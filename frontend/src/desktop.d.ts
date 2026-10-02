// injected by the Electron preload (desktop/preload.js)
interface Window {
  musicHistory?: {
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
    url: string; username: string; password: string;
    // ports and the share account's password for the QR code; the LAN address is looked up on demand
    share?: { webPort: number; port: number; password: string };
    lanIp: () => Promise<string>;
    frame: boolean; // the OS's window frame and buttons are shown
    setFrame: (on: boolean) => Promise<void>; // reopens the window with or without it
  };
}

// the dev machine's LAN address, from vite.config.ts
declare const __LAN_IP__: string;

// AudioWorkletGlobalScope (not included in TypeScript's DOM library).
declare const sampleRate: number;
declare class AudioWorkletProcessor { readonly port: MessagePort; }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;
