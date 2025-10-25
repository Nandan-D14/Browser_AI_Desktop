
import React from 'react';
import { AppDefinition, FileSystemNode } from './types';
import { AIAssistant, FileExplorer, Terminal, Settings, TextEditor, Calculator, Browser, Notes, MediaViewer, PropertiesViewer } from './components/Applications';

// --- SVG Icons ---
export const FolderIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M5 8C5 6.89543 5.89543 6 7 6H19.0287C19.9824 6 20.8993 6.4023 21.5016 7.10073L23.4984 9.89927C24.1007 10.5977 25.0176 11 25.9713 11H41C42.1046 11 43 11.8954 43 13V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" fill="#2563EB"></path><path d="M5 16C5 14.8954 5.89543 14 7 14H41C42.1046 14 43 14.8954 43 16V20H5V16Z" fill="#3B82F6"></path></svg>
);
export const NewFolderIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><g clipPath="url(#clip0_105_19)"><path d="M5 8C5 6.89543 5.89543 6 7 6H19.0287C19.9824 6 20.8993 6.4023 21.5016 7.10073L23.4984 9.89927C24.1007 10.5977 25.0176 11 25.9713 11H41C42.1046 11 43 11.8954 43 13V40C43 41.1046 42.1046 42 41 42H7C5.89543 42 5 41.1046 5 40V8Z" fill="#2563EB"></path><path d="M5 16C5 14.8954 5.89543 14 7 14H41C42.1046 14 43 14.8954 43 16V20H5V16Z" fill="#3B82F6"></path><circle cx="34" cy="34" r="10" fill="#4ADE80"></circle><path d="M34 29V39" stroke="white" strokeWidth="3" strokeLinecap="round"></path><path d="M29 34L39 34" stroke="white" strokeWidth="3" strokeLinecap="round"></path></g><defs><clipPath id="clip0_105_19"><rect width="48" height="48" fill="white"></rect></clipPath></defs></svg>
);
export const FileTextIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M10 4H30L40 14V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V6C8 4.89543 8.89543 4 10 4Z" fill="#E5E7EB"></path><path d="M30 4L40 14H32C30.8954 14 30 13.1046 30 12V4Z" fill="#9CA3AF"></path><path d="M16 24H32" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"></path><path d="M16 32H26" stroke="#6B7280" strokeWidth="3" strokeLinecap="round"></path></svg>
);
export const TerminalIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><rect width="40" height="32" x="4" y="8" fill="#1F2937" rx="4"></rect><path d="M12 18L18 24L12 30" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"></path><path d="M22 30H32" stroke="#34D399" strokeWidth="3" strokeLinecap="round"></path></svg>
);
export const SettingsIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path fillRule="evenodd" clipRule="evenodd" d="M24 30C27.3137 30 30 27.3137 30 24C30 20.6863 27.3137 18 24 18C20.6863 18 18 20.6863 18 24C18 27.3137 20.6863 30 24 30Z" fill="#9CA3AF"></path><path d="M37.5685 20.6322L33.2426 24.9581C33.6527 25.961 33.6527 27.039 33.2426 28.0419L37.5685 32.3678C39.4211 30.5152 39.4211 27.4848 37.5685 25.6322L37.5685 20.6322Z" fill="#6B7280"></path><path d="M14.7574 24.9581L10.4315 20.6322C8.57887 22.4848 8.57887 25.5152 10.4315 27.3678L14.7574 23.0419C14.3473 22.039 14.3473 20.961 14.7574 19.9581L14.7574 24.9581Z" fill="#6B7280"></path><path d="M28.0419 14.7574L24.9581 10.4315C22.4848 8.57887 20.5152 8.57887 18.6322 10.4315L23.0419 14.7574C22.039 14.3473 20.961 14.3473 19.9581 14.7574L28.0419 14.7574Z" fill="#9CA3AF"></g><path d="M24.9581 33.2426L28.0419 37.5685C25.5152 39.4211 22.4848 39.4211 20.6322 37.5685L19.9581 33.2426C20.961 33.6527 22.039 33.6527 23.0419 33.2426L24.9581 33.2426Z" fill="#9CA3AF"></g><path d="M20.6322 37.5685L24.9581 33.2426C25.961 33.6527 27.039 33.6527 28.0419 33.2426L32.3678 37.5685C30.5152 39.4211 27.4848 39.4211 25.6322 37.5685L20.6322 37.5685Z" fill="#6B7280"></g><path d="M32.3678 10.4315L28.0419 14.7574C27.039 14.3473 25.961 14.3473 24.9581 14.7574L20.6322 10.4315C22.4848 8.57887 25.5152 8.57887 27.3678 10.4315L32.3678 10.4315Z" fill="#6B7280"></g></svg>
);
export const CalculatorIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><rect x="8" y="4" width="32" height="40" rx="6" fill="#1F2937"></rect><rect x="12" y="8" width="24" height="10" rx="3" fill="#4B5563"></rect><rect x="12" y="22" width="6" height="6" rx="2" fill="#4B5563"></rect><rect x="21" y="22" width="6" height="6" rx="2" fill="#4B5563"></rect><rect x="30" y="22" width="6" height="6" rx="2" fill="#F97316"></rect><rect x="12" y="30" width="6" height="6" rx="2" fill="#4B5563"></rect><rect x="21" y="30" width="6" height="6" rx="2" fill="#4B5563"></rect><rect x="30" y="30" width="6" height="6" rx="2" fill="#F97316"></rect></svg>
);
export const AiIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><rect x="4" y="4" width="40" height="40" rx="8" fill="url(#ai-grad)"></rect><path d="M24 13L24 35" stroke="white" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round"></path><path d="M18 19L18 29" stroke="white" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round"></path><path d="M30 19L30 29" stroke="white" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round"></path><path d="M13 24H35" stroke="white" strokeOpacity="0.8" strokeWidth="2" strokeLinecap="round"></path><defs><linearGradient id="ai-grad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#3B82F6"></stop><stop offset="1" stopColor="#8B5CF6"></stop></linearGradient></defs></svg>
);
export const BrowserIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><circle cx="24" cy="24" r="20" fill="white"></circle><path d="M24 4C26.1217 4 28.2173 4.41721 30.1793 5.22221C18.8188 8.65251 10.6525 18.8188 7.22221 30.1793C6.41721 28.2173 6 26.1217 6 24C6 13.9543 13.9543 6 24 6C24 4.88566 24 4 24 4Z" fill="#34D399"></path><circle cx="24" cy="24" r="20" stroke="#E5E7EB" strokeWidth="4"></circle><path d="M24 4C13.9543 4 4 13.9543 4 24C4 26.1217 4.41721 28.2173 5.22221 30.1793C8.65251 18.8188 18.8188 10.6525 30.1793 7.22221C28.2173 6.41721 26.1217 6 24 6C24 4.88566 24 4 24 4Z" fill="#3B82F6"></path></svg>
);
export const NoteIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M8 5C8 4.44772 8.44772 4 9 4H39C39.5523 4 40 4.44772 40 5V43C40 43.5523 39.5523 44 39 44H9C8.44772 44 8 43.5523 8 43V5Z" fill="#FBBF24"></path><path d="M8 10H40" stroke="#F87171" strokeWidth="4"></path></svg>
);
export const ImageIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><rect x="4" y="4" width="40" height="40" rx="8" fill="#E5E7EB"></rect><path d="M4 32L14 22C15.5556 20.4444 18.4444 20.4444 20 22L28 30L32 26C33.5556 24.4444 36.4444 24.4444 38 26L44 32V38C44 39.1046 43.1046 40 42 40H6C4.89543 40 4 39.1046 4 38V32Z" fill="#34D399"></path><circle cx="32" cy="16" r="4" fill="#FBBF24"></circle></svg>
);
export const ZipIcon = ({ className }: { className?: string, style?: React.CSSProperties }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M10 4H30L40 14V42C40 43.1046 39.1046 44 38 44H10C8.89543 44 8 43.1046 8 42V6C8 4.89543 8.89543 4 10 4Z" fill="#A5B4FC"></path><path d="M30 4L40 14H32C30.8954 14 30 13.1046 30 12V4Z" fill="#6366F1"></path><rect x="14" y="20" width="20" height="4" fill="#4338CA"></rect><rect x="14" y="28" width="20" height="4" fill="#E0E7FF"></rect><rect x="14" y="36" width="20" height="4" fill="#4338CA"></rect><path d="M22 24H26V28H22V24Z" fill="#E0E7FF"></path></svg>
);
// FIX: Updated StartIcon to accept a `style` prop to allow dynamic stroke color. Removed hardcoded stroke colors from paths to allow inheritance. Added a default stroke color to the parent SVG.
export const InfoIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><circle cx="24" cy="24" r="20" fill="#3B82F6"></circle><path d="M24 16V18" stroke="white" strokeWidth="3" strokeLinecap="round"></path><path d="M24 24V32" stroke="white" strokeWidth="3" strokeLinecap="round"></path></svg>
);
export const ComputerIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M8 8C8 6.89543 8.89543 6 10 6H38C39.1046 6 40 6.89543 40 8V30C40 31.1046 39.1046 32 38 32H10C8.89543 32 8 31.1046 8 30V8Z" fill="#6B7280"></path><rect x="12" y="10" width="24" height="18" fill="#A5F3FC" rx="1"></rect><path d="M16 42H32L30 32H18L16 42Z" fill="#4B5563"></path></svg>
);
export const AppsIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><rect x="8" y="8" width="14" height="14" rx="3" fill="#F87171"></rect><rect x="8" y="26" width="14" height="14" rx="3" fill="#FBBF24"></rect><rect x="26" y="8" width="14" height="14" rx="3" fill="#34D399"></rect><rect x="26" y="26" width="14" height="14" rx="3" fill="#60A5FA"></rect></svg>
);
export const PaintBrushIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}><path d="M22 6H26V14H22V6Z" fill="#F59E0B"></path><path d="M12 14H36V22C36 23.1046 35.1046 24 34 24H14C12.8954 24 12 23.1046 12 22V14Z" fill="#9CA3AF"></path><path d="M16 24H32V42H16V24Z" fill="#D1D5DB"></path></svg>
);
export const BellIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
    </svg>
);
export const SpeakerIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>
);
export const TrashIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
);
export const ListViewIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
);
export const GridViewIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
);
export const PreviewIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>
);
export const DownloadsIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
);
export const GoogleDriveIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" className={className}>
        <path d="M34.4,26.6l6.8-11.8L34.4,3l-6.8,11.8L34.4,26.6z" fill="#ffc107"/>
        <path d="M10.8,3L4,14.8l10.2,10.2l6.8-11.8L10.8,3z" fill="#03a9f4"/>
        <path d="M21,45l-6.8-11.8L24.4,23l10.2,10.2L21,45z" fill="#4caf50"/>
    </svg>
);


