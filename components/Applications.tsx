import React, { useState, useEffect, useRef, useContext, useCallback, useMemo } from 'react';
import { AppContext } from '../App';
import { FileSystemNode, ConversationMode, Message, Transcription, AppId, FileSystemAction, AppDefinition, Theme } from '../types';
import { initialFileSystem, FileTextIcon, FolderIcon, NewFolderIcon, APP_DEFINITIONS, ImageIcon, ComputerIcon, AppsIcon, PaintBrushIcon, SpeakerIcon, TrashIcon, GridViewIcon, ListViewIcon, ZipIcon, PreviewIcon, DownloadsIcon, GoogleDriveIcon } from '../constants';
import geminiService from '../services/geminiService';
import { decode, decodeAudioData, encode } from '../utils/audioUtils';
// FIX: Removed unused and non-existent 'LiveSession' type from import.

declare var JSZip: any;
// FIX: Declare google and gapi on the window object to resolve TypeScript errors for Google Drive/Picker APIs.
declare global {
    interface Window {
        google: any;
        gapi: any;
    }
}

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
                
                <div role="radiogroup" aria-label="Conversation Mode" className="flex space-x-2">
                    {(['QUICK', 'THINKING'] as ConversationMode[]).map(m => (
                        <button key={m} onClick={() => setMode(m)}
                            role="radio"
                            aria-checked={mode === m}
                            style={{ backgroundColor: mode === m ? theme.accentColor : 'var(--bg-tertiary)' }}
                            className={`px-3 py-1 text-sm rounded-full text-white transition-colors`}>
                            {m.charAt(0) + m.slice(1).toLowerCase()}
                        </button>
                    ))}
                </div>

                <button 
                    onClick={() => setIsTtsEnabled(prev => !prev)} 
                    aria-pressed={isTtsEnabled}
                    title={isTtsEnabled ? "Disable Text-to-Speech" : "Enable Text-to-Speech"}
                    style={{ backgroundColor: isTtsEnabled ? theme.accentColor : 'transparent' }}
                    className={`p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-colors`}
                >
                    <SpeakerIcon className={`w-4 h-4 transition-colors ${isTtsEnabled ? 'text-white' : 'text-[var(--text-secondary)]'}`} />
                </button>
            </div>
            <div className="flex-grow p-2 overflow-y-auto" role="log" aria-live="polite">
                {messages.map((msg, index) => (
                    <div key={msg.id} className={`mb-4 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`p-3 rounded-lg max-w-md ${msg.sender === 'user' ? 'text-white' : 'bg-[var(--bg-secondary)]'}`}
                                style={{ backgroundColor: msg.sender === 'user' ? theme.accentColor : undefined }}>
                                <p className="text-sm whitespace-pre-wrap">
                                    {msg.text}
                                    {isLoading && msg.sender === 'ai' && index === messages.length - 1 && (
                                        <span aria-hidden="true" className="inline-block w-2 h-4 bg-white animate-pulse ml-1 align-bottom"></span>
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
                    <div className="text-[var(--text-secondary)] p-2 border border-dashed border-[var(--border-color)] rounded-lg" aria-live="assertive" aria-atomic="true">
                        <p className="text-sm font-bold text-blue-400">User: <span className="font-normal text-[var(--text-primary)]">{transcription.user}</span></p>
                        <p className="text-sm font-bold text-green-400">AI: <span className="font-normal text-[var(--text-primary)]">{transcription.model}</span></p>
                    </div>
                )}
                {isLoading && messages[messages.length - 1]?.sender === 'user' && (
                     <div className="flex justify-start" aria-label="AI is thinking">
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
        <div ref={menuRef} style={{ top: y, left: x, backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border-color)' }} className="absolute z-50 border rounded-md shadow-lg text-[var(--text-primary)] text-sm" role="menu">
            <ul className="py-1">
                {items.map(item => (
                    <li key={item.label} onClick={() => { item.action(); onClose(); }}
                        onKeyPress={(e) => { if (e.key === 'Enter') { item.action(); onClose(); } }}
                        className="px-4 py-2 hover:bg-[var(--hover-bg)] hover:text-white cursor-pointer"
                        style={accentHoverStyle}
                        role="menuitem"
                        tabIndex={0}
                    >
                        {item.label}
                    </li>
                ))}
            </ul>
        </div>
    );
};

// --- File Explorer ---
export const FileExplorer: React.FC<{ file?: FileSystemNode }> = ({ file: initialFile }) => {
    const { fileSystem, fsDispatch, openApp, theme, sendNotification } = useContext(AppContext)!;
    
    const findNodeById = (node: FileSystemNode, nodeId: string): FileSystemNode | null => {
        if (node.id === nodeId) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = findNodeById(child, nodeId);
                if (found) return found;
            }
        }
        return null;
    };

    const getPathForNode = (root: FileSystemNode, nodeId: string): string[] => {
        const path: string[] = [];
        const find = (node: FileSystemNode, id: string): boolean => {
            if (node.id === id) {
                path.unshift(node.id);
                return true;
            }
            if (node.children) {
                for (const child of node.children) {
                    if (find(child, id)) {
                        path.unshift(node.id);
                        return true;
                    }
                }
            }
            return false;
        };
        find(root, nodeId);
        return path;
    };
    
    const initialPath = useMemo(() => {
        if (initialFile) return getPathForNode(fileSystem, initialFile.id);
        const desktopNode = fileSystem.children?.find(c => c.id === 'desktop');
        return desktopNode ? ['root', 'desktop'] : ['root'];
    }, [initialFile, fileSystem]);

    const [currentPath, setCurrentPath] = useState<string[]>(initialPath);
    const [history, setHistory] = useState<string[][]>([initialPath]);
    const [historyIndex, setHistoryIndex] = useState(0);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [previewFile, setPreviewFile] = useState<FileSystemNode | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node?: FileSystemNode } | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [renamingNodeId, setRenamingNodeId] = useState<string | null>(null);
    const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
    const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
    const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    
    // Google Drive State
    const [googleApiLoaded, setGoogleApiLoaded] = useState(false);
    const [tokenClient, setTokenClient] = useState<any>(null);
    const [gdriveAccessToken, setGdriveAccessToken] = useState<string | null>(null);


    const currentFolder = useMemo(() => {
        let node = fileSystem;
        for (let i = 1; i < currentPath.length; i++) {
            node = node.children?.find(c => c.id === currentPath[i])!;
        }
        return node;
    }, [currentPath, fileSystem]);

    useEffect(() => {
        setFocusedIndex(null); // Reset focus when folder changes
    }, [currentPath]);


    const navigateTo = useCallback((path: string[], newHistory = true) => {
        setCurrentPath(path);
        if (newHistory) {
            const newHistoryStack = history.slice(0, historyIndex + 1);
            newHistoryStack.push(path);
            setHistory(newHistoryStack);
            setHistoryIndex(newHistoryStack.length - 1);
        }
    }, [history, historyIndex]);

    const handleBack = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            navigateTo(history[newIndex], false);
        }
    };

    const handleForward = () => {
        if (historyIndex < history.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            navigateTo(history[newIndex], false);
        }
    };

    const handleUp = () => {
        if (currentPath.length > 1) {
            navigateTo(currentPath.slice(0, -1));
        }
    };
    
    const handleFileClick = (node: FileSystemNode) => {
        if (node.type === 'folder') {
            navigateTo([...currentPath, node.id]);
        } else {
            const mimeType = node.mimeType || '';
            if (mimeType.startsWith('image/')) {
                openApp('media_viewer', { file: node });
            } else if (mimeType === 'text/plain' || mimeType === 'text/markdown' || !mimeType) {
                openApp('text_editor', { file: node });
            } else {
                sendNotification({
                    appId: 'file_explorer',
                    title: 'Unsupported File Type',
                    message: `Cannot open "${node.name}". Preview is not available for this file type.`
                });
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        const items = currentFolder.children || [];
        if (items.length === 0) return;
    
        let currentIndex = focusedIndex === null ? -1 : focusedIndex;
    
        const getNumColumns = () => {
            if (!contentRef.current || viewMode !== 'grid') return 1;
            const container = contentRef.current.querySelector('[role="grid"]');
            if (!container) return 1;
            const containerWidth = container.clientWidth;
            // From tailwind `grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]` and `w-28` on item. 7rem is 112px.
            // Item width is `w-28` (7rem/112px), gap is `gap-4` (1rem/16px). Total width considered for calculation is ~128px.
            const itemWidth = 112 + 16;
            return Math.max(1, Math.floor(containerWidth / itemWidth));
        };
    
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (viewMode === 'grid') {
                    const numColumns = getNumColumns();
                    currentIndex = Math.min(items.length - 1, currentIndex + numColumns);
                } else {
                    currentIndex = Math.min(items.length - 1, currentIndex + 1);
                }
                break;
            case 'ArrowUp':
                e.preventDefault();
                if (viewMode === 'grid') {
                    const numColumns = getNumColumns();
                    currentIndex = Math.max(0, currentIndex - numColumns);
                } else {
                    currentIndex = Math.max(0, currentIndex - 1);
                }
                break;
            case 'ArrowRight':
                e.preventDefault();
                if(viewMode === 'grid' || viewMode === 'list') {
                    currentIndex = Math.min(items.length - 1, currentIndex + 1);
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                if(viewMode === 'grid' || viewMode === 'list') {
                     currentIndex = Math.max(0, currentIndex - 1);
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex !== null && items[focusedIndex]) {
                    handleFileClick(items[focusedIndex]);
                }
                break;
            case 'Home':
                e.preventDefault();
                currentIndex = 0;
                break;
            case 'End':
                e.preventDefault();
                currentIndex = items.length - 1;
                break;
            default:
                return;
        }
        
        if (currentIndex >= 0 && currentIndex < items.length) {
            setFocusedIndex(currentIndex);
            const elementId = `fs-item-${items[currentIndex].id}`;
            document.getElementById(elementId)?.scrollIntoView({ block: 'nearest' });
        }
    };

    const handleContextMenu = (e: React.MouseEvent, node?: FileSystemNode) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, node });
    };

    const createFolder = (name: string) => {
        const newNode: FileSystemNode = {
            id: `folder-${Date.now()}`,
            name: name,
            type: 'folder',
            children: [],
            createdAt: new Date().toISOString(),
        };
        fsDispatch({ type: 'ADD_NODE', payload: { parentId: currentFolder.id, node: newNode } });
        setCreatingFolder(false);
    };

    const deleteNode = (node: FileSystemNode) => {
        const trashFolderId = 'trash';
        const updatedNode = { ...node, originalParentId: currentFolder.id }; // Store original location
        fsDispatch({ type: 'DELETE_NODE', payload: { nodeId: node.id, parentId: currentFolder.id } });
        fsDispatch({ type: 'ADD_NODE', payload: { parentId: trashFolderId, node: updatedNode } });
        sendNotification({
            appId: 'file_explorer',
            title: 'File Moved to Trash',
            message: `"${node.name}" was moved to the Trash.`
        });
    };

    const renameNode = (nodeId: string, newName: string) => {
        fsDispatch({ type: 'UPDATE_NODE', payload: { nodeId, updates: { name: newName } } });
        setRenamingNodeId(null);
    };
    
    const handleDragStart = (e: React.DragEvent, nodeId: string) => {
        setDraggedNodeId(nodeId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', nodeId); // Necessary for Firefox
    
        // Create a ghost image for visual feedback during drag
        const dragGhost = e.currentTarget.cloneNode(true) as HTMLElement;
        dragGhost.style.position = 'absolute';
        dragGhost.style.top = '-9999px'; // Position off-screen
        dragGhost.style.opacity = '0.75';
        dragGhost.style.backgroundColor = theme.accentColor;
        dragGhost.style.transform = 'scale(0.95)';
        document.body.appendChild(dragGhost);
        e.dataTransfer.setDragImage(dragGhost, 20, 20); // Offset the image slightly from the cursor
    
        // Clean up the ghost image element after the drag starts
        setTimeout(() => {
            if (document.body.contains(dragGhost)) {
                document.body.removeChild(dragGhost);
            }
        }, 0);
    };

    const handleDrop = (e: React.DragEvent, targetNode: FileSystemNode) => {
        e.preventDefault();
        e.stopPropagation();
        const droppedNodeId = draggedNodeId; // Capture before resetting
        
        // Reset visual state immediately
        setDragOverNodeId(null);
        setDraggedNodeId(null);

        if (!droppedNodeId || droppedNodeId === targetNode.id || targetNode.type !== 'folder') return;
        
        const draggedNode = findNodeById(fileSystem, droppedNodeId);
        if (!draggedNode) return;
        
        const sourcePath = getPathForNode(fileSystem, droppedNodeId);
        const sourceParentId = sourcePath[sourcePath.length - 2];
        
        if (sourceParentId === targetNode.id) return; // Dropped on its own parent

        fsDispatch({ type: 'DELETE_NODE', payload: { nodeId: droppedNodeId, parentId: sourceParentId } });
        fsDispatch({ type: 'ADD_NODE', payload: { parentId: targetNode.id, node: draggedNode } });
    };

    const handleDragEnd = () => {
        setDraggedNodeId(null);
        setDragOverNodeId(null);
    };

    const emptyTrash = () => {
        const trashNode = findNodeById(fileSystem, 'trash');
        if (trashNode && trashNode.children && trashNode.children.length > 0) {
            if (window.confirm('Are you sure you want to permanently delete all items in the Trash? This action cannot be undone.')) {
                fsDispatch({ type: 'EMPTY_TRASH' });
                sendNotification({
                    appId: 'file_explorer',
                    title: 'Trash Emptied',
                    message: `All items have been permanently deleted.`
                });
            }
        }
    };
    
    const sidebarLocations: { name: string; id: string; icon: React.FC<any>}[] = [
        { name: 'Desktop', id: 'desktop', icon: ComputerIcon },
        { name: 'Documents', id: 'documents', icon: FileTextIcon },
        { name: 'Downloads', id: 'downloads', icon: DownloadsIcon },
        { name: 'Pictures', id: 'pictures', icon: ImageIcon },
        { name: 'Trash', id: 'trash', icon: TrashIcon },
    ];
    
    // --- Google Drive Integration ---
    useEffect(() => {
        const initializeGis = () => {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            if (clientId && !clientId.includes('YOUR_CLIENT_ID')) {
                const client = window.google.accounts.oauth2.initTokenClient({
                    client_id: clientId,
                    scope: 'https://www.googleapis.com/auth/drive.readonly',
                    callback: (tokenResponse: any) => {
                        if (tokenResponse && tokenResponse.access_token) {
                            setGdriveAccessToken(tokenResponse.access_token);
                        }
                    },
                });
                setTokenClient(client);
            }
            setGoogleApiLoaded(true);
        };

        if (window.google?.accounts && window.gapi) {
            initializeGis();
            return;
        }

        const gisScript = document.createElement('script');
        gisScript.src = 'https://accounts.google.com/gsi/client';
        gisScript.async = true;
        gisScript.defer = true;
        document.body.appendChild(gisScript);

        const gapiScript = document.createElement('script');
        gapiScript.src = 'https://apis.google.com/js/api.js';
        gapiScript.async = true;
        gapiScript.defer = true;
        document.body.appendChild(gapiScript);

        let scriptsLoaded = 0;
        const onScriptLoad = () => {
            scriptsLoaded++;
            if (scriptsLoaded === 2) {
                window.gapi.load('client:picker', initializeGis);
            }
        };

        gisScript.onload = onScriptLoad;
        gapiScript.onload = onScriptLoad;

    }, []);

    const pickerCallback = useCallback((data: any) => {
        if (data.action === window.google.picker.Action.PICKED) {
            const doc = data.docs[0];
            const fileId = doc.id;
            const fileName = doc.name;
            const mimeType = doc.mimeType;

            sendNotification({
                appId: 'file_explorer',
                title: 'Importing from Drive',
                message: `Downloading "${fileName}"...`
            });

            fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                headers: { 'Authorization': `Bearer ${gdriveAccessToken}` }
            })
            .then(res => {
                if (!res.ok) throw new Error(`Download failed: ${res.statusText}`);
                if (mimeType.startsWith('text/') || ['application/json', 'text/markdown'].includes(mimeType)) {
                    return res.text().then(content => ({ content, size: new Blob([content]).size }));
                } else {
                    return res.blob().then(blob => new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve({ content: reader.result as string, size: blob.size });
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    }));
                }
            })
            .then(({ content, size }) => {
                const newNode: FileSystemNode = {
                    id: `gdrive-${fileId}-${Date.now()}`,
                    name: fileName,
                    type: 'file',
                    content,
                    mimeType,
                    createdAt: new Date().toISOString(),
                    size
                };
                const downloadsFolder = findNodeById(fileSystem, 'downloads');
                const parentId = downloadsFolder ? 'downloads' : 'root';
                fsDispatch({ type: 'ADD_NODE', payload: { parentId, node: newNode } });
                sendNotification({
                    appId: 'file_explorer',
                    title: 'Import Complete',
                    message: `Imported "${fileName}" to Downloads.`
                });
            })
            .catch(error => {
                console.error('Drive import error:', error);
                sendNotification({
                    appId: 'file_explorer',
                    title: 'Import Failed',
                    message: `Could not import "${fileName}". See console for details.`
                });
            });
        }
    }, [gdriveAccessToken, fsDispatch, sendNotification, fileSystem]);

    const createPicker = useCallback((token: string) => {
        if (!token || !process.env.API_KEY) {
            sendNotification({
                appId: 'file_explorer',
                title: 'API Key Missing',
                message: 'Gemini API key is required to use Google Picker.'
            });
            return;
        }
        const view = new window.google.picker.View(window.google.picker.ViewId.DOCS);
        view.setMimeTypes("image/png,image/jpeg,image/jpg,text/plain,application/pdf,application/zip,text/markdown");

        const picker = new window.google.picker.PickerBuilder()
            .enableFeature(window.google.picker.Feature.NAV_HIDDEN)
            .setOAuthToken(token)
            .addView(view)
            .setDeveloperKey(process.env.API_KEY)
            .setCallback(pickerCallback)
            .build();
        picker.setVisible(true);
    }, [pickerCallback, sendNotification]);

    const handleGoogleDriveConnect = () => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId || clientId.includes('YOUR_CLIENT_ID')) {
            sendNotification({
                appId: 'file_explorer',
                title: 'Google Drive Setup Required',
                message: 'Please configure your Google Client ID. Opening README for instructions.'
            });
            const readmeNode = findNodeById(fileSystem, 'readme');
            if (readmeNode?.type === 'file') {
                openApp('text_editor', { file: readmeNode, title: "About This OS" });
            }
            return;
        }

        if (!googleApiLoaded) {
            sendNotification({
                appId: 'file_explorer',
                title: 'Google API Loading',
                message: 'Please wait a moment and try again.'
            });
            return;
        }

        if (gdriveAccessToken) {
            createPicker(gdriveAccessToken);
        } else if (tokenClient) {
            tokenClient.callback = (tokenResponse: any) => {
                if (tokenResponse?.access_token) {
                    const token = tokenResponse.access_token;
                    setGdriveAccessToken(token);
                    createPicker(token);
                }
            };
            tokenClient.requestAccessToken({ prompt: 'consent' });
        }
    };

    const renderNode = (node: FileSystemNode, index: number) => {
        const isRenaming = renamingNodeId === node.id;
        const isFocused = focusedIndex === index;
        const Icon = node.type === 'folder' ? FolderIcon : (
            node.mimeType?.startsWith('image/') ? ImageIcon : 
            (node.mimeType === 'application/zip' ? ZipIcon : FileTextIcon)
        );

        const itemContent = (
             <div
                id={`fs-item-${node.id}`}
                onClick={() => setFocusedIndex(index)}
                onDoubleClick={() => handleFileClick(node)}
                onContextMenu={(e) => handleContextMenu(e, node)}
                draggable
                onDragStart={(e) => handleDragStart(e, node.id)}
                onDrop={(e) => handleDrop(e, node)}
                onDragEnd={handleDragEnd}
                onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (node.type === 'folder' && draggedNodeId && node.id !== draggedNodeId) {
                        setDragOverNodeId(node.id);
                    }
                }}
                onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragOverNodeId(null);
                }}
                onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (node.type === 'folder' && draggedNodeId && node.id !== draggedNodeId) {
                        e.dataTransfer.dropEffect = 'move';
                    } else {
                        e.dataTransfer.dropEffect = 'none';
                    }
                }}
                className={`relative flex items-center p-2 rounded-md cursor-pointer group transition-colors duration-150 focus:outline-none ${viewMode === 'list' ? 'flex-row gap-2' : 'flex-col gap-1 w-28 h-28 justify-center text-center'} ${dragOverNodeId === node.id ? 'bg-blue-500/40' : ''} ${isFocused ? 'ring-2 ring-offset-2 ring-[var(--accent-color)] ring-offset-[var(--bg-primary)]' : ''}`}
                aria-label={node.name}
            >
                <Icon className={`${viewMode === 'grid' ? "w-12 h-12" : "w-6 h-6"} ${draggedNodeId ? 'pointer-events-none' : ''}`} aria-hidden="true" />
                {isRenaming ? (
                    <input
                        type="text"
                        defaultValue={node.name}
                        onBlur={(e) => renameNode(node.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && renameNode(node.id, (e.target as HTMLInputElement).value)}
                        autoFocus
                        onClick={e => e.stopPropagation()}
                        className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-sm p-1 text-sm w-full"
                    />
                ) : (
                    <span className={`text-sm text-[var(--text-primary)] break-words w-full group-hover:text-[var(--accent-color)] ${draggedNodeId ? 'pointer-events-none' : ''}`}>{node.name}</span>
                )}
            </div>
        );
        return viewMode === 'list' ? (
            <tr key={node.id} role="option" aria-selected={isFocused} className="hover:bg-[var(--bg-tertiary)] border-b border-[var(--border-color)] last:border-b-0">
                <td className="p-0">{itemContent}</td>
                <td className="p-2 text-sm text-[var(--text-secondary)]">{node.type}</td>
                <td className="p-2 text-sm text-[var(--text-secondary)]">{node.createdAt ? new Date(node.createdAt).toLocaleDateString() : 'N/A'}</td>
                <td className="p-2 text-sm text-[var(--text-secondary)]">{node.size ? `${(node.size / 1024).toFixed(1)} KB` : '--'}</td>
            </tr>
        ) : (
            <div key={node.id} role="gridcell" aria-selected={isFocused} className="hover:bg-[var(--bg-tertiary)] rounded-lg focus:outline-none">
                {itemContent}
            </div>
        );
    };

    const contextMenuItems = useMemo(() => {
        const items = [];
        const node = contextMenu?.node;
        if (node) {
            items.push({ label: 'Open', action: () => handleFileClick(node) });
            items.push({ label: 'Rename', action: () => setRenamingNodeId(node.id) });
            items.push({ label: 'Delete', action: () => deleteNode(node) });
            items.push({ label: 'Properties', action: () => openApp('properties_viewer', { file: node }) });

        } else { // Clicked on background
            items.push({ label: 'New Folder', action: () => setCreatingFolder(true) });
            items.push({ label: 'Toggle View', action: () => setViewMode(v => v === 'grid' ? 'list' : 'grid') });
            if (previewFile) {
                items.push({ label: 'Close Preview', action: () => setPreviewFile(null) });
            }
        }
        if (currentFolder.id === 'trash') {
            items.push({ label: 'Empty Trash', action: emptyTrash });
        }
        return items;
    }, [contextMenu, previewFile, currentFolder.id]);

    return (
        <div className="h-full flex flex-col bg-transparent text-[var(--text-primary)]">
            {/* Top Bar */}
            <div className="flex-shrink-0 flex items-center p-1.5 border-b border-[var(--border-color)] gap-2">
                <button onClick={handleBack} disabled={historyIndex === 0} className="p-2 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-50" aria-label="Go back"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                <button onClick={handleForward} disabled={historyIndex >= history.length - 1} className="p-2 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-50" aria-label="Go forward"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                <button onClick={handleUp} disabled={currentPath.length <= 1} className="p-2 rounded hover:bg-[var(--bg-tertiary)] disabled:opacity-50" aria-label="Go up one level"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg></button>
                <div className="flex-grow flex items-center bg-[var(--bg-tertiary)] rounded-md px-2 text-sm" aria-label="Current path">
                    {currentPath.map((id, index) => {
                        const folder = findNodeById(fileSystem, id);
                        return (
                            <React.Fragment key={id}>
                                <button onClick={() => navigateTo(currentPath.slice(0, index + 1))} className="px-2 py-1 hover:bg-[var(--bg-secondary)] rounded-sm">{folder?.name || '...'}</button>
                                {index < currentPath.length - 1 && <span className="text-[var(--text-secondary)]" aria-hidden="true">/</span>}
                            </React.Fragment>
                        );
                    })}
                </div>
                 <button onClick={handleGoogleDriveConnect} title="Connect Google Drive" className="p-2 rounded hover:bg-[var(--bg-tertiary)]">
                    <GoogleDriveIcon className="w-5 h-5" />
                </button>
                <button onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} aria-label="List view" className={`p-2 rounded hover:bg-[var(--bg-tertiary)] ${viewMode === 'list' && 'text-[var(--accent-color)]'}`}><ListViewIcon className="w-4 h-4" /></button>
                <button onClick={() => setViewMode('grid')} aria-pressed={viewMode === 'grid'} aria-label="Grid view" className={`p-2 rounded hover:bg-[var(--bg-tertiary)] ${viewMode === 'grid' && 'text-[var(--accent-color)]'}`}><GridViewIcon className="w-4 h-4" /></button>
                <button onClick={() => setPreviewFile(previewFile ? null : (currentFolder?.children?.[0] || null))} aria-pressed={!!previewFile} aria-label="Toggle preview pane" className={`p-2 rounded hover:bg-[var(--bg-tertiary)] ${previewFile && 'text-[var(--accent-color)]'}`}><PreviewIcon className="w-4 h-4" /></button>
            </div>
            
            <div className="flex-grow flex overflow-hidden">
                {/* Sidebar */}
                <nav className="w-48 flex-shrink-0 p-2 border-r border-[var(--border-color)] overflow-y-auto" aria-label="File explorer locations">
                    <ul className="space-y-1">
                        {sidebarLocations.map(loc => {
                            const node = findNodeById(fileSystem, loc.id);
                            if (!node) return null;
                            const isSelected = currentPath.length === 2 && currentPath[1] === loc.id;
                            return (
                                <li key={loc.id}>
                                    <button onClick={() => navigateTo(['root', loc.id])}
                                        style={isSelected ? { backgroundColor: theme.accentColor, color: 'white' } : {}}
                                        className="w-full flex items-center gap-2 p-2 text-sm rounded-md hover:bg-[var(--bg-tertiary)]"
                                        aria-current={isSelected ? "page" : undefined}
                                    >
                                        <loc.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                                        <span>{loc.name}</span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                
                {/* Main Content */}
                <div 
                  className="flex-grow overflow-auto focus:outline-none"
                  ref={contentRef}
                  tabIndex={0}
                  onKeyDown={handleKeyDown}
                  onContextMenu={handleContextMenu}
                  onClick={() => { setContextMenu(null); setFocusedIndex(null); }}
                  aria-label="File list"
                >
                    {viewMode === 'list' ? (
                        <table className="w-full text-left">
                            <thead className="border-b border-[var(--border-color)] text-sm text-[var(--text-secondary)]">
                                <tr><th className="p-2 font-semibold">Name</th><th className="p-2 font-semibold">Type</th><th className="p-2 font-semibold">Date Modified</th><th className="p-2 font-semibold">Size</th></tr>
                            </thead>
                            <tbody role="listbox" aria-label="Files and folders">
                                {currentFolder.children?.map((node, index) => renderNode(node, index))}
                            </tbody>
                        </table>
                    ) : (
                        <div role="grid" aria-label="Files and folders" className="p-4 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-4">
                            {currentFolder.children?.map((node, index) => renderNode(node, index))}
                        </div>
                    )}

                    {creatingFolder && (
                         <div className="p-4 inline-block">
                             <div className="flex flex-col items-center gap-1 w-28 text-center p-2">
                                 <NewFolderIcon className="w-12 h-12" />
                                 <input
                                     type="text"
                                     placeholder="New Folder"
                                     aria-label="New folder name"
                                     onBlur={(e) => { if(e.target.value) createFolder(e.target.value); else setCreatingFolder(false); }}
                                     onKeyDown={(e) => { if(e.key === 'Enter') createFolder((e.target as HTMLInputElement).value); if(e.key === 'Escape') setCreatingFolder(false); }}
                                     autoFocus
                                     className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-sm p-1 text-sm w-full"
                                 />
                             </div>
                         </div>
                    )}

                    {currentFolder?.children?.length === 0 && !creatingFolder && (
                        <div className="h-full flex items-center justify-center text-[var(--text-secondary)]">
                            <p>This folder is empty.</p>
                        </div>
                    )}
                </div>

                {/* Preview Pane */}
                {previewFile && (
                    <aside className="w-64 flex-shrink-0 border-l border-[var(--border-color)] p-4 flex flex-col items-center text-center overflow-y-auto" aria-label="Preview">
                        <button onClick={() => setPreviewFile(null)} aria-label="Close preview" className="self-end p-1 rounded-full hover:bg-[var(--bg-tertiary)]">&times;</button>
                        {(previewFile.mimeType?.startsWith('image/')) ? (
                            <img src={previewFile.content} alt={previewFile.name} className="max-w-full rounded-md mt-4" />
                        ) : (
                            <FileTextIcon className="w-24 h-24 text-[var(--text-secondary)] mt-4" aria-hidden="true" />
                        )}
                        <h3 className="mt-4 font-semibold break-all">{previewFile.name}</h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-2">
                            Type: {previewFile.mimeType || 'Unknown'} <br />
                            Size: {previewFile.size ? `${(previewFile.size / 1024).toFixed(1)} KB` : 'N/A'} <br />
                            Created: {previewFile.createdAt ? new Date(previewFile.createdAt).toLocaleDateString() : 'N/A'}
                        </p>
                    </aside>
                )}
            </div>
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} onClose={() => setContextMenu(null)} />}
        </div>
    );
};


// --- Terminal ---
export const Terminal: React.FC<{ initialCommand?: string }> = ({ initialCommand }) => {
    const { fileSystem } = useContext(AppContext)!;
    const [history, setHistory] = useState<string[]>(['Welcome to WarmWind OS Terminal']);
    const [input, setInput] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleCommand = (cmd: string) => {
        const newHistory = [...history, `> ${cmd}`];
        const [command, ...args] = cmd.split(' ');
        let output = '';

        // Simple command handling
        switch (command) {
            case 'help':
                output = 'Available commands: help, clear, ls, echo, date';
                break;
            case 'clear':
                setHistory([]);
                return;
            case 'echo':
                output = args.join(' ');
                break;
            case 'date':
                output = new Date().toString();
                break;
            case 'ls':
                // For simplicity, lists root files. A real terminal would track cwd.
                output = fileSystem.children?.map(c => c.name).join('  ') || 'Empty';
                break;
            default:
                output = `command not found: ${command}`;
        }
        setHistory([...newHistory, output]);
    };

    useEffect(() => {
        if (initialCommand) {
            handleCommand(initialCommand);
        }
    }, [initialCommand]);

    useEffect(() => {
        containerRef.current?.scrollTo(0, containerRef.current.scrollHeight);
    }, [history]);

    return (
        <div className="h-full bg-black text-green-400 font-mono p-2 text-sm overflow-y-auto" ref={containerRef} onClick={() => inputRef.current?.focus()}>
            <div role="log">
                {history.map((line, index) => <div key={index}>{line}</div>)}
            </div>
            <div className="flex">
                <label htmlFor="terminal-input" className="sr-only">Terminal Input</label>
                <span>&gt;&nbsp;</span>
                <input
                    id="terminal-input"
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            handleCommand(input);
                            setInput('');
                        }
                    }}
                    className="flex-grow bg-transparent border-none outline-none text-green-400"
                    autoFocus
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                />
            </div>
        </div>
    );
};

// --- Settings ---
const AppearanceSettings: React.FC = () => {
    const { wallpaper, setWallpaper, theme, setTheme } = useContext(AppContext)!;
    const [newWallpaperUrl, setNewWallpaperUrl] = useState(wallpaper);
    const fonts = ['system-ui', 'monospace', 'serif', 'cursive'];
    const accentColors = ['#3b82f6', '#ef4444', '#22c55e', '#f97316', '#a855f7'];

    const handleWallpaperChange = () => {
        if (newWallpaperUrl.trim()) {
            setWallpaper(newWallpaperUrl);
        }
    };
    
    const updateTheme = (updates: Partial<Theme>) => {
        setTheme(prev => ({ ...prev, ...updates }));
    };

    return (
        <>
            <h2 className="text-2xl font-bold mb-6">Appearance</h2>
            <section className="mb-8" aria-labelledby="wallpaper-heading">
                <h3 id="wallpaper-heading" className="text-lg font-semibold mb-2">Wallpaper</h3>
                <div className="flex items-center gap-2">
                    <label htmlFor="wallpaper-url" className="sr-only">Wallpaper Image URL</label>
                    <input
                        id="wallpaper-url"
                        type="text"
                        value={newWallpaperUrl}
                        onChange={(e) => setNewWallpaperUrl(e.target.value)}
                        className="flex-grow bg-[var(--bg-tertiary)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] px-3 py-2 rounded-md border border-[var(--border-color)] focus:outline-none focus:ring-1"
                        style={{'--tw-ring-color': theme.accentColor} as React.CSSProperties}
                        placeholder="Enter image URL"
                    />
                    <button onClick={handleWallpaperChange} style={{ backgroundColor: theme.accentColor }} className="text-white px-4 py-2 rounded-md hover:opacity-90">Set</button>
                </div>
                <img src={wallpaper} alt="Current wallpaper preview" className="mt-4 w-48 h-28 object-cover rounded-md border-2 border-[var(--border-color)]" />
            </section>
            
            <section className="mb-8" aria-labelledby="theme-mode-heading">
                <h3 id="theme-mode-heading" className="text-lg font-semibold mb-2">Theme Mode</h3>
                <div role="radiogroup" className="flex gap-4">
                    <button role="radio" aria-checked={theme.mode === 'light'} onClick={() => updateTheme({ mode: 'light' })} className={`px-4 py-2 rounded-md border ${theme.mode === 'light' ? 'border-[var(--accent-color)]' : 'border-[var(--border-color)]'}`}>Light</button>
                    <button role="radio" aria-checked={theme.mode === 'dark'} onClick={() => updateTheme({ mode: 'dark' })} className={`px-4 py-2 rounded-md border ${theme.mode === 'dark' ? 'border-[var(--accent-color)]' : 'border-[var(--border-color)]'}`}>Dark</button>
                </div>
            </section>

            <section className="mb-8" aria-labelledby="accent-color-heading">
                <h3 id="accent-color-heading" className="text-lg font-semibold mb-2">Accent Color</h3>
                <div className="flex gap-3" role="radiogroup">
                    {accentColors.map(color => (
                        <button key={color} role="radio" aria-checked={theme.accentColor === color} aria-label={`Color ${color}`} onClick={() => updateTheme({ accentColor: color })}
                            style={{ backgroundColor: color }}
                            className={`w-8 h-8 rounded-full border-2 ${theme.accentColor === color ? 'border-white' : 'border-transparent'}`}></button>
                    ))}
                </div>
            </section>
            
            <section aria-labelledby="font-family-heading">
                <h3 id="font-family-heading" className="text-lg font-semibold mb-2">Font Family</h3>
                <label htmlFor="font-select" className="sr-only">Select font family</label>
                <select id="font-select" value={theme.fontFamily} onChange={(e) => updateTheme({ fontFamily: e.target.value })}
                    className="bg-[var(--bg-tertiary)] text-[var(--text-primary)] px-3 py-2 rounded-md border border-[var(--border-color)] focus:outline-none">
                    {fonts.map(font => <option key={font} value={font}>{font}</option>)}
                </select>
            </section>
        </>
    );
};

const SoundSettingsPane: React.FC = () => {
    const { soundSettings, setSoundSettings } = useContext(AppContext)!;

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSoundSettings(prev => ({ ...prev, volume: parseFloat(e.target.value) }));
    };

    const togglePlaySounds = () => {
        setSoundSettings(prev => ({ ...prev, playSounds: !prev.playSounds }));
    };

    return (
        <>
            <h2 className="text-2xl font-bold mb-6">Sounds</h2>
            <section className="mb-8" aria-labelledby="volume-heading">
                <h3 id="volume-heading" className="text-lg font-semibold mb-2">Master Volume</h3>
                <div className="flex items-center gap-4">
                    <SpeakerIcon className="w-6 h-6 text-[var(--text-secondary)]" />
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={soundSettings.volume}
                        onChange={handleVolumeChange}
                        className="w-full h-2 bg-[var(--bg-tertiary)] rounded-lg appearance-none cursor-pointer"
                        aria-label="Master volume"
                    />
                    <span className="w-12 text-center">{(soundSettings.volume * 100).toFixed(0)}%</span>
                </div>
            </section>
            <section aria-labelledby="effects-heading">
                <h3 id="effects-heading" className="text-lg font-semibold mb-2">Sound Effects</h3>
                <div className="flex items-center justify-between p-2 rounded-md hover:bg-[var(--bg-tertiary)]">
                    <label htmlFor="play-sounds-toggle" className="cursor-pointer">Play notification sounds</label>
                    <button
                        id="play-sounds-toggle"
                        role="switch"
                        aria-checked={soundSettings.playSounds}
                        onClick={togglePlaySounds}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${soundSettings.playSounds ? 'bg-[var(--accent-color)]' : 'bg-[var(--bg-tertiary)]'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${soundSettings.playSounds ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                </div>
            </section>
        </>
    );
};

const AppsSettingsPane: React.FC = () => {
    const { dockedApps, setDockedApps, openApp, theme } = useContext(AppContext)!;
    
    const handlePinToggle = (appId: AppId) => {
        setDockedApps(prev => {
            if (prev.includes(appId)) {
                return prev.filter(id => id !== appId);
            } else {
                return [...prev, appId];
            }
        });
    };

    return (
        <>
            <h2 className="text-2xl font-bold mb-6">Applications</h2>
            <div className="space-y-2">
                {APP_DEFINITIONS.map(app => (
                    <div key={app.id} className="flex items-center justify-between p-2 rounded-md hover:bg-[var(--bg-tertiary)]">
                        <div className="flex items-center gap-4 cursor-pointer" onClick={() => openApp(app.id)}>
                            <app.icon className="w-8 h-8 flex-shrink-0" />
                            <span className="font-semibold">{app.name}</span>
                        </div>
                        <button 
                            onClick={() => handlePinToggle(app.id)}
                            style={{ 
                                backgroundColor: dockedApps.includes(app.id) ? 'transparent' : theme.accentColor,
                                color: dockedApps.includes(app.id) ? theme.accentColor : 'white',
                                borderColor: theme.accentColor,
                            }}
                            className="text-xs font-semibold px-3 py-1 rounded-full border transition-colors"
                        >
                            {dockedApps.includes(app.id) ? 'Unpin' : 'Pin to Taskbar'}
                        </button>
                    </div>
                ))}
            </div>
        </>
    );
};

export const Settings: React.FC = () => {
    const [activeTab, setActiveTab] = useState('appearance');
    const { theme } = useContext(AppContext)!;
    
    const settingsTabs = [
        { id: 'appearance', label: 'Appearance', icon: PaintBrushIcon },
        { id: 'sounds', label: 'Sounds', icon: SpeakerIcon },
        { id: 'apps', label: 'Apps', icon: AppsIcon },
    ];

    const renderContent = () => {
        switch (activeTab) {
            case 'appearance':
                return <AppearanceSettings />;
            case 'sounds':
                return <SoundSettingsPane />;
            case 'apps':
                return <AppsSettingsPane />;
            default:
                return <AppearanceSettings />;
        }
    };
    
    return (
        <div className="h-full flex text-[var(--text-primary)]">
            <nav className="w-48 flex-shrink-0 p-2 border-r border-[var(--border-color)]" aria-label="Settings categories">
                <ul className="space-y-1">
                    {settingsTabs.map(tab => (
                        <li key={tab.id}>
                            <button
                                onClick={() => setActiveTab(tab.id)}
                                style={activeTab === tab.id ? { backgroundColor: theme.accentColor, color: 'white' } : {}}
                                className="w-full flex items-center gap-3 p-2 text-sm rounded-md font-semibold hover:bg-[var(--bg-tertiary)] text-left"
                                aria-current={activeTab === tab.id ? 'page' : undefined}
                            >
                                <tab.icon className="w-5 h-5 flex-shrink-0" />
                                <span>{tab.label}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </nav>
            <main className="flex-grow p-6 overflow-y-auto">
                {renderContent()}
            </main>
        </div>
    );
};


// --- Text Editor ---
export const TextEditor: React.FC<{ file?: FileSystemNode }> = ({ file }) => {
    const { fsDispatch, theme } = useContext(AppContext)!;
    const [content, setContent] = useState(file?.content || '');
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);
    
    const handleSave = () => {
        if (file) {
            fsDispatch({ type: 'UPDATE_NODE', payload: { nodeId: file.id, updates: { content, size: new Blob([content]).size } } });
            setIsDirty(false);
        }
    };
    
    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContent(e.target.value);
        if (!isDirty) setIsDirty(true);
    };

    return (
        <div className="h-full flex flex-col bg-transparent">
            {file && (
                 <div className="flex-shrink-0 p-2 border-b border-[var(--border-color)]">
                    <button 
                        onClick={handleSave} 
                        style={{ backgroundColor: isDirty ? theme.accentColor : undefined }}
                        className={`px-3 py-1 rounded-md text-sm transition-colors ${isDirty ? 'text-white hover:opacity-90' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                        disabled={!isDirty}>
                        Save {isDirty && '*'}
                    </button>
                 </div>
            )}
             <label htmlFor="text-editor-area" className="sr-only">
                {file ? `Editing ${file.name}` : 'Text Editor'}
            </label>
            <textarea
                id="text-editor-area"
                value={content}
                onChange={handleChange}
                className="flex-grow w-full h-full bg-transparent text-[var(--text-primary)] p-4 resize-none focus:outline-none font-mono"
                placeholder="Start typing..."
            />
        </div>
    );
};

