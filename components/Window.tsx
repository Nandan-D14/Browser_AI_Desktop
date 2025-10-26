import React, { useState, useRef, useEffect, useCallback, MouseEvent as ReactMouseEvent, useContext } from 'react';
import { WindowInstance } from '../types';
import { AppContext } from '../App';

interface WindowProps {
  instance: WindowInstance;
  onClose: (id: string) => void;
  onMinimize: (id: string) => void;
  onMaximize: (id: string) => void;
  onFocus: (id: string) => void;
  onUpdateWindow: (id: string, updates: Partial<Pick<WindowInstance, 'position' | 'size'>>) => void;
  children: React.ReactNode;
  isActive: boolean;
}

const TOP_MENU_BAR_HEIGHT = 28; // in pixels

const WindowComponent: React.FC<WindowProps> = ({ instance, onClose, onMinimize, onMaximize, onFocus, onUpdateWindow, children, isActive }) => {
  const { id, title, position, size, isMaximized } = instance;
  const { theme } = useContext(AppContext)!;

  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  const dragStartPos = useRef({ x: 0, y: 0 });
  const resizeStartInfo = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const titleId = `window-title-${id}`;
  
  useEffect(() => {
    // Animate in on mount
    const timer = setTimeout(() => setIsMounted(true), 10);
    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsAnimatingOut(true);
    setTimeout(() => onClose(id), 300); // Match animation duration
  };

  const handleMinimize = () => {
    setIsAnimatingOut(true);
    setTimeout(() => onMinimize(id), 300); // Match animation duration
  };

  const handleDragStart = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (isMaximized) return;
    if (e.target !== e.currentTarget) return;
    setIsDragging(true);
    onFocus(id);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handleResizeStart = (e: ReactMouseEvent<HTMLDivElement>, direction: string) => {
    e.stopPropagation();
    setIsResizing(direction);
    onFocus(id);
    resizeStartInfo.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      onUpdateWindow(id, { position: { x: position.x + dx, y: Math.max(TOP_MENU_BAR_HEIGHT, position.y + dy) } });
      dragStartPos.current = { x: e.clientX, y: e.clientY };
    }

    if (isResizing) {
      const dx = e.clientX - resizeStartInfo.current.x;
      const dy = e.clientY - resizeStartInfo.current.y;

      let newWidth = resizeStartInfo.current.width;
      let newHeight = resizeStartInfo.current.height;
      let newX = position.x;
      let newY = position.y;

      const minWidth = 200;
      const minHeight = 150;

      if (isResizing.includes('right')) {
        newWidth = Math.max(minWidth, resizeStartInfo.current.width + dx);
      }
      if (isResizing.includes('bottom')) {
        newHeight = Math.max(minHeight, resizeStartInfo.current.height + dy);
      }
      if (isResizing.includes('left')) {
        const proposedWidth = resizeStartInfo.current.width - dx;
        newX = position.x + dx;
        newWidth = proposedWidth;
        if (newWidth < minWidth) {
          newX += newWidth - minWidth;
          newWidth = minWidth;
        }
      }
      if (isResizing.includes('top')) {
        const bottomEdge = position.y + size.height;
        const proposedY = position.y + dy;
        newY = proposedY;

        if (newY < TOP_MENU_BAR_HEIGHT) {
          newY = TOP_MENU_BAR_HEIGHT;
        }

        newHeight = bottomEdge - newY;

        if (newHeight < minHeight) {
          newHeight = minHeight;
          newY = bottomEdge - minHeight;
        }
      }
      
      onUpdateWindow(id, { size: { width: newWidth, height: newHeight }, position: { x: newX, y: newY } });
    }
  }, [isDragging, isResizing, id, onUpdateWindow, position, size]);
  
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(null);
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp]);
  
  const baseWindowStyle: React.CSSProperties = {
    backgroundColor: 'var(--window-bg)',
    borderColor: isActive ? theme.accentColor : 'var(--border-color)',
    color: 'var(--text-primary)'
  };

  const windowStyle: React.CSSProperties = isMaximized ? {
      ...baseWindowStyle,
      top: TOP_MENU_BAR_HEIGHT, left: 0, width: '100vw', height: `calc(100vh - ${TOP_MENU_BAR_HEIGHT}px)`, zIndex: instance.zIndex
    } : {
      ...baseWindowStyle,
      top: position.y, left: position.x, width: size.width, height: size.height, zIndex: instance.zIndex
    };

  const resizeHandles: {dir: string, style: React.CSSProperties}[] = [
    { dir: 'top', style: { top: -2, left: 4, right: 4, height: 4, cursor: 'ns-resize' } },
    { dir: 'bottom', style: { bottom: -2, left: 4, right: 4, height: 4, cursor: 'ns-resize' } },
    { dir: 'left', style: { top: 4, bottom: 4, left: -2, width: 4, cursor: 'ew-resize' } },
    { dir: 'right', style: { top: 4, bottom: 4, right: -2, width: 4, cursor: 'ew-resize' } },
    { dir: 'top-left', style: { top: -2, left: -2, width: 8, height: 8, cursor: 'nwse-resize' } },
    { dir: 'top-right', style: { top: -2, right: -2, width: 8, height: 8, cursor: 'nesw-resize' } },
    { dir: 'bottom-left', style: { bottom: -2, left: -2, width: 8, height: 8, cursor: 'nesw-resize' } },
    { dir: 'bottom-right', style: { bottom: -2, right: -2, width: 8, height: 8, cursor: 'nwse-resize' } },
  ];

  const animationClasses = (isMounted && !isAnimatingOut) ? 'opacity-100 scale-100' : 'opacity-0 scale-95';

  return (
    <div
      style={windowStyle}
      className={`absolute flex flex-col backdrop-blur-3xl border rounded-xl shadow-2xl shadow-black/50 overflow-hidden transition-all duration-300 ease-in-out ${animationClasses}`}
      onMouseDown={() => onFocus(id)}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-label={title}
    >
      <div
        className={`relative flex items-center justify-between h-8 px-2 select-none ${isMaximized ? '' : 'cursor-move'}`}
        onMouseDown={handleDragStart}
        onDoubleClick={() => onMaximize(id)}
      >
        <div className="flex items-center space-x-2 z-10">
            <button aria-label="Close" onClick={handleClose} className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500"></button>
            <button aria-label="Minimize" onClick={handleMinimize} className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-yellow-500"></button>
            <button aria-label="Maximize" onClick={() => onMaximize(id)} className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-green-500"></button>
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span id={titleId} className="text-sm font-semibold truncate" style={{ color: 'var(--text-secondary)'}}>{title}</span>
        </div>
      </div>
      <div className="flex-grow overflow-auto relative" style={{ backgroundColor: 'var(--window-content-bg)'}}>
        {children}
      </div>
      {!isMaximized && resizeHandles.map(handle => (
        <div
          key={handle.dir}
          style={handle.style}
          className="absolute"
          onMouseDown={(e) => handleResizeStart(e, handle.dir)}
        />
      ))}
    </div>
  );
};

export default WindowComponent;