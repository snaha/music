import { session, ok, coverUrl } from './api.svelte';
import { album, playlist, localTrack, library } from './library.svelte';
import { metadata } from './discovery.svelte';
import { player } from './player.svelte';
import { localId, type Collection, type Track, type Source } from './music';

export const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
export const searchWords = (query: string) => normalizeSearch(query).trim().split(/\s+/).filter(Boolean);
export function collectionMatches(tile: Collection, words: string[]) {
  const info = metadata(tile);
  const text = normalizeSearch([tile.title, tile.sub, tile.source, tile.kind, info.year, ...info.genres].join(' '));
  return words.every(word => text.includes(word));
}
const merge = <T extends { id: string }>(previous: T[], incoming: T[]) => {
  const next = new Map(previous.map(item => [item.id, item]));
  for (const item of incoming) next.set(item.id, item);
  return [...next.values()];
};
export const catalogSearch = $state({ query: '', source: 'all' as Source | 'all', collections: [] as Collection[], artists: [] as Collection[], tracks: [] as Track[],
  loading: false, errors: {} as Record<string, string>, moreLocal: false });
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined;
let localOffsets = { album: 0, artist: 0, song: 0 }, localMore = { album: true, artist: true, song: true };
let playlistApi: typeof session.api = null, playlistCount = -1, playlistRequest: Promise<Collection[]> | undefined, knownPlaylists: Collection[] = [];
let accountScope = '';
const pageSize = 50;
const includes = (source: Source) => catalogSearch.source === 'all' || catalogSearch.source === source;
function localPlaylists() {
  const api = session.api!;
  if (playlistApi !== api || playlistCount !== library.scan.count) {
    playlistApi = api; playlistCount = library.scan.count; playlistRequest = undefined; knownPlaylists = [];
  }
  const scanCount = playlistCount;
  if (!playlistRequest) playlistRequest = api.getPlaylists().then(response => {
    const tiles = (ok(response).playlists.playlist ?? []).map(playlist);
    if (playlistApi === api && playlistCount === scanCount) knownPlaylists = tiles;
    return tiles;
  }).catch(error => { if (playlistApi === api && playlistCount === scanCount) playlistRequest = undefined; throw error; });
  return playlistRequest;
}
function songAlbum(track: Track, collections: Collection[]): Collection | undefined {
  if (!track.albumId || !track.album) return undefined;
  return collections.find(tile => tile.id === track.albumId) ?? library.tiles.find(tile => tile.id === track.albumId) ?? {
    id: track.albumId, rawId: track.albumId.slice('local:album:'.length), source: 'local', kind: 'album', title: track.album,
    sub: track.artist ?? '', cover: track.cover, count: 1, available: true,
  };
}
async function localPage(mine: number, query: string, api: NonNullable<typeof session.api>) {
  const offsets = { ...localOffsets }, more = { ...localMore };
  const result = ok(await api.search3({ query, albumCount: more.album ? pageSize : 0, albumOffset: offsets.album,
    artistCount: more.artist ? pageSize : 0, artistOffset: offsets.artist, songCount: more.song ? pageSize : 0, songOffset: offsets.song })).searchResult3;
  if (mine !== generation || api !== session.api) return;
  const albums = (result?.album ?? []).map(album);
  const tracks = (result?.song ?? []).map(localTrack);
  const associated = tracks.map(track => songAlbum(track, albums)).filter((tile): tile is Collection => !!tile);
  catalogSearch.collections = merge(catalogSearch.collections, [...albums, ...associated]);
  catalogSearch.tracks = merge(catalogSearch.tracks, tracks.map(track => ({ ...track, playbackOrigin: songAlbum(track, albums) })));
  catalogSearch.artists = merge(catalogSearch.artists, (result?.artist ?? []).map(artist => ({
    id: localId('artist', artist.id), rawId: artist.id, source: 'local', kind: 'artist', title: artist.name, sub: 'Artist',
    cover: coverUrl(artist.coverArt), count: artist.albumCount ?? 0, available: true,
  })));
  for (const key of ['album', 'artist', 'song'] as const) {
    if (more[key]) { const count = result?.[key]?.length ?? 0; localOffsets[key] += count; localMore[key] = count === pageSize; }
  }
  catalogSearch.moreLocal = Object.values(localMore).some(Boolean);
}
async function load(mine: number, playlists = false) {
  const api = session.api, query = catalogSearch.query;
  const jobs: [string, Promise<void>][] = [];
  if (includes('local') && api && (playlists || catalogSearch.moreLocal)) jobs.push(['Local music', localPage(mine, query, api)]);
  if (playlists && includes('local') && api) jobs.push(['Local playlists', localPlaylists().then(tiles => {
    if (mine === generation) catalogSearch.collections = merge(catalogSearch.collections, tiles.filter(tile => collectionMatches(tile, searchWords(query))));
  })]);
  await Promise.all(jobs.map(async ([name, job]) => {
    try { await job; if (mine === generation) delete catalogSearch.errors[name]; }
    catch (error) { if (mine === generation) catalogSearch.errors[name] = (error as Error).message; }
  }));
  if (mine === generation) catalogSearch.loading = false;
}
export function startCatalogSearch(query: string, source: Source | 'all') {
  const mine = ++generation;
  clearTimeout(timer);
  const words = searchWords(query);
  const scope = JSON.stringify([session.base, session.username]);
  const accountChanged = scope !== accountScope;
  accountScope = scope;
  const changed = accountChanged || query !== catalogSearch.query || source !== catalogSearch.source;
  const previous = changed && !accountChanged ? catalogSearch.tracks : [];
  if (playlistApi !== session.api) knownPlaylists = [];
  catalogSearch.query = query; catalogSearch.source = source; catalogSearch.errors = {};
  localOffsets = { album: 0, artist: 0, song: 0 }; localMore = { album: true, artist: true, song: true };
  catalogSearch.moreLocal = false;
  if (!words.length) { catalogSearch.collections = []; catalogSearch.artists = []; catalogSearch.tracks = []; catalogSearch.loading = false; return; }
  const allowed = (item: { source: Source }) => source === 'all' || item.source === source;
  const immediate = merge(library.tiles, knownPlaylists).filter(tile => allowed(tile) && collectionMatches(tile, words));
  if (changed) {
    catalogSearch.collections = immediate; catalogSearch.artists = [];
    catalogSearch.tracks = merge(previous, player.queue).filter(track => allowed(track) && words.every(word => normalizeSearch([track.title, track.artist, track.album, ...(track.origins ?? []).map(origin => origin.title)].join(' ')).includes(word)));
  } else catalogSearch.collections = merge(catalogSearch.collections, immediate);
  catalogSearch.loading = true;
  timer = setTimeout(() => { void load(mine, true); }, 150);
  return () => { if (mine === generation) { generation++; clearTimeout(timer); } };
}
export function moreCatalogSearch() {
  if (catalogSearch.loading) return;
  catalogSearch.loading = true;
  void load(generation);
}
