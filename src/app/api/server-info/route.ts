import { NextResponse } from 'next/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

export async function POST(request: Request) {
  let mcpClient: Client | null = null;
  let transport: StdioClientTransport | null = null;

  try {
    const body = await request.json();
    const serverScriptPath = body.serverPath as string;
    const serverEnvString = body.serverEnv as string || '{}'; // Get env string, default to empty object

    if (!serverScriptPath) {
      return NextResponse.json({ error: 'Server path is required' }, { status: 400 });
    }

    // Parse environment variables
    let parsedEnv: { [key: string]: string } = {};
    try {
      parsedEnv = JSON.parse(serverEnvString);
      if (typeof parsedEnv !== 'object' || parsedEnv === null || Array.isArray(parsedEnv)) {
        throw new Error('Environment variables must be a JSON object.');
      }
      // Optional: Ensure all values are strings, as expected by execa/spawn
      for (const key in parsedEnv) {
        if (typeof parsedEnv[key] !== 'string') {
          parsedEnv[key] = String(parsedEnv[key]);
        }
      }
    } catch (e: any) {
      return NextResponse.json({ error: `Invalid JSON format for Environment Variables: ${e.message}` }, { status: 400 });
    }

    // Basic security check: Ensure path is absolute or resolve relative paths cautiously
    // This is a simple example; real-world apps need more robust path validation/sanitization
    let absolutePath = path.resolve(serverScriptPath); // Resolve relative paths based on server's CWD

    if (!fs.existsSync(absolutePath)) {
        // Try resolving relative to the project root if absolute fails (common user expectation)
        const projectRootPath = path.resolve(process.cwd(), serverScriptPath);
        if(fs.existsSync(projectRootPath)) {
            absolutePath = projectRootPath;
        } else {
             return NextResponse.json({ error: `Server script not found at ${absolutePath} or ${projectRootPath}` }, { status: 400 });
        }
    }

    if (!fs.statSync(absolutePath).isFile()) {
         return NextResponse.json({ error: 'Server path must point to a file' }, { status: 400 });
    }

    const fileExtension = path.extname(absolutePath);
    let command: string;

    if (fileExtension === '.js') {
      command = process.execPath; // Use the current Node.js executable
    } else if (fileExtension === '.py') {
      command = os.platform() === 'win32' ? 'python' : 'python3'; // Basic check for python command
      // Consider adding checks or configuration for python executable path
    } else {
      return NextResponse.json({ error: 'Server script must be a .js or .py file' }, { status: 400 });
    }

    // Filter undefined values from process.env
    const cleanProcessEnv = Object.entries(process.env).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        acc[key] = value;
      }
      return acc;
    }, {} as { [key: string]: string });

    console.log(`Attempting to connect using command: '${command}', script: '${absolutePath}', env: ${JSON.stringify(parsedEnv)}`);

    transport = new StdioClientTransport({
      command: command,
      args: [absolutePath],
      env: { ...cleanProcessEnv, ...parsedEnv }, // Merge cleaned process.env and parsed env
    });

    mcpClient = new Client({ name: 'mcp-nextjs-client-api', version: '1.0.0' });

    // Add a timeout for the connection attempt
    const connectPromise = mcpClient.connect(transport);
    const toolsPromise = connectPromise.then(() => mcpClient?.listTools());

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out after 30 seconds')), 30000)
    );

    const toolsResult = await Promise.race([toolsPromise, timeoutPromise]) as Awaited<ReturnType<Client['listTools']>>;

    console.log('Connected to server, tools:', toolsResult.tools.map(t => t.name));

    // Disconnect after getting info
    await mcpClient.close();
    mcpClient = null;
    transport = null;

    return NextResponse.json({ tools: toolsResult.tools });

  } catch (error: any) {
    console.error('Failed to connect to MCP server:', error);

    // Ensure client is closed even on error
    if (mcpClient) {
        try {
            await mcpClient.close();
        } catch (closeError) {
            console.error('Error closing MCP client after failure:', closeError);
        }
    }

    // Determine error message
    let errorMessage = 'Failed to connect to server.';
    if (error instanceof Error) {
        errorMessage = error.message;
    } else if (typeof error === 'string') {
        errorMessage = error;
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
} 