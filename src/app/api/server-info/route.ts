import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Type matching frontend definition
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

interface ServerToolsResult {
    serverName: string;
    tools: ToolInfo[];
    status: 'connected' | 'error';
    error?: string;
}

// Refactored helper to connect and get tools for ONE server
async function getServerTools(config: ServerConfig): Promise<ServerToolsResult> {
  let mcpClient: Client | null = null;
  let transport: StdioClientTransport | null = null;

  try {
    const serverScriptPath = config.path;
    const serverEnvString = config.env || '{}';
    let parsedEnv: { [key: string]: string } = {};

    // Parse Env
    try {
      parsedEnv = JSON.parse(serverEnvString);
      if (typeof parsedEnv !== 'object' || parsedEnv === null || Array.isArray(parsedEnv)) {
        throw new Error('Env must be a JSON object.');
      }
      for (const key in parsedEnv) {
        if (typeof parsedEnv[key] !== 'string') { parsedEnv[key] = String(parsedEnv[key]); }
      }
    } catch (e: any) { throw new Error(`Invalid JSON for Env: ${e.message}`); }

    // Validate Path & Determine Command
    let absolutePath = path.resolve(serverScriptPath);
    if (!fs.existsSync(absolutePath)) {
        const projectRootPath = path.resolve(process.cwd(), serverScriptPath);
        if(fs.existsSync(projectRootPath)) { absolutePath = projectRootPath; } 
        else { throw new Error(`Script not found`); }
    }
    if (!fs.statSync(absolutePath).isFile()) { throw new Error('Path must be a file'); }
    const fileExtension = path.extname(absolutePath);
    let command: string;
    if (fileExtension === '.js') { command = process.execPath; }
    else if (fileExtension === '.py') { command = os.platform() === 'win32' ? 'python' : 'python3'; }
    else { throw new Error('Script must be .js or .py'); }

    // Filter process.env
    const cleanProcessEnv = Object.entries(process.env).reduce((acc, [key, value]) => {
      if (value !== undefined) { acc[key] = value; }
      return acc;
    }, {} as { [key: string]: string });

    console.log(`[Server Info API] Connecting to ${config.name}: cmd='${command}', script='${absolutePath}'`);

    // Initialize & Connect
    transport = new StdioClientTransport({ command, args: [absolutePath], env: { ...cleanProcessEnv, ...parsedEnv } });
    mcpClient = new Client({ name: `mcp-client-info-${config.name}`, version: '1.0.0' });

    const connectPromise = mcpClient.connect(transport);
    const toolsPromise = connectPromise.then(() => mcpClient?.listTools());
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out (30s)')), 30000)
    );
    const toolsResult = await Promise.race([toolsPromise, timeoutPromise]) as Awaited<ReturnType<Client['listTools']>>;
    
    console.log(`[Server Info API] Connected to ${config.name}. Tools found: ${toolsResult.tools.length}`);

    // Disconnect after getting info
    await mcpClient.close();

    return {
      serverName: config.name,
      tools: toolsResult.tools, // Assuming MCP SDK returns tools in the expected format
      status: 'connected',
    };

  } catch (error: any) {
    console.error(`[Server Info API] Failed to connect or get tools for ${config.name}:`, error);
    // Ensure client is closed even on error during connection/listing
    if (mcpClient) {
      try { await mcpClient.close(); } catch (closeError) { /* ignore */ }
    }
    return {
        serverName: config.name,
        tools: [],
        status: 'error',
        error: error.message || 'Unknown connection error',
    };
  }
}

// Main POST handler
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const serverConfigs = body.servers as ServerConfig[];

    if (!Array.isArray(serverConfigs) || serverConfigs.length === 0) {
      return NextResponse.json({ error: 'Server configurations array is required' }, { status: 400 });
    }

    // Process each server configuration concurrently
    const resultsPromises = serverConfigs.map(config => getServerTools(config));
    const results = await Promise.all(resultsPromises);

    return NextResponse.json(results);

  } catch (error: any) {
    // Catch errors during request parsing or overall processing
    console.error('[Server Info API] Overall processing error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process server info request' }, { status: 500 });
  }
} 