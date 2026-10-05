import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build, transform } from 'esbuild';
import { compileModule } from '../frontend/tests/runes-compiler.mjs';
import { MusicDatabase } from './music-database.js';

test('frontend migrates to the worker, pages and searches history, isolates users and ignores stale reads', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'music-history-ui-'));
  const database = new MusicDatabase(path.join(directory, 'music.sqlite'));
  const output = await build({
    stdin: { contents: "export * from './src/lib/listening-history.svelte.ts'; export {session} from './src/lib/api.svelte.ts';", resolveDir: new URL('../frontend/', import.meta.url).pathname, loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', conditions: ['browser'],
    plugins: [{ name: 'runes', setup(builder) { builder.onLoad({ filter: /\.svelte\.ts$/ }, async ({ path }) => {
      const source = await transform(await readFile(path, 'utf8'), { loader: 'ts' });
      return { contents: compileModule(source.code, { filename: path, generate: 'client' }).js.code, loader: 'js' };
    }); } }],
  });
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
  let unavailable = false;
  const bridge = {
    write: args => unavailable ? Promise.reject(new Error('disk unavailable')) : database.call('write', args), list: args => database.call('list', args), clear: scope => database.call('clear', { scope }),
  };
  globalThis.window = { desktop: {}, musicHistory: bridge };
  const m = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString('base64')}`);
  const context = { id: 'context', queue: [{ id: 'local:track:1', rawId: '1', source: 'local', title: 'Song', album: 'Album', cover: 'signed-secret-artwork', available: true }], order: 'normal', permutation: [], origin: { id: 'local:playlist:p', rawId: 'p', source: 'local', kind: 'playlist', title: 'Night mix', cover: 'signed-secret-artwork' } };
  try {
    m.session.base = 'http://127.0.0.1:1234'; m.session.username = 'admin';
    // Origin migration canonicalizes desktop history before the renderer loads it.
    const legacyKey = 'music.history.v1:desktop:admin';
    const legacy = JSON.stringify({ contexts: [context], entries: [{ id: 'legacy', contextId: context.id, index: 0, cursor: 0, playedAt: 1000 }] });
    storage.set(legacyKey, legacy);
    m.loadHistory();
    assert.equal(m.listeningHistory.entries.length, 1, 'legacy loads synchronously');
    for (let i = 0; i < 120; i++) m.recordHistory(context, 0, 0);
    await m.searchHistory('');
    assert.equal(m.listeningHistory.total, 121);
    assert.equal(m.listeningHistory.entries.length, 50);
    const persisted = await bridge.list({ scope: 'desktop:admin' });
    assert.ok((await bridge.list({ scope: 'desktop:admin', query: 'night', offset: 100 })).entries.some(entry => entry.id === 'legacy'), 'legacy entry reaches the durable journal');
    assert.equal(storage.get(legacyKey), legacy, 'migration retains the browser backup');
    assert.equal(persisted.entries[0].context.queue[0].cover, '', 'signed cover URL is not persisted');
    assert.equal(persisted.entries[0].context.origin.cover, '');
    await m.searchHistory('', true); assert.equal(m.listeningHistory.entries.length, 100);
    const oldestLoaded = m.listeningHistory.entries.at(-1).id;
    m.recordHistory(context, 0, 0);
    await m.historyStats();
    for (let i = 0; i < 20 && m.listeningHistory.loading; i++) await new Promise(setImmediate);
    assert.equal(m.listeningHistory.entries.length, 101, 'recording playback preserves loaded history pages');
    assert.equal(m.listeningHistory.entries.at(-1).id, oldestLoaded);
    assert.equal(m.listeningHistory.hasMore, true);
    await m.searchHistory('night'); assert.equal(m.listeningHistory.total, 122);
    await m.searchHistory('absent'); assert.equal(m.listeningHistory.total, 0);
    m.recordHistory(context, 0, 0);
    assert.equal(m.listeningHistory.entries.length, 0, 'a nonmatching play never flashes into filtered history');
    await m.historyStats();
    m.session.base = 'http://127.0.0.1:4321'; m.loadHistory(); await m.searchHistory('');
    assert.equal(m.listeningHistory.total, 123, 'desktop history survives a port change');
    const stale = m.searchHistory('night');
    m.session.username = 'other'; m.loadHistory(); await m.searchHistory(''); await stale;
    assert.equal(m.listeningHistory.total, 0);
    m.session.username = 'admin'; m.loadHistory(); await m.searchHistory('');
    unavailable = true; m.recordHistory(context, 0, 0); await m.searchHistory('');
    assert.equal(m.listeningHistory.entries.length, 51, 'failed write keeps the new play visible');
    assert.ok(m.listeningHistory.error);
    unavailable = false; m.retryHistory(); await m.searchHistory('');
    assert.equal(m.listeningHistory.total, 124, 'retry saves the original event without duplication');
    const beforeClear = m.searchHistory('night'); m.clearHistory(); await beforeClear; await m.searchHistory('');
    assert.equal(m.listeningHistory.total, 0, 'late reads do not undo clear');
    m.session.username = 'other'; m.loadHistory(); await m.searchHistory('');
    m.session.username = 'admin'; m.loadHistory(); await m.searchHistory('');
    assert.equal(m.listeningHistory.total, 0, 'migration never resurrects cleared history');
    m.clearHistory(); m.recordHistory(context, 0, 0); await m.searchHistory('');
    assert.equal(m.listeningHistory.total, 1, 'a play immediately after clear survives the asynchronous clear');
  } finally { await database.close(); await rm(directory, { recursive: true, force: true }); }
});
