import { session, streamUrl } from './api.svelte';
import { spotify, spotifyPlayable, spotifyMessage } from './spotify.svelte';
import { PlaybackController, type PlaybackAdapter } from './playback-controller';
import { confirmSpotify, interpretRemote, type RemoteObservation } from './spotify-playback';
import { shuffle } from './shuffle';
import type { Track } from './music';

export type Order = 'normal' | 'shuffle' | 'random';
export type Grid = { count: number; key: string; find(albumId: string): number; song(n: number): Promise<Track | undefined> };
export const player = $state({
  queue: [] as Track[], index: -1, blockedIndex: -1, playing: false, pending: false, requesting: false, requestRevision: 0, suspended: false, error: '',
  time: 0, duration: 0, order: 'normal' as Order, queueOpen: false, topHidden: false, visOpen: false,
  view: '' as '' | 'share' | 'settings' | 'components', viewFrom: 'bottom' as 'bottom' | 'right',
  get song() { return this.queue[this.index] as Track | undefined; },
});

const audio = new Audio(), warmAudio = new Audio();
audio.crossOrigin = warmAudio.crossOrigin = 'anonymous';
audio.preload = 'auto'; warmAudio.preload = 'metadata';
let localTrack: Track | undefined, scrobbled = false;
let intent = 0, perm: Uint32Array = new Uint32Array(0), cursor = -1;
let randomGrid: Grid | undefined, randomDraw = 0;
let lastRemote: RemoteObservation | undefined;
let remoteSampleAt = 0, remoteProgress = 0;
let pollTimer: ReturnType<typeof setTimeout> | undefined, polling = false;
let queueVersion = 0;

function clearWarm() { warmAudio.removeAttribute('src'); warmAudio.load(); }
function requireMixedOutput() {
  if (player.queue.some((s) => s.source === 'spotify') && player.queue.some((s) => s.source === 'local') && !spotify.sameMac)
    throw new Error('Mixed queues need Spotify Desktop on this Mac. Choose and confirm it in Settings.');
}
const localAdapter: PlaybackAdapter = {
  available(track) { requireMixedOutput(); if (!session.api || !track.available) throw new Error('Local track unavailable. Check your music library.'); },
  async prepare(track) { graph?.ctx.resume(); if (audio.src !== streamUrl(track.rawId)) { audio.src = streamUrl(track.rawId); audio.load(); } },
  async start(track) { localTrack = track; scrobbled = false; audio.currentTime = 0; await audio.play(); session.api?.scrobble({ id: track.rawId, submission: false }).catch(() => {}); },
  async pause() { audio.pause(); },
  async resume() { graph?.ctx.resume(); await audio.play(); },
  async seek(seconds) { audio.currentTime = seconds; },
};
const remoteAdapter: PlaybackAdapter = {
  available(track) {
    requireMixedOutput();
    if (!spotifyPlayable()) throw new Error(spotifyMessage());
    if (!track.available) throw new Error('This Spotify track is unavailable. Skip it to continue.');
    if (!spotify.deviceId) throw new Error('Select Spotify Desktop in Settings.');
  },
  async prepare() { await graph?.ctx.resume(); },
  async start(track) {
    await window.spotify!.command('play', track.uri);
    const state = await confirmSpotify((s) => !!s && s.deviceId === spotify.deviceId && s.track?.id === track.id && s.playing);
    if (state) rememberRemote(track, state.progress, true);
  },
  async pause() {
    const before = await window.spotify!.playback();
    if (!before) throw new Error('Cannot confirm Spotify has stopped. Open Spotify Desktop, play and pause a track there, then retry here.');
    if (before.deviceId !== spotify.deviceId) throw new Error('Spotify output changed outside Music. Select the output again.');
    if (!before.playing) return;
    await window.spotify!.command('pause');
    await confirmSpotify((s) => !!s && s.deviceId === spotify.deviceId && !s.playing);
  },
  async resume() {
    await window.spotify!.command('resume');
    const state = await confirmSpotify((s) => !!s && s.deviceId === spotify.deviceId && s.track?.id === player.song?.id && s.playing);
    if (state && player.song) rememberRemote(player.song, state.progress, true);
  },
  async seek(seconds) { await window.spotify!.command('seek', seconds); remoteProgress = seconds; remoteSampleAt = performance.now(); lastRemote = undefined; },
};
const controller = new PlaybackController({ local: localAdapter, spotify: remoteAdapter });

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
function rememberRemote(track: Track, progress: number, isPlaying: boolean) {
  remoteProgress = progress; remoteSampleAt = performance.now();
  lastRemote = { trackId: track.id, progress, duration: track.duration ?? 0, at: Date.now(), playing: isPlaying };
}
function prepareNext() {
  const i = player.order === 'shuffle' ? perm[cursor + 1] : player.index + 1;
  const track = player.queue[i];
  if (track?.source === 'local') warmAudio.src = streamUrl(track.rawId);
  else clearWarm();
}
function blocked(track: Track | undefined) {
  if (track?.source === 'spotify' && (!spotifyPlayable() || !track.available)) {
    player.error = track.available ? spotifyMessage() : 'This Spotify track is unavailable. Skip it to continue.';
    player.view = 'settings'; return true;
  }
  return false;
}
async function start(index: number) {
  const track = player.queue[index]; if (!track) return;
  if (blocked(track)) { player.blockedIndex = index; return; }
  try { (track.source === 'spotify' ? remoteAdapter : localAdapter).available(track); }
  catch (error) { player.error = (error as Error).message; player.view = 'settings'; return; }
  player.blockedIndex = -1;
  const mine = ++intent;
  player.index = index; player.pending = true; player.suspended = false; player.error = '';
  player.time = 0; player.duration = track.duration ?? 0; playing(false); lastRemote = undefined;
  const startedAt = performance.now();
  void window.spotify?.transition?.(true).catch(() => {});
  try {
    await controller.play(track);
    if (mine !== intent) return;
    player.pending = false; playing(true); metadata(track); prepareNext(); schedulePoll(1000);
    performance.measure('music-playback-handoff', { start: startedAt, end: performance.now(), detail: { source: track.source } });
  } catch (error) { if (mine === intent) fail(error); }
  finally { if (mine === intent) void window.spotify?.transition?.(false).catch(() => {}); }
}

