"use client";

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { MARKET_SERVERS, MarketServerDefinition } from "@/lib/market-servers";
// Define ServerConfig locally again (or move to shared types file later)
interface ServerConfig {
  id: string;
  name: string;
  path: string;
  env: string;
  marketId?: string;
}

interface MarketModalProps {
    isOpen: boolean;
    closeModal: () => void;
    servers: ServerConfig[]; // Pass installed servers to check status
    installError: string | null;
    installingServerId: string | null;
    handleInstallClick: (serverDef: MarketServerDefinition) => void;
}

export default function MarketModal({
    isOpen,
    closeModal,
    servers,
    installError,
    installingServerId,
    handleInstallClick
}: MarketModalProps) {

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={closeModal}>
                {/* Backdrop */}
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
                        {/* Panel Container */}
                        <Transition.Child 
                            as="div" 
                            className="w-full max-w-3xl" 
                            enter="ease-out duration-300" 
                            enterFrom="opacity-0 scale-95" 
                            enterTo="opacity-100 scale-100" 
                            leave="ease-in duration-200" 
                            leaveFrom="opacity-100 scale-100" 
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 border-b pb-2 mb-4">
                                    Server Marketplace
                                </Dialog.Title>
                                
                                {installError && (
                                    <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded-md text-sm">
                                        <strong>Installation Error:</strong> {installError}
                                    </div>
                                )}
                                
                                <div className="mt-2 max-h-[60vh] overflow-y-auto pr-2 space-y-4">
                                    {MARKET_SERVERS.map((serverDef) => {
                                        const isInstalled = servers.some(s => s.marketId === serverDef.id);
                                        const isLoadingInstall = installingServerId === serverDef.id;
                                        return (
                                            <div key={serverDef.id} className={`border rounded-lg p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${isInstalled ? 'bg-green-50' : 'bg-white'}`}>
                                                <div className="flex-grow">
                                                    <h4 className="font-semibold text-gray-800 flex items-center gap-2 flex-wrap">
                                                        <span>{serverDef.name}</span>
                                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${serverDef.type === 'git' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                                            {serverDef.type === 'git' ? 'Git Repo' : 'NPX Package'}
                                                        </span>
                                                        {isInstalled && <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-medium">Installed</span>}
                                                    </h4>
                                                    <p className="text-sm text-gray-600 mt-1">{serverDef.description}</p>
                                                    {serverDef.type === 'git' && serverDef.gitUrl && (
                                                        <p className="text-xs text-gray-500 mt-2">Source: <a href={serverDef.gitUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">GitHub Repo</a></p>
                                                    )}
                                                    {serverDef.type === 'npx' && serverDef.npxCommand && (
                                                        <p className="text-xs text-gray-500 mt-2 font-mono bg-gray-100 px-1 rounded">Run Command: <code className='text-purple-700'>{serverDef.npxCommand}</code></p>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleInstallClick(serverDef)} // Use passed handler
                                                    disabled={isInstalled || isLoadingInstall}
                                                    className={`mt-2 sm:mt-0 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap ${ 
                                                        isLoadingInstall
                                                            ? 'bg-gray-300 text-gray-500 cursor-wait'
                                                            : isInstalled
                                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2'
                                                    }`}
                                                >
                                                    {isLoadingInstall ? 'Installing...' : (isInstalled ? 'Installed' : 'Install')}
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {MARKET_SERVERS.length === 0 && <p className="text-gray-500 text-sm">No servers available in the market definition.</p>}
                                </div>

                                <div className="mt-6 border-t pt-4">
                                    <button 
                                        type="button" 
                                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                        onClick={closeModal}
                                     >
                                         Cancel
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