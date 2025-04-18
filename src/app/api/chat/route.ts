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
    // baseURL: "https://api.siliconflow.cn/v1",
    timeout: 300 * 1000, // 120 seconds request timeout
}); // API key is automatically picked up from process.env.OPENAI_API_KEY

// Type definitions (consider moving to a shared types file)
type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

interface RequestBody {
    messages: ChatMessage[];
    serverPath: string;
    serverEnv: string;
}

// Helper function to initialize MCP client and get tools
async function initializeMcpClient(
    serverScriptPath: string,
    serverEnvString: string
): Promise<{ mcpClient: Client, transport: StdioClientTransport, tools: OpenAI.Chat.ChatCompletionTool[] }> {
    // Parse environment variables first
    let parsedEnv: { [key: string]: string } = {};
    try {
        parsedEnv = JSON.parse(serverEnvString || '{}');
        if (typeof parsedEnv !== 'object' || parsedEnv === null || Array.isArray(parsedEnv)) {
            throw new Error('Environment variables must be a JSON object.');
        }
        for (const key in parsedEnv) {
            if (typeof parsedEnv[key] !== 'string') {
                parsedEnv[key] = String(parsedEnv[key]);
            }
        }
    } catch (e: any) {
        // Re-throw with a more specific message for the chat API context
        throw new Error(`Invalid JSON for Environment Variables in chat request: ${e.message}`);
    }

    // Clean process.env
    const cleanProcessEnv = Object.entries(process.env).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {} as { [key: string]: string });

    let absolutePath = path.resolve(serverScriptPath);
    if (!fs.existsSync(absolutePath)) {
        const projectRootPath = path.resolve(process.cwd(), serverScriptPath);
        if (fs.existsSync(projectRootPath)) {
            absolutePath = projectRootPath;
        } else {
            throw new Error(`Server script not found at ${absolutePath} or ${projectRootPath}`);
        }
    }
    if (!fs.statSync(absolutePath).isFile()) {
        throw new Error('Server path must point to a file');
    }

    const fileExtension = path.extname(absolutePath);
    let command: string;
    if (fileExtension === '.js') command = process.execPath;
    else if (fileExtension === '.py') command = os.platform() === 'win32' ? 'python' : 'python3';
    else throw new Error('Server script must be a .js or .py file');

    console.log(`[Chat API] Initializing MCP client: command='${command}', script='${absolutePath}', env=${JSON.stringify(parsedEnv)}`);
    const transport = new StdioClientTransport({
        command,
        args: [absolutePath],
        env: { ...cleanProcessEnv, ...parsedEnv }
    });
    const mcpClient = new Client({ name: 'mcp-nextjs-chat-api', version: '1.0.0' });

    await mcpClient.connect(transport);
    const toolsResult = await mcpClient.listTools();

    const openAITools: OpenAI.Chat.ChatCompletionTool[] = toolsResult.tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema,
        },
    }));

    console.log(`[Chat API] MCP client connected. Tools: ${openAITools.map(t => t.function.name).join(', ')}`);
    return { mcpClient, transport, tools: openAITools };
}

