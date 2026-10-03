// injected by the Electron preload (desktop/preload.cjs)
interface Window {
  desktop?: {
    url: string; username: string; password: string;
    // ports and the share account's password for the QR code; the LAN address is looked up on demand
    share?: { webPort: number; port: number; password: string };
    lanIp: () => Promise<string>;
    frame: boolean; // the OS's window frame and buttons are shown
    setFrame: (on: boolean) => Promise<void>; // reopens the window with or without it
    scale: 'default' | 1 | 1.5 | 2; // UI scale: the OS's own, or a fixed factor
    setScale: (s: 'default' | 1 | 1.5 | 2) => Promise<void>; // applies at once, as a zoom relative to the display's scale
  };
}

// the dev machine's LAN address, from vite.config.ts
declare const __LAN_IP__: string;
