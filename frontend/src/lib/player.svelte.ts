import { logPlayback } from './playback-log';
import { session, streamUrl } from './api.svelte';
import { PlaybackController, type PlaybackAdapter } from './playback-controller';
import { shuffle } from './shuffle';
import type { Track, Collection } from './music';
import { recordHistory, saveHistory, historyTrack, type ListeningContext, type HistoryEntry } from './listening-history.svelte';

export type Order = 'normal' | 'shuffle' | 'random';
export type Grid = { count: number; key: string; find(albumId: string): number; song(n: number): Promise<Track | undefined> };
export const player = $state({
  queue: [] as Track[], index: -1, blockedIndex: -1, playing: false, pending: false, requesting: false, requestRevision: 0, suspended: false, error: '',
  time: 0, duration: 0, order: 'normal' as Order, queueOpen: false, queueTab: 'queue' as 'queue' | 'history', shortcutsOpen: false, topHidden: false, visOpen: false,
  loadingCollectionId: '', volume: 100,
  view: '' as '' | 'share' | 'settings', viewFrom: 'bottom' as 'bottom' | 'right',
  get song() { return this.queue[this.index] as Track | undefined; },
});

const audio = new Audio(), warmAudio = new Audio();
const savedVolume = Number(localStorage.getItem('music.volume') ?? 100);
player.volume = Number.isFinite(savedVolume) ? Math.max(0, Math.min(100, savedVolume)) : 100;
audio.volume = player.volume / 100;
audio.crossOrigin = warmAudio.crossOrigin = 'anonymous';
audio.preload = 'auto'; warmAudio.preload = 'metadata';
let localTrack: Track | undefined, scrobbled = false;
let intent = 0, perm: Uint32Array = new Uint32Array(0), cursor = -1;
let randomGrid: Grid | undefined, randomDraw = 0;
let queueVersion = 0;
let historyContext: ListeningContext | undefined;
function freshHistoryContext() { historyContext = undefined; }
function remember(index: number) {
  if (!historyContext) {
    const context = $state<ListeningContext>({ id: crypto.randomUUID(), queue: player.queue.map(t => ({ ...t })), origin: player.queue[index]?.playbackOrigin, order: player.order, permutation: [...perm] });
    historyContext = context;
  }
  recordHistory(historyContext, index, cursor);
}

function clearWarm() { warmAudio.removeAttribute('src'); warmAudio.load(); }
const localAdapter: PlaybackAdapter = {
  available(track) { if (track.source !== 'local') throw new Error('This build plays local music only.'); if (!session.api || !track.available) throw new Error('Local track unavailable. Check your music library.'); },
  async prepare(track) { graph?.ctx.resume(); if (audio.src !== streamUrl(track.rawId)) { audio.src = streamUrl(track.rawId); audio.load(); } },
  async start(track) { localTrack = track; scrobbled = false; audio.currentTime = 0; await audio.play(); session.api?.scrobble({ id: track.rawId, submission: false }).catch(() => {}); },
  async pause() { audio.pause(); },
  async resume() { graph?.ctx.resume(); await audio.play(); },
  async seek(seconds) { audio.currentTime = seconds; },
};
const controller = new PlaybackController({ local: localAdapter });

function playing(value: boolean) {
  player.playing = value;
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = value ? 'playing' : 'paused';
}
function fail(error: unknown) { player.error = error instanceof Error ? error.message : String(error); player.pending = false; player.suspended = true; playing(false); }
function metadata(track: Track) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album,
    artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : [] });
}
export function setVolume(value: number) {
  if (!Number.isFinite(value)) return;
  player.volume = Math.max(0, Math.min(100, Math.round(value)));
  audio.volume = player.volume / 100;
  try { localStorage.setItem('music.volume', String(player.volume)); } catch {}
}
export function collectionPlayback(collection: Pick<Collection, 'id'>) {
  const current = (player.song?.playbackOrigin?.id || player.song?.albumId) === collection.id;
  const loading = player.loadingCollectionId === collection.id || (current && player.pending);
  return { current, loading, listening: current && player.playing && !player.suspended && !player.pending };
}
function prepareNext() {
  const i = player.order === 'shuffle' ? perm[cursor + 1] : player.index + 1;
  const track = player.queue[i];
  if (track?.source === 'local') warmAudio.src = streamUrl(track.rawId);
  else clearWarm();
}
function blocked(track: Track | undefined) {
  if (track && track.source !== 'local') { player.error = 'This build plays local music only.'; return true; }
  if (track && !track.available) { player.error = 'This track is unavailable. Check its music folder or skip it.'; return true; }
  return false;
}
async function start(index: number) {
  const track = player.queue[index]; if (!track) return;
  if (blocked(track)) { player.blockedIndex = index; return; }
  try { localAdapter.available(track); }
  catch (error) { player.error = (error as Error).message; player.view = 'settings'; return; }
  player.blockedIndex = -1;
  const mine = ++intent;
  logPlayback('start-request', { source: track.source, trackId: track.id, queueLength: player.queue.length, index });
  player.index = index; player.pending = true; player.suspended = false; player.error = '';
  player.time = 0; player.duration = track.duration ?? 0; playing(false);
  const startedAt = performance.now();
  try {
    await controller.play(track);
    if (mine !== intent) { logPlayback('start-superseded', { intent: mine }); return; }
    logPlayback('start-confirmed', { source: track.source, trackId: track.id, intent: mine });
    player.pending = false; playing(true); remember(player.index); metadata(track); prepareNext();
    performance.measure('music-playback-handoff', { start: startedAt, end: performance.now(), detail: { source: track.source } });
  } catch (error) { if (mine === intent) { logPlayback('start-failed', { source: track.source, trackId: track.id, message: error instanceof Error ? error.message : String(error) }); fail(error); } }
}

