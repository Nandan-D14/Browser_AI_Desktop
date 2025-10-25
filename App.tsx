
import React, { useState, useCallback, useMemo, createContext, useReducer, useRef, useEffect, useContext } from 'react';
import { AppContextType, AppDefinition, AppId, WindowInstance, FileSystemNode, FileSystemAction, Theme, Notification, SoundSettings } from './types';
import { APP_DEFINITIONS, initialFileSystem, FolderIcon, FileTextIcon, ImageIcon, BellIcon, AppsIcon } from './constants';
import WindowComponent from './components/Window';
import { AppRenderer, ContextMenu } from './components/Applications';

// --- File System Logic ---
const traverseAndModify = (node: FileSystemNode, action: FileSystemAction): FileSystemNode => {
    if (action.type === 'EMPTY_TRASH' && node.id === 'trash') {
        return { ...node, children: [] };
    }
    // This function creates a new tree with the modifications, ensuring immutability.
    let children = node.children;
    if (children) {
        if (action.type === 'ADD_NODE' && action.payload.parentId === node.id) {
            // Add node
            children = [...children, action.payload.node];
        } else if (action.type === 'DELETE_NODE' && action.payload.parentId === node.id) {
            // Delete node
            children = children.filter(child => child.id !== action.payload.nodeId);
        } else {
            // Recurse
            children = children.map(child => {
                 if (action.type === 'UPDATE_NODE' && action.payload.nodeId === child.id) {
                    return { ...child, ...action.payload.updates };
                 }
                 return traverseAndModify(child, action);
            });
        }
    }
    return { ...node, children };
};


const fileSystemReducer = (state: FileSystemNode, action: FileSystemAction): FileSystemNode => {
    if (action.type === 'UPDATE_NODE' && action.payload.nodeId === state.id) {
        return { ...state, ...action.payload.updates };
    }
    return traverseAndModify(state, action);
};

// --- Context ---
export const AppContext = createContext<AppContextType | null>(null);

// --- Helper Components ---
const Desktop: React.FC = () => {
    const { openApp, theme } = React.useContext(AppContext)!;
    return (
        <div className="absolute inset-0 p-4 pt-10">
            <div className="flex flex-col items-start space-y-4">
            {APP_DEFINITIONS.filter(app => app.isDefault).map(app => (
                 <div key={app.id} onDoubleClick={() => openApp(app.id)} className="flex flex-col items-center space-y-1 text-center w-20 cursor-pointer p-2 rounded hover:bg-white/10" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && openApp(app.id)}>
                    <app.icon className="w-12 h-12 drop-shadow-lg" aria-hidden="true" />
                    <span className="text-xs shadow-black/50" style={{ color: theme.mode === 'dark' ? '#fff' : '#111', textShadow: theme.mode === 'dark' ? '1px 1px 2px black' : 'none' }}>{app.name}</span>
                 </div>
            ))}
            </div>
        </div>
    );
};

const NotificationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { notifications, clearAllNotifications, getAppDefinition } = useContext(AppContext)!;
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    return (
        <div ref={panelRef} className="absolute top-full right-0 mt-1 w-80 bg-[var(--bg-secondary)] backdrop-blur-xl rounded-lg shadow-lg border border-[var(--border-color)] text-sm flex flex-col max-h-[32rem]" role="region" aria-label="Notification Panel">
            <div className="flex justify-between items-center p-3 border-b border-[var(--border-color)]">
                <h3 className="font-semibold text-[var(--text-primary)]">Notifications</h3>
                {notifications.length > 0 && (
                    <button onClick={clearAllNotifications} className="text-xs text-blue-500 hover:underline">Clear All</button>
                )}
            </div>
            {notifications.length > 0 ? (
                <ul className="flex-grow overflow-y-auto p-2">
                    {notifications.map(n => {
                        const AppIcon = getAppDefinition(n.appId)?.icon || 'div';
                        return (
                            <li key={n.id} className="p-2 rounded-md hover:bg-[var(--bg-tertiary)]">
                                <div className="flex items-start gap-3">
                                    <AppIcon className="w-6 h-6 flex-shrink-0 mt-1" aria-hidden="true" />
                                    <div className="flex-grow">
                                        <p className="font-semibold text-[var(--text-primary)]">{n.title}</p>
                                        <p className="text-xs text-[var(--text-secondary)]">{n.message}</p>
                                        <p className="text-xs text-[var(--text-secondary)] mt-1 opacity-70">{new Date(n.timestamp).toLocaleString()}</p>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            ) : (
                <div className="flex-grow flex items-center justify-center p-8 text-[var(--text-secondary)]">
                    <p>No new notifications</p>
                </div>
            )}
        </div>
    );
};


const TopMenuBar: React.FC = () => {
    const { windows, getAppDefinition, activeWindowId, notifications, markNotificationsAsRead } = useContext(AppContext)!;
    const [time, setTime] = useState(new Date());
    const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
    
    const activeWindow = windows.find(w => w.id === activeWindowId);
    const activeAppDef = activeWindow ? getAppDefinition(activeWindow.appId) : null;
    const activeAppName = activeAppDef ? activeAppDef.name : "Desktop";
    
    const unreadCount = useMemo(() => notifications.filter(n => !n.read).length, [notifications]);

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000 * 30);
        return () => clearInterval(timer);
    }, []);

    const handleNotificationToggle = () => {
        if (!isNotificationPanelOpen) {
            markNotificationsAsRead();
        }
        setIsNotificationPanelOpen(prev => !prev);
    };

    return (
        <header role="menubar" className="absolute top-0 left-0 right-0 h-7 bg-[var(--topbar-bg)] backdrop-blur-3xl flex items-center px-4 z-[100000] justify-between text-[var(--text-primary)] text-sm font-semibold border-b border-[var(--border-color)]">
            <div className="flex items-center gap-4">
                <div>{activeAppName}</div>
            </div>
            <div className="flex items-center gap-4">
                 <div>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                 <div className="relative">
                    <button onClick={handleNotificationToggle} className="relative" aria-haspopup="true" aria-expanded={isNotificationPanelOpen} aria-label={`Notifications, ${unreadCount} unread`}>
                        <BellIcon className="w-5 h-5" aria-hidden="true"/>
                        {unreadCount > 0 && (
                             <span className="absolute top-0 right-0 block h-2 w-2 transform translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-1 ring-[var(--topbar-bg)]"></span>
                        )}
                    </button>
                    {isNotificationPanelOpen && <NotificationPanel onClose={() => setIsNotificationPanelOpen(false)} />}
                 </div>
            </div>
        </header>
    )
};

const TaskbarPreview: React.FC<{
    appId: AppId,
    taskbarIconRef: React.RefObject<HTMLDivElement>,
    onMouseEnter: () => void,
    onMouseLeave: () => void,
}> = ({ appId, taskbarIconRef, onMouseEnter, onMouseLeave }) => {
    const { windows, getAppDefinition, closeApp, focusApp } = useContext(AppContext)!;
    const appDef = getAppDefinition(appId);
    const runningWindows = useMemo(() => windows.filter(w => w.appId === appId && !w.isMinimized), [windows, appId]);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ left: 0, bottom: 0 });

    useEffect(() => {
        if (taskbarIconRef.current && previewContainerRef.current) {
            const iconRect = taskbarIconRef.current.getBoundingClientRect();
            const bottom = window.innerHeight - iconRect.top;
            const left = iconRect.left + iconRect.width / 2;
            setPosition({ left, bottom });
        }
    }, [taskbarIconRef, runningWindows.length]);

    if (!appDef || runningWindows.length === 0) {
        return null;
    }

    return (
        <div
            ref={previewContainerRef}
            style={{ left: `${position.left}px`, bottom: `${position.bottom}px`, transform: 'translateX(-50%)' }}
            className="absolute z-[99999] flex flex-col-reverse items-center gap-2"
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
        >
            {runningWindows.map((win, index) => (
                <div
                    key={win.id}
                    onClick={() => focusApp(win.id)}
                    style={{ animationDelay: `${index * 50}ms` }}
                    className="w-48 bg-[var(--bg-secondary)] backdrop-blur-xl rounded-lg shadow-lg border border-[var(--border-color)] p-2 cursor-pointer hover:border-[var(--accent-color)] transition-all animate-preview-in"
                >
                    <div className="flex justify-between items-start gap-2">
                        <div className="flex items-start gap-2 overflow-hidden">
                            <appDef.icon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                            <span className="text-xs text-[var(--text-primary)] truncate">{win.title}</span>
                        </div>
                        <button
                            onClick={(e) => { e.stopPropagation(); closeApp(win.id); }}
                            className="p-0.5 rounded-full hover:bg-[var(--bg-tertiary)] flex-shrink-0"
                            aria-label={`Close ${win.title}`}
                        >
                            <svg className="w-3 h-3 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    <div className="mt-2 h-24 bg-[var(--bg-primary)] rounded-md flex items-center justify-center overflow-hidden">
                       <appDef.icon className="w-10 h-10 text-[var(--text-secondary)] opacity-50" aria-hidden="true" />
                    </div>
                </div>
            ))}
        </div>
    );
};

