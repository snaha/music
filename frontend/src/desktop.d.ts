type DesktopStatus = import('../../shared/contracts').DesktopStatus;
type DesktopProfile = import('../../shared/contracts').DesktopProfile;
type ProfileEntry = import('../../shared/contracts').ProfileEntry;
// injected by the Electron preload (desktop/preload.js)
interface Window {
  musicHistory?: {
    stats?(query: { scope: string }): Promise<Record<string, { plays: number; lastPlayed: number }>>;
    write(batch: import('../../shared/contracts').HistoryBatch): Promise<void>;
    list(query: { scope: string; query?: string; offset?: number; limit?: number }): Promise<import('../../shared/contracts').HistoryPage>;
    clear(scope: string): Promise<void>;
  };
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
