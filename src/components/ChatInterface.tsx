"use client";

import { useRef, useEffect } from 'react';
import OpenAI from 'openai';

// Define types locally (or move to shared types file)
type Message = OpenAI.Chat.ChatCompletionMessageParam & { toolName?: string };
interface ToolCall { id?: string; type: 'function'; function: { name: string; arguments: string; }; }

interface ChatInterfaceProps {
    messages: Message[];
    isLoading: boolean;
    currentMessage: string;
    setCurrentMessage: (value: string) => void;
    handleSendMessage: () => void;
    connectionStatus: 'idle' | 'connecting' | 'partial' | 'connected' | 'error';
}

export default function ChatInterface({
    messages,
    isLoading,
    currentMessage,
    setCurrentMessage,
    handleSendMessage,
    connectionStatus
}: ChatInterfaceProps) {
    const messagesEndRef = useRef<null | HTMLDivElement>(null);
    const canChat = connectionStatus === 'connected' || connectionStatus === 'partial';

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

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

    return (
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
                    {messages.map((msg, index) => {
                        let contentToShow: string = "";
                        let roleClass = '';
                        let justification = '';
                        let toolCalls: ToolCall[] | undefined | null = (msg as any).tool_calls; // Type assertion needed

                        if (msg.role === 'user') {
                            roleClass = 'bg-blue-500 text-white';
                            justification = 'justify-end';
                            contentToShow = getStringContent(msg.content);
                        } else if (msg.role === 'assistant') {
                            const isToolCallRequest = toolCalls && toolCalls.length > 0;
                            roleClass = isToolCallRequest 
                                ? 'bg-purple-100 text-purple-800 border border-purple-200 italic text-sm'
                                : 'bg-gray-100 text-gray-800 border border-gray-200';
                            justification = 'justify-start';
                            let assistantText = getStringContent(msg.content);
                            if (isToolCallRequest && toolCalls) { 
                                const toolCallInfo = `\n(Requesting tools: ${toolCalls.map(tc => tc.function.name).join(', ')})`;
                                contentToShow = assistantText ? `${assistantText}${toolCallInfo}` : toolCallInfo.trim();
                            } else {
                                contentToShow = assistantText;
                            }
                        } else if (msg.role === 'tool') {
                            roleClass = 'bg-yellow-100 text-yellow-800 text-xs italic border border-yellow-200';
                            justification = 'justify-start';
                            const toolContent = getStringContent(msg.content);
                            contentToShow = `Tool Result [${(msg as any).tool_call_id}]:\n${toolContent}`; // Type assertion needed
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
                    {connectionStatus === 'partial' && (
                        <p className="text-xs text-yellow-600 mt-1 text-center">Note: Some servers failed to connect. Available tools may be limited.</p>
                    )}
                </div>
            </div>
        </div>
    );
} 