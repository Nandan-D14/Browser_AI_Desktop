
import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { AppContext } from '../App';
import { FileSystemNode, ConversationMode, Message, Transcription, AppId, FileSystemAction, AppDefinition, Theme } from '../types';
import { initialFileSystem, FileTextIcon, FolderIcon, NewFolderIcon, APP_DEFINITIONS, ImageIcon, ComputerIcon, AppsIcon, PaintBrushIcon, SpeakerIcon, TrashIcon, GridViewIcon, ListViewIcon, ZipIcon } from '../constants';
import geminiService from '../services/geminiService';
import { decode, decodeAudioData, encode } from '../utils/audioUtils';
// FIX: Removed unused and non-existent 'LiveSession' type from import.

declare var JSZip: any;

// --- App Renderer ---
export const AppRenderer: React.FC<{ appId: AppId, args?: any }> = ({ appId, args }) => {
    const appDef = useContext(AppContext)?.getAppDefinition(appId);
    if (!appDef) return <div>Error: App not found</div>;
    const Component = appDef.component;
    return <Component {...args} />;
};

// --- AI Assistant ---
export const AIAssistant: React.FC = () => {
    const { openApp, fsDispatch, aiPromptHandler, aiVoiceHandler, isAiListening, setIsAiListening, theme } = useContext(AppContext)!;
    const [messages, setMessages] = useState<Message[]>([]);
    const [mode, setMode] = useState<ConversationMode>('QUICK');
    const [isLoading, setIsLoading] = useState(false);
    const [isTtsEnabled, setIsTtsEnabled] = useState(false);
    const ttsAudioContextRef = useRef<AudioContext | null>(null);


    // Voice state
    const [transcription, setTranscription] = useState<Transcription>({ user: '', model: '', isFinal: false });
    // FIX: Replaced non-existent 'LiveSession' type with 'any'.
    const sessionRef = useRef<any | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const nextAudioStartTimeRef = useRef<number>(0);
    const audioPlaybackQueue = useRef<AudioBufferSourceNode[]>([]);
    
    const handleSaveToFile = (content: string, language: string) => {
        const extension = language || 'txt';
        const fileName = `ai_generated_${Date.now()}.${extension}`;
        const parentId = 'documents'; // Save to Documents folder by default

        const newNode: FileSystemNode = {
            id: `file-${Date.now()}-${Math.random()}`,
            name: fileName,
            type: 'file',
            content: content,
            createdAt: new Date().toISOString(),
            size: new Blob([content]).size,
        };

        fsDispatch({ type: 'ADD_NODE', payload: { parentId, node: newNode } });
        openApp('text_editor', { file: newNode });
    };

    const playAudio = useCallback(async (base64Audio: string) => {
        if (!ttsAudioContextRef.current || ttsAudioContextRef.current.state === 'closed') {
            ttsAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        const audioContext = ttsAudioContextRef.current;
        const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.start();
    }, []);

    const handlePromptSubmit = useCallback(async (prompt: string) => {
        if (!prompt.trim() || isLoading) return;

        const userMessage: Message = { id: Date.now().toString(), sender: 'user', text: prompt, mode };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        const aiMessageId = (Date.now() + 1).toString();
        const initialAiMessage: Message = {
            id: aiMessageId,
            sender: 'ai',
            text: '', // Start with empty text
            mode,
        };
        setMessages(prev => [...prev, initialAiMessage]);

        let finalAccumulatedText = '';

        try {
            const streamHandler = (chunk: string) => {
                finalAccumulatedText += chunk;
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === aiMessageId ? { ...msg, text: finalAccumulatedText } : msg
                    )
                );
            };

            if (mode === 'THINKING') {
                await geminiService.generateWithProStream(prompt, streamHandler);
            } else {
                await geminiService.generateWithFlashLiteStream(prompt, streamHandler);
            }

            // After stream is finished, process for actions.
            const actions: Message['actions'] = [];
            const codeBlockRegex = /```(\w*)\n([\s\S]+?)```/g;
            const matches = [...finalAccumulatedText.matchAll(codeBlockRegex)];

            if (matches.length > 0) {
                const firstMatch = matches[0];
                const language = firstMatch[1] || 'txt';
                const content = firstMatch[2];

                actions.push({
                    label: `Save as .${language}`,
                    onClick: () => handleSaveToFile(content, language),
                });

                if (['sh', 'bash', 'shell'].includes(language.toLowerCase())) {
                    actions.push({
                        label: 'Open in Terminal',
                        onClick: () => openApp('terminal', { initialCommand: content }),
                    });
                }
            }

            if (actions.length > 0) {
                setMessages(prev => prev.map(msg =>
                    msg.id === aiMessageId ? { ...msg, actions } : msg
                ));
            }

            // Handle TTS after full response is received
            if (isTtsEnabled && finalAccumulatedText) {
                try {
                    const audioData = await geminiService.generateSpeech(finalAccumulatedText);
                    await playAudio(audioData);
                } catch (ttsError) {
                    console.error("TTS Error:", ttsError);
                }
            }

        } catch (error) {
            console.error(error);
            setMessages(prev => prev.map(msg =>
                msg.id === aiMessageId ? { ...msg, text: 'An error occurred.' } : msg
            ));
        } finally {
            setIsLoading(false);
        }
    }, [isLoading, mode, isTtsEnabled, openApp, handleSaveToFile, playAudio]);
    
    const stopVoiceConversation = useCallback(() => {
        if(sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        if(scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if(mediaStreamSourceRef.current) {
            mediaStreamSourceRef.current.disconnect();
            mediaStreamSourceRef.current = null;
        }
        if(audioContextRef.current && audioContextRef.current.state !== 'closed') {
           audioContextRef.current.close();
        }
        audioPlaybackQueue.current.forEach(source => source.stop());
        audioPlaybackQueue.current = [];
        setIsAiListening(false);
    }, [setIsAiListening]);

    const startVoiceConversation = useCallback(async () => {
        if (isAiListening) {
             stopVoiceConversation();
             return;
        }

        try {
            setIsAiListening(true);
            setTranscription({ user: '', model: '', isFinal: false });
            
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            nextAudioStartTimeRef.current = 0;

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            const sessionPromise = geminiService.connectLiveApi({
                onMessage: async (message) => {
                    if (message.serverContent?.inputTranscription) {
                        setTranscription(prev => ({...prev, user: prev.user + message.serverContent.inputTranscription.text, isFinal: false}));
                    }
                    if (message.serverContent?.outputTranscription) {
                        setTranscription(prev => ({...prev, model: prev.model + message.serverContent.outputTranscription.text, isFinal: false}));
                    }
                    if (message.serverContent?.turnComplete) {
                        setTranscription(prev => {
                            if (prev.user || prev.model) {
                                setMessages(prevMsgs => [...prevMsgs, 
                                    {id: `user-${Date.now()}`, sender: 'user', text: prev.user, mode: 'VOICE'}, 
                                    {id: `ai-${Date.now()}`, sender: 'ai', text: prev.model, mode: 'VOICE'} 
                                ]);
                            }
                            return { user: '', model: '', isFinal: false };
                        });
                    }
                    const audioData = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (audioData && outputAudioContextRef.current) {
                        const audioBuffer = await decodeAudioData(decode(audioData), outputAudioContextRef.current, 24000, 1);
                        const source = outputAudioContextRef.current.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputAudioContextRef.current.destination);
                        const currentTime = outputAudioContextRef.current.currentTime;
                        const startTime = Math.max(currentTime, nextAudioStartTimeRef.current);
                        source.start(startTime);
                        nextAudioStartTimeRef.current = startTime + audioBuffer.duration;
                        audioPlaybackQueue.current.push(source);
                        source.onended = () => {
                            audioPlaybackQueue.current = audioPlaybackQueue.current.filter(s => s !== source);
                        };
                    }
                },
                onError: (e) => { console.error("Live API Error:", e); stopVoiceConversation(); },
                onClose: () => { stopVoiceConversation(); },
            });
            
            sessionRef.current = await sessionPromise;
            mediaStreamSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            scriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const l = inputData.length;
                // FIX: Corrected typo from Int116Array to Int16Array for audio processing.
                const int16 = new Int16Array(l);
                for (let i = 0; i < l; i++) { int16[i] = inputData[i] * 32768; }
                const pcmBlob = {
                    data: encode(new Uint8Array(int16.buffer)),
                    mimeType: 'audio/pcm;rate=16000',
                };
                sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            mediaStreamSourceRef.current.connect(scriptProcessorRef.current);
            scriptProcessorRef.current.connect(audioContextRef.current.destination);
        } catch (error) {
            console.error("Failed to start voice conversation:", error);
            setIsAiListening(false);
        }
    }, [isAiListening, stopVoiceConversation, setIsAiListening]);

    useEffect(() => {
        aiPromptHandler.current = handlePromptSubmit;
        aiVoiceHandler.current = startVoiceConversation;
        return () => {
            aiPromptHandler.current = null;
            aiVoiceHandler.current = null;
        };
    }, [handlePromptSubmit, startVoiceConversation, aiPromptHandler, aiVoiceHandler]);

    const handleClearConversation = () => {
        if (messages.length > 0 && window.confirm('Are you sure you want to clear the conversation history?')) {
            setMessages([]);
        }
    };

    useEffect(() => () => stopVoiceConversation(), [stopVoiceConversation]);

    return (
        <div className="h-full flex flex-col bg-transparent p-2 text-[var(--text-primary)]">
            <div className="flex-shrink-0 p-2 border-b border-[var(--border-color)] flex justify-between items-center">
                <button onClick={handleClearConversation} title="Clear Conversation" className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] disabled:opacity-50" disabled={messages.length === 0}>
                    <TrashIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                </button>
                
                <div className="flex space-x-2">
                    {(['QUICK', 'THINKING'] as ConversationMode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)}
                            style={{ backgroundColor: mode === m ? theme.accentColor : 'var(--bg-tertiary)' }}
                            className={`px-3 py-1 text-sm rounded-full text-white transition-colors`}>
                            {m.charAt(0) + m.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => setIsTtsEnabled(prev => !prev)} 
                    title={isTtsEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}
                    style={{ backgroundColor: isTtsEnabled ? theme.accentColor : 'transparent' }}
                    className={`p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors`}
                >
                    <SpeakerIcon className={`w-4 h-4 transition-colors ${isTtsEnabled ? 'text-white' : 'text-[var(--text-secondary)]'}`} />
                </button>
            </div>
            <div className="flex-grow p-2 overflow-y-auto">
                {messages.map((msg, index) => (
                    <div key={msg.id} className={`mb-4 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`p-3 rounded-lg max-w-md ${msg.sender === 'user' ? 'text-white' : 'bg-[var(--bg-secondary)]'}`}
                                style={{ backgroundColor: msg.sender === 'user' ? theme.accentColor : undefined }}>
                                <p className="text-sm whitespace-pre-wrap">
                                    {msg.text}
                                    {isLoading && msg.sender === 'ai' && index === messages.length - 1 && (
                                        <span className="inline-block w-2 h-4 bg-white animate-pulse ml-1 align-bottom"></span>
                                    )}
                                </p>
                            </div>
                             {msg.actions && msg.sender === 'ai' && (
                                <div className="mt-2 flex items-center gap-2">
                                    {msg.actions.map((action, index) => (
                                        <button 
                                            key={index} 
                                            onClick={action.onClick}
                                            style={{ backgroundColor: theme.accentColor }}
                                            className="px-3 py-1 opacity-80 hover:opacity-100 text-white text-xs font-semibold rounded-full backdrop-blur-sm"
                                        >
                                            {action.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isAiListening && (
                    <div className="text-[var(--text-secondary)] p-2 border border-dashed border-[var(--border-color)] rounded-lg">
                        <p className="text-sm font-bold text-blue-400">User: <span className="font-normal text-[var(--text-primary)]">{transcription.user}</span></p>
                        <p className="text-sm font-bold text-green-400">AI: <span className="font-normal text-[var(--text-primary)]">{transcription.model}</span></p>
                    </div>
                )}
                {isLoading && messages[messages.length - 1]?.sender === 'user' && (
                     <div className="flex justify-start">
                        <div className="p-3 rounded-lg bg-[var(--bg-secondary)] inline-flex items-center space-x-2">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse delay-200"></div>
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse delay-400"></div>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
};

// --- Context Menu ---
// FIX: Exported ContextMenu component to be used in other files.
export const ContextMenu: React.FC<{ x: number, y: number, items: { label: string, action: () => void }[], onClose: () => void }> = ({ x, y, items, onClose }) => {
    const { theme } = useContext(AppContext)!;
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);
    
    // FIX: Cast style object with custom property to React.CSSProperties to satisfy TypeScript.
    const accentHoverStyle = {
        '--hover-bg': theme.accentColor
    } as React.CSSProperties;

    return (
        <div ref={menuRef} style={{ top: y, left: x, backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} className="absolute z-50 border rounded-md shadow-lg text-[var(--text-primary)] text-sm">
            <ul className="py-1">
                {items.map(item => (
                    <li key={item.label} onClick={() => { item.action(); onClose(); }}
                        className="px-4 py-2 hover:bg-[var(--hover-bg)] hover:text-white cursor-pointer"
                        style={accentHoverStyle}
                    >
                        {item.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};


// --- File Explorer ---
type SearchFilter = 'all' | 'folder' | 'text' | 'image';
type SearchResult = FileSystemNode & { path: string };
type SortKey = 'name' | 'size' | 'createdAt';

export const FileExplorer: React.FC = () => {
    const { fileSystem, fsDispatch, openApp, theme, sendNotification } = useContext(AppContext)!;
    const [currentPath, setCurrentPath] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
    const [searchFilter, setSearchFilter] = useState<SearchFilter>('all');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, node?: FileSystemNode } | null>(null);
    const [clipboard, setClipboard] = useState<FileSystemNode | null>(null);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey, direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });

    const getCurrentNode = useCallback(() => {
        let node = fileSystem;
        for (const part of currentPath) {
            const nextNode = node.children?.find(child => child.name === part && child.type === 'folder');
            if (nextNode) {
                node = nextNode;
            }
        }
        return node;
    }, [fileSystem, currentPath]);

    const findNodeById = useCallback((nodeId: string, root: FileSystemNode = fileSystem): FileSystemNode | null => {
        if (root.id === nodeId) return root;
        if (root.children) {
            for (const child of root.children) {
                const found = findNodeById(nodeId, child);
                if (found) return found;
            }
        }
        return null;
    }, [fileSystem]);


    const handleDecompress = async (zipNode: FileSystemNode) => {
        if (!zipNode.content || (zipNode.mimeType !== 'application/zip' && !zipNode.name.endsWith('.zip'))) return;

        sendNotification({ appId: 'file_explorer', title: 'Decompressing...', message: `Extracting "${zipNode.name}".` });

        try {
            const zip = await JSZip.loadAsync(zipNode.content, { base64: true });
            
            const parentNode = getCurrentNode();
            const extractionFolderName = zipNode.name.replace(/\.zip$/, '');

            const extractionFolderNode: FileSystemNode = {
                id: `folder-${Date.now()}-${Math.random()}`,
                name: extractionFolderName,
                type: 'folder',
                children: [],
                createdAt: new Date().toISOString(),
            };
            fsDispatch({ type: 'ADD_NODE', payload: { parentId: parentNode.id, node: extractionFolderNode } });

            const createdDirs = new Map<string, string>();
            createdDirs.set('', extractionFolderNode.id);

            // FIX: Cast the result of Object.values to any[] to resolve typing issues with JSZip library.
            const fileEntries = (Object.values(zip.files) as any[]).filter(file => !file.dir);
            
            for (const zipEntry of fileEntries) {
                const pathParts = zipEntry.name.split('/').filter(p => p);
                const fileName = pathParts.pop();
                if (!fileName) continue;

                let currentParentId = extractionFolderNode.id;
                let builtPath = '';
                for (const part of pathParts) {
                    const parentPath = builtPath;
                    builtPath = builtPath ? `${builtPath}/${part}` : part;
                    if (!createdDirs.has(builtPath)) {
                        const newFolderNode: FileSystemNode = {
                            id: `folder-${Date.now()}-${Math.random()}`,
                            name: part,
                            type: 'folder',
                            children: [],
                            createdAt: new Date().toISOString(),
                        };
                        const parentIdForDispatch = createdDirs.get(parentPath)!;
                        fsDispatch({ type: 'ADD_NODE', payload: { parentId: parentIdForDispatch, node: newFolderNode } });
                        createdDirs.set(builtPath, newFolderNode.id);
                    }
                    currentParentId = createdDirs.get(builtPath)!;
                }
                
                let content: string;
                let size: number;
                let mimeType: string = 'application/octet-stream';

                if (/\.(txt|md|json|html|css|js)$/i.test(fileName)) {
                    content = await zipEntry.async("string");
                    size = new Blob([content]).size;
                    if(fileName.endsWith('.txt')) mimeType = 'text/plain';
                    if(fileName.endsWith('.md')) mimeType = 'text/markdown';
                } else if (/\.(jpe?g|png|gif|webp)$/i.test(fileName)) {
                    const base64Content = await zipEntry.async("base64");
                    mimeType = `image/${fileName.split('.').pop()?.toLowerCase() || 'jpeg'}`;
                    content = `data:${mimeType};base64,${base64Content}`;
                    size = atob(base64Content).length;
                } else {
                    content = await zipEntry.async("base64");
                    size = atob(content).length;
                }
                
                const newFileNode: FileSystemNode = {
                    id: `file-${Date.now()}-${Math.random()}`,
                    name: fileName,
                    type: 'file',
                    content,
                    createdAt: new Date().toISOString(),
                    size,
                    mimeType
                };
                fsDispatch({ type: 'ADD_NODE', payload: { parentId: currentParentId, node: newFileNode } });
            }
            sendNotification({ appId: 'file_explorer', title: 'Decompression Complete', message: `Successfully extracted "${zipNode.name}".` });
        } catch(error) {
             console.error("Decompression failed:", error);
             sendNotification({ appId: 'file_explorer', title: 'Decompression Failed', message: `Could not extract "${zipNode.name}". The file may be corrupt.` });
        }
    };


    const handleNodeClick = (node: FileSystemNode) => {
        if (node.type === 'folder') {
            setSearchResults(null);
            setSearchQuery('');
            if ((node as SearchResult).path) {
                const pathParts = (node as SearchResult).path.replace(/^~\//, '').split('/');
                pathParts.pop();
                setCurrentPath([...pathParts, node.name]);
            } else {
                 setCurrentPath([...currentPath, node.name]);
            }
        } else {
             if (node.mimeType === 'application/zip' || node.name.endsWith('.zip')) {
                 handleDecompress(node);
             } else if (node.mimeType?.startsWith('image/')) {
                 openApp('media_viewer', { file: node });
             } else {
                 openApp('text_editor', { file: node });
             }
        }
    };

    const performSearch = useCallback(() => {
        if (!searchQuery.trim()) {
            setSearchResults(null);
            return;
        }

        const results: SearchResult[] = [];
        const query = searchQuery.toLowerCase();

        const recursiveSearch = (node: FileSystemNode, currentPath: string) => {
            let isMatch = false;

            if (node.name.toLowerCase().includes(query)) {
                isMatch = true;
            }

            if (!isMatch && node.type === 'file' && node.content && (node.mimeType === 'text/plain' || node.mimeType === 'text/markdown')) {
                if (node.content.toLowerCase().includes(query)) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                results.push({ ...node, path: currentPath });
            }

            if (node.type === 'folder' && node.children) {
                node.children.forEach(child => {
                    const newPath = currentPath === '~' ? `~/${child.name}` : `${currentPath}/${child.name}`;
                    recursiveSearch(child, newPath);
                });
            }
        };
        
        recursiveSearch(fileSystem, '~');
        setSearchResults(results);
    }, [searchQuery, fileSystem]);

    const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    };
    
    const handleRename = (node: FileSystemNode, newName: string) => {
        if (newName && newName !== node.name) {
            fsDispatch({ type: 'UPDATE_NODE', payload: { nodeId: node.id, updates: { name: newName } } });
        }
        setRenamingId(null);
    };

    const handleMoveToTrash = (node: FileSystemNode) => {
        let parentId: string | undefined;
    
        if ('path' in node && typeof (node as SearchResult).path === 'string') {
            const pathParts = (node as SearchResult).path.replace(/^~\//, '').split('/');
            pathParts.pop(); 
            let parent = fileSystem;
            for (const part of pathParts) {
                parent = parent.children?.find(c => c.name === part) || parent;
            }
            parentId = parent.id;
        } else {
            parentId = getCurrentNode().id;
        }
    
        if (!parentId) {
            console.error("Could not find parent for node:", node);
            return;
        }

        fsDispatch({ type: 'DELETE_NODE', payload: { nodeId: node.id, parentId: parentId } });
        fsDispatch({ type: 'ADD_NODE', payload: { parentId: 'trash', node: { ...node, originalParentId: parentId } } });
    };
    
    const handleRestore = (node: FileSystemNode) => {
        if (!node.originalParentId) return;
        const { originalParentId, ...restoredNodeProps } = node;
        const restoredNode: FileSystemNode = restoredNodeProps;

        fsDispatch({ type: 'DELETE_NODE', payload: { nodeId: node.id, parentId: 'trash' }});
        fsDispatch({ type: 'ADD_NODE', payload: { parentId: originalParentId, node: restoredNode }});
    };

    const handleDeletePermanently = (node: FileSystemNode) => {
        if (window.confirm(`Permanently delete "${node.name}"? This cannot be undone.`)) {
            fsDispatch({ type: 'DELETE_NODE', payload: { nodeId: node.id, parentId: 'trash' } });
        }
    };
    
    const handleEmptyTrash = () => {
        const trashNode = fileSystem.children?.find(c => c.id === 'trash');
        if (trashNode && trashNode.children && trashNode.children.length > 0) {
            if (window.confirm('Are you sure you want to permanently empty the Trash? All items will be deleted.')) {
                fsDispatch({ type: 'EMPTY_TRASH' });
            }
        }
    };

    const handleCopy = (node: FileSystemNode) => {
        setClipboard(node);
    };

    const handlePaste = useCallback(() => {
        if (!clipboard) return;
        const parentNode = getCurrentNode();

        const createUniqueNodeCopy = (nodeToCopy: FileSystemNode, destinationChildren: FileSystemNode[]): FileSystemNode => {
            const existingNames = new Set(destinationChildren.map(child => child.name));
            let newName = nodeToCopy.name;

            if (existingNames.has(newName)) {
                const nameParts = nodeToCopy.name.split('.');
                const extension = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
                const baseName = nameParts.join('.');
                
                newName = `${baseName} (copy)${extension}`;
                if (existingNames.has(newName)) {
                    let counter = 2;
                    do {
                        newName = `${baseName} (${counter})${extension}`;
                        counter++;
                    } while (existingNames.has(newName));
                }
            }

            const deepCopy = (node: FileSystemNode): FileSystemNode => {
                const newNode: FileSystemNode = {
                    ...node,
                    id: `${node.type}-${Date.now()}-${Math.random()}`,
                };
                if (node.children) {
                    newNode.children = node.children.map(deepCopy);
                }
                return newNode;
            };
            
            const copiedNode = deepCopy(nodeToCopy);
            copiedNode.name = newName;
            copiedNode.createdAt = new Date().toISOString();
            
            return copiedNode;
        };
        
        const newNode = createUniqueNodeCopy(clipboard, parentNode.children || []);
        fsDispatch({ type: 'ADD_NODE', payload: { parentId: parentNode.id, node: newNode } });
        sendNotification({
            appId: 'file_explorer',
            title: 'File Pasted',
            message: `'${newNode.name}' was successfully copied.`,
        });
    }, [clipboard, fsDispatch, getCurrentNode, sendNotification]);
    
    const handleCompress = async (nodeToCompress: FileSystemNode) => {
        sendNotification({ appId: 'file_explorer', title: 'Compressing...', message: `Starting to compress "${nodeToCompress.name}".` });
        const zip = new JSZip();

        const addNodeToZip = async (currentZipFolder: any, node: FileSystemNode) => {
            if (node.type === 'file') {
                let fileContent: any = node.content || '';
                if (node.mimeType?.startsWith('image/') && node.content) {
                    try {
                        const response = await fetch(node.content);
                        fileContent = await response.blob();
                    } catch (error) {
                        console.error(`Failed to fetch image ${node.name}:`, error);
                        fileContent = `Error: Could not fetch image content from ${node.content}`;
                    }
                }
                currentZipFolder.file(node.name, fileContent);
            } else if (node.type === 'folder' && node.children) {
                const folder = currentZipFolder.folder(node.name);
                for (const child of node.children) {
                    await addNodeToZip(folder, child);
                }
            }
        };

        try {
            await addNodeToZip(zip, nodeToCompress);
            const zipContent = await zip.generateAsync({ type: 'base64' });

            const parentNode = getCurrentNode();
            const zipFileName = `${nodeToCompress.name.split('.')[0]}.zip`;
            
            const newNode: FileSystemNode = {
                id: `file-${Date.now()}-${Math.random()}`,
                name: zipFileName,
                type: 'file',
                content: zipContent,
                createdAt: new Date().toISOString(),
                size: atob(zipContent).length,
                mimeType: 'application/zip',
            };

            fsDispatch({ type: 'ADD_NODE', payload: { parentId: parentNode.id, node: newNode } });
            sendNotification({ appId: 'file_explorer', title: 'Compression Complete', message: `Successfully created "${zipFileName}".` });
        } catch (error) {
            console.error("Compression failed:", error);
            sendNotification({ appId: 'file_explorer', title: 'Compression Failed', message: `Could not compress "${nodeToCompress.name}".` });
        }
    };


    const handleContextMenu = (e: React.MouseEvent, node: FileSystemNode) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const handleCreateFolder = () => {
        const parentNode = getCurrentNode();
        const existingNames = parentNode.children?.map(child => child.name) || [];
        
        let newFolderName = 'New Folder';
        let counter = 2;
        while (existingNames.includes(newFolderName)) {
            newFolderName = `New Folder (${counter})`;
            counter++;
        }

        const newNode: FileSystemNode = {
            id: `folder-${Date.now()}-${Math.random()}`,
            name: newFolderName,
            type: 'folder',
            children: [],
            createdAt: new Date().toISOString(),
        };

        fsDispatch({ type: 'ADD_NODE', payload: { parentId: parentNode.id, node: newNode } });
        setRenamingId(newNode.id);
    };

    const handleBackgroundContextMenu = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY });
        }
    };

    const currentNode = getCurrentNode();
    const isTrashFolder = currentNode.id === 'trash';

    const contextMenuItems = useMemo(() => {
        if (!contextMenu) return [];
        
        if (contextMenu.node) {
            if (isTrashFolder) {
                 return [
                    { label: 'Restore', action: () => handleRestore(contextMenu.node!) },
                    { label: 'Delete Permanently', action: () => handleDeletePermanently(contextMenu.node!) },
                ];
            }
            
            const isZip = contextMenu.node.name.endsWith('.zip') || contextMenu.node.mimeType === 'application/zip';
            
            const items = [
                { label: 'Open', action: () => handleNodeClick(contextMenu.node!) },
            ];

            if (isZip) {
                items.push({ label: 'Decompress', action: () => handleDecompress(contextMenu.node!) });
            } else {
                items.push({ label: 'Compress', action: () => handleCompress(contextMenu.node!) });
            }

            items.push(
                { label: 'Copy', action: () => handleCopy(contextMenu.node!) },
                { label: 'Rename', action: () => setRenamingId(contextMenu.node!.id) },
                { label: 'Delete', action: () => handleMoveToTrash(contextMenu.node!) },
                { label: 'Properties', action: () => openApp('properties_viewer', { file: contextMenu.node! }) }
            );
            return items;
        } else {
            if (isTrashFolder) {
                const trashNode = fileSystem.children?.find(c => c.id === 'trash');
                if (!trashNode || !trashNode.children || trashNode.children.length === 0) return [];
                return [{ label: 'Empty Trash', action: handleEmptyTrash }];
            }
            const items = [{ label: 'New Folder', action: handleCreateFolder }];
            if (clipboard) {
                items.push({ label: 'Paste', action: handlePaste });
            }
            return items;
        }
    }, [contextMenu, clipboard, handlePaste, isTrashFolder, fileSystem]);
    
    // FIX: Cast style object with custom property to React.CSSProperties to satisfy TypeScript.
    const accentHoverStyle = {
      '--hover-bg-color': `${theme.accentColor}33` // Add alpha for hover
    } as React.CSSProperties;

    const filteredResults = useMemo(() => {
        if (!searchResults) return [];
        if (searchFilter === 'all') return searchResults;
        return searchResults.filter(node => {
            switch (searchFilter) {
                case 'folder': return node.type === 'folder';
                case 'text': return node.mimeType === 'text/plain' || node.mimeType === 'text/markdown';
                case 'image': return node.mimeType?.startsWith('image/');
                default: return true;
            }
        });
    }, [searchResults, searchFilter]);

    const searchFilters: { id: SearchFilter, label: string }[] = [
        { id: 'all', label: 'All' },
        { id: 'folder', label: 'Folders' },
        { id: 'text', label: 'Text' },
        { id: 'image', label: 'Images' },
    ];

    const sortedNodes = useMemo(() => {
        const nodesToSort = [...(currentNode.children || [])];
        if (sortConfig.key) {
            nodesToSort.sort((a, b) => {
                if (a.type === 'folder' && b.type !== 'folder') return -1;
                if (a.type !== 'folder' && b.type === 'folder') return 1;
    
                let comparison = 0;
                switch(sortConfig.key) {
                    case 'name':
                        comparison = a.name.localeCompare(b.name);
                        break;
                    case 'size':
                        comparison = (a.size ?? -1) - (b.size ?? -1);
                        break;
                    case 'createdAt':
                        comparison = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
                        break;
                    default:
                        comparison = 0;
                }
    
                return sortConfig.direction === 'ascending' ? comparison : -comparison;
            });
        }
        return nodesToSort;
    }, [currentNode.children, sortConfig]);

    const requestSort = (key: SortKey) => {
        let direction: 'ascending' | 'descending' = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    const formatBytes = (bytes: number | undefined) => {
        if (bytes === undefined || bytes === null || !+bytes) return '-';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1))} ${sizes[i]}`;
    }

    const PathBreadcrumbs = () => {
        const pathParts = ['~', ...currentPath];
        return (
            <div className="flex-grow bg-[var(--bg-primary)] rounded px-2 py-1 text-sm flex items-center space-x-1 overflow-x-auto">
                {pathParts.map((part, index) => (
                    <React.Fragment key={index}>
                        <button
                            onClick={() => {
                                setSearchResults(null);
                                setSearchQuery('');
                                setCurrentPath(pathParts.slice(1, index + 1));
                            }}
                            className="hover:underline flex-shrink-0"
                        >
                            {part === '~' ? <ComputerIcon className="w-4 h-4" /> : part}
                        </button>
                        {index < pathParts.length - 1 && <span className="text-[var(--text-secondary)]">/</span>}
                    </React.Fragment>
                ))}
            </div>
        );
    };

    const SortableHeader: React.FC<{ sortKey: SortKey, label: string, className?: string }> = ({ sortKey, label, className }) => {
        const isSorted = sortConfig.key === sortKey;
        const icon = isSorted ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '';
        return (
            <button onClick={() => requestSort(sortKey)} className={`flex items-center gap-1 ${className}`}>
                {label} <span className="text-xs">{icon}</span>
            </button>
        );
    };
    
    return (
        <div className="h-full flex flex-col text-[var(--text-primary)]">
            <div className="flex-shrink-0 bg-[var(--bg-secondary)] border-b border-[var(--border-color)]">
                <div className="flex items-center p-2 space-x-2">
                    <button onClick={() => setCurrentPath(currentPath.slice(0, -1))} disabled={currentPath.length === 0} className="p-1 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-50">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <button onClick={handleCreateFolder} className="p-1 rounded hover:bg-[var(--bg-tertiary)]" title="New Folder">
                        <NewFolderIcon className="w-5 h-5" />
                    </button>
                    <PathBreadcrumbs />
                     {isTrashFolder && (
                        <button onClick={handleEmptyTrash} className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 flex items-center gap-1.5" disabled={currentNode.children?.length === 0}>
                            <TrashIcon className="w-4 h-4" />
                            Empty Trash
                        </button>
                    )}
                    <div className="flex items-center space-x-1">
                        <button onClick={() => setViewMode('list')} className={`p-1 rounded ${viewMode === 'list' ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'}`} title="List View"><ListViewIcon className="w-5 h-5" /></button>
                        <button onClick={() => setViewMode('grid')} className={`p-1 rounded ${viewMode === 'grid' ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'}`} title="Grid View"><GridViewIcon className="w-5 h-5" /></button>
                    </div>
                    <input
                        type="text"
                        placeholder="Search entire filesystem..."
                        className="bg-[var(--bg-primary)] rounded px-2 py-1 text-sm w-48 focus:outline-none focus:ring-1"
                        style={{'--tw-ring-color': theme.accentColor} as React.CSSProperties}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearchKeyDown}
                    />
                </div>
                {searchResults !== null && (
                     <div className="px-3 pb-2 flex items-center gap-2 border-t border-[var(--border-color)] pt-2">
                        <span className="text-xs font-semibold text-[var(--text-secondary)]">Filter:</span>
                        {searchFilters.map(filter => (
                            <button key={filter.id} onClick={() => setSearchFilter(filter.id)} 
                                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${searchFilter === filter.id ? 'text-white' : 'hover:bg-[var(--bg-tertiary)]'}`}
                                style={{ backgroundColor: searchFilter === filter.id ? theme.accentColor : 'transparent' }}>
                                {filter.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {searchResults !== null ? (
                // SEARCH RESULTS VIEW (simplified list view)
                <div className="flex-grow p-2 overflow-y-auto" onClick={() => setSelectedNodeId(null)}>
                    <div className="flex justify-between items-center mb-2 px-2">
                         <p className="text-sm text-[var(--text-secondary)]">Found {filteredResults.length} result(s)</p>
                        <button onClick={() => { setSearchQuery(''); setSearchResults(null); }} className="text-sm px-2 py-1 rounded hover:bg-[var(--bg-tertiary)]" style={{ color: theme.accentColor }}>Clear Search</button>
                    </div>
                    {filteredResults.length > 0 ? (
                        <ul className="space-y-1">
                            {filteredResults.map((node) => {
                                const isSelected = selectedNodeId === node.id;
                                return (
                                <li key={node.id} onDoubleClick={() => handleNodeClick(node)} onContextMenu={(e) => handleContextMenu(e, node)} 
                                    onClick={(e) => {e.stopPropagation(); setSelectedNodeId(node.id)}}
                                    className={`flex items-center space-x-3 px-2 py-1.5 rounded cursor-pointer transition-colors duration-150 ${ isSelected ? 'text-white' : `hover:bg-[var(--hover-bg-color)]` }`}
                                    style={isSelected ? { backgroundColor: theme.accentColor } : accentHoverStyle}
                                >
                                    <div className="flex-shrink-0" style={{ filter: isSelected ? 'brightness(0) invert(1)' : 'none' }}>
                                        {node.type === 'folder' ? <FolderIcon className="w-6 h-6" /> : <FileTextIcon className="w-6 h-6" />}
                                    </div>
                                    <div className='flex flex-col overflow-hidden'>
                                        <span className="truncate">{node.name}</span>
                                        <span className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>{node.path}</span>
                                    </div>
                                </li>
                            )})}
                        </ul>
                    ) : (
                        <div className="h-full flex items-center justify-center text-center text-[var(--text-secondary)]"><p>No results found for "{searchQuery}".</p></div>
                    )}
                </div>
            ) : viewMode === 'list' ? (
                // LIST VIEW
                <div className="flex-grow overflow-y-auto" onClick={() => { setContextMenu(null); setSelectedNodeId(null); }} onContextMenu={handleBackgroundContextMenu}>
                    <div className="grid grid-cols-[auto_1fr_100px_150px] gap-x-4 px-2 py-1 text-xs font-semibold text-[var(--text-secondary)] border-b border-[var(--border-color)] sticky top-0 bg-[var(--window-content-bg)]">
                        <div />
                        <SortableHeader sortKey='name' label='Name' className='text-left' />
                        <SortableHeader sortKey='size' label='Size' className='justify-end' />
                        <SortableHeader sortKey='createdAt' label='Date Modified' className='justify-end' />
                    </div>
                    <ul className="p-2 space-y-px">
                        {sortedNodes.map((node) => {
                            const isSelected = selectedNodeId === node.id;
                            const isZip = node.name.endsWith('.zip') || node.mimeType === 'application/zip';
                            return (
                            <li key={node.id} onDoubleClick={() => handleNodeClick(node)} onContextMenu={(e) => handleContextMenu(e, node)}
                                onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id)}}
                                className={`grid grid-cols-[auto_1fr_100px_150px] gap-x-4 items-center px-2 py-1.5 rounded cursor-pointer transition-colors duration-150 ${ isSelected ? 'text-white' : 'hover:bg-[var(--hover-bg-color)]' }`}
                                style={isSelected ? { backgroundColor: theme.accentColor } : accentHoverStyle}
                            >
                                <div className="flex-shrink-0" style={{ filter: isSelected ? 'brightness(0) invert(1)' : 'none' }}>
                                    {isZip ? <ZipIcon className="w-6 h-6" /> : node.type === 'folder' ? <FolderIcon className="w-6 h-6" /> : <FileTextIcon className="w-6 h-6" />}
                                </div>
                                {renamingId === node.id ? (
                                    <input type="text" defaultValue={node.name} onBlur={(e) => handleRename(node, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename(node, e.currentTarget.value)} className="bg-transparent p-0 m-0 border-0 outline-none w-full" autoFocus onClick={(e) => e.stopPropagation()}/>
                                ) : (
                                    <div className='flex flex-col overflow-hidden'>
                                        <span className="truncate">{node.name}</span>
                                         {isTrashFolder && node.originalParentId && (<span className={`text-xs truncate ${isSelected ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>From: {findNodeById(node.originalParentId)?.name || 'Unknown Location'}</span>)}
                                    </div>
                                )}
                                <span className="text-right text-sm text-[var(--text-secondary)]">{formatBytes(node.size)}</span>
                                <span className="text-right text-sm text-[var(--text-secondary)]">{node.createdAt ? new Date(node.createdAt).toLocaleString() : '-'}</span>
                            </li>
                        )})}
                    </ul>
                     {currentNode.children?.length === 0 && (<div className="h-full flex items-center justify-center text-center text-[var(--text-secondary)]"><p>{isTrashFolder ? 'Trash is empty.' : 'This folder is empty.'}</p></div>)}
                </div>
            ) : (
                // GRID VIEW
                <div className="flex-grow p-4 overflow-y-auto" onClick={() => { setContextMenu(null); setSelectedNodeId(null); }} onContextMenu={handleBackgroundContextMenu}>
                    <ul className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
                         {sortedNodes.map((node) => {
                            const isSelected = selectedNodeId === node.id;
                            const isZip = node.name.endsWith('.zip') || node.mimeType === 'application/zip';
                            return (
                            <li key={node.id} onDoubleClick={() => handleNodeClick(node)} onContextMenu={(e) => handleContextMenu(e, node)}
                                onClick={(e) => { e.stopPropagation(); setSelectedNodeId(node.id)}}
                                className={`flex flex-col items-center text-center w-28 h-28 p-2 rounded-lg cursor-pointer transition-colors duration-150 ${ isSelected ? 'text-white' : 'hover:bg-[var(--hover-bg-color)]' }`}
                                style={isSelected ? { backgroundColor: theme.accentColor } : accentHoverStyle}
                            >
                                <div className="w-16 h-16 flex items-center justify-center mb-1" style={{ filter: isSelected ? 'brightness(0) invert(1)' : 'none' }}>
                                    {node.type === 'file' && node.mimeType?.startsWith('image/') ? (
                                        <img src={node.content} alt={node.name} className="max-w-full max-h-full object-cover rounded-md" />
                                    ) : isZip ? (
                                        <ZipIcon className="w-16 h-16" />
                                    ) : node.type === 'folder' ? (
                                        <FolderIcon className="w-16 h-16" />
                                    ) : (
                                        <FileTextIcon className="w-16 h-16" />
                                    )}
                                </div>
                                {renamingId === node.id ? (
                                    <input type="text" defaultValue={node.name} onBlur={(e) => handleRename(node, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename(node, e.currentTarget.value)} className="bg-transparent text-center p-0 m-0 border-0 outline-none w-full text-xs" autoFocus onClick={(e) => e.stopPropagation()} style={{color: isSelected ? 'white' : 'inherit'}} />
                                ) : (
                                     <span className="text-xs break-words w-full truncate">{node.name}</span>
                                )}
                            </li>
                        )})}
                    </ul>
                     {currentNode.children?.length === 0 && (<div className="h-full flex items-center justify-center text-center text-[var(--text-secondary)]"><p>{isTrashFolder ? 'Trash is empty.' : 'This folder is empty.'}</p></div>)}
                </div>
            )}
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} />}
        </div>
    );
};


