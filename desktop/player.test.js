import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build, transform } from 'esbuild';
import svelteCompiler from '../frontend/node_modules/svelte/compiler/index.js';
const { compileModule } = svelteCompiler;

test('actual local player loads collections, controls audio, preserves queue occurrences and replays history', async () => {
  const output = await build({
    stdin: { contents: `export * from './src/lib/player.svelte.ts'; export { listeningHistory, clearHistory, loadHistory } from './src/lib/listening-history.svelte.ts'; export { session } from './src/lib/api.svelte.ts'; export { library, setMode, pick, addCollection } from './src/lib/library.svelte.ts';`, resolveDir: new URL('../frontend/', import.meta.url).pathname, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', conditions: ['browser'],
    plugins: [{ name: 'svelte-runes', setup(builder) {
      builder.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
        const source = await transform(await readFile(path, 'utf8'), { loader: 'ts', target: 'es2023' });
        return { contents: compileModule(source.code, { filename: path, generate: 'client' }).js.code, loader: 'js' };
      });
    } }],
  });
  const storage = new Map(), audioElements = [];
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  globalThis.window = {};
  globalThis.Audio = class extends EventTarget {
    currentTime = 0; duration = 180; src = ''; paused = true;
    constructor() { super(); audioElements.push(this); }
    async play() { this.paused = false; this.dispatchEvent(new Event('play')); }
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); }
    load() {} removeAttribute() { this.src = ''; }
  };
  globalThis.Image = class { set src(value) { queueMicrotask(() => this.onload?.()); } };
  const m = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  const settle = async () => { for (let i = 0; i < 10; i++) await new Promise(setImmediate); };
  const local = { id: 'local:track:1', rawId: '1', source: 'local', title: 'Local song', cover: '', duration: 180, available: true };
  const other = { ...local, id: 'local:track:2', rawId: '2', title: 'Second song' };
  const origin = { id: 'local:playlist:mix', rawId: 'mix', source: 'local', kind: 'playlist', title: 'Night mix', cover: '', count: 3, available: true };
  const child = track => ({ id: track.rawId, title: track.title, duration: track.duration });
  const response = value => ({ status: 'ok', ...value });
  const scrobbles = [];
  m.session.base = 'http://127.0.0.1:1234'; m.session.username = 'audit';
  m.session.api = {
    scrobble: async value => { scrobbles.push(value); return response({}); },
    getPlaylist: async () => response({ playlist: { entry: [child(local), child(other), child(local)] } }),
    getAlbumList2: async () => response({ albumList2: { album: [{ id: 'album', name: 'Local album', songCount: 2 }] } }),
    getPlaylists: async () => response({ playlists: { playlist: [{ id: 'mix', name: 'Night mix', songCount: 3 }] } }),
  };
  try {
    await m.pick(origin); await settle();
    assert.equal(m.player.playing, true); assert.deepEqual(m.player.queue.map(t => t.id), [local.id, other.id, local.id]);
    assert.equal(m.collectionPlayback(origin).listening, true);
    const collectionTracks = m.player.queue.map(track => ({ ...track }));
    assert.equal(m.collectionTrackIsCurrent(origin, collectionTracks, 0), true);
    assert.equal(m.collectionTrackIsCurrent(origin, collectionTracks, 2), false, 'only the selected duplicate occurrence is current');
    assert.equal(audioElements[0].paused, false); assert.match(audioElements[0].src, /id=1/);
    m.setVolume(42); assert.equal(audioElements[0].volume, .42); assert.equal(storage.get('music.volume'), '42');
    m.setVolume(200); assert.equal(m.player.volume, 100);
    await m.seek(.5); assert.equal(audioElements[0].currentTime, 90);
    audioElements[0].currentTime = 100; audioElements[0].dispatchEvent(new Event('timeupdate'));
    assert.equal(m.player.time, 100); assert.ok(scrobbles.some(entry => entry.submission));
    await m.pause(); assert.equal(m.player.playing, false);
    await m.toggle(); assert.equal(m.player.playing, true); assert.equal(audioElements[0].currentTime, 100, 'resume preserves position');
    m.jump(2); await settle();
    const entry = m.listeningHistory.entries[0];
    assert.equal(entry.index, 2); assert.equal(entry.context.queue.length, 3); assert.equal(entry.context.origin.id, origin.id);
    assert.equal(m.collectionTrackIsCurrent(origin, collectionTracks, 0), false);
    assert.equal(m.collectionTrackIsCurrent(origin, collectionTracks, 2), true);
    m.moveQueue(0, 1); assert.equal(m.player.index, 2, 'reorder retains the current duplicate occurrence');
    m.removeQueue(0); assert.equal(m.player.index, 1);
    assert.equal(m.collectionTrackIsCurrent(origin, collectionTracks, 2), true, 'collection occurrence survives queue edits');
    const version = m.enqueue([other]); assert.equal(m.player.queueOpen, true); assert.equal(m.player.playing, true);
    m.play([other]); await settle(); assert.equal(m.appendToSession([local], version), false, 'stale collection pages cannot extend a replacement queue');
    m.replayHistory(entry); await settle(); assert.equal(m.player.index, 2); assert.equal(m.player.queue.length, 3);
    assert.equal(m.player.song.playbackOrigin.id, origin.id);
    assert.equal(m.collectionTrackIsCurrent(origin, collectionTracks, 2), true, 'history replay retains the collection occurrence');
    await m.pause(); await m.addCollection(origin); assert.equal(m.player.playing, false, 'queueing a collection never starts playback');
    assert.equal(m.player.queue.length, 6);
    const queue = m.player.queue.map(t => t.id);
    await m.setMode('albums'); await m.setMode('playlists'); assert.deepEqual(m.player.queue.map(t => t.id), queue, 'browsing modes preserve the queue');
    m.play([{ ...local, available: false }]); assert.deepEqual(m.player.queue.map(t => t.id), queue, 'unavailable tracks retain the current queue');
    m.play([{ ...local, source: 'unsupported' }]); assert.deepEqual(m.player.queue.map(t => t.id), queue, 'unsupported saved sources retain the current queue');
    m.clearHistory(); assert.equal(m.listeningHistory.entries.length, 0);
    m.removeQueue(m.player.index); await settle(); assert.ok(m.player.song);
    const randomTrack = { ...other, id: 'local:track:random', rawId: 'random' };
    for (const cancel of [grid => m.setOrder('normal', () => grid), grid => m.setOrder('shuffle', () => grid), () => m.play([local]), () => m.enqueue([other]), () => m.jump(0), () => m.prev(), () => m.pause()]) {
      let resolveSong;
      const grid = { count: 1, key: 'deferred', find: () => 0, song: () => new Promise(resolve => { resolveSong = resolve; }) };
      m.setOrder('normal', () => grid);
      m.jumpRandom(() => grid);
      assert.equal(m.player.randomRequesting, true, 'random lookup responds immediately');
      await cancel(grid);
      assert.equal(m.player.randomRequesting, false, 'new intentions clear random loading immediately');
      const ids = m.player.queue.map(track => track.id);
      resolveSong(randomTrack); await settle();
      assert.deepEqual(m.player.queue.map(track => track.id), ids, 'cancelled random lookup cannot append a stale track');
      assert.equal(m.player.randomRequesting, false);
    }
    m.player.requesting = true;
    const grid = { count: 1, key: 'separate-loading', find: () => 0, song: async () => randomTrack };
    m.jumpRandom(() => grid); m.setOrder('normal', () => grid); await settle();
    assert.equal(m.player.requesting, true, 'cancelling random loading does not clear an independent collection request');
    m.player.requesting = false;
  } finally { m.disposePlayback(); }
});
