"use client";

// Define types locally for now
interface ToolInfo { name: string; description?: string; inputSchema: any; }
interface ServerConfig { id: string; name: string; path: string; env: string; marketId?: string; }
interface ServerToolsResult { serverName: string; tools: ToolInfo[]; status: 'connected' | 'error'; error?: string; }

// --- Define structure for manual add data ---
// This structure will be passed to the handleAddManualServer function
export interface ManualServerAddData {
    type: 'git' | 'npx';
    name: string;
    env: string;
    // Git specific
    gitUrl?: string;
    scriptPath?: string;
    subDirectory?: string;
    installCommands?: string; // Use string for textarea input, parse later
    buildCommands?: string; // Use string for textarea input, parse later
    // Npx specific
    npxCommand?: string;
}

interface ServerManagementPanelProps {
    servers: ServerConfig[];
    connectionStatus: 'idle' | 'connecting' | 'partial' | 'connected' | 'error';
    connectionError: string | null;
    handleDeleteServer: (id: string) => void;
    handleEditServerClick: (server: ServerConfig) => void;
    // --- Modified props for Add Server Form --- 
    // Instead of individual fields, pass a handler that accepts the ManualServerAddData object
    // handleAddManualServer: (data: ManualServerAddData) => void; 
    // addServerFormError: string | null;
    // isAddingServer: boolean; 
    // Action Button Handlers
    handleConnectServers: () => void;
    openMarketModal: () => void;
    openToolsModal: () => void;
    showToolsButtonEnabled: boolean;
    serverTools: ServerToolsResult[];
    // --- Add prop to open the new modal ---
    openAddServerModal: () => void;
}

export default function ServerManagementPanel({
    servers,
    connectionStatus,
    connectionError,
    handleDeleteServer,
    handleEditServerClick,
    // Destructure new props
    // handleAddManualServer, 
    // addServerFormError,
    // isAddingServer,
    handleConnectServers,
    openMarketModal,
    openToolsModal,
    showToolsButtonEnabled,
    serverTools,
    // --- Add prop to open the new modal ---
    openAddServerModal
}: ServerManagementPanelProps) {

    return (
        <div className="lg:w-1/3 flex flex-col gap-6 order-2 lg:order-1">
            {/* Server Configuration Management Card */}
            <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
                <h2 className="text-xl font-semibold mb-4 text-gray-700">MCP Servers</h2>
                
                {/* List of Configured Servers */}
                <div className="mb-4 space-y-3 max-h-60 overflow-y-auto pr-2">
                    {servers.length === 0 && <p className="text-sm text-gray-500">No servers configured.</p>}
                    {servers.map((server) => (
                        <div key={server.id} className="border rounded-md p-3 bg-gray-50 relative pr-16"> 
                            <p className="font-semibold text-gray-800">{server.name}</p>
                            <p className="text-xs text-gray-600 break-all">Path: {server.path}</p>
                            <p className="text-xs text-gray-500 mt-1 break-all">Env: {server.env}</p>
                            <div className="absolute top-2 right-2 flex flex-col gap-1">
                                <button 
                                    onClick={() => handleEditServerClick(server)}
                                    className="text-blue-600 hover:text-blue-800 p-1" 
                                    title="Edit Server Env"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"> <path d="M13.488 2.513a1.75 1.75 0 0 0-2.475 0L3.75 9.775A1.75 1.75 0 0 0 3 10.957v2.293a.75.75 0 0 0 .75.75h2.293a1.75 1.75 0 0 0 1.182-.512l7.263-7.262a1.75 1.75 0 0 0 0-2.475Zm-1.243 1.243L4.5 11.5V10.957a.25.25 0 0 1 .074-.178L11.83 3.516l.414.415ZM12.5 3.275l-.414-.414L13.5 1.45a.25.25 0 0 1 .354 0l.414.414a.25.25 0 0 1 0 .354L12.5 3.275Z"/> </svg>
                                </button>
                                <button 
                                    onClick={() => handleDeleteServer(server.id)}
                                    className="text-red-500 hover:text-red-700 p-1" 
                                    title="Delete Server"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4"> <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd"/> </svg>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* --- Add Button to Open Modal --- */}
                <div className="border-t pt-4 mt-4">
                    <button
                        onClick={openAddServerModal} // Use the new prop to open modal
                        className="w-full px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm font-medium"
                    >
                        + Add Server Manually
                    </button>
                </div>
                
                {/* Connect Button */}
                <div className="mt-4 border-t pt-4">
                    <button
                        onClick={handleConnectServers}
                        disabled={servers.length === 0 || connectionStatus === 'connecting'}
                        className={`w-full px-4 py-2 rounded-md text-white font-medium ${ 
                            servers.length === 0 || connectionStatus === 'connecting'
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                        }`}
                        >
                        {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect & List Tools'}
                    </button>
                    {/* Display Overall Connection Status */}
                    <div className="text-center mt-2 text-sm font-medium">
                        {connectionStatus === 'connected' && <p className="text-green-600">✅ All servers connected.</p>}
                        {connectionStatus === 'partial' && <p className="text-yellow-600">⚠️ Partially connected.</p>}
                        {connectionStatus === 'error' && connectionError && <p className="text-red-600" title={connectionError}>❌ Connection Failed.</p>}
                        {connectionStatus === 'idle' && servers.length > 0 && <p className="text-gray-500">Click button above to connect.</p>}
                    </div>
                </div>
                
                {/* Install Button */} 
                <div className="mt-4 border-t pt-4">
                    <button
                        type="button"
                        onClick={openMarketModal}
                        className="w-full px-4 py-2 rounded-md text-sm font-medium bg-teal-100 text-teal-700 hover:bg-teal-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
                    >
                        + Install Server from Market
                    </button>
                </div>

                {/* View Tools Button */}
                <div className="mt-2"> 
                    <button
                        type="button"
                        onClick={openToolsModal}
                        disabled={!showToolsButtonEnabled}
                        className={`w-full px-4 py-2 rounded-md text-sm font-medium ${ 
                            !showToolsButtonEnabled
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
                        }`}
                    >
                        View Available Tools ({serverTools.reduce((acc, curr) => acc + (curr.status === 'connected' ? curr.tools.length : 0), 0)})
                    </button>
                </div>
            </div>
        </div>
    );
} 