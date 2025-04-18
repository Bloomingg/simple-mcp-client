import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Ensure the API key is loaded from environment variables
if (!process.env.OPENAI_API_KEY) {
    console.warn("OPENAI_API_KEY environment variable is not set!");
    // Optionally throw an error if the key is critical for the app to function
    // throw new Error("OPENAI_API_KEY environment variable is not set!");
}

const openai = new OpenAI({
    baseURL: "https://api.siliconflow.cn/v1",
    timeout: 300 * 1000, // 120 seconds request timeout
}); // API key is automatically picked up from process.env.OPENAI_API_KEY

// Type definitions (ensure consistency with frontend)
interface ServerConfig {
    id: string;
    name: string;
    path: string;
    env: string;
}

interface ToolInfo {
    name: string;
    description?: string;
    inputSchema: any;
}

type OpenAITool = OpenAI.Chat.ChatCompletionTool;
type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

// Request Body for Chat API
interface RequestBody {
    messages: ChatMessage[];
    servers: ServerConfig[]; // Changed from serverPath/serverEnv
}

// --- Helper: Initialize ALL MCP Clients --- 
interface ActiveClientInfo {
    client: Client;
    transport: StdioClientTransport;
    tools: OpenAITool[];
    toolNames: Set<string>; // Keep track of tool names for routing
}

async function initializeAllMcpClients(
    serverConfigs: ServerConfig[]
): Promise<Map<string, ActiveClientInfo>> {
    const activeClients = new Map<string, ActiveClientInfo>();
    const initPromises = serverConfigs.map(async (config) => {
        let mcpClient: Client | null = null;
        let transport: StdioClientTransport | null = null;
        try {
            const serverScriptPath = config.path;
            const serverEnvString = config.env || '{}';
            let parsedEnv: { [key: string]: string } = {};
            try {
                parsedEnv = JSON.parse(serverEnvString);
                if (typeof parsedEnv !== 'object' || parsedEnv === null || Array.isArray(parsedEnv)) { throw new Error('Env must be JSON object'); }
                for (const key in parsedEnv) { if (typeof parsedEnv[key] !== 'string') { parsedEnv[key] = String(parsedEnv[key]); } }
            } catch (e: any) { throw new Error(`Invalid JSON Env: ${e.message}`); }

            let absolutePath = path.resolve(serverScriptPath);
            if (!fs.existsSync(absolutePath)) {
                const projectRootPath = path.resolve(process.cwd(), serverScriptPath);
                if(fs.existsSync(projectRootPath)) { absolutePath = projectRootPath; } 
                else { throw new Error(`Script not found`); }
            }
            if (!fs.statSync(absolutePath).isFile()) { throw new Error('Path must be a file'); }
            const fileExtension = path.extname(absolutePath);
            let command: string;
            if (fileExtension === '.js') command = process.execPath;
            else if (fileExtension === '.py') command = os.platform() === 'win32' ? 'python' : 'python3';
            else throw new Error('Script must be .js or .py');

            const cleanProcessEnv = Object.entries(process.env).reduce((acc, [key, value]) => {
                if (value !== undefined) { acc[key] = value; }
                return acc;
            }, {} as { [key: string]: string });

            console.log(`[Chat Init] Connecting to ${config.name}...`);
            transport = new StdioClientTransport({ command, args: [absolutePath], env: { ...cleanProcessEnv, ...parsedEnv } });
            // Use unique client name based on server config name/id
            mcpClient = new Client({ name: `mcp-client-chat-${config.name}-${config.id.substring(0, 4)}`, version: '1.0.0' });

            const connectPromise = mcpClient.connect(transport);
            const toolsPromise = connectPromise.then(() => mcpClient?.listTools());
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout (30s)')), 30000));
            const toolsResult = await Promise.race([toolsPromise, timeoutPromise]) as Awaited<ReturnType<Client['listTools']>>;
            
            const openAITools: OpenAITool[] = toolsResult.tools.map(tool => ({
                type: 'function',
                function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
            }));
            const toolNames = new Set(toolsResult.tools.map(t => t.name));
            
            console.log(`[Chat Init] Connected to ${config.name} (${toolNames.size} tools).`);
            activeClients.set(config.name, { client: mcpClient, transport, tools: openAITools, toolNames });

        } catch (error: any) {
            console.error(`[Chat Init] Failed to initialize MCP Client for ${config.name}:`, error.message);
            // Don't add to activeClients, but don't stop others from initializing.
            // Ensure cleanup if partially connected
            if (mcpClient) { try { await mcpClient.close(); } catch { /* ignore */ } }
        }
    });

    await Promise.all(initPromises); // Wait for all connection attempts
    console.log(`[Chat Init] Finished initializing ${activeClients.size} / ${serverConfigs.length} clients.`);
    return activeClients;
}