function rebuildShuffle() {
  if (player.order === 'shuffle') { perm = shuffle(player.queue.length, player.index); cursor = 0; }
}
export function play(queue: Track[], index = 0) {
  if (blocked(queue[Math.max(0, index)])) return -1;
  player.requestRevision++;
  queueVersion++; freshHistoryContext();
  randomDraw++; randomGrid = undefined;
  player.queue = queue.map((t) => ({ ...t })); player.index = Math.max(0, index);
  if (player.order === 'random') player.order = 'normal';
  rebuildShuffle();
  if (player.queue.length) void start(player.order === 'shuffle' ? perm[0] : player.index);
  return queueVersion;
}
export function appendToSession(tracks: Track[], version: number) {
  if (version !== queueVersion) return false;
  const offset = player.queue.length;
  player.queue.push(...tracks.map((t) => ({ ...t })));
  if (historyContext) historyContext.queue.push(...tracks.map(t => ({ ...t })));
  if (player.order === 'shuffle') perm = Uint32Array.from([...perm, ...Array.from(shuffle(tracks.length), (i) => i + offset)]);
  if (historyContext) { historyContext.permutation = [...perm]; saveHistory(historyContext); }
  prepareNext(); return true;
}
export function enqueue(tracks: Track[]) {
  if (player.order === 'random') { randomGrid = undefined; randomDraw++; player.order = 'normal'; }
  appendToSession(tracks, queueVersion); player.queueOpen = true;
  return queueVersion;
}
export function moveQueue(from: number, to: number) {
  if (from < 0 || to < 0 || from >= player.queue.length || to >= player.queue.length) return;
  freshHistoryContext();
  const current = player.song;
  player.blockedIndex = -1;
  const [entry] = player.queue.splice(from, 1); player.queue.splice(to, 0, entry);
  player.index = current ? player.queue.indexOf(current) : -1;
  rebuildShuffle(); prepareNext();
}
export function removeQueue(index: number) {
  if (index < 0 || index >= player.queue.length) return;
  freshHistoryContext();
  const current = player.song;
  const removingCurrent = index === player.index;
  player.queue.splice(index, 1);
  player.blockedIndex = -1;
  if (!removingCurrent) player.index = current ? player.queue.indexOf(current) : -1;
  else if (player.queue.length) void start(Math.min(index, player.queue.length - 1));
  else { queueVersion++; player.index = -1; void pause(); }
  rebuildShuffle(); prepareNext();
}

