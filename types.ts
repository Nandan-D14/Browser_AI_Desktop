import React from 'react';
// FIX: Removed unused and non-existent 'LiveSession' type from import.
import { GoogleGenAI } from "@google/genai";

export type AppId = 'ai_assistant' | 'file_explorer' | 'terminal' | 'settings' | 'text_editor' | 'calculator' | 'browser' | 'notes' | 'media_viewer' | 'properties_viewer';

export interface AppDefinition {
  id: AppId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  component: React.ComponentType<any>;
  defaultSize: [number, number];
  isDefault?: boolean;
}

export interface WindowInstance {
  id: string;
  appId: AppId;
  title: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
}

export type FileSystemNode = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  content?: string;
  children?: FileSystemNode[];
  mimeType?: string;
  createdAt?: string;
  size?: number;
  originalParentId?: string;
};

export type FileSystemAction =
  | { type: 'ADD_NODE'; payload: { parentId: string; node: FileSystemNode } }
  | { type: 'DELETE_NODE'; payload: { nodeId: string; parentId: string } }
  | { type: 'UPDATE_NODE'; payload: { nodeId: string; updates: Partial<FileSystemNode> } }
  | { type: 'EMPTY_TRASH' };

export interface Theme {
  mode: 'light' | 'dark';
  accentColor: string;
  fontFamily: string;
}

export interface Notification {
  id: string;
  appId: AppId;
  title: string;
  message: string;
  timestamp: string; // ISO string for serialization
  read: boolean;
}

export interface AppContextType {
  windows: WindowInstance[];
  openApp: (appId: AppId, args?: any) => void;
  closeApp: (id:string) => void;
  focusApp: (id: string) => void;
  minimizeApp: (id: string) => void;
  toggleMaximizeApp: (id: string) => void;
  updateWindow: (id: string, updates: Partial<Pick<WindowInstance, 'position' | 'size'>>) => void;
  wallpaper: string;
  setWallpaper: (url: string) => void;
  getAppDefinition: (appId: AppId) => AppDefinition | undefined;
  fileSystem: FileSystemNode;
  fsDispatch: React.Dispatch<FileSystemAction>;
  // FIX: Added activeWindowId to the context type to make it available to consumers.
  activeWindowId: string | null;
  dockedApps: AppId[];
  setDockedApps: React.Dispatch<React.SetStateAction<AppId[]>>;
  aiPromptHandler: React.MutableRefObject<((prompt: string) => void) | null>;
  aiVoiceHandler: React.MutableRefObject<(() => void) | null>;
  isAiListening: boolean;
  setIsAiListening: React.Dispatch<React.SetStateAction<boolean>>;
  theme: Theme;
  setTheme: React.Dispatch<React.SetStateAction<Theme>>;
  notifications: Notification[];
  sendNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markNotificationsAsRead: () => void;
  clearAllNotifications: () => void;
}

export type ConversationMode = 'QUICK' | 'THINKING' | 'VOICE';

export interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  mode?: ConversationMode;
  actions?: {
    label: string;
    onClick: () => void;
  }[];
}

export interface Transcription {
  user: string;
  model: string;
  isFinal: boolean;
}

export interface AiService {
  ai: GoogleGenAI | null;
  connectLiveApi: (
    callbacks: {
      onMessage: (message: any) => void;
      onError: (error: any) => void;
      onClose: () => void;
    }
    // FIX: Replaced non-existent 'LiveSession' type with 'any'.
  ) => Promise<any>;
  generateWithPro: (prompt: string) => Promise<string>;
  generateWithFlashLite: (prompt: string) => Promise<string>;
  generateWithProStream: (prompt: string, onChunk: (chunk: string) => void) => Promise<void>;
  generateWithFlashLiteStream: (prompt: string, onChunk: (chunk: string) => void) => Promise<void>;
  generateSpeech: (text: string) => Promise<string>;
}