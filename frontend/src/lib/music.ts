export type Source = 'local' | 'spotify';
export type Track = {
  id: string; rawId: string; source: Source; title: string; artist?: string; album?: string;
  albumId?: string; coverId?: string; cover: string; duration?: number; track?: number; disc?: number; uri?: string;
  playbackOrigin?: Pick<Collection, 'id' | 'rawId' | 'source' | 'kind' | 'title' | 'cover'>;
  albumInfo?: Collection; origins?: { id: string; title: string; kind: string }[];
  externalUrl?: string; available: boolean;
};
export type Collection = {
  id: string; rawId: string; source: Source; kind: 'album' | 'artist' | 'playlist';
  title: string; sub: string; cover: string; count: number; externalUrl?: string;
  available: boolean; incomplete?: boolean; addedAt?: string; saved?: boolean; indexing?: boolean; favorite?: boolean; origins?: string[];
};
export type SpotifyAvailability = 'checking' | 'ready' | 'disconnected' | 'reconnect' | 'offline' | 'device-unavailable' | 'restricted';
export type SpotifyStatus = {
  availability: SpotifyAvailability;
  connected: boolean; account: string; clientId: string; collections: Collection[];
  albums: Collection[]; indexedTracks: number; indexing: boolean; indexError: string; inaccessiblePlaylists: number;
  updatedAt: number; syncing: boolean; progress: string; error: string; retryAt: number; quotaBlocked: boolean;
  deviceId: string; deviceName: string; sameMac: boolean;
};
export type SpotifyDevice = { id: string; name: string; type: string; is_restricted: boolean; is_active: boolean };
export type SpotifyPlayback = {
  deviceId: string; playing: boolean; progress: number; track: Track | null; type: string;
  shuffle: boolean; repeat: string; disallows: Record<string, boolean>;
};
export type SpotifyBridge = {
  status(): Promise<SpotifyStatus>; connect(clientId: string): Promise<SpotifyStatus>; cancel(): Promise<void>;
  checkAvailability(force?: boolean): Promise<SpotifyStatus>; removeLibrary(): Promise<SpotifyStatus>;
  disconnect(): Promise<SpotifyStatus>; refresh(): Promise<SpotifyStatus>;
  albumTracks(id: string, offset: number, snapshot?: string): Promise<{ tracks: Track[]; next: number | null; snapshot?: string; incomplete?: boolean }>;
  transition(active: boolean): Promise<void>;
  tracks(id: string, offset: number): Promise<{ tracks: Track[]; next: number | null; incomplete?: boolean }>;
  devices(): Promise<SpotifyDevice[]>; selectDevice(id: string, sameMac: boolean): Promise<SpotifyStatus>;
  playback(): Promise<SpotifyPlayback | null>;
  command(action: 'play' | 'pause' | 'resume' | 'seek', value?: string | number): Promise<void>;
  external(url: string): Promise<void>; onChange(callback: (status: SpotifyStatus) => void): () => void;
};
export const localId = (kind: string, id: string) => `local:${kind}:${id}`;
