export interface MarketServerDefinition {
    id: string;
    name: string;
    description: string;
    author: string;
    type: 'git' | 'npx';
    defaultEnv?: string; // JSON string for default environment variables
    tags?: string[];

    // --- Git Specific Fields ---
    gitUrl?: string; // Required for type 'git'
    subDirectory?: string; // Optional: Subdirectory within the repo containing the server code
    installCommands?: string[]; // Optional: Commands to run after cloning (in subDirectory if specified)
    buildCommands?: string[]; // Optional: Commands to run after install (in subDirectory if specified)
    scriptPath?: string; // Required for git type: Path to the executable script relative to repo root or subDirectory
    
    // --- NPX Specific Fields ---
    npxCommand?: string; // Required for type 'npx'
}

export const MARKET_SERVERS: MarketServerDefinition[] = [
    {
        id: "mcp-openimsdk-chat",
        name: "OpenIMSDK MCP Server",
        description: "A simple chat server built from the OpenIM",
        // NOTE: User running the Next.js app needs git installed!
        author: "OpenIMSDK",
        type: 'git',
        gitUrl: "https://github.com/Bloomingg/simple-mcp-server.git",
        scriptPath: "build/index.js",
        installCommands: ["npm install"],
        buildCommands: ["npm run build"],
        defaultEnv: JSON.stringify({
            "OPENIM_TOKEN": "OPENIM_TOKEN",
            "OPENIM_BASE_URL": "OPENIM_BASE_URL",
            "OPENIM_SELF_USER_ID": "OPENIM_SELF_USER_ID"
        }),
        tags: ["openimsdk", "typescript", "api", "chat"]
    },
    {
        id: "mcp-qs-weather-ts",
        name: "MCP Quickstart Weather (TypeScript)",
        description: "A simple server providing weather information built from the MCP quickstart repo.",
        author: "MCP Team",
        type: 'git', // Type is git
        gitUrl: "https://github.com/modelcontextprotocol/quickstart-resources.git",
        subDirectory: "weather-server-typescript", // Specify the subdirectory
        installCommands: ["npm install"], // Commands run inside the subDirectory
        buildCommands: ["npm run build"], // Build command run inside the subDirectory
        scriptPath: "build/index.js", // Path relative to the subDirectory
        defaultEnv: JSON.stringify({ "OPENWEATHERMAP_API_KEY": "YOUR_OPENWEATHERMAP_KEY" }),
        tags: ["weather", "typescript", "api", "quickstart", "git"]
    },
    // {
    //     // Example of a simpler Git repo (no build, no subdir)
    //     id: "simple-python-git-server",
    //     name: "Simple Python Server (Git)",
    //     description: "A basic Python server directly runnable from repo root.",
    //     author: "Example Author",
    //     type: 'git',
    //     gitUrl: "https://github.com/example/simple-python-mcp.git",
    //     scriptPath: "server.py", // Path relative to repo root
    //     defaultEnv: "{}",
    //     tags: ["python", "example", "git"]
    // },
    {
        id: "youtube-transcript",
        name: "YouTube Transcript Server (NPX)",
        description: "Fetches transcripts from YouTube videos via npx. Requires an OpenAI API Key for potential processing.",
        author: "@kimtaeyoon83",
        type: 'npx', // Type is npx
        npxCommand: "npx -y @kimtaeyoon83/mcp-server-youtube-transcript", 
        defaultEnv: JSON.stringify({ "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY" }),
        tags: ["youtube", "transcript", "npx", "community"]
    }
    // Add other predefined servers here...
]; 