// --- Calculator ---
export const Calculator: React.FC = () => {
    const [display, setDisplay] = useState('0');
    const [expression, setExpression] = useState('');

    const handleInput = (char: string) => {
        if (display === '0' && char !== '.') {
            setDisplay(char);
        } else {
            setDisplay(display + char);
        }
    };
    
    const handleOperator = (op: string) => {
        setExpression(display + op);
        setDisplay('0');
    };

    const handleEquals = () => {
        try {
            // Using Function constructor for safe evaluation
            const result = new Function(`return ${expression}${display}`)();
            setDisplay(String(result));
            setExpression('');
        } catch (error) {
            setDisplay('Error');
        }
    };
    
    const handleClear = () => {
        setDisplay('0');
        setExpression('');
    };

    const buttons = [
        '7', '8', '9', '/',
        '4', '5', '6', '*',
        '1', '2', '3', '-',
        '0', '.', '=', '+'
    ];

    const handleButtonClick = (btn: string) => {
        if (!isNaN(Number(btn)) || btn === '.') {
            handleInput(btn);
        } else if (btn === '=') {
            handleEquals();
        } else {
            handleOperator(btn);
        }
    };
    
    return (
        <div className="h-full flex flex-col bg-gray-800 p-4 text-white">
            <div role="status" aria-live="polite" className="flex-grow bg-gray-700 rounded-lg p-4 text-right text-4xl mb-4 break-all">{display}</div>
            <div className="grid grid-cols-4 gap-2">
                <button onClick={handleClear} className="col-span-4 p-4 bg-gray-600 rounded-lg hover:bg-gray-500 text-2xl">C</button>
                {buttons.map(btn => (
                    <button key={btn} onClick={() => handleButtonClick(btn)}
                        className={`p-4 rounded-lg text-2xl ${'/*-+='.includes(btn) ? 'bg-orange-500 hover:bg-orange-400' : 'bg-gray-600 hover:bg-gray-500'}`}>
                        {btn}
                    </button>
                ))}
            </div>
        </div>
    );
};

