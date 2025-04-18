"use client";

import { Fragment, useState, useEffect } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { ManualServerAddData } from './ServerManagementPanel'; // Import the type

interface AddServerModalProps {
    isOpen: boolean;
    closeModal: () => void;
    handleAddManualServer: (data: ManualServerAddData) => Promise<void>; // Make async if parent is
    addServerFormError: string | null;
    isAddingServer: boolean;
}

export default function AddServerModal({
    isOpen,
    closeModal,
    handleAddManualServer,
    addServerFormError,
    isAddingServer
}: AddServerModalProps) {

    // --- State for the Add Server form --- 
    const [addType, setAddType] = useState<'git' | 'npx'>('git');
    const [manualName, setManualName] = useState('');
    const [manualEnv, setManualEnv] = useState('{}');
    // Git state
    const [gitUrl, setGitUrl] = useState('');
    const [scriptPath, setScriptPath] = useState('');
    const [subDirectory, setSubDirectory] = useState('');
    const [installCommands, setInstallCommands] = useState(''); // Store as string
    const [buildCommands, setBuildCommands] = useState(''); // Store as string
    // Npx state
    const [npxCommand, setNpxCommand] = useState('');
    
    // Clear form when modal opens/closes or type changes
    useEffect(() => {
        if (isOpen) {
             clearForm(); // Clear when opened
             setAddType('git'); // Default to git when opened
        }
    }, [isOpen]);
    
     useEffect(() => {
        // Clear specific fields when type changes
         clearForm(false); // Keep name and env
    }, [addType]);


    const handleAddClick = () => {
        const data: ManualServerAddData = {
            type: addType,
            name: manualName,
            env: manualEnv,
            gitUrl: addType === 'git' ? gitUrl : undefined,
            scriptPath: addType === 'git' ? scriptPath : undefined,
            subDirectory: addType === 'git' ? subDirectory : undefined,
            installCommands: addType === 'git' ? installCommands : undefined,
            buildCommands: addType === 'git' ? buildCommands : undefined,
            npxCommand: addType === 'npx' ? npxCommand : undefined,
        };
        // Call parent handler - parent will handle closing modal on success
        handleAddManualServer(data); 
    };

    // Helper to clear form
     const clearForm = (clearAll = true) => {
        if (clearAll) {
            setManualName('');
            setManualEnv('{}');
        }
        setGitUrl('');
        setScriptPath('');
        setSubDirectory('');
        setInstallCommands('');
        setBuildCommands('');
        setNpxCommand('');
        // Note: Error clearing is handled by the parent
    }

    return (
        <Transition appear show={isOpen} as={Fragment}>
            <Dialog as="div" className="relative z-10" onClose={closeModal}>
                {/* Backdrop */}
                <Transition.Child 
                    as={Fragment} 
                    enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" 
                    leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
                >
                    <div className="fixed inset-0 bg-black/30" />
                </Transition.Child>

                <div className="fixed inset-0 overflow-y-auto">
                    <div className="flex min-h-full items-center justify-center p-4 text-center">
                        {/* Panel Container */}
                        <Transition.Child 
                            as={Fragment} 
                            enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" 
                            leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
                        >
                            <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                                <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900 border-b pb-2 mb-4">
                                    Add Server Manually
                                </Dialog.Title>
                                
                                <div className="mt-2 space-y-4">
                                    {/* Type Selector */}
                                    <div className="flex items-center gap-4">
                                        <label className="text-sm font-medium text-gray-700">Type:</label>
                                        <div className="flex items-center gap-3">
                                             <label className="flex items-center gap-1 cursor-pointer">
                                                <input type="radio" name="addTypeModal" value="git" checked={addType === 'git'} onChange={() => setAddType('git')} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" />
                                                <span className="text-sm text-black">Git Repo</span>
                                            </label>
                                            <label className="flex items-center gap-1 cursor-pointer">
                                                <input type="radio" name="addTypeModal" value="npx" checked={addType === 'npx'} onChange={() => setAddType('npx')} className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300" />
                                                <span className="text-sm text-black">NPX Cmd</span>
                                            </label>
                                        </div>
                                    </div>

                                    {/* Common Fields */}
                                     <input
                                        type="text"
                                        placeholder="Server Name (e.g., My Custom Server)"
                                        value={manualName}
                                        onChange={(e) => setManualName(e.target.value)}
                                        className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                    />

                                    {/* Conditional Fields: Git */}
                                    {addType === 'git' && (
                                        <div className="space-y-2 pt-2 border-t border-gray-200">
                                             <label className="text-sm font-medium text-gray-600 block">Git Repository Details</label>
                                             <input type="text" placeholder="Git Repository URL *" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" />
                                             <input type="text" placeholder="Script Path (relative to repo/subdir) *" value={scriptPath} onChange={(e) => setScriptPath(e.target.value)} className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" />
                                             <input type="text" placeholder="Subdirectory (optional)" value={subDirectory} onChange={(e) => setSubDirectory(e.target.value)} className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm" />
                                             <textarea rows={2} placeholder="Install Commands (optional, one per line)" value={installCommands} onChange={(e) => setInstallCommands(e.target.value)} className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-xs"></textarea>
                                             <textarea rows={2} placeholder="Build Commands (optional, one per line)" value={buildCommands} onChange={(e) => setBuildCommands(e.target.value)} className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-xs"></textarea>
                                        </div>
                                    )}

                                    {/* Conditional Fields: NPX */}
                                    {addType === 'npx' && (
                                         <div className="space-y-2 pt-2 border-t border-gray-200">
                                             <label className="text-sm font-medium text-gray-600 block">NPX Command Details</label>
                                             <input type="text" placeholder="NPX Command (e.g., some-pkg@latest --port $PORT) *" value={npxCommand} onChange={(e) => setNpxCommand(e.target.value)} className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono" />
                                         </div>
                                    )}
                                    
                                     {/* Common Fields: Env */}
                                     <div className="pt-2 border-t border-gray-200">
                                         <label className="text-sm font-medium text-gray-600 block">Environment Variables</label>
                                         <textarea
                                            rows={3}
                                            placeholder='JSON format (e.g., { "API_KEY": "123" })'
                                            value={manualEnv}
                                            onChange={(e) => setManualEnv(e.target.value)}
                                            className="w-full px-3 text-black py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono text-xs"
                                        />
                                    </div>
                                </div>

                                {/* Error Message */}
                                {addServerFormError && (
                                    <div className="mt-4 p-3 bg-red-100 text-red-700 border border-red-200 rounded-md text-sm">
                                        <strong>Error:</strong> {addServerFormError}
                                    </div>
                                )}
                                
                                {/* Action Buttons */}
                                <div className="mt-6 flex justify-end gap-3 border-t pt-4">
                                    <button 
                                        type="button" 
                                        className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50"
                                        onClick={closeModal}
                                        disabled={isAddingServer}
                                     >
                                         Cancel
                                     </button>
                                     <button
                                        type="button"
                                        onClick={handleAddClick}
                                        disabled={isAddingServer}
                                        className={`inline-flex justify-center rounded-md border border-transparent bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-wait`}
                                    >
                                        {isAddingServer ? 'Adding...' : 'Add Server'}
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

// Removed unused constant
// const modalInputFieldClass = "..."; 