// --- Main Chat POST Handler (SSE) --- 
export async function POST(request: Request) {
    // Map to store active client connections for this request
    let activeClients = new Map<string, ActiveClientInfo>();
    const MAX_TOOL_ITERATIONS = 5;

    try {
        const body: RequestBody = await request.json();
        const { messages: initialMessages, servers } = body;

        if (!initialMessages || initialMessages.length === 0 || !Array.isArray(servers)) {
            return NextResponse.json({ error: 'Missing required fields (messages, servers array)' }, { status: 400 });
        }

        // Set up SSE stream
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();
        const sendMessage = (data: object) => { writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); };
        const sendError = (errorMessage: string) => {
            console.error(`[Chat API Stream] Sending error: ${errorMessage}`);
            sendMessage({ type: 'error', error: errorMessage });
             // Don't close writer here, let finally block handle cleanup
        };

        // Start async processing
        (async () => {
            try {
                // Initialize all clients concurrently
                activeClients = await initializeAllMcpClients(servers);

                if (activeClients.size === 0 && servers.length > 0) {
                    throw new Error("Failed to connect to any configured MCP server.");
                }
                
                // Aggregate tools from all active clients
                const allAvailableTools: OpenAITool[] = [];
                activeClients.forEach(info => allAvailableTools.push(...info.tools));
                
                 // Check for duplicate tool names across servers (important limitation)
                 const allToolNames = allAvailableTools.map(t => t.function.name);
                 const uniqueToolNames = new Set(allToolNames);
                 if (allToolNames.length !== uniqueToolNames.size) {
                     console.warn("[Chat API Stream] Duplicate tool names detected across servers. Tool routing might be ambiguous.");
                     // Consider prefixing or throwing an error here in a real application
                 }

                let iterationCount = 0;
                let currentMessages = [...initialMessages];

                // Main LLM interaction loop
                while (iterationCount < MAX_TOOL_ITERATIONS) {
                    iterationCount++;
                    console.log(`[Chat API Stream] OpenAI Call Iteration: ${iterationCount}, ${allAvailableTools.length} total tools available.`);

                    const response = await openai.chat.completions.create({
                        model: "deepseek-ai/DeepSeek-V3",
                        messages: currentMessages,
                        tools: allAvailableTools.length > 0 ? allAvailableTools : undefined,
                        tool_choice: allAvailableTools.length > 0 ? "auto" : undefined,
                    });

                    const responseMessage = response.choices[0].message;
                    currentMessages.push(responseMessage);
                    sendMessage({ type: 'message', message: responseMessage });

                    const toolCalls = responseMessage.tool_calls;
                    console.log(`[Chat API Stream] Iteration ${iterationCount}: OpenAI tool calls: ${JSON.stringify(toolCalls)}`);

                    if (toolCalls) {
                        const toolResponses: ChatMessage[] = [];
                        const toolCallPromises = toolCalls.map(async (toolCall) => {
                            const functionName = toolCall.function.name;
                            let functionArgs: any;
                            // Explicitly type the role for tool responses
                            const role: "tool" = "tool"; 
                            
                            try {
                                functionArgs = JSON.parse(toolCall.function.arguments);
                            } catch (parseError: any) {
                                console.error(`[Chat API Stream] Error parsing args for ${functionName}:`, parseError);
                                // Use the explicit role type here
                                return { tool_call_id: toolCall.id, role, content: `Error: Invalid arguments - ${parseError.message}` };
                            }
                            
                            // Find the correct client and its name for this tool
                            let targetClientInfo: ActiveClientInfo | undefined;
                            let targetServerName: string | undefined;
                            for (const [serverName, clientInfo] of activeClients.entries()) {
                                if (clientInfo.toolNames.has(functionName)) {
                                    targetClientInfo = clientInfo;
                                    targetServerName = serverName; // Store the name
                                    break;
                                }
                            }

                            if (!targetClientInfo || !targetServerName) {
                                console.error(`[Chat API Stream] Tool \'${functionName}\' not found in any active server.`);
                                // Use the explicit role type here
                                return { tool_call_id: toolCall.id, role, content: `Error: Tool \'${functionName}\' not available.` };
                            }
                            
                            // Use targetServerName for logging
                            console.log(`[Chat API Stream] Executing tool \'${functionName}\' on server \'${targetServerName}\'...`);
                            try {
                                const toolResult = await targetClientInfo.client.callTool({ name: functionName, arguments: functionArgs });
                                console.log(`[Chat API Stream] Tool ${functionName} executed.`);
                                const contentString = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content);
                                // Use the explicit role type here
                                return { tool_call_id: toolCall.id, role, content: contentString };
                            } catch (toolError: any) {
                                console.error(`[Chat API Stream] Error executing ${functionName}:`, toolError);
                                // Use the explicit role type here
                                return { tool_call_id: toolCall.id, role, content: `Error executing tool: ${toolError.message || 'Unknown error'}` };
                            }
                        }); // End map over toolCalls
                        
                        // Wait for all tool calls in this batch to complete
                        const resolvedResponses = await Promise.all(toolCallPromises);
                        
                        // Send results and add to history
                        resolvedResponses.forEach(resp => {
                            // Ensure the response conforms to ChatMessage before sending/pushing
                            const messageToSend: ChatMessage = resp as ChatMessage; 
                            sendMessage({ type: 'message', message: messageToSend });
                            toolResponses.push(messageToSend);
                        });
                        currentMessages.push(...toolResponses);
                        // Loop continues

                    } else {
                        console.log(`[Chat API Stream] Iteration ${iterationCount}: No tool calls requested. Loop finished.`);
                        break; // Exit loop
                    }
                } // End while loop

                if (iterationCount >= MAX_TOOL_ITERATIONS) {
                     console.warn(`[Chat API Stream] Reached max tool call iterations (${MAX_TOOL_ITERATIONS}).`);
                     const warningMessage: ChatMessage = { role: "assistant", content: `(Warning: Reached maximum tool call iterations (${MAX_TOOL_ITERATIONS}).)` };
                     sendMessage({ type: 'message', message: warningMessage });
                }

                sendMessage({ type: 'done' }); // Signal completion

            } catch (error: any) {
                // Catch errors within the async processing block
                sendError(error.message || 'An internal server error occurred during stream processing');
            } finally {
                // Ensure ALL clients are closed in the finally block
                console.log('[Chat API Stream] Cleaning up active MCP clients...');
                const closePromises = Array.from(activeClients.values()).map(info => 
                    // No need to access config here for closing
                    info.client.close().catch(err => console.error(`Error closing client:`, err))
                );
                await Promise.all(closePromises);
                console.log('[Chat API Stream] Finished cleaning up clients.');
                activeClients.clear();
                // Close the stream writer
                try { writer.close(); } catch {} 
            }
        })(); // Immediately invoke the async function

        // Return the readable side of the stream
        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
         // Catch errors during initial request setup (before stream starts)
         console.error('[Chat API] Error setting up stream:', error);
         // Ensure cleanup even if setup fails partially
          const closePromises = Array.from(activeClients.values()).map(info => 
              // No need to access config here for closing
             info.client.close().catch(err => console.error(`Error closing client during setup error:`, err))
          );
          await Promise.all(closePromises);
         return NextResponse.json({ error: error.message || 'Failed to set up stream' }, { status: 500 });
    }
} 