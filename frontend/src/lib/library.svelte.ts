import type { AlbumID3, Child, Playlist } from 'subsonic-api';
import { coverUrl, ok, session } from './api.svelte';
import { appendToSession, enqueue, play, player, type Grid } from './player.svelte';
import { spotify } from './spotify.svelte';
import { localId, type Collection, type Track } from './music';

export type Tile = Collection;
export const MODES = ['albums', 'playlists'] as const;
export type Mode = (typeof MODES)[number];
export const library = $state({ mode: 'albums' as Mode, tiles: [] as Tile[], visible: [] as Tile[], loading: false,
  error: '', source: 'all' as 'all' | 'local' | 'spotify', highlight: false, scan: { scanning: false, count: 0 } });
let localTiles: Tile[] = [], req = 0, pickRequest = 0, listing = true;

const album = (a: AlbumID3): Tile => ({ id: localId('album', a.id), rawId: a.id, source: 'local', cover: coverUrl(a.coverArt), title: a.name, sub: a.artist ?? '', kind: 'album', count: a.songCount ?? 1, available: true, addedAt: a.created ? new Date(a.created).toISOString() : undefined, favorite: !!a.starred });
const playlist = (p: Playlist): Tile => ({ id: localId('playlist', p.id), rawId: p.id, source: 'local', cover: coverUrl(p.coverArt ?? `pl-${p.id}`), title: p.name, sub: 'playlist', kind: 'playlist', count: p.songCount ?? 1, available: true });
export const localTrack = (s: Child): Track => ({ id: localId('track', s.id), rawId: s.id, source: 'local', title: s.title,
  artist: s.artist, album: s.album, albumId: s.albumId ? localId('album', s.albumId) : undefined,
  cover: coverUrl(s.coverArt, 512), duration: s.duration, track: s.track, disc: s.discNumber, available: true });

function spotifyTiles(): Tile[] {
  if (!window.spotify || !spotify.connected) return [];
  return library.mode === 'playlists' ? spotify.collections.filter(t => t.kind === 'playlist') : spotify.albums;
}

export function updateSpotifyCollections() { if (listing) publish(true); }
function publish(preserve: boolean) {
  const next = [...localTiles, ...spotifyTiles()];
  if (preserve) {
    const map = new Map(next.map((t) => [t.id, t]));
    const old = new Set(library.tiles.map((t) => t.id));
    library.tiles = [...library.tiles.filter((t) => map.has(t.id)).map((t) => map.get(t.id)!), ...next.filter((t) => !old.has(t.id))];
  } else library.tiles = next;
}

async function allAlbums(type: 'alphabeticalByArtist' | 'newest', mine: number, refresh: boolean) {
  const api = session.api!, out: Tile[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = ok(await api.getAlbumList2({ type, size: 500, offset })).albumList2.album ?? [];
    if (mine !== req) return;
    out.push(...page.map(album));
    if (!refresh || page.length < 500) { localTiles = out.slice(); publish(true); }
    if (page.length < 500) return;
  }
}
export async function setMode(mode: Mode, refresh = false) {
  const api = session.api, mine = ++req;
  library.mode = mode; library.loading = true; library.error = ''; listing = true;
  if (!refresh) { localTiles = []; publish(false); }
  try {
    if (!api) return;
    if (mode === 'albums') { await allAlbums('alphabeticalByArtist', mine, refresh); return; }
    const result = ok(await api.getPlaylists()).playlists.playlist ?? [];
    if (mine === req) localTiles = result.map(playlist);
    if (mine === req) publish(refresh);
  } catch (error) { if (mine === req) library.error = (error as Error).message; }
  finally { if (mine === req) { library.loading = false; warmCovers(); } }
}