export function setOrder(order: Order, source: () => Grid) {
  if (order === player.order) return;
  freshHistoryContext();
  player.order = order; randomDraw++;
  if (order === 'random') {
    randomGrid = source(); // freeze the source selection for this listening session
    perm = shuffle(randomGrid.count); cursor = -1;
    freshHistoryContext();
    const current = player.song;
    player.queue = current ? [current] : []; player.index = current ? 0 : -1;
    if (!current) void nextRandom();
  } else { randomGrid = undefined; rebuildShuffle(); }
}
async function nextRandom() {
  const grid = randomGrid; if (!grid?.count) return;
  if (player.index < player.queue.length - 1) { void start(player.index + 1); return; }
  if (++cursor >= perm.length) { perm = shuffle(grid.count); cursor = 0; }
  const mine = ++randomDraw; player.requesting = true;
  try {
    const track = await grid.song(perm[cursor]);
    if (mine !== randomDraw) return;
    if (!track) throw new Error('This collection has no playable music tracks. Skip to continue.');
    if (blocked(track)) { cursor--; return; }
    freshHistoryContext();
    player.queue.push({ ...track }); void start(player.queue.length - 1);
  } catch (error) { if (mine === randomDraw) fail(error); }
  finally { if (mine === randomDraw) player.requesting = false; }
}
export function jumpRandom(source: () => Grid) {
  const hadSong = !!player.song;
  if (player.order !== 'random') { setOrder('random', source); if (hadSong) void nextRandom(); }
  else void nextRandom();
}
export function replayHistory(entry: HistoryEntry) {
  const context = entry.context;
  logPlayback('history-selected', { entryId: entry.id, contextId: context.id, index: entry.index });
  const queue = context.queue.map(historyTrack);
  if (blocked(queue[entry.index])) return;
  // Start the chosen occurrence, then restore the exact shuffle permutation.
  const previousOrder = player.order;
  player.order = 'normal';
  if (play(queue, entry.index) < 0) { player.order = previousOrder; return; }
  player.order = context.order === 'random' ? 'normal' : context.order;
  if (player.order === 'shuffle') {
    const valid = context.permutation.length === queue.length && new Set(context.permutation).size === queue.length && context.permutation.every(i => Number.isInteger(i) && i >= 0 && i < queue.length);
    perm = valid ? Uint32Array.from(context.permutation) : shuffle(queue.length, entry.index);
    cursor = [...perm].indexOf(entry.index);
  }
  player.queueTab = 'queue';
}
export function jump(index: number) {
  player.requestRevision++;
  randomDraw++;
  if (blocked(player.queue[index])) return;
  if (player.order === 'shuffle') { freshHistoryContext(); player.index = index; rebuildShuffle(); }
  void start(index);
}
export function next() {
  player.requestRevision++;
  if (player.order === 'random') return void nextRandom();
  const index = player.order === 'shuffle' ? perm[cursor + 1] : (player.blockedIndex >= 0 ? player.blockedIndex : player.index) + 1;
  if (index < player.queue.length) { if (blocked(player.queue[index])) { player.blockedIndex = index; if (player.order === 'shuffle') cursor++; return; } if (player.order === 'shuffle') cursor++; void start(index); }
  else { void pause(); player.time = player.duration; }
}
export function prev() {
  player.requestRevision++;
  if (player.time > 3) return seek(0);
  if (player.order === 'shuffle') { if (cursor > 0 && !blocked(player.queue[perm[cursor - 1]])) void start(perm[--cursor]); }
  else if (player.index > 0) void start(player.index - 1);
}
export async function pause() {
  player.requestRevision++;
  player.loadingCollectionId = '';

  const mine = ++intent; randomDraw++; player.requesting = false; player.pending = true;
  try { await controller.pause(); if (mine === intent) { playing(false); player.pending = false; } }
  catch (error) { if (mine === intent) fail(error); }
}
export async function toggle() {
  if (player.loadingCollectionId && !player.pending && !player.song) { cancelCollectionLoading(); return; }
  if (player.blockedIndex >= 0) return start(player.blockedIndex);
  if (player.playing || player.pending) return pause();
  if (!player.song && player.queue.length) return start(0);
  if (!player.song || blocked(player.song)) return;
  if (player.suspended || controller.current?.id !== player.song.id || player.time >= player.duration - 0.2) return start(player.index);
  const mine = ++intent; player.pending = true;
  try { await controller.resume(); if (mine === intent) { player.pending = false; player.error = ''; playing(true);  } }
  catch (error) { if (mine === intent) fail(error); }
}
export function cancelCollectionLoading() { player.requestRevision++; player.requesting = false; player.loadingCollectionId = ''; }
export async function seek(fraction: number) {
  if (!player.duration || player.pending || !Number.isFinite(fraction)) return;
  const seconds = Math.max(0, Math.min(1, fraction)) * player.duration;
  player.time = seconds;
  const mine = ++intent;

  try { await controller.seek(seconds); } catch (error) { if (mine === intent) fail(error); }
}

audio.addEventListener('timeupdate', () => {
  if (controller.active !== 'local' || player.pending || player.song?.id !== localTrack?.id) return;
  player.time = audio.currentTime; player.duration = audio.duration || localTrack?.duration || 0;
  if (!scrobbled && localTrack && (player.time > player.duration / 2 || player.time > 240)) {
    scrobbled = true; session.api?.scrobble({ id: localTrack.rawId, submission: true }).catch(() => {});
  }
});
audio.addEventListener('ended', () => { if (controller.active === 'local' && !player.pending) { playing(false); next(); } });
audio.addEventListener('error', () => { if (controller.active === 'local') fail(new Error('Local audio could not be loaded. Check the file and retry or skip.')); });
audio.addEventListener('pause', () => { if (controller.active === 'local' && !player.pending) playing(false); });
audio.addEventListener('play', () => { if (controller.active === 'local' && !player.pending) playing(true); });

export function disposePlayback() { audio.pause(); clearWarm(); }

let graph: { ctx: AudioContext; node: GainNode; localAnalysis: GainNode } | null = null;
export function audioGraph() {
  if (!graph) {
    const ctx = new AudioContext(), node = ctx.createGain();
    const local = ctx.createMediaElementSource(audio), silent = ctx.createGain(), localAnalysis = ctx.createGain();
    local.connect(ctx.destination); local.connect(localAnalysis); localAnalysis.connect(node);
    silent.gain.value = 0; node.connect(silent); silent.connect(ctx.destination);
    graph = { ctx, node, localAnalysis };
  }
  graph.ctx.resume(); return graph;
}
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play', () => { if (!player.playing) void toggle(); });
  ms.setActionHandler('pause', () => void pause());
  ms.setActionHandler('nexttrack', next); ms.setActionHandler('previoustrack', prev);
  ms.setActionHandler('seekto', (d) => { if (d.seekTime != null) void seek(d.seekTime / player.duration); });
}