// --- Terminal ---
export const Terminal: React.FC<{ initialCommand?: string }> = ({ initialCommand }) => {
    const [lines, setLines] = useState<string[]>(['Welcome to WarmWind OS Terminal.', 'Type "help" for a list of commands.']);
    const [input, setInput] = useState('');
    const endOfTerminalRef = useRef<null | HTMLDivElement>(null);

    const executeCommand = useCallback((command: string) => {
        const trimmedCommand = command.trim();
        if (!trimmedCommand) return;

        if (trimmedCommand.toLowerCase() === 'clear') {
            setLines([]);
            return;
        }

        const newLines = [`> ${trimmedCommand}`];
        let output = '';
        switch (trimmedCommand.toLowerCase()) {
            case 'help':
                output = 'Available commands: help, clear, date, about';
                break;
            case 'date':
                output = new Date().toString();
                break;
            case 'about':
                output = 'WarmWind OS v1.0 - AI Virtual PC';
                break;
            default:
                output = `command not found: ${trimmedCommand}`;
        }
        setLines(prev => [...prev, ...newLines, output]);
    }, []);

    const handleInputSubmit = () => {
        executeCommand(input);
        setInput('');
    };

    useEffect(() => {
        if (initialCommand) {
            const commands = initialCommand.split('\n');
            commands.forEach(cmd => {
                if (cmd.trim()) {
                    executeCommand(cmd);
                }
            });
        }
    }, [initialCommand, executeCommand]);

    useEffect(() => {
        endOfTerminalRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [lines]);

    return (
        <div className="h-full bg-black text-green-400 font-mono p-2 text-sm overflow-y-auto" onClick={() => document.getElementById('terminal-input')?.focus()}>
            {lines.map((line, i) => <div key={i} className="whitespace-pre-wrap">{line}</div>)}
            <div className="flex">
                <span>&gt;&nbsp;</span>
                <input
                    id="terminal-input"
                    type="text"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && handleInputSubmit()}
                    className="bg-transparent border-none outline-none text-green-400 flex-grow"
                    autoFocus
                />
            </div>
            <div ref={endOfTerminalRef} />
        </div>
    );
};


