"use client";

import { useState, useEffect, useRef } from "react";
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for unique keys
import { MarketServerDefinition } from "@/lib/market-servers"; // Import market definitions
import ConfigureEnvModal from "@/components/ConfigureEnvModal"; // Import the new component
import MarketModal from "@/components/MarketModal"; // Import the new component
import ToolsModal from "@/components/ToolsModal"; // Import the new component
import ServerManagementPanel, { ManualServerAddData } from "@/components/ServerManagementPanel"; // Import the new component
import ChatInterface from '@/components/ChatInterface';
import AddServerModal from "@/components/AddServerModal"; // Import the new AddServerModal

// Types
interface ToolInfo {
  name: string;
  description?: string; // Make description optional
  inputSchema: any;
}

interface ServerConfig {
  id: string;
  name: string;
  path: string;
  env: string; // Keep env as JSON string for simplicity in form
  marketId?: string; // Added to link to market definition
}

// Type for grouped tools fetched from backend
interface ServerToolsResult {
    serverName: string;
    tools: ToolInfo[];
    status: 'connected' | 'error';
    error?: string;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam & { toolName?: string };

// Placeholder pattern check
function needsConfiguration(envString?: string): boolean {
  if (!envString) return false;
  // Simple check for common placeholder patterns
  return /"(?:YOUR_|<.+>)"/.test(envString);
}

export default function Home() {
  // --- State Management --- 
  const [servers, setServers] = useState<ServerConfig[]>([]); // Array of server configs
  const [serverTools, setServerTools] = useState<ServerToolsResult[]>([]); // Array of results per server
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'partial' | 'connected' | 'error'>('idle'); // Overall connection status
  const [connectionError, setConnectionError] = useState<string | null>(null); // General connection error
  
  // State for the Add Server form
  const [addServerFormError, setAddServerFormError] = useState<string | null>(null);
  const [isAddingServer, setIsAddingServer] = useState<boolean>(false); // New state for loading indicator

  // Chat state remains the same
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // State for Tools Modal
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

  // State for Market Modal
  const [isMarketModalOpen, setIsMarketModalOpen] = useState(false); // State for Market modal
  const [installingServerId, setInstallingServerId] = useState<string | null>(null); // Track which server is being installed
  const [installError, setInstallError] = useState<string | null>(null);

  // Unified Configure/Edit State
  const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'pre-install' | 'edit'>('pre-install'); // 'pre-install' or 'edit'
  const [serverToConfigure, setServerToConfigure] = useState<MarketServerDefinition | ServerConfig | null>(null); // Can be market def or installed config
  const [configuringEnvString, setConfiguringEnvString] = useState<string>('{}');
  const [configureEnvError, setConfigureEnvError] = useState<string | null>(null);

  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false); // State for the new modal

  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // --- Effects --- 
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // --- Modal Handlers ---
  function closeToolsModal() {
    setIsToolsModalOpen(false)
  }

  function openToolsModal() {
    setIsToolsModalOpen(true)
  }

  function closeMarketModal() {
    setIsMarketModalOpen(false);
    setInstallError(null);
    setInstallingServerId(null);
  }

  function openMarketModal() {
    setIsMarketModalOpen(true);
  }
  
  function closeConfigureModal() {
      setIsConfigureModalOpen(false);
      setServerToConfigure(null);
      setConfiguringEnvString('{}');
      setConfigureEnvError(null);
      // Clear specific loading indicator only if it was for pre-install
      if (modalMode === 'pre-install') {
         setInstallingServerId(null); 
      }
  }
  
  // --- Add Handlers for the new Add Server Modal --- 
  function closeAddServerModal() { 
      setIsAddServerModalOpen(false); 
      setAddServerFormError(null); // Clear error when closing
  }
  function openAddServerModal() { setIsAddServerModalOpen(true); }

