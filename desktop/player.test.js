import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import svelteCompiler from '../frontend/node_modules/svelte/compiler/index.js';
const { compileModule } = svelteCompiler;

test('actual Svelte player handles mixed queues, duplicate entries, reorder, removal and stale page appends', async () => {
  const output = await build({
    stdin: { contents: `export * from './src/lib/player.svelte.ts'; export { listeningHistory, clearHistory, loadHistory } from './src/lib/listening-history.svelte.ts'; export { session } from './src/lib/api.svelte.ts'; export { spotify } from './src/lib/spotify.svelte.ts'; export { library, updateSpotifyCollections, pick, addCollection } from './src/lib/library.svelte.ts';`,
      resolveDir: new URL('../frontend/', import.meta.url).pathname, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', conditions: ['browser'],
    plugins: [{ name: 'svelte-runes', setup(builder) {
      builder.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
        const source = await transform(await readFile(path, 'utf8'), { loader: 'ts', target: 'es2023' });
        return { contents: compileModule(source.code, { filename: path, generate: 'client' }).js.code, loader: 'js' };
      });
    } }],
  });
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  const audioElements = [];
  class MockAudio extends EventTarget {
    currentTime = 0; duration = 120; src = ''; paused = true;
    constructor() { super(); audioElements.push(this); }
    async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    load() {}
    removeAttribute() { this.src = ''; }
  }
  let state = null;
  const commands = [];
  globalThis.Audio = MockAudio;
  globalThis.document = { hidden: false };
  globalThis.window = { spotify: {
    playback: async () => state,
    command: async (action, uri) => {
      commands.push(action);
      if (action === 'play') state = { deviceId: 'mac', playing: true, progress: 0, track: { id: uri }, type: 'track', shuffle: false, repeat: 'off' };
      if (action === 'pause') state.playing = false;
    },
  } };
  const m = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
  const local = { id: 'local:track:1', rawId: '1', source: 'local', title: 'Local', cover: '', duration: 120, available: true };
  const remote = { ...local, id: 'spotify:track:1', source: 'spotify', uri: 'spotify:track:1', title: 'Spotify' };
  try {
    m.session.api = { scrobble: async () => ({}) }; m.session.base = 'http://127.0.0.1:1234';
    Object.assign(m.spotify, { connected: true, availability: 'ready', deviceId: 'mac', sameMac: true });
    const version = m.play([local, remote, { ...local, title: 'Local again' }]);
    await settle(); assert.equal(m.player.playing, true);
    m.next(); await settle(); assert.equal(m.player.song.source, 'spotify'); assert.equal(audioElements[0].paused, true);
    m.next(); await settle(); assert.equal(m.player.song.source, 'local'); assert.equal(state.playing, false);
    assert.ok(commands.indexOf('pause') > commands.indexOf('play'));
    m.moveQueue(0, 2); assert.equal(m.player.index, 1); assert.equal(m.player.song.title, 'Local again');
    m.removeQueue(0); assert.equal(m.player.index, 0); assert.equal(m.player.song.title, 'Local again');
    assert.equal(m.appendToSession([remote], version), true);
    m.play([local]); await settle();
    assert.equal(m.appendToSession([remote], version), false, 'pages from the replaced collection cannot alter the new queue');
    assert.equal(m.player.queue.length, 1);
    m.spotify.sameMac = false;
    m.play([local, remote]); await settle();
    assert.match(m.player.error, /Mixed queues/); assert.equal(audioElements[0].paused, false);
    assert.equal(m.player.queue.length, 1, 'failed output validation preserves the existing queue');
    m.spotify.sameMac = true;
    m.play([local, { ...remote, available: false }]); await settle(); m.next(); await settle();
    assert.match(m.player.error, /unavailable/); assert.equal(audioElements[0].paused, false);
    const beforeBlocked = m.listeningHistory.entries.length;
    m.next(); await settle();
    assert.equal(m.listeningHistory.entries.length, beforeBlocked, 'unavailable playback is not recorded');
    const origin = { id: 'local:playlist:a', rawId: 'a', source: 'local', kind: 'playlist', title: 'Previous playlist', cover: '' };
    m.setOrder('normal', () => ({ count: 0 }));
    const first = { ...local, title: 'First occurrence', playbackOrigin: origin };
    const second = { ...local, title: 'Second occurrence', playbackOrigin: origin };
    m.play([first, second]); await settle(); m.next(); await settle();
    const previous = m.listeningHistory.entries[0];
    m.enqueue([{ ...local, id: 'local:track:tail', rawId: 'tail' }]);
    assert.equal(previous.context.queue.length, 3, 'late pages remain part of the history context');
    m.removeQueue(2);
    assert.equal(previous.context.queue[previous.index].title, 'Second occurrence');
    assert.equal(previous.context.origin.title, 'Previous playlist');
    m.play([remote]); await settle();
    m.replayHistory(previous); await settle();
    assert.equal(m.player.index, 1, 'history restores the precise duplicate occurrence');
    assert.equal(m.player.queue.length, 3, 'history restores the previous playlist queue independently of later edits');
    assert.equal(m.player.song.playbackOrigin.title, 'Previous playlist');
    m.play([first, second, { ...local, id: 'local:track:3', rawId: '3' }]); await settle();
    m.setOrder('shuffle', () => ({ count: 0 })); m.next(); await settle();
    const shuffled = m.listeningHistory.entries[0];
    const expectedNext = shuffled.context.permutation[shuffled.cursor + 1];
    m.play([remote]); await settle(); m.replayHistory(shuffled); await settle();
    assert.equal(m.player.order, 'shuffle');
    m.next(); await settle();
    if (expectedNext !== undefined) assert.equal(m.player.index, expectedNext, 'history restores the shuffle traversal');
    await new Promise(resolve => setTimeout(resolve, 300));
    const saved = storage.get(`music.history.v1:${m.session.base}:${m.session.username}`);
    assert.ok(saved && !saved.includes('/rest/getCoverArt'), 'persisted history excludes signed artwork URLs');
    m.session.username = 'another-account'; m.loadHistory();
    assert.equal(m.listeningHistory.entries.length, 0, 'history is isolated by account');
    m.session.username = ''; m.loadHistory();
    assert.ok(m.listeningHistory.entries.length > 0, 'history restores persisted entries');
    const older = m.listeningHistory.entries.at(-1), newer = m.listeningHistory.entries[0];
    const recorded = m.listeningHistory.entries.length;
    for (let i = 0; i < 20; i++) m.replayHistory(i % 2 ? newer : older);
    await settle();
    assert.equal(m.player.pending, false, 'rapid history switching settles the latest request');
    assert.equal(m.player.song.id, newer.context.queue[newer.index].id);
    assert.equal(m.listeningHistory.entries.length, recorded + 1, 'superseded history requests do not record fake plays');
    m.clearHistory(); assert.equal(m.listeningHistory.entries.length, 0);
    const queueIds = m.player.queue.map((t) => t.id);
    m.spotify.albums = Array.from({ length: 10000 }, (_, i) => ({ id: `spotify:album:${i}`, rawId: String(i), source: 'spotify', kind: 'album', title: String(i), sub: 'Artist', count: 10, cover: '', available: true }));
    m.updateSpotifyCollections();
    const ids = m.library.tiles.map((t) => t.id);
    m.spotify.albums = [...m.spotify.albums].reverse(); m.updateSpotifyCollections();
    assert.deepEqual(m.library.tiles.map((t) => t.id), ids, 'refresh keeps a large catalog in place');
    assert.equal(ids.length, 10000);
    m.library.source = 'spotify';
    assert.deepEqual(m.player.queue.map((t) => t.id), queueIds, 'source filtering never resets the queue');
    const partial = { ...m.spotify.albums[0], count: 1 };
    window.spotify.albumTracks = async id => { assert.equal(id, partial.id); return { tracks: [remote], next: null }; };
    await m.pick(partial); await settle(); assert.deepEqual(m.player.queue.map(t => t.id), [remote.id]);
    await m.addCollection(partial); assert.deepEqual(m.player.queue.map(t => t.id), [remote.id, remote.id]);
    await m.pause(); m.spotify.availability = 'disconnected'; m.spotify.connected = false;
    m.updateSpotifyCollections(); assert.equal(m.library.tiles.length, 10000, 'disconnected cached albums remain visible');
    const savedQueue = m.player.queue.map(t => t.id);
    m.play([remote]); await settle(); assert.deepEqual(m.player.queue.map(t => t.id), savedQueue);
    await m.addCollection(partial); assert.equal(m.player.queue.length, savedQueue.length + 1, 'cached tracks can be queued while disconnected');
    const connections = new Map();
    const node = () => { const value = { gain: { value: 1 }, connect(target) { connections.get(value).push(target); } }; connections.set(value, []); return value; };
    globalThis.AudioContext = class {
      destination = node(); localSource;
      createGain() { return node(); }
      createMediaElementSource() { return this.localSource = node(); }
      resume() { return Promise.resolve(); }
    };
    const graph = m.audioGraph();
    const sinks = connections.get(graph.node);
    assert.equal(sinks.length, 1); assert.equal(sinks[0].gain.value, 0, 'analysis speaker route is permanently silent');
    assert.deepEqual(connections.get(sinks[0]), [graph.ctx.destination]);
    assert.ok(connections.get(graph.ctx.localSource).includes(graph.ctx.destination), 'local audio retains a direct output');
  } finally { m.disposePlayback(); }
});