const Taskbar: React.FC = () => {
    const { 
        openApp, 
        aiPromptHandler, 
        aiVoiceHandler, 
        isAiListening, 
        theme, 
        dockedApps, 
        getAppDefinition, 
        windows, 
        focusApp, 
        setDockedApps,
        fileSystem
    } = useContext(AppContext)!;
    const [input, setInput] = useState('');
    const [taskbarContextMenu, setTaskbarContextMenu] = useState<{ x: number, y: number, appId: AppId } | null>(null);
    const [hoveredApp, setHoveredApp] = useState<{ appId: AppId, ref: React.RefObject<HTMLDivElement> } | null>(null);
    const hoverTimeoutRef = useRef<number | null>(null);
    const iconRefs = useRef<Map<AppId, React.RefObject<HTMLDivElement>>>(new Map());

    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [menuContextMenu, setMenuContextMenu] = useState<{x: number, y: number, app: AppDefinition} | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const [searchResults, setSearchResults] = useState<AppDefinition[]>([]);

    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }
        const query = searchQuery.toLowerCase();

        const filteredApps = APP_DEFINITIONS.filter(app =>
            app.name.toLowerCase().includes(query)
        );
        setSearchResults(filteredApps);
    }, [searchQuery]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false);
                setSearchQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    const handleAboutClick = () => {
        const readmeFile = fileSystem.children?.find(c => c.id === 'readme');
        if (readmeFile) {
            openApp('text_editor', { file: readmeFile, title: "About This OS" });
        }
        setIsMenuOpen(false);
        setSearchQuery('');
    };

    const handleMenuToggle = () => {
        const wasOpen = isMenuOpen;
        setIsMenuOpen(!wasOpen);
        if (wasOpen) {
            setSearchQuery('');
        }
    };

    const handlePinToggle = (appId: AppId) => {
        setDockedApps(prev => {
            if (prev.includes(appId)) {
                return prev.filter(id => id !== appId);
            } else {
                return [...prev, appId];
            }
        });
        setMenuContextMenu(null);
    };

    const menuContextItems = menuContextMenu ? [
        { 
            label: dockedApps.includes(menuContextMenu.app.id) ? 'Unpin from Taskbar' : 'Pin to Taskbar', 
            action: () => handlePinToggle(menuContextMenu.app.id)
        },
        { label: 'Open', action: () => openApp(menuContextMenu.app.id) }
    ] : [];

    const accentHoverStyle = {
        '--hover-color': theme.accentColor
    } as React.CSSProperties;

    const taskbarApps = useMemo(() => {
        const runningAppIds = windows.map(w => w.appId);
        const dockedSet = new Set(dockedApps);
        const runningButNotDocked = runningAppIds.filter(id => !dockedSet.has(id));
        const finalIds = [...dockedApps, ...runningButNotDocked];
        return [...new Set(finalIds)]
            .map(id => getAppDefinition(id))
            .filter((app): app is AppDefinition => !!app);
    }, [dockedApps, windows, getAppDefinition]);

    const getRef = (appId: AppId) => {
        if (!iconRefs.current.has(appId)) {
            iconRefs.current.set(appId, React.createRef<HTMLDivElement>());
        }
        return iconRefs.current.get(appId)!;
    };
    
    const showPreview = useCallback((appId: AppId, ref: React.RefObject<HTMLDivElement>) => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = window.setTimeout(() => {
            const runningWindows = windows.filter(w => w.appId === appId && !w.isMinimized);
            if (runningWindows.length > 0) {
                 setHoveredApp({ appId, ref });
            }
        }, 300);
    }, [windows]);

    const hidePreview = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = window.setTimeout(() => {
            setHoveredApp(null);
        }, 200);
    }, []);

    const cancelHidePreview = useCallback(() => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    }, []);

    const handleSubmit = () => {
        if (!input.trim()) return;
        openApp('ai_assistant');
        setTimeout(() => {
            aiPromptHandler.current?.(input);
            setInput('');
        }, 0);
    };

    const handleVoiceClick = () => {
        openApp('ai_assistant');
        setTimeout(() => {
            aiVoiceHandler.current?.();
        }, 0);
    };
    
    const handleIconContextMenu = (e: React.MouseEvent, appId: AppId) => {
        e.preventDefault();
        e.stopPropagation();
        setTaskbarContextMenu({ x: e.clientX, y: e.clientY, appId });
    };

    const taskbarContextItems = useMemo(() => {
        if (!taskbarContextMenu) return [];
        const { appId } = taskbarContextMenu;
        const isDocked = dockedApps.includes(appId);
        const items = [{ label: 'Open', action: () => { openApp(appId); setTaskbarContextMenu(null); } }];
        if (isDocked) {
            items.push({ label: 'Unpin from Taskbar', action: () => { setDockedApps(prev => prev.filter(id => id !== appId)); setTaskbarContextMenu(null); } });
        } else {
            items.push({ label: 'Pin to Taskbar', action: () => { setDockedApps(prev => [...prev, appId]); setTaskbarContextMenu(null); } });
        }
        return items;
    }, [taskbarContextMenu, openApp, setDockedApps, dockedApps]);

    return (
        <>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[100000]">
                <div 
                    role="toolbar"
                    aria-label="Taskbar"
                    className="flex items-center bg-black/25 backdrop-blur-2xl p-2 rounded-full border border-white/20 shadow-2xl shadow-black/50 transition-all duration-300 ease-in-out focus-within:shadow-lg focus-within:shadow-blue-500/50 focus-within:border-white/30"
                    onClick={() => { setTaskbarContextMenu(null); setMenuContextMenu(null); }}
                    onMouseLeave={hidePreview}
                >
                     <div className="relative group px-1" ref={menuRef}>
                        <button 
                            onClick={handleMenuToggle} 
                            aria-haspopup="true" aria-expanded={isMenuOpen} aria-label="App launcher"
                            className="p-2 rounded-full hover:bg-white/20 transition-all transform group-hover:scale-110"
                        >
                            <AppsIcon className="w-8 h-8" />
                        </button>
                         {isMenuOpen && (
                            <div role="menu" className="absolute bottom-full left-0 mb-2 w-80 bg-[var(--bg-secondary)] backdrop-blur-xl rounded-lg shadow-lg border border-[var(--border-color)] text-sm" >
                               <div className="p-2 border-b border-[var(--border-color)]">
                                    <input
                                        type="text"
                                        placeholder="Type to search..."
                                        className="w-full bg-[var(--bg-tertiary)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] px-2 py-1.5 rounded-md border border-[var(--border-color)] focus:outline-none focus:ring-1"
                                        style={{'--tw-ring-color': theme.accentColor} as React.CSSProperties}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        autoFocus
                                        aria-label="Search applications"
                                    />
                               </div>
                               <ul className="py-1 max-h-[28rem] overflow-y-auto text-[var(--text-primary)]" role="none">
                                    {!searchQuery.trim() ? (
                                        <>
                                            {APP_DEFINITIONS.map(app => (
                                                <li 
                                                    key={app.id}
                                                    onClick={() => { openApp(app.id); handleMenuToggle(); }} 
                                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuContextMenu({ x: e.clientX, y: e.clientY, app })}}
                                                    className="px-3 py-2 hover:bg-[var(--hover-color)] cursor-pointer flex items-center gap-3"
                                                    style={accentHoverStyle}
                                                    role="menuitem"
                                                >
                                                    <app.icon className="w-6 h-6 flex-shrink-0" aria-hidden="true" />
                                                    <span>{app.name}</span>
                                                </li>
                                            ))}
                                            <li className='border-t border-[var(--border-color)] mt-1 pt-1' role="separator">
                                                <div onClick={handleAboutClick} style={accentHoverStyle} className="px-3 py-2 hover:bg-[var(--hover-color)] cursor-pointer flex items-center gap-3" role="menuitem">About This OS</div>
                                            </li>
                                        </>
                                    ) : (
                                        <>
                                            {searchResults.length > 0 ? (
                                                searchResults.map(app => (
                                                    <li 
                                                        key={app.id}
                                                        onClick={() => { openApp(app.id); handleMenuToggle(); }} 
                                                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenuContextMenu({ x: e.clientX, y: e.clientY, app }); }}
                                                        className="px-3 py-2 hover:bg-[var(--hover-color)] cursor-pointer flex items-center gap-3"
                                                        style={accentHoverStyle}
                                                        role="menuitem"
                                                    >
                                                        <app.icon className="w-6 h-6 flex-shrink-0" aria-hidden="true"/>
                                                        <span>{app.name}</span>
                                                    </li>
                                                ))
                                            ) : (
                                                <li className="px-3 py-2 text-[var(--text-secondary)] text-center">No applications found for "{searchQuery}"</li>
                                            )}
                                        </>
                                    )}
                               </ul>
                            </div>
                        )}
                    </div>
                    {taskbarApps.map(appDef => {
                        const runningWindows = windows.filter(w => w.appId === appDef.id);
                        const isRunning = runningWindows.length > 0;
                        const isGrouped = runningWindows.length > 1;
                        const iconRef = getRef(appDef.id);
                        
                        const handleIconClick = () => {
                            const runningWindows = windows.filter(w => w.appId === appDef.id);
                            if (runningWindows.length > 0) {
                                focusApp(runningWindows[0].id);
                            } else {
                                openApp(appDef.id);
                            }
                        };

                        return (
                            <div 
                                key={appDef.id} 
                                ref={iconRef}
                                onMouseEnter={() => showPreview(appDef.id, iconRef)}
                                className="relative group px-1"
                            >
                                <button 
                                    onClick={handleIconClick} 
                                    onContextMenu={(e) => handleIconContextMenu(e, appDef.id)}
                                    aria-label={appDef.name}
                                    className="p-2 rounded-full hover:bg-white/20 transition-all transform group-hover:scale-110"
                                >
                                    <appDef.icon className="w-8 h-8" aria-hidden="true" />
                                </button>
                                {isRunning && (
                                    <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 h-1.5 bg-white rounded-full transition-all duration-200 ${isGrouped ? 'w-2.5' : 'w-1.5'}`} aria-hidden="true"></div>
                                )}
                            </div>
                        )
                    })}
                    
                    <button
                        onClick={handleVoiceClick}
                        className={`relative flex-shrink-0 p-2 rounded-full transition-colors duration-200 text-white ${isAiListening ? 'bg-red-600' : 'bg-green-600 hover:bg-green-500'}`}
                        aria-label="Start voice conversation"
                    >
                        {isAiListening && <span className="absolute inset-0 bg-red-500 rounded-full animate-ping" aria-hidden="true"></span>}
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" x2="12" y1="19" y2="22"></line></svg>
                    </button>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSubmit()}
                        className="flex-grow bg-transparent border-none text-white px-4 text-sm focus:outline-none placeholder-gray-400 min-w-[20rem]"
                        placeholder={isAiListening ? "Listening..." : "Ask AI anything..."}
                        disabled={isAiListening}
                        aria-label="Ask AI anything"
                    />
                    <button
                        onClick={handleSubmit}
                        disabled={isAiListening || !input.trim()}
                        style={{ backgroundColor: isAiListening || !input.trim() ? '' : theme.accentColor }}
                        className="flex-shrink-0 p-2 rounded-full hover:opacity-90 disabled:bg-gray-600 disabled:cursor-not-allowed text-white transition-colors duration-200"
                        aria-label="Send message"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </button>
                </div>
            </div>
            {hoveredApp && (
                <TaskbarPreview
                    appId={hoveredApp.appId}
                    taskbarIconRef={hoveredApp.ref}
                    onMouseEnter={cancelHidePreview}
                    onMouseLeave={hidePreview}
                />
            )}
            {taskbarContextMenu && <ContextMenu x={taskbarContextMenu.x} y={taskbarContextMenu.y} items={taskbarContextItems} onClose={() => setTaskbarContextMenu(null)} />}
            {menuContextMenu && <ContextMenu x={menuContextMenu.x} y={menuContextMenu.y} items={menuContextItems} onClose={() => setMenuContextMenu(null)} />}
        </>
    );
};

const NotificationToasts: React.FC = () => {
    const { notifications, getAppDefinition } = useContext(AppContext)!;
    const [visibleToasts, setVisibleToasts] = useState<Notification[]>([]);
    const displayedIds = useRef(new Set<string>());

    useEffect(() => {
        const newNotifications = notifications.filter(n => !displayedIds.current.has(n.id));

        if (newNotifications.length > 0) {
            newNotifications.forEach(n => displayedIds.current.add(n.id));
            setVisibleToasts(prev => [...prev, ...newNotifications]);

            newNotifications.forEach(n => {
                setTimeout(() => {
                    setVisibleToasts(current => current.filter(toast => toast.id !== n.id));
                }, 5000);
            });
        }
    }, [notifications]);
    
    const removeToast = (id: string) => {
        setVisibleToasts(current => current.filter(toast => toast.id !== id));
    };

    return (
        <div role="region" aria-live="polite" aria-label="Notifications" className="fixed bottom-4 right-4 z-[200000] w-80 space-y-2">
            {visibleToasts.map(toast => {
                const AppIcon = getAppDefinition(toast.appId)?.icon || 'div';
                return (
                    <div key={toast.id} role="status" aria-atomic="true" className="bg-[var(--bg-secondary)] backdrop-blur-xl rounded-lg shadow-lg border border-[var(--border-color)] p-3 animate-toast-in">
                        <div className="flex items-start gap-3">
                            <AppIcon className="w-6 h-6 flex-shrink-0 mt-1" aria-hidden="true" />
                            <div className="flex-grow">
                                <p className="font-semibold text-sm text-[var(--text-primary)]">{toast.title}</p>
                                <p className="text-xs text-[var(--text-secondary)]">{toast.message}</p>
                            </div>
                            <button onClick={() => removeToast(toast.id)} aria-label="Dismiss notification" className="p-1 rounded-full hover:bg-[var(--bg-tertiary)] -mt-1 -mr-1">
                                <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>
                );
            })}
             <style>{`
                @keyframes toast-in {
                    from { opacity: 0; transform: translateX(100%); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .animate-toast-in { animation: toast-in 0.3s ease-out forwards; }
                @keyframes preview-in {
                    from { opacity: 0; transform: translateY(10px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-preview-in { animation: preview-in 0.2s ease-out forwards; }
            `}</style>
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    // --- State Initialization with Persistence ---
    const [fileSystem, fsDispatch] = useReducer(fileSystemReducer, initialFileSystem, (initial) => {
        try {
            const saved = localStorage.getItem('warmwind_os_fs');
            return saved ? JSON.parse(saved) : initial;
        } catch (e) {
            console.error("Failed to load filesystem state:", e);
            return initial;
        }
    });

    const [windows, setWindows] = useState<WindowInstance[]>(() => {
        try {
            const saved = localStorage.getItem('warmwind_os_windows');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load windows state:", e);
            return [];
        }
    });
    
    const [theme, setTheme] = useState<Theme>(() => {
        try {
            const savedTheme = localStorage.getItem('warmwind_os_theme');
            return savedTheme ? JSON.parse(savedTheme) : {
                mode: 'dark',
                accentColor: '#3b82f6',
                fontFamily: 'system-ui, sans-serif',
            };
        } catch (e) {
            console.error("Failed to load theme state:", e);
            return {
                mode: 'dark',
                accentColor: '#3b82f6',
                fontFamily: 'system-ui, sans-serif',
            };
        }
    });

    const [soundSettings, setSoundSettings] = useState<SoundSettings>(() => {
        try {
            const saved = localStorage.getItem('warmwind_os_sound');
            return saved ? JSON.parse(saved) : {
                volume: 0.5,
                playSounds: true,
            };
        } catch (e) {
            console.error("Failed to load sound settings:", e);
            return { volume: 0.5, playSounds: true };
        }
    });


    const [activeWindowId, setActiveWindowId] = useState<string | null>(null); // Active window is transient on reload
    
    const [notifications, setNotifications] = useState<Notification[]>([]);

    const [nextZIndex, setNextZIndex] = useState<number>(() => {
        try {
            const savedWindowsRaw = localStorage.getItem('warmwind_os_windows');
            if (savedWindowsRaw) {
                const savedWindows: WindowInstance[] = JSON.parse(savedWindowsRaw);
                if (savedWindows.length > 0) {
                    return Math.max(...savedWindows.map(w => w.zIndex)) + 1;
                }
            }
        } catch (e) {
            console.error("Failed to calculate initial z-index from stored windows:", e);
        }
        return 10;
    });
    
    const [wallpaper, setWallpaper] = useState(() => {
        try {
            const savedWallpaper = localStorage.getItem('warmwind_os_wallpaper');
            return savedWallpaper || 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop';
        } catch (error) {
            console.error("Failed to load wallpaper from localStorage", error);
            return 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop';
        }
    });
    
    const [dockedApps, setDockedApps] = useState<AppId[]>([]);
    
    const lastWindowState = React.useRef<Map<string, {pos: {x:number, y:number}, size:{width:number, height:number}}>>(new Map());
    
    const aiPromptHandler = useRef<((prompt: string) => void) | null>(null);
    const aiVoiceHandler = useRef<(() => void) | null>(null);
    const [isAiListening, setIsAiListening] = useState(false);
    const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

    // --- Persistence Effects ---
    useEffect(() => {
        try {
            localStorage.setItem('warmwind_os_fs', JSON.stringify(fileSystem));
        } catch (e) { console.error("Failed to save filesystem state:", e); }
    }, [fileSystem]);

    useEffect(() => {
        try {
            localStorage.setItem('warmwind_os_windows', JSON.stringify(windows));
        } catch (e) { console.error("Failed to save windows state:", e); }
    }, [windows]);

    useEffect(() => {
        try {
            const savedDock = localStorage.getItem('warmwind_os_dock_apps');
            if (savedDock) {
                setDockedApps(JSON.parse(savedDock));
            } else {
                setDockedApps(APP_DEFINITIONS.filter(app => app.isDefault).map(app => app.id));
            }
        } catch (error) {
            console.error("Failed to load dock apps from localStorage", error);
            setDockedApps(APP_DEFINITIONS.filter(app => app.isDefault).map(app => app.id));
        }
    }, []);

    useEffect(() => {
        if (dockedApps.length > 0) { // Avoid writing the initial empty array
            localStorage.setItem('warmwind_os_dock_apps', JSON.stringify(dockedApps));
        }
    }, [dockedApps]);

    useEffect(() => {
        try {
            localStorage.setItem('warmwind_os_wallpaper', wallpaper);
        } catch (error) {
            console.error("Failed to save wallpaper to localStorage", error);
        }
    }, [wallpaper]);

    useEffect(() => {
        try {
            localStorage.setItem('warmwind_os_theme', JSON.stringify(theme));
            const root = document.documentElement;
            root.style.setProperty('--accent-color', theme.accentColor);
            root.style.setProperty('--font-family', theme.fontFamily);
            root.className = theme.mode;
        } catch (e) {
            console.error("Failed to save theme state:", e);
        }
    }, [theme]);

    useEffect(() => {
        try {
            localStorage.setItem('warmwind_os_sound', JSON.stringify(soundSettings));
        } catch (e) {
            console.error("Failed to save sound settings:", e);
        }
    }, [soundSettings]);

    useEffect(() => {
        notificationAudioRef.current = new Audio('data:audio/ogg;base64,T2dnUwACAAAAAAAAAABnHAAAAAAAAAAAAAAAAB8BHgF2b3JiaXMAAAAAAUSsAAAAAAAAYgAAYwAAAAABAAAAAAA++CBkJEIscg+w4xJBVjrDkHg/tAOAaBc5BJpxjzznInGPOOeecc84555xzzjnnnHPOOeecc84555xzzjnnnHPOOeecc84555xzzjnnnFsmQkSxyD5EjLGEFWesOQeD+0A4BoFzkEmnGPPOCcaAQw455JAhjjjiiCSOOSaZY456JqJDBhpllFImmWiimWZKa6455pknpXnmmmy2CSeaaJ56KqKstgpqqimmquqqqq7KKqustuoopLDCGmu22Wq77bbbbbvuttz222+/DTfccMMNN+ywxRZbbrvtuhvvuO2+G/DAAw888MADDzzwwAOPPPDAAw888MADDzwgAgA=');
    }, []);

    const getAppDefinition = useCallback((appId: AppId): AppDefinition | undefined => {
        return APP_DEFINITIONS.find(app => app.id === appId);
    }, []);

    const openApp = useCallback((appId: AppId, args?: any) => {
        const appDef = getAppDefinition(appId);
        if (!appDef) return;

        let windowTitle = args?.title || appDef.name;
        if (!args?.title && args?.file?.name) {
            if (appId === 'text_editor') {
                 windowTitle = args.file.name;
            } else {
                 windowTitle = `${appDef.name} - ${args.file.name}`;
            }
        }
        
        const existingWindow = windows.find(w => w.appId === appId);
        if(existingWindow && appId !== 'text_editor' && appId !== 'media_viewer' && appId !== 'properties_viewer'){
            focusApp(existingWindow.id);
            return;
        }


        const newWindow: WindowInstance = {
            id: `${appId}-${Date.now()}`,
            appId,
            title: windowTitle,
            position: { x: Math.random() * 200 + 50, y: Math.random() * 200 + 50 },
            size: { width: appDef.defaultSize[0], height: appDef.defaultSize[1] },
            zIndex: nextZIndex + 1,
            isMinimized: false,
            isMaximized: false,
            ...args
        };
        
        setWindows(prev => [...prev, newWindow]);
        setActiveWindowId(newWindow.id);
        setNextZIndex(prev => prev + 1);
    }, [nextZIndex, getAppDefinition, windows]);

    const closeApp = useCallback((id: string) => {
        setWindows(prev => prev.filter(win => win.id !== id));
        if (activeWindowId === id) {
             const remainingWindows = windows.filter(win => win.id !== id && !win.isMinimized);
             setActiveWindowId(remainingWindows.length > 0 ? remainingWindows.sort((a,b) => b.zIndex - a.zIndex)[0].id : null);
        }
    }, [activeWindowId, windows]);

    const focusApp = useCallback((id: string) => {
        if (id === activeWindowId && !windows.find(w => w.id === id)?.isMinimized) return;
        setNextZIndex(prevZ => {
            const newZ = prevZ + 1;
            setWindows(currentWindows => 
                currentWindows.map(win => win.id === id ? { ...win, zIndex: newZ, isMinimized: false } : win)
            );
            return newZ;
        });
        setActiveWindowId(id);
    }, [activeWindowId, windows]);

    const minimizeApp = useCallback((id: string) => {
        setWindows(prev => prev.map(win => win.id === id ? { ...win, isMinimized: !win.isMinimized } : win));
        const wasMinimized = windows.find(w => w.id === id)?.isMinimized;
        if (!wasMinimized) {
            const otherWindows = windows.filter(w => w.id !== id && !w.isMinimized);
            if(otherWindows.length > 0) {
                 setActiveWindowId(otherWindows.sort((a,b) => b.zIndex - a.zIndex)[0].id);
            } else {
                 setActiveWindowId(null);
            }
        } else {
            focusApp(id);
        }
    }, [windows, focusApp]);
    
    const toggleMaximizeApp = useCallback((id: string) => {
        setWindows(prev => prev.map(win => {
            if (win.id === id) {
                if (win.isMaximized) { // Restore
                    const lastState = lastWindowState.current.get(id);
                    return { ...win, isMaximized: false, position: lastState?.pos || win.position, size: lastState?.size || win.size };
                } else { // Maximize
                    lastWindowState.current.set(id, {pos: win.position, size: win.size});
                    return { ...win, isMaximized: true };
                }
            }
            return win;
        }));
    }, []);

    const updateWindow = useCallback((id: string, updates: Partial<Pick<WindowInstance, 'position' | 'size'>>) => {
        setWindows(prev => prev.map(win => win.id === id ? { ...win, ...updates } : win));
    }, []);

    const sendNotification = useCallback((notificationData: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        const newNotification: Notification = {
            id: `notif-${Date.now()}`,
            ...notificationData,
            timestamp: new Date().toISOString(),
            read: false,
        };
        setNotifications(prev => [newNotification, ...prev]);

        if (soundSettings.playSounds && notificationAudioRef.current) {
            notificationAudioRef.current.volume = soundSettings.volume;
            notificationAudioRef.current.play().catch(e => console.error("Error playing notification sound:", e));
        }
    }, [soundSettings]);

    const markNotificationsAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => n.read ? n : { ...n, read: true }));
    }, []);

    const clearAllNotifications = useCallback(() => {
        setNotifications([]);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Hotkey for closing the active window (Alt+F4)
            if (event.altKey && event.key === 'F4') {
                event.preventDefault(); // Prevent closing the browser tab
                if (activeWindowId) {
                    closeApp(activeWindowId);
                }
            }

            // Hotkey for opening AI Assistant (Ctrl+Alt+A)
            if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'a') {
                event.preventDefault();
                openApp('ai_assistant');
            }

            // Hotkey for opening File Explorer (Ctrl+Alt+E)
            if (event.ctrlKey && event.altKey && event.key.toLowerCase() === 'e') {
                event.preventDefault();
                openApp('file_explorer');
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeWindowId, closeApp, openApp]);

    const contextValue = useMemo(() => ({
        windows, openApp, closeApp, focusApp, minimizeApp, toggleMaximizeApp, updateWindow, wallpaper, setWallpaper, getAppDefinition, fileSystem, fsDispatch, activeWindowId, dockedApps, setDockedApps, aiPromptHandler, aiVoiceHandler, isAiListening, setIsAiListening, theme, setTheme,
        soundSettings, setSoundSettings,
        notifications, sendNotification, markNotificationsAsRead, clearAllNotifications
    }), [windows, openApp, closeApp, focusApp, minimizeApp, toggleMaximizeApp, updateWindow, wallpaper, setWallpaper, getAppDefinition, fileSystem, activeWindowId, dockedApps, setDockedApps, isAiListening, theme, soundSettings, notifications, sendNotification, markNotificationsAsRead, clearAllNotifications]);

    return (
        <AppContext.Provider value={contextValue}>
            <main className="h-screen w-screen font-sans overflow-hidden">
                <div className="absolute inset-0 bg-cover bg-center transition-all duration-500" style={{ backgroundImage: `url(${wallpaper})` }} />
                <TopMenuBar />
                <Desktop />
                
                {windows.filter(win => !win.isMinimized).map(win => (
                    <WindowComponent
                        key={win.id}
                        instance={win}
                        onClose={closeApp}
                        onMinimize={minimizeApp}
                        onMaximize={toggleMaximizeApp}
                        onFocus={focusApp}
                        onUpdateWindow={updateWindow}
                        isActive={win.id === activeWindowId}
                    >
                        <AppRenderer appId={win.appId} args={win} />
                    </WindowComponent>
                ))}
                
                <Taskbar />
                <NotificationToasts />
            </main>
        </AppContext.Provider>
    );
};

export default App;