// --- App Definitions ---
export const APP_DEFINITIONS: AppDefinition[] = [
  { id: 'ai_assistant', name: 'AI Assistant', icon: AiIcon, component: AIAssistant, defaultSize: [400, 600] },
  { id: 'file_explorer', name: 'File Explorer', icon: FolderIcon, component: FileExplorer, defaultSize: [700, 500], isDefault: true },
  { id: 'terminal', name: 'Terminal', icon: TerminalIcon, component: Terminal, defaultSize: [600, 400], isDefault: true },
  { id: 'settings', name: 'Settings', icon: SettingsIcon, component: Settings, defaultSize: [700, 500] },
  { id: 'text_editor', name: 'Text Editor', icon: FileTextIcon, component: TextEditor, defaultSize: [600, 500], isDefault: true },
  { id: 'calculator', name: 'Calculator', icon: CalculatorIcon, component: Calculator, defaultSize: [300, 450] },
  { id: 'browser', name: 'Browser', icon: BrowserIcon, component: Browser, defaultSize: [800, 600] },
  { id: 'notes', name: 'Notes', icon: NoteIcon, component: Notes, defaultSize: [400, 500] },
  { id: 'media_viewer', name: 'Media Viewer', icon: ImageIcon, component: MediaViewer, defaultSize: [600, 500] },
  { id: 'properties_viewer', name: 'Properties', icon: InfoIcon, component: PropertiesViewer, defaultSize: [350, 400] },
];