function rebuildShuffle() {
  if (player.order === 'shuffle') { perm = shuffle(player.queue.length, player.index); cursor = 0; }
}
export function play(queue: Track[], index = 0) {
  if (blocked(queue[Math.max(0, index)])) return -1;
  if (queue.some(t => t.source === 'spotify') && queue.some(t => t.source === 'local') && !spotify.sameMac) { player.error = 'Mixed queues need Spotify Desktop on this Mac. Choose and confirm it in Settings.'; player.view = 'settings'; return -1; }
  player.requestRevision++;
  queueVersion++;
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
  if (player.order === 'shuffle') perm = Uint32Array.from([...perm, ...Array.from(shuffle(tracks.length), (i) => i + offset)]);
  prepareNext(); return true;
}
export function enqueue(tracks: Track[]) {
  if (player.order === 'random') { randomGrid = undefined; randomDraw++; player.order = 'normal'; }
  appendToSession(tracks, queueVersion); player.queueOpen = true;
  return queueVersion;
}
export function moveQueue(from: number, to: number) {
  if (from < 0 || to < 0 || from >= player.queue.length || to >= player.queue.length) return;
  const current = player.song;
  player.blockedIndex = -1;
  const [entry] = player.queue.splice(from, 1); player.queue.splice(to, 0, entry);
  player.index = current ? player.queue.indexOf(current) : -1;
  rebuildShuffle(); prepareNext();
}
export function removeQueue(index: number) {
  if (index < 0 || index >= player.queue.length) return;
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
  player.order = order; randomDraw++;
  if (order === 'random') {
    randomGrid = source(); // freeze the source selection for this listening session
    perm = shuffle(randomGrid.count); cursor = -1;
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
    player.queue.push({ ...track }); void start(player.queue.length - 1);
  } catch (error) { if (mine === randomDraw) fail(error); }
  finally { if (mine === randomDraw) player.requesting = false; }
}
export function jumpRandom(source: () => Grid) {
  const hadSong = !!player.song;
  if (player.order !== 'random') { setOrder('random', source); if (hadSong) void nextRandom(); }
  else void nextRandom();
}
export function jump(index: number) {
  player.requestRevision++;
  randomDraw++;
  if (blocked(player.queue[index])) return;
  if (player.order === 'shuffle') { player.index = index; rebuildShuffle(); }
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
  lastRemote = undefined;
  const mine = ++intent; randomDraw++; player.requesting = false; player.pending = true;
  try { await controller.pause(); if (mine === intent) { playing(false); player.pending = false; } }
  catch (error) { if (mine === intent) fail(error); }
}
export async function toggle() {
  if (player.blockedIndex >= 0) return start(player.blockedIndex);
  if (player.playing || player.pending) return pause();
  if (!player.song && player.queue.length) return start(0);
  if (!player.song || blocked(player.song)) return;
  if (player.suspended || controller.current?.id !== player.song.id || player.time >= player.duration - 0.2) return start(player.index);
  const mine = ++intent; player.pending = true;
  try { await controller.resume(); if (mine === intent) { player.pending = false; player.error = ''; playing(true); schedulePoll(1000); } }
  catch (error) { if (mine === intent) fail(error); }
}
export async function seek(fraction: number) {
  if (!player.duration || player.pending || !Number.isFinite(fraction)) return;
  const seconds = Math.max(0, Math.min(1, fraction)) * player.duration;
  player.time = seconds;
  const mine = ++intent;
  lastRemote = undefined;
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

function schedulePoll(ms: number) { clearTimeout(pollTimer); pollTimer = setTimeout(pollRemote, ms); }
async function pollRemote() {
  if (polling || controller.active !== 'spotify' || player.pending || player.suspended || !player.song) { schedulePoll(2000); return; }
  polling = true; const track = player.song, mine = intent;
  try {
    const state = await window.spotify!.playback();
    if (mine !== intent || player.song !== track) return;
    const result = interpretRemote(state, track, spotify.deviceId, lastRemote);
    if (result === 'external') {
      controller.suspend(); fail(new Error('Playback changed in Spotify. Your queue is paused here; press Play to take control again.')); return;
    }
    if (result === 'unavailable') { fail(new Error('Spotify Desktop is unavailable. Open it, play and pause a track there, then press Play here.')); return; }
    if (result === 'ended') { lastRemote = undefined; playing(false); next(); return; }
    rememberRemote(track, state!.progress, state!.playing); player.time = state!.progress; playing(state!.playing);
  } catch (error) { if (mine === intent) fail(error); }
  finally {
    polling = false;
    const remaining = player.duration - player.time;
    schedulePoll(player.playing ? (remaining < 5 ? 750 : document.hidden ? 5000 : 2500) : 10000);
  }
}
// Smooth progress without a network request on every frame.
const progressTimer = setInterval(() => {
  if (controller.active === 'spotify' && player.playing && !player.pending)
    player.time = Math.min(player.duration, remoteProgress + (performance.now() - remoteSampleAt) / 1000);
}, 100);
export function disposePlayback() { clearInterval(progressTimer); clearTimeout(pollTimer); audio.pause(); clearWarm(); }

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
