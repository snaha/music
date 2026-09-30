import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveAlbums, discoverLibrary, emptyIndex } from './spotify-library.js';
import { musicTrack, albumTile } from './spotify-model.js';
import { SpotifyService } from './spotify.js';
const album = (id = 'a') => ({ id, name: id, artists: [{ name: 'Various Artists' }], total_tracks: 10 });
const raw = (id, a = 'a', disc = 1, track = 1) => ({ type: 'track', id, name: id, album: album(a), disc_number: disc, track_number: track });
const tile = (id, more = {}) => ({ id, rawId: id, title: id, kind: 'playlist', available: true, snapshot: '1', ...more });
function harness(collections, api) {
  return { generation: 0, tokens: {}, cache: { collections, index: emptyIndex() }, api, waitForPlayback: async () => {}, saveCache: async () => {}, emit() {}, rebuildIndex() { this.indexed = deriveAlbums(this.cache); } };
}
test('one track adds one partial album; overlapping sources dedupe with provenance; editions stay separate', () => {
  const s = harness([tile('p'), tile('spotify:liked')]);
  s.cache.index.sources.p = { tracks: [musicTrack(raw('1')), musicTrack(raw('1')), musicTrack(raw('2', 'deluxe'))] };
  s.cache.index.sources['spotify:liked'] = { tracks: [musicTrack(raw('1'))] };
  const result = deriveAlbums(s.cache);
  assert.deepEqual(result.albums.map(a => a.count), [1, 1]); assert.equal(result.indexedTracks, 2);
  assert.equal(result.tracks.get('spotify:album:a')[0].origins.length, 2);
  assert.equal(s.cache.index.sources.p.tracks.length, 3, 'playlist duplicates retained');
});
test('saved albums contribute full tracks in disc order; removals retain other memberships', () => {
  const s = harness([tile('p'), albumTile(album())]);
  s.cache.index.sources.p = { tracks: [musicTrack(raw('1'))] };
  s.cache.index.sources['spotify:album:a'] = { tracks: [musicTrack(raw('3', 'a', 2, 1)), musicTrack(raw('2', 'a', 1, 2)), musicTrack(raw('1'))] };
  assert.deepEqual(deriveAlbums(s.cache).tracks.get('spotify:album:a').map(t => t.rawId), ['1', '2', '3']);
  s.cache.collections.pop();
  assert.equal(deriveAlbums(s.cache).albums[0].count, 1);
  s.cache.index.sources.p.tracks = []; assert.equal(deriveAlbums(s.cache).albums.length, 0);
});
test('inaccessible sources cannot add albums; missing old index migrates without login', () => {
  const cache = { collections: [tile('p', { available: false })] };
  assert.deepEqual(deriveAlbums(cache).albums, []); assert.equal(cache.index.version, 2);
  cache.index.sources.p = { tracks: [musicTrack(raw('1'))] }; assert.equal(deriveAlbums(cache).albums.length, 0);
});
test('discovery phases preserve duplicates, skip snapshots, filter episodes and use at most two requests', async () => {
  let active = 0, max = 0; const calls = [];
  const s = harness([tile('spotify:liked'), albumTile(album()), tile('p'), tile('q'), tile('same')], async url => {
    calls.push(url); max = Math.max(max, ++active); await new Promise(r => setTimeout(r, 2)); active--;
    return { items: [{ item: raw('1') }, { item: raw('1') }, { item: { id: 'pod', type: 'episode' } }], next: null };
  });
  s.cache.index.sources.same = { snapshot: '1', tracks: [musicTrack(raw('old'))] };
  await discoverLibrary(s);
  assert.ok(calls[0].includes('/me/tracks')); assert.ok(calls[1].includes('/albums/')); assert.equal(max, 2);
  assert.ok(!calls.some(u => u.includes('same'))); assert.equal(s.cache.index.sources.p.tracks.length, 2); assert.equal(s.indexed.albums[0].count, 2);
});
test('interrupted scans retain complete membership and resume playlist checkpoints', async () => {
  const s = harness([tile('p')], async url => {
    if (url.endsWith('offset=0')) return { items: [raw('new')], next: 'next' };
    throw Object.assign(new Error('rate limited'), { status: 429 });
  });
  s.cache.index.sources.p = { snapshot: 'old', tracks: [musicTrack(raw('old'))] };
  await discoverLibrary(s);
  assert.equal(s.cache.index.sources.p.tracks[0].rawId, 'old'); assert.equal(s.cache.index.pending.p.next, 50);
  assert.equal(s.indexed.albums[0].count, 2); assert.equal(s.indexing, false);
  s.api = async url => { assert.ok(url.endsWith('offset=50')); return { items: [raw('last')], next: null }; };
  await discoverLibrary(s);
  assert.deepEqual(s.cache.index.sources.p.tracks.map(t => t.rawId), ['new', 'last']); assert.equal(s.cache.index.pending.p, undefined);
});
test('rate failures drain concurrent work and disconnect discards late responses', async () => {
  let complete = false;
  const s = harness([tile('p'), tile('q'), tile('r')], async url => {
    if (url.includes('/p/')) throw Object.assign(new Error('rate limit'), { status: 429 });
    await new Promise(r => setTimeout(r, 10)); complete = true; return { items: [raw('x')] };
  });
  await discoverLibrary(s); assert.equal(complete, true); assert.equal(s.indexing, false); assert.equal(s.cache.index.sources.r, undefined);
  const disconnected = harness([tile('p')], async () => { disconnected.generation++; disconnected.tokens = null; return { items: [raw('x')] }; });
  await discoverLibrary(disconnected); assert.deepEqual(disconnected.cache.index.sources, {});
});
test('incremental albums preserve prior positions and album playback freezes the included subset', () => {
  const s = new SpotifyService({ directory: '', secureStorage: {} });
  s.cache.collections = [tile('p')]; s.cache.index = emptyIndex();
  s.cache.index.sources.p = { tracks: Array.from({ length: 60 }, (_, i) => musicTrack(raw(String(i)))) }; s.rebuildIndex();
  const first = s.albumTracks('spotify:album:a'); assert.equal(first.tracks.length, 50);
  s.cache.index.sources.p.tracks.unshift(musicTrack(raw('other', 'new'))); s.cache.index.sources.p.tracks.push(musicTrack(raw('later'))); s.rebuildIndex();
  assert.deepEqual(s.indexed.albums.map(a => a.rawId), ['a', 'new']);
  const second = s.albumTracks('spotify:album:a', first.next, first.snapshot); assert.equal(second.tracks.length, 10); assert.ok(!second.tracks.some(t => t.rawId === 'later'));
});
test('large cached library derives stable unique album positions', () => {
  const s = harness(Array.from({ length: 400 }, (_, i) => tile(String(i))));
  for (const collection of s.cache.collections) s.cache.index.sources[collection.id] = { tracks: Array.from({ length: 100 }, (_, j) => musicTrack(raw(`${collection.id}-${j}`, String(j)))) };
  const start = performance.now(), first = deriveAlbums(s.cache); const elapsed = performance.now() - start;
  assert.equal(first.indexedTracks, 40000); assert.equal(first.albums.length, 100);
  assert.deepEqual(deriveAlbums(s.cache).albums.map(a => a.id), first.albums.map(a => a.id));
  console.log(`40,000-track cached index: ${elapsed.toFixed(1)} ms`);
});
