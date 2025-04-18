"use client";

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';

// Define needed types locally (or move to shared types file)
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

interface ToolsModalProps {
    isOpen: boolean;
    closeModal: () => void;
    serverTools: ServerToolsResult[];
}

export default function ToolsModal({
    isOpen,
    closeModal,
    serverTools
}: ToolsModalProps) {

    return (
         <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={closeModal}>
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
                            as="div"
                            className="w-full max-w-2xl"
                            enter="ease-out duration-300"
                            enterFrom="opacity-0 scale-95"
                            enterTo="opacity-100 scale-100"
                            leave="ease-in duration-200"
                            leaveFrom="opacity-100 scale-100"
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title
                                    as="h3"
                                    className="text-lg font-medium leading-6 text-gray-900 border-b pb-2 mb-4"
                                >
                                    Available MCP Tools
                                </Dialog.Title>
                                <div className="mt-2 max-h-[60vh] overflow-y-auto pr-2">
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
                                        onClick={closeModal}
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
    );
} 