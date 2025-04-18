"use client";

import { useState, useEffect, useRef, Fragment } from "react";
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid'; // Import uuid for unique keys
import { Dialog, Transition } from '@headlessui/react' // Import Headless UI

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
}

// Type for grouped tools fetched from backend
interface ServerToolsResult {
    serverName: string;
    tools: ToolInfo[];
    status: 'connected' | 'error';
    error?: string;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam & { toolName?: string };

export default function Home() {
  // --- State Management --- 
  const [servers, setServers] = useState<ServerConfig[]>([]); // Array of server configs
  const [serverTools, setServerTools] = useState<ServerToolsResult[]>([]); // Array of results per server
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'partial' | 'connected' | 'error'>('idle'); // Overall connection status
  const [connectionError, setConnectionError] = useState<string | null>(null); // General connection error
  
  // State for the Add Server form
  const [newServerName, setNewServerName] = useState<string>('');
  const [newServerPath, setNewServerPath] = useState<string>('');
  const [newServerEnv, setNewServerEnv] = useState<string>('{}');
  const [addServerFormError, setAddServerFormError] = useState<string | null>(null);

  // Chat state remains the same
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // State for Tools Modal
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

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
  
  // --- Handlers --- 
  const handleAddServer = () => {
    setAddServerFormError(null);
    if (!newServerName.trim() || !newServerPath.trim()) {
      setAddServerFormError('Server Name and Path are required.');
      return;
    }
    // Basic JSON validation for env
    try {
      JSON.parse(newServerEnv);
    } catch (e) {
      setAddServerFormError('Environment Variables must be valid JSON.');
      return;
    }
    
    const newServer: ServerConfig = {
      id: uuidv4(),
      name: newServerName.trim(),
      path: newServerPath.trim(),
      env: newServerEnv,
    };
    setServers([...servers, newServer]);
    // Clear form
    setNewServerName('');
    setNewServerPath('');
    setNewServerEnv('{}');
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
  const canChat = connectionStatus === 'connected' || connectionStatus === 'partial';
  const showToolsButtonEnabled = (connectionStatus === 'connected' || connectionStatus === 'partial') && serverTools.length > 0;

  return (
    <>
      <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-gray-50">
        <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 w-full">Simple MCP Client</h1>

        <div className="w-full max-w-7xl flex flex-col lg:flex-row gap-6">
          {/* --- Left Column: Server Management & Tools --- */}
          <div className="lg:w-1/3 flex flex-col gap-6 order-2 lg:order-1">
            {/* Server Configuration Management */}
            <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
              <h2 className="text-xl font-semibold mb-4 text-gray-700">MCP Servers</h2>
              
              {/* List of Configured Servers */}
              <div className="mb-4 space-y-3 max-h-60 overflow-y-auto pr-2">
                {servers.length === 0 && <p className="text-sm text-gray-500">No servers configured.</p>}
                {servers.map((server) => (
                  <div key={server.id} className="border rounded-md p-3 bg-gray-50 relative">
                    <p className="font-semibold text-gray-800">{server.name}</p>
                    <p className="text-xs text-gray-600 break-all">Path: {server.path}</p>
                    <p className="text-xs text-gray-500 mt-1">Env: {server.env}</p>
                    <button 
                      onClick={() => handleDeleteServer(server.id)}
                      className="absolute top-2 right-2 text-red-500 hover:text-red-700 p-1"
                      title="Delete Server"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Server Form */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-md font-semibold mb-2 text-gray-600">Add New Server</h3>
                <div className="space-y-2">
                   <input
                    type="text"
                    placeholder="Server Name (e.g., Weather API)"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                   <input
                    type="text"
                    placeholder="Full Script Path (e.g., /path/to/server.py)"
                    value={newServerPath}
                    onChange={(e) => setNewServerPath(e.target.value)}
                    className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  />
                  <textarea
                    rows={2}
                    placeholder='Env Vars (JSON format, e.g., { "API_KEY": "123" })'
                    value={newServerEnv}
                    onChange={(e) => setNewServerEnv(e.target.value)}
                    className="w-full px-3 py-2 text-black border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
                {addServerFormError && <p className="text-red-500 text-xs mt-1">{addServerFormError}</p>}
                <button
                  onClick={handleAddServer}
                  className="w-full mt-3 px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 text-sm font-medium"
                >
                  Add Server
                </button>
              </div>
              
              {/* Connect Button */}
              <div className="mt-4 border-t pt-4">
                  <button
                    onClick={handleConnectServers} // Connect to all listed servers
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

               {/* Add Button to Open Tools Modal */} 
               <div className="mt-4 border-t pt-4">
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

          {/* --- Right Column: Chat Interface --- */}
          <div className="lg:w-2/3 flex flex-col order-1 lg:order-2">
            <div className="flex flex-col h-[80vh] border border-gray-200 rounded-lg overflow-hidden shadow-lg bg-white">
              {/* Message Display Area */}
              <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.length === 0 && !canChat && (
                  <div className="text-center text-gray-500 text-sm mt-4 p-4 bg-yellow-50 rounded-md border border-yellow-200">
                    Add and connect to at least one MCP server using the panel on the left to begin chatting.
                  </div>
                )}
                 {messages.length === 0 && canChat && (
                  <div className="text-center text-gray-500 text-sm mt-4">
                     Server(s) connected. Send a message to start chatting.
                     {connectionStatus === 'partial' && <span className="block text-xs text-yellow-600">(Note: Some servers failed to connect)</span>}
                  </div>
                )}
               {/* Message rendering logic remains the same */}
               {messages.map((msg, index) => {
                  const getStringContent = (content: any): string => {
                    if (typeof content === 'string') return content;
                    if (content === null || content === undefined) return "";
                    if (Array.isArray(content)) {
                      return content.map(part => {
                        if (part.type === 'text') return part.text;
                        return `[Unsupported content part: ${part.type || 'unknown'}]`;
                      }).join('\n');
                    }
                    try { return JSON.stringify(content); } catch { return "[Unserializable content]"; }
                  };
                  let contentToShow: string = "";
                  let roleClass = '';
                  let justification = '';
                  if (msg.role === 'user') {
                    roleClass = 'bg-blue-500 text-white';
                    justification = 'justify-end';
                    contentToShow = getStringContent(msg.content);
                  } else if (msg.role === 'assistant') {
                    const isToolCallRequest = msg.tool_calls && msg.tool_calls.length > 0;
                    roleClass = isToolCallRequest 
                      ? 'bg-purple-100 text-purple-800 border border-purple-200 italic text-sm'
                      : 'bg-gray-100 text-gray-800 border border-gray-200';
                    justification = 'justify-start';
                    let assistantText = getStringContent(msg.content);
                    if (isToolCallRequest && msg.tool_calls) { 
                      const toolCallInfo = `\n(Requesting tools: ${msg.tool_calls.map(tc => tc.function.name).join(', ')})`;
                      contentToShow = assistantText ? `${assistantText}${toolCallInfo}` : toolCallInfo.trim();
                    } else {
                      contentToShow = assistantText;
                    }
                  } else if (msg.role === 'tool') {
                    roleClass = 'bg-yellow-100 text-yellow-800 text-xs italic border border-yellow-200';
                    justification = 'justify-start';
                    const toolContent = getStringContent(msg.content);
                    contentToShow = `Tool Result [${msg.tool_call_id}]:\n${toolContent}`;
                  }
                  return (
                    <div key={index} className={`flex ${justification} mb-2`}>
                      <div className={`p-3 rounded-lg max-w-sm break-words md:max-w-md lg:max-w-lg xl:max-w-xl whitespace-pre-wrap shadow-sm ${roleClass}`}>
                        {contentToShow}
                      </div>
                    </div>
                  );
                })}
                 {isLoading && (
                  <div className="flex justify-start">
                      <div className="p-3 rounded-lg bg-gray-100 text-gray-500 border border-gray-200 animate-pulse">
                          Thinking...
                      </div>
                  </div>
               )}
              <div ref={messagesEndRef} />
              </div>

              {/* Message Input Area */}
              <div className="border-t border-gray-200 p-4 bg-white">
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={currentMessage}
                    onChange={(e) => setCurrentMessage(e.target.value)}
                    placeholder={canChat ? "Type your message..." : "Connect to server(s) first..."}
                    className="flex-grow px-4 py-2 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black"
                    onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                    disabled={isLoading || !canChat}
                  />
                   <button
                     onClick={handleSendMessage}
                     disabled={isLoading || !currentMessage.trim() || !canChat}
                     className={`p-2 rounded-full text-white transition-colors duration-200 ${ 
                       isLoading || !currentMessage.trim() || !canChat
                         ? 'bg-gray-400 cursor-not-allowed'
                         : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                     }`}
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                       <path d="M3.105 3.105a1.5 1.5 0 0 1 1.995-.256l11.67 6.053a1.5 1.5 0 0 1 0 2.798l-11.67 6.053a1.5 1.5 0 0 1-1.995-.256L1 11.76a1.5 1.5 0 0 1 0-2.522L3.105 3.105Z" />
                     </svg>
                   </button>
                </div>
                 {/* Optional: Add a specific message if connection is partial */}
                {connectionStatus === 'partial' && (
                    <p className="text-xs text-yellow-600 mt-1 text-center">Note: Some servers failed to connect. Available tools may be limited.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* --- Tools Modal --- */}
      <Transition appear show={isToolsModalOpen} as={Fragment}>
        <Dialog as="div" className="relative z-10" onClose={closeToolsModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black/30" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-gray-900 border-b pb-2 mb-4"
                  >
                    Available MCP Tools
                  </Dialog.Title>
                  <div className="mt-2 max-h-[60vh] overflow-y-auto pr-2">
                    {/* Tools rendering logic moved here */}
                    {serverTools.length === 0 && <p className="text-sm text-gray-500">No servers connected or tools found.</p>}
                    {serverTools.map(serverResult => (
                      <div key={serverResult.serverName} className="mb-4 last:mb-0">
                        <h4 className={`text-md font-semibold mb-2 flex items-center gap-2 sticky top-0 bg-white py-1 ${serverResult.status === 'connected' ? 'text-gray-800' : 'text-red-600'}`}>
                           {serverResult.status === 'connected' 
                             ? <span className="text-green-500" title="Connected">●</span>
                             : <span className="text-red-500" title={`Error: ${serverResult.error || 'Unknown'}`}>●</span> }
                           {serverResult.serverName}
                        </h4>
                        {serverResult.status === 'connected' && serverResult.tools.length > 0 && (
                            <ul className="space-y-2 pl-4 border-l ml-1">
                              {serverResult.tools.map((tool) => (
                                <li key={tool.name} className="text-sm text-gray-600 border-b pb-1 last:border-b-0">
                                  <strong className="font-medium text-gray-800 block">{tool.name}</strong>
                                   {tool.description && <p className="text-xs mt-1">{tool.description}</p>}
                                </li>
                              ))}
                            </ul>
                        )}
                         {serverResult.status === 'connected' && serverResult.tools.length === 0 && (
                             <p className="text-xs text-gray-500 pl-4 ml-1">No tools found for this server.</p>
                         )}
                         {serverResult.status === 'error' && (
                             <p className="text-xs text-red-500 pl-4 ml-1 break-words">Connection failed: {serverResult.error || 'Unknown error'}</p>
                         )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 border-t pt-4">
                    <button
                      type="button"
                      className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      onClick={closeToolsModal}
                    >
                      Close
                    </button>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </>
  );
}

