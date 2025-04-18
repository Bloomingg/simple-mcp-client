"use client";

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { MarketServerDefinition } from "@/lib/market-servers"; // Adjust path if needed

// Define ServerConfig locally for this component
// (Matches definition in page.tsx)
interface ServerConfig {
  id: string;
  name: string;
  path: string;
  env: string;
  marketId?: string;
}

interface ConfigureEnvModalProps {
    isOpen: boolean;
    closeModal: () => void;
    mode: 'pre-install' | 'edit';
    serverToConfigure: MarketServerDefinition | ServerConfig | null;
    configuringEnvString: string;
    setConfiguringEnvString: (value: string) => void;
    configureEnvError: string | null;
    handleSaveChanges: () => void;
    handleConfirmConfigurationAndInstall: () => void;
    isLoading: boolean; // Indicate if install/save is in progress
}

export default function ConfigureEnvModal({
    isOpen,
    closeModal,
    mode,
    serverToConfigure,
    configuringEnvString,
    setConfiguringEnvString,
    configureEnvError,
    handleSaveChanges,
    handleConfirmConfigurationAndInstall,
    isLoading
}: ConfigureEnvModalProps) {
    const serverName = serverToConfigure?.name || 'Server';
    const isInstalling = mode === 'pre-install' && isLoading; // Loading only applies to install

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-20" onClose={closeModal}>
                {/* Backdrop */}
                <Transition.Child 
                    as="div" 
                    className="fixed inset-0 bg-black/50"
                    enter="ease-out duration-300" 
                    enterFrom="opacity-0" 
                    enterTo="opacity-100" 
                    leave="ease-in duration-200" 
                    leaveFrom="opacity-100" 
                    leaveTo="opacity-0"
                /> 
                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        <Transition.Child 
                            as="div" 
                            className="w-full max-w-xl" 
                            enter="ease-out duration-300" 
                            enterFrom="opacity-0 scale-95" 
                            enterTo="opacity-100 scale-100" 
                            leave="ease-in duration-200" 
                            leaveFrom="opacity-100 scale-100" 
                            leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="transform overflow-hidden rounded-xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
                                    {mode === 'pre-install' ? 'Configure Environment for Installation' : 'Edit Environment'}
                                </Dialog.Title>
                                <div className="mt-2">
                                    <p className="text-sm text-gray-500 mb-2">
                                        {mode === 'pre-install' 
                                            ? <>Please provide values for the required environment variables for <strong>{serverName}</strong>.</>
                                            : <>Editing environment variables for <strong>{serverName}</strong>.</>
                                        }
                                    </p>
                                    <textarea
                                        rows={5}
                                        className="w-full px-3 py-2 text-black border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 font-mono text-xs"
                                        value={configuringEnvString}
                                        onChange={(e) => setConfiguringEnvString(e.target.value)}
                                        disabled={isInstalling} // Disable textarea only during install
                                    />
                                    {configureEnvError && <p className="text-red-500 text-xs mt-1">{configureEnvError}</p>} 
                                </div>
                                <div className="mt-4 flex justify-end gap-2 border-t pt-4">
                                    <button 
                                        type="button" 
                                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
                                        onClick={closeModal} 
                                        disabled={isInstalling} // Also disable cancel during install
                                     >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        className={`inline-flex justify-center items-center rounded-md border border-transparent px-4 py-2 text-sm font-medium text-white ${isInstalling ? 'bg-gray-400 cursor-wait' : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'}`}
                                        onClick={mode === 'edit' ? handleSaveChanges : handleConfirmConfigurationAndInstall}
                                        disabled={isInstalling} // Only disable during install
                                    >
                                        {isInstalling && (
                                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        )}
                                        {mode === 'edit' 
                                            ? 'Save Changes' 
                                            : (isInstalling ? 'Installing...' : 'Confirm & Install')}
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