// --- Mock File System ---
export const initialFileSystem: FileSystemNode = {
  id: 'root',
  name: '~',
  type: 'folder',
  createdAt: new Date('2023-01-01T10:00:00Z').toISOString(),
  children: [
    {
      id: 'desktop',
      name: 'Desktop',
      type: 'folder',
      createdAt: new Date('2023-01-01T10:01:00Z').toISOString(),
      children: [],
    },
    {
      id: 'documents',
      name: 'Documents',
      type: 'folder',
      createdAt: new Date('2023-01-01T10:02:00Z').toISOString(),
      children: [
        { id: 'doc1', name: 'project_plan.txt', type: 'file', content: 'Here is the project plan...', createdAt: new Date('2023-04-15T14:30:00Z').toISOString(), size: 27, mimeType: 'text/plain' },
        { id: 'notes-file', name: 'notes.txt', type: 'file', content: 'This is a persistent notepad.', createdAt: new Date('2023-02-20T11:00:00Z').toISOString(), size: 29, mimeType: 'text/plain' },
        { 
          id: 'work',
          name: 'Work',
          type: 'folder',
          createdAt: new Date('2023-01-10T09:00:00Z').toISOString(),
          children: [
             { id: 'report1', name: 'Q3_Report.txt', type: 'file', content: 'Q3 report content.', createdAt: new Date('2023-09-30T17:00:00Z').toISOString(), size: 18, mimeType: 'text/plain' },
          ]
        },
      ],
    },
    {
        id: 'downloads',
        name: 'Downloads',
        type: 'folder',
        createdAt: new Date('2023-01-01T10:03:00Z').toISOString(),
        children: [],
    },
    {
        id: 'pictures',
        name: 'Pictures',
        type: 'folder',
        createdAt: new Date('2023-01-01T10:05:00Z').toISOString(),
        children: [
            { id: 'pic1', name: 'vacation.jpg', type: 'file', content: 'https://images.unsplash.com/photo-1517760444937-f6397edcbbcd?q=80&w=2070', mimeType: 'image/jpeg', createdAt: new Date('2023-08-12T18:45:00Z').toISOString(), size: 120834 }, // Approx size
            { id: 'pic2', name: 'logo.png', type: 'file', content: 'https://images.unsplash.com/photo-1629904853716-f0bc54eea48d?q=80&w=2070', mimeType: 'image/png', createdAt: new Date('2023-03-01T12:00:00Z').toISOString(), size: 98455 }, // Approx size
        ]
    },
    {
      id: 'trash',
      name: 'Trash',
      type: 'folder',
      createdAt: new Date('2023-01-01T09:00:00Z').toISOString(),
      children: [],
    },
    {
      id: 'readme',
      name: 'README.md',
      type: 'file',
      content: `# Welcome to WarmWind OS!

This is a virtual operating system running in your browser, powered by React and AI.

## Keyboard Shortcuts

- **Alt + F4**: Close the active window
- **Ctrl + Alt + A**: Open AI Assistant
- **Ctrl + Alt + E**: Open File Explorer

## Google Drive Integration Setup

To use the Google Drive file import feature, you need to configure Google Cloud credentials:

1.  **Create a Google Cloud Project**: Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a new project.
2.  **Enable APIs**: In your new project, enable the "Google Drive API" and the "Google Picker API".
3.  **Create OAuth 2.0 Client ID**:
    - Go to "APIs & Services" > "Credentials".
    - Click "Create Credentials" and select "OAuth client ID".
    - Choose "Web application" as the application type.
    - Add your application's URL to the "Authorized JavaScript origins".
    - Add the same URL to the "Authorized redirect
URIs".
4.  **Configure Environment Variable**:
    - Copy the generated "Client ID".
    - In your development environment, create a variable named \`GOOGLE_CLIENT_ID\` and paste your Client ID as the value.
`,
      createdAt: new Date('2023-01-01T09:05:00Z').toISOString(),
      size: 273,
      mimeType: 'text/markdown',
    },
  ],
};