  // --- Handlers --- 
  const handleAddManualServer = async (data: ManualServerAddData) => {
    setAddServerFormError(null); // Clear previous errors
    setIsAddingServer(true);

    // --- Basic Frontend Validation --- 
    if (!data.name.trim()) {
        setAddServerFormError("Server Name is required.");
        setIsAddingServer(false);
        return;
    }
    try {
        JSON.parse(data.env);
    } catch (e) {
        setAddServerFormError("Environment Variables must be valid JSON.");
        setIsAddingServer(false);
        return;
    }
    if (data.type === 'git' && (!data.gitUrl?.trim() || !data.scriptPath?.trim())) {
        setAddServerFormError("Git URL and Script Path are required for Git type.");
        setIsAddingServer(false);
        return;
    }
    if (data.type === 'npx' && !data.npxCommand?.trim()) {
        setAddServerFormError("NPX Command is required for NPX type.");
        setIsAddingServer(false);
        return;
    }
    // Note: Further validation (e.g., URL format, command parsing) could be added

    // --- Call Backend API (New Endpoint) --- 
    try {
        console.log("[Add Server] Calling install-manual-server with data:", data);
        const response = await fetch('/api/install-manual-server', { // Use the new endpoint
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data), // Send the structured data
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `Manual installation failed with status ${response.status}`);
        }
        
        const newServerConfig = result as ServerConfig;
        setServers(prev => [...prev, newServerConfig]);
        console.log(`Server ${data.name} added successfully via manual install.`);
        closeAddServerModal(); // Close modal on success

    } catch (error: any) {
        console.error(`Failed to add server ${data.name}:`, error);
        setAddServerFormError(error.message || "An unknown error occurred during installation.");
    } finally {
        setIsAddingServer(false);
    }
  };

  const handleDeleteServer = (id: string) => {
    setServers(servers.filter(server => server.id !== id));
    // Optionally disconnect or update tools if connected?
    // For now, just remove from list. User needs to reconnect.
    setServerTools([]); 
    setConnectionStatus('idle');
  };

  const handleConnectServers = async () => {
    if (servers.length === 0) return;
    setConnectionStatus('connecting');
    setConnectionError(null);
    setServerTools([]); // Clear previous results

    try {
      const response = await fetch('/api/server-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ servers }), // Send the array of servers
      });

      const results: ServerToolsResult[] = await response.json();

      if (!response.ok) {
        // Use error from response body if available
        const errorMsg = results?.[0]?.error || `Server info API responded with status ${response.status}`;
        throw new Error(errorMsg);
      }
      
      setServerTools(results);

      // Determine overall status
      const allConnected = results.every(r => r.status === 'connected');
      const anyConnected = results.some(r => r.status === 'connected');
      
      if (allConnected) {
          setConnectionStatus('connected');
      } else if (anyConnected) {
          setConnectionStatus('partial');
      } else {
          setConnectionStatus('error');
          setConnectionError('Failed to connect to any server.'); // Set a general error
      }

      console.log('Server connection results:', results);

    } catch (error: any) {
      console.error('Failed to connect to servers:', error);
      setConnectionError(error.message || 'Failed to fetch server info.');
      setConnectionStatus('error');
      setServerTools([]); // Ensure tools are cleared on fetch error
    }
  };

  // Handler for clicking Edit on an existing server
  const handleEditServerClick = (server: ServerConfig) => {
      setModalMode('edit');
      setServerToConfigure(server); // Store the existing config
      setConfiguringEnvString(server.env); // Load current env
      setConfigureEnvError(null);
      setIsConfigureModalOpen(true);
  };

  // Handler for saving changes from the Edit mode
  const handleSaveChanges = () => {
    if (!serverToConfigure || !('id' in serverToConfigure)) return; // Ensure it's a ServerConfig
    setConfigureEnvError(null);
    // Validate JSON
    try {
        JSON.parse(configuringEnvString);
    } catch (e) {
        setConfigureEnvError('Invalid JSON format for Environment Variables.');
        return;
    }
    // Update the server in the main state
    setServers(prevServers => 
        prevServers.map(s => 
            s.id === (serverToConfigure as ServerConfig).id 
              ? { ...s, env: configuringEnvString } 
              : s
        )
    );
    console.log(`Updated env for server: ${serverToConfigure.name}`);
    closeConfigureModal();
  };

  // --- Installer Handlers ---
  // Step 1: Initial click on "Install"
  const handleInstallClick = (serverDef: MarketServerDefinition) => {
    if (needsConfiguration(serverDef.defaultEnv)) {
        console.log(`Config needed for ${serverDef.name}`);
        setModalMode('pre-install');
        setServerToConfigure(serverDef);
        setConfiguringEnvString(serverDef.defaultEnv || '{}');
        setConfigureEnvError(null);
        setIsConfigureModalOpen(true); 
        setInstallingServerId(serverDef.id);
    } else {
        console.log(`No config needed for ${serverDef.name}, installing.`);
        callInstallApi(serverDef); 
    }
  };

  // Step 2: User confirms pre-installation config
  const handleConfirmConfigurationAndInstall = () => {
    if (!serverToConfigure || 'id' in serverToConfigure) return; // Ensure it's a MarketServerDefinition
    // ... (validation remains the same) ...
    try { JSON.parse(configuringEnvString); } catch (e) { setConfigureEnvError('Invalid JSON'); return; }
    callInstallApi(serverToConfigure as MarketServerDefinition, configuringEnvString);
  };

  // Step 3: Actual API call (remains the same)
  const callInstallApi = async (serverDef: MarketServerDefinition, envStringOverride?: string) => {
    setInstallingServerId(serverDef.id); // Ensure loading indicator is on
    setInstallError(null); // Clear previous market errors
    try {
        const requestBody: { id: string; envString?: string } = { id: serverDef.id };
        if (envStringOverride !== undefined) {
            requestBody.envString = envStringOverride;
        }
        
        const response = await fetch('/api/install-server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });
        
        const result = await response.json();
        if (!response.ok) { throw new Error(result.error || `Installation failed with status ${response.status}`); }
        
        const newServerConfig = result as ServerConfig;
        setServers(prev => [...prev, newServerConfig]);
        console.log(`Server ${serverDef.name} installed successfully.`);
        closeConfigureModal(); // Close configure modal if open
        closeMarketModal(); // Close market modal

    } catch (error: any) {
        console.error(`Failed to install server ${serverDef.name}:`, error);
        // Show error in the appropriate modal
        if (isConfigureModalOpen) {
            setConfigureEnvError(error.message || "An unknown error occurred during installation.");
        } else {
            setInstallError(error.message || "An unknown error occurred during installation.");
        }
    } finally {
        // Clear loading indicator only after API call finishes (success or fail)
        setInstallingServerId(null); 
    }
  };

  const handleSendMessage = async () => {
    // Check if at least one server is connected
    const canChat = connectionStatus === 'connected' || connectionStatus === 'partial';
    if (!currentMessage.trim() || isLoading || !canChat) return;

    // Close any existing stream connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    const newUserMessage: Message = { role: "user", content: currentMessage };
    const currentMessages = [...messages, newUserMessage];
    setMessages(currentMessages);
    setCurrentMessage(''); 
    setIsLoading(true); // Disable input

    // Filter out any properties not expected by the API before sending
    const apiMessages = currentMessages.map(({ toolName, ...rest }) => rest);
    // Get only the successfully connected server configs to pass to chat API?
    // Or pass all and let backend try to connect? Let's pass all for now.
    const activeServers = servers; 
    
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
        const response = await fetch('/api/chat', {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 'Accept': 'text/event-stream'
             },
             // Send the list of all defined servers
             body: JSON.stringify({ messages: apiMessages, servers: activeServers }),
         });
         // ... rest of stream handling logic (remains the same) ...
         if (!response.ok || !response.body) {
            let errorMsg = `API error: ${response.status}`;
            try { const errorData = await response.json(); errorMsg = errorData.error || JSON.stringify(errorData); } catch {}
            throw new Error(errorMsg);
        }
        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let streamEndedGracefully = false;
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                if (!streamEndedGracefully) { streamEndedGracefully = true; }
                break;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; 
            for (const line of lines) {
                 if (line.startsWith("data:")) {
                    const jsonString = line.substring(5).trim();
                    if (jsonString) {
                        try {
                            const data = JSON.parse(jsonString);
                            if (data.type === 'message') {
                                setMessages(prev => [...prev, data.message as Message]);
                            } else if (data.type === 'error') {
                                console.error("Stream error message:", data.error);
                                setMessages(prev => [...prev, { role: 'assistant', content: `Stream Error: ${data.error}` } ]);
                                streamEndedGracefully = true;
                                break;
                            } else if (data.type === 'done') {
                                console.log("Received done signal.");
                                streamEndedGracefully = true;
                                break;
                            }
                        } catch (e) {
                             console.error("Failed to parse stream data:", jsonString, e);
                        }
                    }
                }
            }
             if (streamEndedGracefully) { break; }
        }
    } catch (error: any) {
        console.error("Error sending message or processing stream:", error);
        setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Error: ${error.message || "Failed to connect or process stream"}` 
        }]);
    } finally {
        setIsLoading(false);
        if (reader) {
            try { await reader.cancel(); } catch (cancelError) { /* ignore */ }
        }
    }
  };

  // --- Render Logic --- 
  const showToolsButtonEnabled = (connectionStatus === 'connected' || connectionStatus === 'partial') && serverTools.length > 0;

  return (
    <>
      <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-gray-50">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 w-full">Simple MCP Client</h1>

        <div className="w-full max-w-7xl flex flex-col lg:flex-row gap-6">
          {/* --- Left Column: Server Management & Tools --- */}
          <ServerManagementPanel
              servers={servers}
              connectionStatus={connectionStatus}
              connectionError={connectionError}
              handleDeleteServer={handleDeleteServer}
              handleEditServerClick={handleEditServerClick}
              openAddServerModal={openAddServerModal}
              handleConnectServers={handleConnectServers}
              openMarketModal={openMarketModal}
              openToolsModal={openToolsModal}
              showToolsButtonEnabled={showToolsButtonEnabled}
              serverTools={serverTools}
          />

          {/* --- Right Column: Chat Interface --- */}
          <ChatInterface 
              messages={messages}
              isLoading={isLoading}
              currentMessage={currentMessage}
              setCurrentMessage={setCurrentMessage}
              handleSendMessage={handleSendMessage}
              connectionStatus={connectionStatus}
          />
        </div>
      </main>

      {/* --- Modals --- */}
      <AddServerModal 
          isOpen={isAddServerModalOpen}
          closeModal={closeAddServerModal}
          handleAddManualServer={handleAddManualServer}
          addServerFormError={addServerFormError}
          isAddingServer={isAddingServer}
      />

      <ToolsModal 
          isOpen={isToolsModalOpen}
          closeModal={closeToolsModal}
          serverTools={serverTools}
      />
      <MarketModal 
          isOpen={isMarketModalOpen}
          closeModal={closeMarketModal}
          servers={servers}
          installError={installError}
          installingServerId={installingServerId}
          handleInstallClick={handleInstallClick}
      />
      <ConfigureEnvModal 
          isOpen={isConfigureModalOpen}
          closeModal={closeConfigureModal}
          mode={modalMode}
          serverToConfigure={serverToConfigure}
          configuringEnvString={configuringEnvString}
          setConfiguringEnvString={setConfiguringEnvString}
          configureEnvError={configureEnvError}
          handleSaveChanges={handleSaveChanges}
          handleConfirmConfigurationAndInstall={handleConfirmConfigurationAndInstall}
          isLoading={installingServerId === (serverToConfigure as MarketServerDefinition)?.id && modalMode === 'pre-install'} 
      />
    </>
  );
}

