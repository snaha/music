type DesktopProfile = { name: string; label: string; directory: string; existing: boolean; portable: boolean };
type BuildNotes = { title: string; summary: string; highlights: string[]; tryIt: string };
type DesktopStatus = {
  phase: 'setup' | 'starting' | 'ready' | 'error'; error: string; onboarding: boolean;
  url: string; username: string; password: string; frame: boolean;
  share?: { webPort: number; port: number; password: string };
  build: { version: string; channel: string; commit: string; branch: string; builtAt: string; runUrl: string; notes?: BuildNotes };
  profile: DesktopProfile; musicFolder: string; musicFolders: string[];
  defaultMusicFolder: string; defaultMusicFolderAvailable: boolean; source: string; canCopy: boolean;
};
type ProfileEntry = { name: string; label: string; createdAt: number; setupComplete: boolean };
// injected by the Electron preload (desktop/preload.js)
interface Window {
  musicHistory?: {
    stats?(query: { scope: string }): Promise<Record<string, { plays: number; lastPlayed: number }>>;
    write(batch: { scope: string; contexts: import('./lib/listening-history.svelte').ListeningContext[]; entries: { id: string; contextId: string; index: number; cursor: number; playedAt: number }[]; importKey?: string }): Promise<void>;
    list(query: { scope: string; query?: string; offset?: number }): Promise<{ entries: import('./lib/listening-history.svelte').HistoryEntry[]; total: number; hasMore: boolean }>;
    clear(scope: string): Promise<void>;
  };
  spotifyCapture?: {
    start(): Promise<{ status: string; message: string; sampleRate: number }>;
    stop(): Promise<void>;
    onSamples(callback: (data: { samples: Float32Array; sampleRate: number; sequence: number }) => void): () => void;
    onState(callback: (state: { status: string; message: string; peak: number }) => void): () => void;
  };
  spotify?: import('./lib/music').SpotifyBridge;
  desktop?: {
    status: () => Promise<DesktopStatus>;
    start: (options?: { source?: 'folder' | 'empty'; musicFolder?: string; musicFolders?: string[] }) => Promise<DesktopStatus>;
    chooseFolder: () => Promise<string | null>;
    finishSetup: () => Promise<DesktopStatus>;
    profiles: () => Promise<ProfileEntry[]>;
    switchProfile: (mode: 'fresh' | 'copy' | 'continue' | 'existing', name?: string) => Promise<void>;
    showData: () => Promise<string>;
    changeFolder: (mode?: 'replace' | 'add' | 'remove', folder?: string) => Promise<void>;
    restart: () => Promise<void>;
    onChange: (callback: (status: DesktopStatus) => void) => () => void;
    lanIp: () => Promise<string>;
    setFrame: (on: boolean) => Promise<void>; // reopens the window with or without it
  };
}

// the dev machine's LAN address, from vite.config.ts
declare const __LAN_IP__: string;

// AudioWorkletGlobalScope (not included in TypeScript's DOM library).
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