export async function POST(request: Request) {
    let mcpClient: Client | null = null;
    let transport: StdioClientTransport | null = null;
    const MAX_TOOL_ITERATIONS = 5;

    try {
        const body: RequestBody = await request.json();
        const { messages: initialMessages, serverPath, serverEnv } = body;

        // Input validation (basic)
        if (!initialMessages || initialMessages.length === 0 || !serverPath) {
            return NextResponse.json({ error: 'Missing required fields (messages, serverPath)' }, { status: 400 });
        }

        // Create a TransformStream for SSE
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();
        const encoder = new TextEncoder();

        const sendMessage = (data: object) => {
            writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        const sendError = (errorMessage: string) => {
            console.error(`[Chat API Stream] Sending error: ${errorMessage}`);
            sendMessage({ type: 'error', error: errorMessage });
            writer.close(); // Close stream on error
        }

        // Start processing asynchronously, don't await the whole loop here
        (async () => {
            try {
                // Initialize MCP Client and get tools inside the async block
                const mcpData = await initializeMcpClient(serverPath, serverEnv);
                mcpClient = mcpData.mcpClient;
                transport = mcpData.transport;
                const availableTools = mcpData.tools;

                let iterationCount = 0;
                let currentMessages = [...initialMessages];

                while (iterationCount < MAX_TOOL_ITERATIONS) {
                    iterationCount++;
                    console.log(`[Chat API Stream] OpenAI Call Iteration: ${iterationCount}`);

                    const response = await openai.chat.completions.create({
                        model: "gpt-4o",
                        // model: "deepseek-ai/DeepSeek-V3",
                        messages: currentMessages,
                        tools: availableTools.length > 0 ? availableTools : undefined,
                        tool_choice: availableTools.length > 0 ? "auto" : undefined,
                    });

                    const responseMessage = response.choices[0].message;
                    currentMessages.push(responseMessage);
                    sendMessage({ type: 'message', message: responseMessage }); // Send assistant message chunk

                    const toolCalls = responseMessage.tool_calls;
                    console.log(`[Chat API Stream] Iteration ${iterationCount}: OpenAI tool calls requested: ${JSON.stringify(toolCalls)}.`);

                    if (toolCalls) {
                        const toolResponses: ChatMessage[] = [];
                        for (const toolCall of toolCalls) {
                            const functionName = toolCall.function.name;
                            let functionArgs: any;
                            let toolResponse: ChatMessage;
                            try {
                                functionArgs = JSON.parse(toolCall.function.arguments);
                            } catch (parseError: any) {
                                console.error(`[Chat API Stream] Error parsing arguments for tool ${functionName}:`, parseError);
                                toolResponse = { tool_call_id: toolCall.id, role: "tool", content: `Error: Invalid arguments provided by LLM - ${parseError.message}` };
                                toolResponses.push(toolResponse);
                                sendMessage({ type: 'message', message: toolResponse }); // Send tool error chunk
                                continue;
                            }
                            console.log(`[Chat API Stream] Executing tool: ${functionName} with args:`, functionArgs);
                            try {
                                const toolResult = await mcpClient.callTool({ name: functionName, arguments: functionArgs });
                                console.log(`[Chat API Stream] Tool ${functionName} executed.`);
                                const contentString = typeof toolResult.content === 'string' ? toolResult.content : JSON.stringify(toolResult.content);
                                toolResponse = { tool_call_id: toolCall.id, role: "tool", content: contentString };
                            } catch (toolError: any) {
                                console.error(`[Chat API Stream] Error executing tool ${functionName}:`, toolError);
                                toolResponse = { tool_call_id: toolCall.id, role: "tool", content: `Error executing tool: ${toolError.message || 'Unknown error'}` };
                            }
                            toolResponses.push(toolResponse);
                            sendMessage({ type: 'message', message: toolResponse }); // Send tool result/error chunk
                        }
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

                // Signal completion
                sendMessage({ type: 'done' });

            } catch (error: any) {
                sendError(error.message || 'An internal server error occurred during stream processing');
            } finally {
                // Ensure MCP client is closed in the async block
                if (mcpClient) {
                    try { await mcpClient.close(); console.log("[Chat API Stream] MCP client closed."); }
                    catch (closeError) { console.error('[Chat API Stream] Error closing MCP client:', closeError); }
                }
                // Close the stream writer
                try { writer.close(); } catch { }
            }
        })(); // Immediately invoke the async function

        // Return the readable side of the stream immediately
        return new Response(stream.readable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        // Catch errors during initial request processing (before stream starts)
        console.error('[Chat API] Error setting up stream:', error);
        return NextResponse.json({ error: error.message || 'Failed to set up stream' }, { status: 500 });
    }
} 