// --- Browser ---
export const Browser: React.FC = () => {
    const [url, setUrl] = useState('https://www.google.com/webhp?igu=1');
    const [iframeSrc, setIframeSrc] = useState(url);

    const handleGo = () => {
        let finalUrl = url;
        if (!url.startsWith('http')) {
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
        setIframeSrc(finalUrl);
    };

    return (
        <div className="h-full flex flex-col bg-transparent">
            <div className="flex-shrink-0 p-2 border-b border-[var(--border-color)] flex gap-2">
                <label htmlFor="browser-url-input" className="sr-only">Website URL</label>
                <input id="browser-url-input" type="text" value={url} onChange={(e) => setUrl(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleGo()}
                    className="flex-grow bg-[var(--bg-tertiary)] text-[var(--text-primary)] px-3 py-1 rounded-md border border-[var(--border-color)] focus:outline-none"/>
                <button onClick={handleGo} className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-500">Go</button>
            </div>
            <iframe src={iframeSrc} title="Browser Content" className="w-full h-full border-none" sandbox="allow-scripts allow-same-origin allow-forms" />
        </div>
    );
};

// --- Notes ---
export const Notes: React.FC = () => {
    const { fsDispatch, fileSystem } = useContext(AppContext)!;
    const notesFile = useMemo(() => {
        let file = null;
        const docs = fileSystem.children?.find(c => c.id === 'documents');
        if (docs?.children) {
            file = docs.children.find(c => c.id === 'notes-file');
        }
        return file;
    }, [fileSystem]);
    
    const [content, setContent] = useState(notesFile?.content || '');

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (notesFile && content !== notesFile.content) {
                fsDispatch({
                    type: 'UPDATE_NODE',
                    payload: { nodeId: notesFile.id, updates: { content, size: new Blob([content]).size } }
                });
            }
        }, 500); // Debounce saving
        return () => clearTimeout(timeoutId);
    }, [content, notesFile, fsDispatch]);

    return (
        <textarea
            aria-label="Notes"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="w-full h-full bg-yellow-100 text-gray-800 p-4 resize-none focus:outline-none text-lg leading-loose"
            placeholder="Your notes are saved automatically..."
        />
    );
};

