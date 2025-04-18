import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import { execa } from 'execa';
import { v4 as uuidv4 } from 'uuid';
import { ManualServerAddData } from '@/components/ServerManagementPanel'; // Import the input data type

// Define the expected response structure (matching frontend ServerConfig)
interface ServerConfig {
  id: string;
  name: string;
  path: string; // Path to the executable (script, wrapper, etc.)
  env: string;
  marketId?: string; // Will be null/undefined for manually added servers
}

// Base directory for installing servers
const SERVERS_INSTALL_DIR = path.resolve(process.cwd(), 'mcp-servers');

// Helper to run commands (copied from install-server route)
async function runCommands(commands: string[], cwd: string, env: Record<string, string>) {
    for (const command of commands) {
        console.log(`[Manual Install API] Running command in ${cwd}: ${command}`);
        const [executable, ...args] = command.split(' '); 
        try {
            const { stdout, stderr } = await execa(executable, args, { 
                cwd, 
                env: { ...process.env, ...env }, 
                stdio: 'pipe' 
            });
            console.log(`[Manual Install API] > ${command} stdout:\n${stdout}`);
            if (stderr) {
                console.warn(`[Manual Install API] > ${command} stderr:\n${stderr}`);
            }
        } catch (error: any) {
            console.error(`[Manual Install API] Error running command: ${command}`, error);
            throw new Error(`Command failed: ${command}. Error: ${error.stderr || error.stdout || error.message}`);
        }
    }
}

// Helper to generate runner script (copied from install-server route)
function generateRunnerScript(npxCommand: string, envJsonString: string): string {
    let envExports = '';
    try {
        const envVars = JSON.parse(envJsonString);
        for (const key in envVars) {
            const value = String(envVars[key]).replace(/'/g, "'\\''"); 
            envExports += `export ${key}='${value}'\n`;
        }
    } catch (e) { console.warn("[Manual Install API] Failed to parse env JSON for runner script", e); }

    return `#!/bin/sh
# Wrapper script generated by MCP Client Installer (Manual Add)

# Set environment variables
${envExports}

# Execute the npx command
echo "[MCP Server Runner - Manual] Starting server with npx..."
${npxCommand}
`;
}

// --- POST Handler for Manual Installation ---
export async function POST(request: Request) {
    try {
        await fs.mkdir(SERVERS_INSTALL_DIR, { recursive: true });

        const data: ManualServerAddData = await request.json();

        // --- Basic Input Validation ---
        if (!data || !data.name || !data.type || !data.env) {
            return NextResponse.json({ error: 'Missing required fields: type, name, env' }, { status: 400 });
        }
        // Specific validation is done on frontend, but double-check here if needed
        
        // Generate a unique ID for this manual installation instance
        // Using name + hash might be better for preventing duplicates, but uuid is simpler
        const installId = `${data.name.replace(/\s+/g, '-').toLowerCase()}-${uuidv4().substring(0, 8)}`;
        const installDirPath = path.join(SERVERS_INSTALL_DIR, installId);
        let finalScriptPath = '';
        const finalEnvString = data.env; // Already validated as JSON string on frontend
        let parsedEnv: Record<string, string> = {};
        try { parsedEnv = JSON.parse(finalEnvString); } catch { /* Should not happen due to frontend validation */ }

        console.log(`[Manual Install API] Installing ${data.name} (Type: ${data.type}) into ${installDirPath}`);

        // --- Installation Logic based on Type ---
        if (data.type === 'git') {
            if (!data.gitUrl || !data.scriptPath) {
                throw new Error('Git URL and Script Path are required for manual Git install.');
            }
            
            // 1. Clone (Force create dir for manual add, overwrite if exists?)
            // For simplicity, we'll remove existing dir if present for manual installs
            await fs.rm(installDirPath, { recursive: true, force: true }); 
            console.log(`[Manual Install API] Cloning ${data.gitUrl} into ${installId}...`);
            try {
                await execa('git', ['clone', '--depth', '1', data.gitUrl, installId], { cwd: SERVERS_INSTALL_DIR });
                console.log(`[Manual Install API] Git clone successful.`);
            } catch (error: any) {
                 console.error(`[Manual Install API] Git clone failed:`, error);
                 throw new Error(`Failed to clone repository: ${error.stderr || error.stdout || error.message}`);
            }

            // 2. Determine working directory & Run Commands
            const commandCwd = data.subDirectory ? path.join(installDirPath, data.subDirectory) : installDirPath;
            if(data.subDirectory) { 
                try { await fs.access(commandCwd); } catch { throw new Error(`Specified subDirectory (${data.subDirectory}) not found after clone.`); } 
            }

            // Parse commands from textarea string (split by newline)
            const installCmds = data.installCommands?.split('\n').map(cmd => cmd.trim()).filter(Boolean) ?? [];
            const buildCmds = data.buildCommands?.split('\n').map(cmd => cmd.trim()).filter(Boolean) ?? [];

            if (installCmds.length > 0) {
                console.log("[Manual Install API] Running install commands...");
                await runCommands(installCmds, commandCwd, parsedEnv);
            }
            if (buildCmds.length > 0) {
                console.log("[Manual Install API] Running build commands...");
                await runCommands(buildCmds, commandCwd, parsedEnv);
            }

            // 3. Determine Final Script Path
            finalScriptPath = path.resolve(commandCwd, data.scriptPath);

        } else if (data.type === 'npx') {
            if (!data.npxCommand) {
                throw new Error('NPX Command is required for manual NPX install.');
            }
            
            await fs.mkdir(installDirPath, { recursive: true });
            const scriptContent = generateRunnerScript(data.npxCommand, finalEnvString);
            const wrapperScriptName = 'run.sh';
            finalScriptPath = path.join(installDirPath, wrapperScriptName);

            console.log(`[Manual Install API] Generating wrapper script at ${finalScriptPath}`);
            await fs.writeFile(finalScriptPath, scriptContent, 'utf8');
            try {
                await fs.chmod(finalScriptPath, 0o755);
                console.log(`[Manual Install API] Made wrapper script executable.`);
            } catch (err: any) {
                console.error(`[Manual Install API] Failed to set executable permissions on ${finalScriptPath}:`, err);
                throw new Error(`Failed to make runner script executable. Check permissions.`);
            }
        } else {
             const exhaustiveCheck: never = data.type;
             throw new Error(`Unsupported server type: ${exhaustiveCheck}`);
        }

        // --- Verification & Config Creation ---
        try {
            await fs.access(finalScriptPath);
            console.log(`[Manual Install API] Verified final script/executable exists at: ${finalScriptPath}`);
        } catch {
            console.error(`[Manual Install API] Final executable/script not found after installation at: ${finalScriptPath}`);
            throw new Error(`Installation failed: the final script/executable was not found or is not accessible.`);
        }

        const installedServerConfig: ServerConfig = {
            id: uuidv4(), // Generate a unique ID for this server instance
            name: data.name,
            path: finalScriptPath,
            env: finalEnvString,
            marketId: undefined // Not from market
        };

        console.log(`[Manual Install API] Installation successful for ${data.name}.`);
        return NextResponse.json(installedServerConfig);

    } catch (error: any) {
        console.error('[Manual Install API] Error:', error);
        return NextResponse.json({ error: error.message || 'Manual installation failed' }, { status: 500 });
    }
} 