const warmed = new Set<string>(); let warmGen = 0;
const preload = (u: string) => new Promise<void>((r) => { const i = new Image(); i.onload = i.onerror = () => r(); i.src = u; });
async function warmCovers() {
  const gen = ++warmGen, todo = library.tiles.filter((t) => t.source === 'local').map((t) => t.cover).filter((u) => u && !warmed.has(u));
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (todo.length && gen === warmGen) { const u = todo.shift()!; await preload(u); warmed.add(u); }
  }));
}
let wasScanning = false, tick = 0;
export function watchScan() {
  let busy = false;
  const timer = setInterval(async () => {
    if (!session.api || busy) return;
    busy = true;
    try {
      const s = ok(await session.api.getScanStatus()).scanStatus;
      library.scan = { scanning: s.scanning, count: s.count ?? 0 };
      const due = !s.scanning || tick++ % 5 === 0;
      if (listing && (s.scanning || wasScanning) && due) void setMode(library.mode, true);
      wasScanning = s.scanning;
    } catch { /* the login and player surfaces report connection failures */ }
    finally { busy = false; }
  }, 1000);
  return () => clearInterval(timer);
}

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const spotifyAlbums = (t: Tile) => spotify.collections.filter((a) => a.kind === 'album' && a.sub === t.rawId);
export async function songsOf(t: Tile): Promise<Track[]> {
  const tracks: Track[] = [];
  for await (const page of trackPages(t)) tracks.push(...page);
  return tracks;
}
export async function* trackPages(t: Tile): AsyncGenerator<Track[]> {
  if (t.indexing) throw new Error('This album is still being indexed. Its included tracks will appear shortly.');
  if (!t.available) throw new Error(t.kind === 'album' ? 'No playable tracks have been indexed for this album. Check discovery status in Settings and refresh to retry.' : 'Spotify does not expose this playlist’s tracks. Open it in Spotify to listen there.');
  if (t.source === 'spotify') {
    if (t.kind === 'artist') { const albums = spotifyAlbums(t); if (albums.length) yield* trackPages(rnd(albums)); return; }
    let snapshot: string | undefined;
    for (let offset: number | null = 0; offset !== null;) {
      const page: { tracks: Track[]; next: number | null; snapshot?: string } = t.kind === 'album' ? await window.spotify!.albumTracks(t.id, offset, snapshot) : await window.spotify!.tracks(t.id, offset);
      if ('snapshot' in page) snapshot = page.snapshot as string; yield page.tracks; offset = page.next;
    }
    return;
  }
  const api = session.api!;
  if (t.kind === 'album') { yield (ok(await api.getAlbum({ id: t.rawId })).album.song ?? []).map(localTrack); return; }
  if (t.kind === 'playlist') { yield (ok(await api.getPlaylist({ id: t.rawId })).playlist.entry ?? []).map(localTrack); return; }
  const albums = ok(await api.getArtist({ id: t.rawId })).artist.album ?? [];
  if (albums.length) yield* trackPages(album(rnd(albums)));
}
export async function pick(t: Tile) {
  const mine = ++pickRequest; player.requesting = true; player.error = '';
  const selection = ++player.requestRevision;
  try {
    if (t.kind !== 'artist') {
      let version: number | undefined;
      for await (const tracks of trackPages(t)) {
        if (mine !== pickRequest) return;
        if (!tracks.length) continue;
        if (version === undefined) {
          if (selection !== player.requestRevision) return;
          version = play(tracks);
        }
        else if (!appendToSession(tracks, version)) return;
      }
      if (version === undefined) throw new Error('This collection contains no music tracks.');
      return;
    }
    const albums = t.source === 'spotify' ? spotifyAlbums(t) : (ok(await session.api!.getArtist({ id: t.rawId })).artist.album ?? []).map(album);
    if (mine !== pickRequest) return;
    req++; listing = false; library.tiles = albums;
  } catch (error) { if (mine === pickRequest) player.error = (error as Error).message; }
  finally { if (mine === pickRequest) player.requesting = false; }
}
let addTail = Promise.resolve();
export function addCollection(t: Tile) {
  player.requesting = true;
  addTail = addTail.then(async () => {
    player.error = ''; let version: number | undefined;
    try {
      for await (const tracks of trackPages(t)) {
        if (!tracks.length) continue;
        if (version === undefined) version = enqueue(tracks);
        else if (!appendToSession(tracks, version)) return;
      }
      if (version === undefined) throw new Error('This collection contains no music tracks.');
    } catch (error) { player.error = (error as Error).message; }
    finally { player.requesting = false; }
  });
  return addTail;
}
export function grid(): Grid {
  const tiles = library.visible.filter((t) => t.available), cum = new Float64Array(tiles.length + 1);
  tiles.forEach((t, i) => (cum[i + 1] = cum[i] + Math.max(1, t.count)));
  return {
    count: cum[tiles.length], key: tiles.map((t) => t.id).join(),
    find: (albumId) => { const i = tiles.findIndex((t) => t.kind === 'album' && t.id === albumId); return i < 0 ? -1 : cum[i]; },
    async song(n) {
      let lo = 0, hi = tiles.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m + 1] <= n) lo = m + 1; else hi = m; }
      const t = tiles[lo], songs = t && (await songsOf(t));
      if (!songs?.length) return;
      return t.kind === 'artist' ? rnd(songs) : songs[n - cum[lo]] ?? rnd(songs);
    },
  };
}
