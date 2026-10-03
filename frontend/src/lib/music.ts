export type Source = 'local';
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
  year?: number; genres?: string[];
};
export const localId = (kind: string, id: string) => `local:${kind}:${id}`;