// --- Settings ---
const SettingsCategory: React.FC<{
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    isActive: boolean;
    onClick: () => void;
}> = ({ icon: Icon, label, isActive, onClick }) => {
    const { theme } = useContext(AppContext)!;
    return (
        <li
            onClick={onClick}
            style={{ 
                backgroundColor: isActive ? `${theme.accentColor}B3` : undefined, // B3 = 70% opacity
                color: isActive ? 'white' : 'var(--text-primary)'
            }}
            className={`flex items-center space-x-3 p-2 rounded-xl cursor-pointer transition-colors duration-200 hover:bg-[var(--bg-tertiary)]`}
        >
            <Icon className="w-6 h-6" />
            <span className="font-semibold">{label}</span>
        </li>
    );
};

const PersonalizationSettings: React.FC = () => {
    const { wallpaper, setWallpaper, theme } = useContext(AppContext)!;
    const wallpapers = [
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=2071&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=1841&auto=format&fit=crop',
        'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?q=80&w=2093&auto=format&fit=crop',
    ];

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-[var(--text-primary)]">Personalization</h2>
            <h3 className="font-semibold text-lg mb-3 text-[var(--text-primary)]">Change Wallpaper</h3>
            <div className="grid grid-cols-2 gap-4">
                {wallpapers.map(url => (
                    <img
                        key={url}
                        src={url}
                        onClick={() => setWallpaper(url)}
                        className={`w-full h-32 object-cover rounded-lg cursor-pointer border-4 transition-all`}
                        style={{ borderColor: wallpaper === url ? theme.accentColor : 'transparent' }}
                        alt="Wallpaper option"
                    />
                ))}
            </div>
        </div>
    );
};

