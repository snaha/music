import type { CatalogProvider, CatalogSearchRequest } from './catalog-provider';
import type { AlbumID3, Child, Playlist, SubsonicAPI } from 'subsonic-api';
import { coverUrl, ok } from './api.svelte';
import { localId, type Collection, type Track } from './music';
export const album = (a: AlbumID3): Collection => ({ id: localId('album', a.id), rawId: a.id, source: 'local', cover: coverUrl(a.coverArt), title: a.name, sub: a.artist ?? '', kind: 'album', count: a.songCount ?? 1, available: true, addedAt: a.created ? new Date(a.created).toISOString() : undefined, favorite: !!a.starred, year: a.year, genres: a.genre ? [a.genre] : [] });
export const playlist = (p: Playlist): Collection => ({ id: localId('playlist', p.id), rawId: p.id, source: 'local', cover: coverUrl(p.coverArt ?? `pl-${p.id}`), title: p.name, sub: 'playlist', kind: 'playlist', count: p.songCount ?? 1, available: true });
export const localTrack = (s: Child): Track => ({ id: localId('track', s.id), rawId: s.id, source: 'local', title: s.title, artist: s.artist, album: s.album, albumId: s.albumId ? localId('album', s.albumId) : undefined, coverId: s.coverArt, cover: coverUrl(s.coverArt, 512), duration: s.duration, track: s.track, disc: s.discNumber, available: true });
// Provider boundary: callers consume domain collections/tracks, not Subsonic responses.
export const localCatalog = {
  source: 'local' as const,
  capabilities: { search: true, playlists: true, pagedAlbums: true },
  async *albums(api: SubsonicAPI, type: 'alphabeticalByArtist' | 'newest'): AsyncGenerator<Collection[]> {
    for (let offset = 0; ; offset += 500) {
      const page = ok(await api.getAlbumList2({ type, size: 500, offset })).albumList2.album ?? [];
      yield page.map(album); if (page.length < 500) return;
    }
  },
  async search(api: SubsonicAPI, request: CatalogSearchRequest) {
    const result = ok(await api.search3(request)).searchResult3;
    return { collections: (result?.album ?? []).map(album), tracks: (result?.song ?? []).map(localTrack),
      artists: (result?.artist ?? []).map(artist => ({ id: localId('artist', artist.id), rawId: artist.id, source: 'local' as const, kind: 'artist' as const, title: artist.name, sub: 'Artist', cover: coverUrl(artist.coverArt), count: artist.albumCount ?? 0, available: true })) };
  },
  async playlists(api: SubsonicAPI) { return (ok(await api.getPlaylists()).playlists.playlist ?? []).map(playlist); },
  async artistAlbums(api: SubsonicAPI, id: string) { return (ok(await api.getArtist({ id })).artist.album ?? []).map(album); },
  async *tracks(api: SubsonicAPI, collection: Collection): AsyncGenerator<Track[]> {
    if (collection.source !== 'local') throw new Error('Unsupported catalog source.');
    if (collection.kind === 'artist') {
      const albums = await localCatalog.artistAlbums(api, collection.rawId);
      if (albums.length) yield* localCatalog.tracks(api, albums[Math.floor(Math.random() * albums.length)]);
      return;
    }
    const children = collection.kind === 'album' ? (ok(await api.getAlbum({ id: collection.rawId })).album.song ?? []) : (ok(await api.getPlaylist({ id: collection.rawId })).playlist.entry ?? []);
    yield children.map((song, index) => ({ ...localTrack(song), playbackOriginIndex: index }));
  },
} satisfies CatalogProvider<SubsonicAPI>;