// --- Media Viewer ---
export const MediaViewer: React.FC<{ file: FileSystemNode }> = ({ file }) => {
    return (
        <div className="h-full w-full flex items-center justify-center bg-black p-4">
            <img src={file.content} alt={file.name} className="max-w-full max-h-full object-contain" />
        </div>
    );
};

// --- Properties Viewer ---
export const PropertiesViewer: React.FC<{ file: FileSystemNode }> = ({ file }) => {
    const properties = [
        { name: 'Name', value: file.name },
        { name: 'Type', value: file.type === 'folder' ? 'Folder' : (file.mimeType || 'File') },
        { name: 'Size', value: file.size ? `${(file.size / 1024).toFixed(2)} KB (${file.size} bytes)` : 'N/A' },
        { name: 'Created', value: file.createdAt ? new Date(file.createdAt).toLocaleString() : 'N/A' },
        { name: 'ID', value: file.id },
    ];
    return (
        <div className="p-4 text-sm text-[var(--text-primary)]">
            <h3 className="font-bold text-lg mb-4">{file.name}</h3>
            <table className="w-full" aria-label={`Properties for ${file.name}`}>
                <tbody>
                    {properties.map(prop => (
                        <tr key={prop.name} className="border-b border-[var(--border-color)]">
                            <td className="py-2 pr-2 font-semibold">{prop.name}</td>
                            <td className="py-2 break-all">{prop.value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};