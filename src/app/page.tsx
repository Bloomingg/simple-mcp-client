"use client";

import { useState, useEffect, useRef } from "react";
import OpenAI from 'openai';

interface ToolInfo {
  name: string;
  description: string;
  inputSchema: any;
}

type Message = OpenAI.Chat.ChatCompletionMessageParam & { toolName?: string };

export default function Home() {
  const [serverPath, setServerPath] = useState<string>("");
  const [serverEnv, setServerEnv] = useState<string>("{}");
  const [serverTools, setServerTools] = useState<ToolInfo[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>("disconnected"); // disconnected, connecting, connected, error
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleConnectServer = async () => {
    setConnectionStatus("connecting");
    setConnectionError(null);
    setServerTools([]);
    try {
      let parsedEnv = {};
      try {
        parsedEnv = JSON.parse(serverEnv);
      } catch (e) {
        throw new Error("Invalid JSON format for Environment Variables.");
      }

      const response = await fetch('/api/server-info', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ serverPath, serverEnv }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Server responded with status ${response.status}`);
      }

      // Assuming the API returns { tools: ToolInfo[] }
      const fetchedTools: ToolInfo[] = data.tools || [];
      setServerTools(fetchedTools);
      setConnectionStatus("connected");
      console.log("Server connected successfully. Tools:", fetchedTools.map(t => t.name));

    } catch (error: any) {
      console.error("Failed to connect to server:", error);
      setConnectionError(error.message || "Failed to connect to server.");
      setConnectionStatus("error");
    }
  };

  const handleSendMessage = async () => {
    if (!currentMessage.trim() || isLoading || connectionStatus !== 'connected') return;
    try {
      JSON.parse(serverEnv);
    } catch (e) {
      setMessages([...messages, { role: "assistant", content: "Error: Invalid JSON in Environment Variables field. Please fix and retry." }]);
      return;
    }
    const newUserMessage: Message = { role: "user", content: currentMessage };
    const currentMessages = [...messages, newUserMessage];
    setMessages(currentMessages);
    setCurrentMessage(""); 
    setIsLoading(true); // Disable input

    const apiMessages = currentMessages.map(({ toolName, ...rest }) => rest);
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null; // Keep track of the reader

    try {
        const response = await fetch('/api/chat', {
             method: 'POST',
             headers: {
                 'Content-Type': 'application/json',
                 'Accept': 'text/event-stream'
             },
             body: JSON.stringify({ messages: apiMessages, serverPath, serverEnv }),
         });

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
                console.log("Stream reader finished.");
                if (!streamEndedGracefully) {
                    console.warn("Stream ended without explicit 'done' signal.");
                    // Treat this as completion, although potentially unexpected.
                    streamEndedGracefully = true;
                }
                break; // Exit the reading loop
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
                                // Input remains disabled
                            } else if (data.type === 'error') {
                                console.error("Stream error message:", data.error);
                                setMessages(prev => [...prev, { role: 'assistant', content: `Stream Error: ${data.error}` } ]);
                                streamEndedGracefully = true; // Mark as ended (due to error)
                                break; // Exit inner loop, finally block will handle isLoading
                            } else if (data.type === 'done') {
                                console.log("Received done signal.");
                                streamEndedGracefully = true; // Mark as ended successfully
                                break; // Exit inner loop, finally block will handle isLoading
                            }
                        } catch (e) {
                             console.error("Failed to parse stream data:", jsonString, e);
                             // Optionally add a generic parse error message to UI
                             // setMessages(prev => [...prev, { role: 'assistant', content: `Error parsing stream data.` } ]);
                        }
                    }
                }
            }
             if (streamEndedGracefully) {
                 break; // Exit the main while loop if inner loop detected 'done' or 'error'
             }
        }

    } catch (error: any) {
        console.error("Error sending message or processing stream:", error);
        // Add error message, finally block will handle isLoading
        setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `Error: ${error.message || "Failed to connect or process stream"}` 
        }]);
    } finally {
        // This block always runs, ensuring the input is re-enabled correctly.
        setIsLoading(false);
        console.log("Stream processing finished or errored out. Input enabled.");
        // Attempt to cancel the reader if it's still active (e.g., due to early exit)
        if (reader) {
            try {
                 await reader.cancel();
                 console.log("Stream reader cancelled.");
            } catch (cancelError) {
                 console.error("Error cancelling stream reader:", cancelError);
            }
        }
    }
  };

  // Add effect to close EventSource on component unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log("Closing EventSource connection on unmount.");
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-8 bg-gray-50">
      <h1 className="text-3xl font-bold mb-8 text-center text-gray-800 w-full">MCP Client (Next.js + OpenAI)</h1>

      <div className="w-full max-w-7xl flex flex-col lg:flex-row gap-6">
        <div className="lg:w-1/3 flex flex-col gap-6 order-2 lg:order-1">
          <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">MCP Server Configuration</h2>
            <div className="mb-4">
              <label htmlFor="serverPath" className="block text-sm font-medium text-gray-600 mb-1">
                Server Script Path
              </label>
              <input
                type="text"
                id="serverPath"
                value={serverPath}
                onChange={(e) => setServerPath(e.target.value)}
                placeholder="Enter full path to MCP server script"
                className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                disabled={connectionStatus === 'connecting'}
              />
            </div>
            <div className="mb-4">
              <label htmlFor="serverEnv" className="block text-sm font-medium text-gray-600 mb-1">
                Environment Variables (JSON format)
              </label>
              <textarea
                id="serverEnv"
                rows={3}
                value={serverEnv}
                onChange={(e) => setServerEnv(e.target.value)}
                placeholder='e.g., { "API_KEY": "your_key", "OTHER_VAR": "value" }'
                className="w-full px-3 py-2 text-black border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-sm"
                disabled={connectionStatus === 'connecting'}
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={handleConnectServer}
                disabled={!serverPath || connectionStatus === 'connecting'}
                className={`px-4 py-2 rounded-md text-white font-medium ${ 
                  !serverPath || connectionStatus === 'connecting'
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                }`}
              >
                {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect & Get Tools'}
              </button>
              <div>
                {connectionStatus === 'connected' && (
                  <p className="text-green-600 text-sm font-medium">✅ Connected</p>
                )}
                {connectionStatus === 'error' && (
                  <p className="text-red-600 text-sm font-medium" title={connectionError || 'Unknown error'}>❌ Error</p>
                )}
              </div>
            </div>
            {connectionStatus === 'error' && connectionError && (
              <p className="text-red-500 text-xs mt-2 break-words">Error details: {connectionError}</p>
            )}
          </div>

          {serverTools.length > 0 && connectionStatus === 'connected' && (
            <div className="bg-white shadow-lg rounded-lg p-6 border border-gray-200">
              <h2 className="text-xl font-semibold mb-3 text-gray-700">Available Tools</h2>
              <ul className="space-y-2">
                {serverTools.map((tool) => (
                  <li key={tool.name} className="text-sm text-gray-600 border-b pb-1 last:border-b-0">
                    <strong className="font-medium text-gray-800 block">{tool.name}</strong>
                    <p className="text-xs mt-1">{tool.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="lg:w-2/3 flex flex-col order-1 lg:order-2">
          <div className="flex flex-col h-[80vh] border border-gray-200 rounded-lg overflow-hidden shadow-lg bg-white">
            <div className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-50">
              {messages.length === 0 && connectionStatus === 'connected' && (
                <div className="text-center text-gray-500 text-sm mt-4">
                  Server connected. Send a message to start chatting.
                </div>
              )}
              {messages.length === 0 && connectionStatus !== 'connected' && (
                <div className="text-center text-gray-500 text-sm mt-4">
                  Connect to an MCP server using the panel on the left to begin.
                </div>
              )}
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
                  try {
                    return JSON.stringify(content);
                  } catch {
                    return "[Unserializable content]";
                  }
                };

                let contentToShow: string = "";
                let roleClass = '';
                let justification = '';

                if (msg.role === 'user') {
                  roleClass = 'bg-blue-500 text-white';
                  justification = 'justify-end';
                  contentToShow = getStringContent(msg.content);
                } else if (msg.role === 'assistant') {
                  // Check if the message contains tool calls
                  const isToolCallRequest = msg.tool_calls && msg.tool_calls.length > 0;
                  
                  roleClass = isToolCallRequest 
                     ? 'bg-purple-100 text-purple-800 border border-purple-200 italic text-sm' // Style for tool call requests
                     : 'bg-gray-100 text-gray-800 border border-gray-200'; // Normal assistant message style
                  
                  justification = 'justify-start';
                  let assistantText = getStringContent(msg.content);
                  
                  if (isToolCallRequest && msg.tool_calls) {
                    const toolCallInfo = `\n(Requesting tools: ${msg.tool_calls.map(tc => tc.function.name).join(', ')})`;
                    // If the message *only* contains tool calls (content is null/empty), just show the request info.
                    // Otherwise, combine content and request info.
                    contentToShow = assistantText ? `${assistantText}${toolCallInfo}` : toolCallInfo.trim(); // trim() removes leading newline if no text content
                  } else {
                    contentToShow = assistantText; // Regular assistant message content
                  }
                } else if (msg.role === 'tool') {
                  roleClass = 'bg-yellow-100 text-yellow-800 text-xs italic border border-yellow-200'; // Changed tool style
                  justification = 'justify-start';
                  const toolContent = getStringContent(msg.content);
                  contentToShow = `Tool Result [${msg.tool_call_id}]:\n${toolContent}`;
                }

                return (
                  <div
                    key={index}
                    className={`flex ${justification} mb-2`}
                  >
                    <div
                      className={`p-3 rounded-lg max-w-sm md:max-w-md lg:max-w-lg xl:max-w-xl whitespace-pre-wrap shadow-sm ${roleClass}`}
                    >
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

            <div className="border-t border-gray-200 p-4 bg-white">
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  placeholder={connectionStatus === 'connected' ? "Type your message..." : "Connect to server first..."}
                  className="flex-grow px-4 py-2 border border-gray-300 rounded-full shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-black"
                  onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleSendMessage()}
                  disabled={isLoading || connectionStatus !== 'connected'}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={isLoading || !currentMessage.trim() || connectionStatus !== 'connected'}
                  className={`p-2 rounded-full text-white transition-colors duration-200 ${ 
                    isLoading || !currentMessage.trim() || connectionStatus !== 'connected'
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path d="M3.105 3.105a1.5 1.5 0 0 1 1.995-.256l11.67 6.053a1.5 1.5 0 0 1 0 2.798l-11.67 6.053a1.5 1.5 0 0 1-1.995-.256L1 11.76a1.5 1.5 0 0 1 0-2.522L3.105 3.105Z" />
                  </svg>
                </button>
              </div>
              {connectionStatus !== 'connected' && messages.length > 0 && (
                <p className="text-xs text-red-500 mt-1 text-center">Please connect to an MCP server first to send messages.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
