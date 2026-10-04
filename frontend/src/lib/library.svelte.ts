import type { AlbumID3, Child, Playlist, ScanStatus } from 'subsonic-api';
import { coverUrl, ok, session } from './api.svelte';
import { appendToSession, enqueue, play, player, type Grid } from './player.svelte';
import { localId, type Collection, type Track } from './music';

export type Tile = Collection;
export const MODES = ['albums', 'playlists'] as const;
export type Mode = (typeof MODES)[number];
export const library = $state({ mode: 'albums' as Mode, tiles: [] as Tile[], visible: [] as Tile[], loading: false,
  error: '', source: 'all' as 'all' | 'local',
  scan: { scanning: false, count: 0, checked: false, error: '' } });
let localTiles: Tile[] = [], req = 0, pickRequest = 0, listing = true;

export const album = (a: AlbumID3): Tile => ({ id: localId('album', a.id), rawId: a.id, source: 'local', cover: coverUrl(a.coverArt), title: a.name, sub: a.artist ?? '', kind: 'album', count: a.songCount ?? 1, available: true, addedAt: a.created ? new Date(a.created).toISOString() : undefined, favorite: !!a.starred, year: a.year, genres: a.genre ? [a.genre] : [] });
export const playlist = (p: Playlist): Tile => ({ id: localId('playlist', p.id), rawId: p.id, source: 'local', cover: coverUrl(p.coverArt ?? `pl-${p.id}`), title: p.name, sub: 'playlist', kind: 'playlist', count: p.songCount ?? 1, available: true });
export const localTrack = (s: Child): Track => ({ id: localId('track', s.id), rawId: s.id, source: 'local', title: s.title,
  artist: s.artist, album: s.album, albumId: s.albumId ? localId('album', s.albumId) : undefined,
  coverId: s.coverArt, cover: coverUrl(s.coverArt, 512), duration: s.duration, track: s.track, disc: s.discNumber, available: true });

function publish(preserve: boolean) {
  const next = localTiles;
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
// Navidrome extends the Subsonic scan status with completion and failure details.
type LibraryScanStatus = ScanStatus & { lastScan?: string | Date; error?: string };
export function watchScan() {
  let busy = false, stopped = false, lastApi: typeof session.api = null;
  let previous: { scanning: boolean; count: number; lastScan: string } | undefined;
  let refreshPending = false, lastRefresh = Number.NEGATIVE_INFINITY;
  const timer = setInterval(async () => {
    if (busy) return;
    const api = session.api;
    if (api !== lastApi) {
      lastApi = api; previous = undefined; refreshPending = false; lastRefresh = Number.NEGATIVE_INFINITY;
      library.scan = { scanning: false, count: 0, checked: false, error: '' };
    }
    if (!api) return;
    busy = true;
    try {
      const s: LibraryScanStatus = ok(await api.getScanStatus()).scanStatus;
      if (stopped || api !== session.api) return;
      const next = { scanning: s.scanning, count: s.count ?? 0, lastScan: String(s.lastScan ?? '') };
      library.scan = { scanning: next.scanning, count: next.count, checked: true,
        error: s.error ? `Music indexing failed: ${s.error}` : '' };
      // A small scan can finish before the first poll, or entirely between polls.
      // Refresh the first snapshot and any completed scan, even without seeing it start.
      if (!previous || previous.count !== next.count || previous.lastScan !== next.lastScan || (previous.scanning && !next.scanning)) refreshPending = true;
      previous = next;
      const now = performance.now();
      if (listing && !library.loading && (!next.scanning ? refreshPending : now - lastRefresh >= 5000)) {
        refreshPending = false; lastRefresh = now;
        await setMode(library.mode, true);
      }
    } catch (error) {
      if (!stopped && api === session.api) library.scan.error = `Cannot check music indexing: ${(error as Error).message}`;
    }
    finally { busy = false; }
  }, 1000);
  return () => { stopped = true; clearInterval(timer); };
}

const rnd = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
export async function songsOf(t: Tile): Promise<Track[]> {
  const tracks: Track[] = [];
  for await (const page of trackPages(t)) tracks.push(...page);
  return tracks;
}
export async function* trackPages(t: Tile): AsyncGenerator<Track[]> {
  if (t.indexing) throw new Error('This album is still being indexed. Its included tracks will appear shortly.');
  if (!t.available) throw new Error('This collection has no playable tracks. Check your music folders in Settings.');
  const api = session.api!;
  const collectionTrack = (song: Child, index: number): Track => ({ ...localTrack(song), playbackOriginIndex: index });
  if (t.kind === 'album') { yield (ok(await api.getAlbum({ id: t.rawId })).album.song ?? []).map(collectionTrack); return; }
  if (t.kind === 'playlist') { yield (ok(await api.getPlaylist({ id: t.rawId })).playlist.entry ?? []).map(collectionTrack); return; }
  const albums = ok(await api.getArtist({ id: t.rawId })).artist.album ?? [];
  if (albums.length) yield* trackPages(album(rnd(albums)));
}
export async function pick(t: Tile) {
  const mine = ++pickRequest; player.requesting = true; player.loadingCollectionId = t.id; player.error = '';
  const selection = ++player.requestRevision;
  try {
    if (t.kind !== 'artist') {
      let version: number | undefined;
      for await (const tracks of trackPages(t)) {
        if (mine !== pickRequest) return;
        if (!tracks.length) continue;
        if (version === undefined) {
          if (selection !== player.requestRevision) return;
          version = play(tracks.map(track => ({ ...track, playbackOrigin: t })));
          if (version < 0) return;
        }
        else if (!appendToSession(tracks.map(track => ({ ...track, playbackOrigin: t })), version)) return;
      }
      if (version === undefined) throw new Error('This collection contains no music tracks.');
      return;
    }
    const albums = (ok(await session.api!.getArtist({ id: t.rawId })).artist.album ?? []).map(album);
    if (mine !== pickRequest) return;
    req++; listing = false; library.mode = 'albums'; library.tiles = albums;
  } catch (error) { if (mine === pickRequest && player.loadingCollectionId === t.id) player.error = (error as Error).message; }
  finally { if (mine === pickRequest) { player.requesting = false; player.loadingCollectionId = ''; } }
}
let addTail = Promise.resolve();
export function addCollection(t: Tile) {
  player.requesting = true;
  addTail = addTail.then(async () => {
    player.error = ''; let version: number | undefined;
    try {
      for await (const tracks of trackPages(t)) {
        const included = tracks.filter(track => track.available).map(track => ({ ...track, playbackOrigin: t }));
        if (!included.length) continue;
        if (version === undefined) version = enqueue(included);
        else if (!appendToSession(included, version)) return;
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
      const track = t.kind === 'artist' ? rnd(songs) : songs[n - cum[lo]] ?? rnd(songs);
      return { ...track, playbackOrigin: t };
    },
  };
}