const AppearanceSettings: React.FC = () => {
    const { theme, setTheme } = useContext(AppContext)!;

    const accentColors = ['#3b82f6', '#ef4444', '#22c55e', '#f97316', '#8b5cf6', '#ec4899'];
    const fonts = [
        { name: 'System Sans-serif', value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" },
        { name: 'Serif', value: "Georgia, 'Times New Roman', Times, serif" },
        { name: 'Monospace', value: "'Courier New', Courier, monospace" },
    ];

    return (
        <div>
            <h2 className="text-2xl font-bold mb-4 text-[var(--text-primary)]">Appearance</h2>

            {/* --- Mode --- */}
            <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3 text-[var(--text-primary)]">Mode</h3>
                <div className="flex space-x-2 p-1 bg-[var(--bg-secondary)] rounded-lg">
                    <button onClick={() => setTheme(t => ({...t, mode: 'light'}))} className={`flex-1 py-2 text-sm font-semibold rounded-md ${theme.mode === 'light' ? 'text-black' : ''}`}
                        style={{ backgroundColor: theme.mode === 'light' ? 'white' : 'transparent' }}>Light</button>
                    <button onClick={() => setTheme(t => ({...t, mode: 'dark'}))} className={`flex-1 py-2 text-sm font-semibold rounded-md ${theme.mode === 'dark' ? 'text-white' : ''}`}
                        style={{ backgroundColor: theme.mode === 'dark' ? 'var(--bg-tertiary)' : 'transparent' }}>Dark</button>
                </div>
            </div>
            
            {/* --- Accent Color --- */}
            <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3 text-[var(--text-primary)]">Accent Color</h3>
                <div className="flex space-x-3">
                    {accentColors.map(color => (
                        <button key={color} onClick={() => setTheme(t => ({...t, accentColor: color}))}
                            className={`w-10 h-10 rounded-full border-4 transition-transform transform hover:scale-110`}
                            style={{ backgroundColor: color, borderColor: theme.accentColor === color ? 'white' : 'transparent' }} />
                    ))}
                </div>
            </div>

            {/* --- Font --- */}
            <div>
                <h3 className="font-semibold text-lg mb-3 text-[var(--text-primary)]">Font</h3>
                <select 
                    value={theme.fontFamily}
                    onChange={(e) => setTheme(t => ({...t, fontFamily: e.target.value}))}
                    className="w-full p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-[var(--text-primary)] focus:outline-none focus:ring-2"
                    style={{'--tw-ring-color': theme.accentColor} as React.CSSProperties}
                >
                    {fonts.map(font => <option key={font.name} value={font.value}>{font.name}</option>)}
                </select>
            </div>
        </div>
    );
};

const SystemSettings: React.FC = () => (
    <div>
        <h2 className="text-2xl font-bold mb-4 text-[var(--text-primary)]">System</h2>
        <div className="bg-[var(--bg-secondary)] p-4 rounded-lg">
            <h3 className="text-xl font-semibold mb-4 border-b border-[var(--border-color)] pb-2 text-[var(--text-primary)]">About WarmWind OS</h3>
            <ul className="space-y-2 text-sm">
                <li className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">OS Name:</span>
                    <span className="text-[var(--text-primary)]">WarmWind OS</span>
                </li>
                <li className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Version:</span>
                    <span className="text-[var(--text-primary)]">1.0 (Brave Heron)</span>
                </li>
                <li className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Build:</span>
                    <span className="text-[var(--text-primary)]">WWOS-24A-GEMINI</span>
                </li>
                <li className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Processor:</span>
                    <span className="text-[var(--text-primary)]">Virtual AI Core (Gemini 2.5 Pro)</span>
                </li>
                <li className="flex justify-between">
                    <span className="text-[var(--text-secondary)]">Installed RAM:</span>
                    <span className="text-[var(--text-primary)]">(Browser Allocated)</span>
                </li>
            </ul>
        </div>
    </div>
);

const AppSettings: React.FC = () => (
    <div>
        <h2 className="text-2xl font-bold mb-4 text-[var(--text-primary)]">Apps</h2>
        <p className="text-[var(--text-secondary)] mb-4">List of all applications installed on WarmWind OS.</p>
        <ul className="space-y-2">
            {APP_DEFINITIONS.map(app => (
                 <li key={app.id} className="flex items-center space-x-4 p-2 bg-[var(--bg-secondary)] rounded-lg">
                    <app.icon className="w-8 h-8" />
                    <span className="font-semibold text-[var(--text-primary)]">{app.name}</span>
                </li>
            ))}
        </ul>
    </div>
);


export const Settings: React.FC = () => {
    const [activeCategory, setActiveCategory] = useState('appearance');

    const categories = [
        { id: 'appearance', label: 'Appearance', icon: PaintBrushIcon },
        { id: 'personalization', label: 'Personalization', icon: ImageIcon },
        { id: 'system', label: 'System', icon: ComputerIcon },
        { id: 'apps', label: 'Apps', icon: AppsIcon },
    ];

    const renderContent = () => {
        switch (activeCategory) {
            case 'appearance':
                return <AppearanceSettings />;
            case 'personalization':
                return <PersonalizationSettings />;
            case 'system':
                return <SystemSettings />;
            case 'apps':
                return <AppSettings />;
            default:
                return null;
        }
    };

    return (
        <div className="h-full flex bg-transparent">
            <aside className="w-56 flex-shrink-0 bg-[var(--bg-secondary)] p-4">
                <h1 className="text-xl font-bold mb-6 text-[var(--text-primary)]">Settings</h1>
                <ul className="space-y-2">
                    {categories.map(cat => (
                        <SettingsCategory
                            key={cat.id}
                            label={cat.label}
                            icon={cat.icon}
                            isActive={activeCategory === cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                        />
                    ))}
                </ul>
            </aside>
            <main className="flex-grow p-6 overflow-y-auto">
                {renderContent()}
            </main>
        </div>
    );
};


// --- Text Editor ---
export const TextEditor: React.FC<{ file?: FileSystemNode }> = ({ file }) => {
    const { fsDispatch } = useContext(AppContext)!;

    if (!file) {
        return (
            <div className="w-full h-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] flex items-center justify-center">
                <p>No file open. Open a file from the File Explorer.</p>
            </div>
        );
    }
    
    const [content, setContent] = useState(file.content || '');

    const handleSave = () => {
        fsDispatch({ type: 'UPDATE_NODE', payload: { nodeId: file.id, updates: { content, size: new Blob([content]).size } } });
    };

    return (
        <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleSave}
            className="w-full h-full bg-transparent text-[var(--text-primary)] p-4 font-mono text-sm border-none outline-none resize-none"
        />
    );
};


// --- Calculator ---
export const Calculator: React.FC = () => {
    const [display, setDisplay] = useState('0');
    
    const handleButtonClick = (value: string) => {
        if(value === 'C') return setDisplay('0');
        if(value === '=') {
            try {
                // Using eval is unsafe in real apps, but fine for this demo.
                setDisplay(eval(display.replace(/x/g, '*')).toString());
            } catch {
                setDisplay('Error');
            }
            return;
        }
        if(display === '0' || display === 'Error') {
            setDisplay(value);
        } else {
            setDisplay(display + value);
        }
    };
    
    const buttons = ['C', '/', 'x', '=', '7', '8', '9', '-', '4', '5', '6', '+', '1', '2', '3', '0', '.',];
    
     const getButtonClass = (btn: string) => {
        const baseClass = "text-2xl rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 transition-transform transform active:scale-95 shadow-md text-white font-semibold";
        if (['/', 'x', '-', '+', '='].includes(btn)) {
            return `${baseClass} bg-orange-500 hover:bg-orange-400`;
        }
        if (btn === 'C') {
            return `${baseClass} bg-gray-500 hover:bg-gray-400`;
        }
        return `${baseClass} bg-gray-600 hover:bg-gray-500`;
    }

    return (
        <div className="h-full bg-transparent p-2 flex flex-col">
            <div className="bg-gray-900 text-white text-4xl text-right p-4 rounded-xl mb-2 truncate">{display}</div>
            <div className="grid grid-cols-4 gap-2 flex-grow">
                 {buttons.map(btn => (
                    <button 
                        key={btn} 
                        onClick={() => handleButtonClick(btn)} 
                        className={`${getButtonClass(btn)} ${btn === '0' ? 'col-span-2' : ''}`}
                    >
                        {btn}
                    </button>
                ))}
            </div>
        </div>
    );
};

// --- Browser ---
type Tab = {
  id: string;
  history: string[];
  currentIndex: number;
  title: string;
  favicon: string | null;
  isLoading: boolean;
  isBlocked: boolean;
};

const initialUrl = "https://www.google.com/webhp?igu=1";
const getFaviconUrl = (pageUrl: string) => {
    try {
        const url = new URL(pageUrl);
        return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url.origin}&size=16`;
    } catch (e) {
        return null;
    }
};

const createNewTab = (): Tab => ({
    id: `tab-${Date.now()}-${Math.random()}`,
    history: [initialUrl],
    currentIndex: 0,
    title: "New Tab",
    favicon: getFaviconUrl(initialUrl),
    isLoading: true,
    isBlocked: false,
});

export const Browser: React.FC = () => {
    const { theme } = useContext(AppContext)!;
    const [tabs, setTabs] = useState<Tab[]>([createNewTab()]);
    const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);
    const [inputValue, setInputValue] = useState(initialUrl);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId)!, [tabs, activeTabId]);
    const currentUrl = activeTab.history[activeTab.currentIndex];

    useEffect(() => {
        setInputValue(currentUrl);
    }, [currentUrl]);

    const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
        setTabs(prevTabs => prevTabs.map(t => t.id === tabId ? { ...t, ...updates } : t));
    }, []);

    const navigateTo = (url: string, tabId: string) => {
        let newUrl = url.trim();
        if (!/^(https?:\/\/)/i.test(newUrl) && newUrl.includes('.')) {
            newUrl = 'https://' + newUrl;
        } else if (!newUrl.includes('.') && !newUrl.startsWith('https://') && !newUrl.startsWith('http://')) {
            newUrl = `https://www.google.com/search?q=${encodeURIComponent(newUrl)}`;
        }
        
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) return;

        const newHistory = tab.history.slice(0, tab.currentIndex + 1);
        newHistory.push(newUrl);

        updateTab(tabId, { 
            history: newHistory, 
            currentIndex: newHistory.length - 1,
            isLoading: true,
            isBlocked: false,
            title: newUrl,
            favicon: getFaviconUrl(newUrl),
        });
    };

    const handleAddNewTab = () => {
        const newTab = createNewTab();
        setTabs([...tabs, newTab]);
        setActiveTabId(newTab.id);
    };

    const handleCloseTab = (tabId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newTabs = tabs.filter(t => t.id !== tabId);
        if (newTabs.length === 0) {
            const newTab = createNewTab();
            setTabs([newTab]);
            setActiveTabId(newTab.id);
            return;
        }
        if (activeTabId === tabId) {
            const closingTabIndex = tabs.findIndex(t => t.id === tabId);
            const newActiveIndex = Math.max(0, closingTabIndex - 1);
            setActiveTabId(newTabs[newActiveIndex].id);
        }
        setTabs(newTabs);
    };

    const goBack = () => {
        if (activeTab.currentIndex > 0) {
            updateTab(activeTabId, { currentIndex: activeTab.currentIndex - 1, isLoading: true, isBlocked: false });
        }
    };

    const goForward = () => {
        if (activeTab.currentIndex < activeTab.history.length - 1) {
            updateTab(activeTabId, { currentIndex: activeTab.currentIndex + 1, isLoading: true, isBlocked: false });
        }
    };
    
    const reload = () => {
        if (iframeRef.current) {
            updateTab(activeTabId, { isLoading: true, isBlocked: false });
            iframeRef.current.src = 'about:blank';
            setTimeout(() => {
              if (iframeRef.current) {
                iframeRef.current.src = currentUrl;
              }
            }, 10);
        }
    };
    
    const handleIframeLoad = () => {
        const frame = iframeRef.current;
        // Use a short timeout to ensure the browser has settled security contexts
        // after the 'load' event, which can sometimes be inconsistent immediately.
        setTimeout(() => {
            if (!frame || frame.src.startsWith('about:')) {
                return;
            }

            let newTitle: string;
            let isBlocked = false;
            try {
                // Accessing the contentWindow's location will throw a security error
                // for cross-origin iframes that are blocked.
                if (frame.contentWindow?.location.href === null) {} // No-op access to trigger error

                // If we reach here, the frame is accessible.
                newTitle = frame.contentWindow?.document.title || new URL(currentUrl).hostname;
            } catch (e) {
                // The frame is blocked.
                isBlocked = true;
                try {
                    newTitle = new URL(currentUrl).hostname;
                } catch {
                    newTitle = "Invalid URL";
                }
            }
            updateTab(activeTabId, { isLoading: false, title: newTitle, isBlocked });
        }, 1);
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            navigateTo(inputValue, activeTabId);
        }
    };
    
    const NavButton: React.FC<{ onClick: () => void; disabled: boolean; children: React.ReactNode, title: string }> = ({ onClick, disabled, children, title }) => (
        <button onClick={onClick} disabled={disabled} title={title} className="p-1 rounded-full hover:bg-[var(--bg-tertiary)] disabled:opacity-50 disabled:hover:bg-transparent transition-colors">
            {children}
        </button>
    );

    const InfoIcon: React.FC<{className?: string}> = ({className}) => (
        <svg className={className} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>
    );

    return (
        <div className="h-full flex flex-col bg-[var(--bg-secondary)] text-[var(--text-primary)]">
            <div className="flex-shrink-0 flex items-center bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                <ul className="flex flex-row overflow-x-auto">
                    {tabs.map(tab => (
                        <li key={tab.id}
                            onClick={() => setActiveTabId(tab.id)}
                            className={`flex items-center gap-2 pl-3 pr-2 py-1.5 max-w-48 border-r border-[var(--border-color)] cursor-pointer text-xs relative ${activeTabId === tab.id ? 'bg-[var(--bg-secondary)]' : 'hover:bg-[var(--bg-tertiary)]'}`}
                        >
                           {tab.isLoading ? (
                               <svg className="animate-spin h-4 w-4 text-[var(--text-secondary)] flex-shrink-0" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                           ) : (
                                <img src={tab.favicon || undefined} className="w-4 h-4 flex-shrink-0" alt="" onError={(e) => e.currentTarget.style.display = 'none'} />
                           )}
                           <span className="truncate flex-grow">{tab.title}</span>
                           <button onClick={(e) => handleCloseTab(tab.id, e)} className="p-0.5 rounded-full hover:bg-[var(--bg-primary)] flex-shrink-0">
                               <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                           </button>
                        </li>
                    ))}
                </ul>
                <button onClick={handleAddNewTab} title="New Tab" className="p-2 border-l border-r border-[var(--border-color)] hover:bg-[var(--bg-secondary)]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
            </div>
            <div className="flex items-center p-1.5 gap-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-color)]">
                <NavButton onClick={goBack} disabled={activeTab.currentIndex === 0} title="Back">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </NavButton>
                <NavButton onClick={goForward} disabled={activeTab.currentIndex >= activeTab.history.length - 1} title="Forward">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </NavButton>
                <NavButton onClick={reload} disabled={false} title="Reload">
                    <svg className={`w-5 h-5 ${activeTab.isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-3.89M20 15a9 9 0 01-15 3.89" /></svg>
                </NavButton>
                <div className="flex-grow relative flex items-center">
                    <input
                        type="text" value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={handleInputKeyDown} onFocus={(e) => e.target.select()}
                        className="w-full bg-[var(--bg-primary)] rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2"
                        style={{'--tw-ring-color': theme.accentColor} as React.CSSProperties}
                        placeholder="Search Google or type a URL" />
                    <div className="absolute right-2 flex items-center gap-2">
                        <div className="group relative">
                            <InfoIcon className="w-4 h-4 text-[var(--text-secondary)]" />
                            <div className="absolute hidden group-hover:block bottom-full mb-2 right-1/2 translate-x-1/2 w-60 bg-[var(--bg-tertiary)] text-[var(--text-primary)] text-xs p-2 rounded shadow-lg border border-[var(--border-color)] z-10">
                                Some websites may not load due to security policies. Use the "Open Externally" button to open them in a new browser tab.
                            </div>
                        </div>
                        <button onClick={() => window.open(currentUrl, '_blank')} title="Open in New Tab" className="p-1 rounded-full hover:bg-[var(--bg-primary)]">
                           <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex-grow relative bg-white">
                {activeTab.isBlocked ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-[var(--bg-secondary)] text-[var(--text-primary)] text-center">
                        <svg className="w-16 h-16 text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
                        <h2 className="text-2xl font-bold mb-2">This page won't load</h2>
                        <p className="max-w-md mb-6 text-[var(--text-secondary)]">
                            <span className="font-semibold truncate block">{(()=>{ try { return new URL(currentUrl).hostname } catch { return 'This website'}})()}</span> has security settings that prevent it from being displayed here.
                        </p>
                        <button 
                            onClick={() => window.open(currentUrl, '_blank')} 
                            className="px-6 py-2 rounded-lg text-white font-semibold transition-opacity hover:opacity-90 flex items-center gap-2"
                            style={{ backgroundColor: theme.accentColor }}
                        >
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                            Open in New Tab
                        </button>
                    </div>
                ) : (
                    <iframe
                        ref={iframeRef}
                        key={activeTab.id}
                        src={currentUrl}
                        onLoad={handleIframeLoad}
                        className={`w-full h-full border-0 bg-white transition-opacity duration-300 ${activeTab.isLoading ? 'opacity-0' : 'opacity-100'}`}
                        title="Browser"
                        sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                    />
                )}
                 {activeTab.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white pointer-events-none">
                        <svg className="animate-spin h-8 w-8" style={{ color: theme.accentColor }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Notes ---
export const Notes: React.FC = () => {
    const { fileSystem } = useContext(AppContext)!;
    
    const documents = fileSystem.children?.find(c => c.id === 'documents');
    const notesFile = documents?.children?.find(c => c.name === 'notes.txt');

    if (!notesFile) {
        return (
             <div className="w-full h-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] flex items-center justify-center p-2 text-center">
                <p>Could not find notes.txt in your Documents folder.</p>
            </div>
        );
    }
    return <TextEditor file={notesFile} />;
};

// --- MediaViewer ---
export const MediaViewer: React.FC<{ file?: FileSystemNode }> = ({ file }) => {
    if (!file) {
        return (
            <div className="h-full w-full bg-black flex items-center justify-center p-4 text-gray-400">
                <p>No image selected. Open an image from the File Explorer.</p>
            </div>
        );
    }
    return (
        <div className="h-full w-full bg-black flex items-center justify-center p-4">
            <img src={file.content} alt={file.name} className="max-w-full max-h-full object-contain" />
        </div>
    );
};

// --- Properties Viewer ---
export const PropertiesViewer: React.FC<{ file?: FileSystemNode }> = ({ file }) => {
    if (!file) {
        return (
            <div className="p-4 text-[var(--text-secondary)] bg-transparent h-full flex items-center justify-center text-center">
                <p>Right-click a file and select "Properties" to view details.</p>
            </div>
        );
    }
    
    const formatBytes = (bytes: number, decimals = 2) => {
        if (!+bytes) return '0 Bytes'
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    const getFileTypeDescription = (node: FileSystemNode): string => {
        if (node.type === 'folder') return 'Folder';
        if (node.name.endsWith('.zip') || node.mimeType === 'application/zip') return 'ZIP Archive';
        if (node.mimeType) {
            if (node.mimeType.startsWith('image/')) return `Image File (${node.mimeType.split('/')[1].toUpperCase()})`;
            if (node.mimeType === 'text/plain') return 'Text Document';
            return node.mimeType;
        }
        const extension = node.name.split('.').pop()?.toLowerCase();
        switch (extension) {
            case 'txt': return 'Text Document';
            case 'md': return 'Markdown Document';
            case 'jpg':
            case 'jpeg': return 'JPEG Image';
            case 'png': return 'PNG Image';
            default: return 'File';
        }
    };

    return (
        <div className="p-4 text-[var(--text-primary)] bg-transparent h-full text-sm">
            <h2 className="text-lg font-bold mb-4 border-b border-[var(--border-color)] pb-2 flex items-center gap-2">
                {file.type === 'folder' ? <FolderIcon className="w-5 h-5 text-yellow-500" /> : <FileTextIcon className="w-5 h-5 text-gray-400" />}
                <span className="truncate">{file.name}</span>
            </h2>
            <div className="space-y-2">
                <div className="flex justify-between">
                    <span className="font-semibold text-[var(--text-secondary)]">Type:</span>
                    <span>{getFileTypeDescription(file)}</span>
                </div>
                {file.type === 'file' && (
                    <div className="flex justify-between">
                        <span className="font-semibold text-[var(--text-secondary)]">Size:</span>
                        <span>{formatBytes(file.size || 0)}</span>
                    </div>
                )}
                 {file.type === 'folder' && file.children && (
                    <div className="flex justify-between">
                        <span className="font-semibold text-[var(--text-secondary)]">Contains:</span>
                        <span>{file.children.length} items</span>
                    </div>
                )}
                <div className="flex justify-between">
                    <span className="font-semibold text-[var(--text-secondary)]">Created:</span>
                    <span className='text-right'>{file.createdAt ? new Date(file.createdAt).toLocaleString() : 'N/A'}</span>
                </div>
            </div>
        </div>
    );
};