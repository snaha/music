import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SpotifyService } from './spotify.js';
import { musicTrack, playlistTile } from './spotify-model.js';

async function service(t, fetchImpl) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'music-spotify-'));
  t.after(async () => { s.generation++; s.tokens = null; await s.discovery; await s.writeTail.catch(() => {}); await rm(directory, { recursive: true, force: true }); });
  const s = new SpotifyService({ directory, fetchImpl, callbackPort: 0, openExternal: async () => {}, secureStorage: {
    isEncryptionAvailable: () => true, encryptString: (text) => Buffer.from(text), decryptString: (bytes) => bytes.toString(),
  } });
  await s.init(); s.config.clientId = 'a'.repeat(32);
  s.tokens = { access_token: 'old', refresh_token: 'refresh', expiresAt: 0, account: 'me' };
  s.availability = 'ready';
  return s;
}

test('music normalization excludes podcasts, audiobooks and Spotify local files', () => {
  for (const item of [null, { type: 'episode', id: 'a' }, { type: 'chapter', id: 'a' }, { type: 'track', id: 'a', is_local: true }]) assert.equal(musicTrack(item), null);
  const track = musicTrack({ type: 'track', id: 'a', name: 'Song', duration_ms: 120000 });
  assert.equal(track.id, 'spotify:track:a'); assert.equal(track.duration, 120);
  assert.notEqual(track.id, 'local:track:a');
  assert.equal(playlistTile({ id: 'p', owner: { id: 'someone' } }, 'me').available, false);
  assert.equal(playlistTile({ id: 'p', collaborative: true }, 'me').available, true);
});

test('concurrent token refresh is single-flight and retains rotated refresh tokens', async (t) => {
  let calls = 0;
  const s = await service(t, async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return Response.json({ access_token: 'new', refresh_token: 'rotated', expires_in: 3600 }); });
  assert.deepEqual(await Promise.all([s.accessToken(), s.accessToken()]), ['new', 'new']);
  assert.equal(calls, 1); assert.equal(s.tokens.refresh_token, 'rotated');
});

test('401 refreshes once; 429 prevents further requests until Retry-After', async (t) => {
  let calls = 0;
  const s = await service(t, async (url) => {
    calls++;
    if (url.includes('/api/token')) return Response.json({ access_token: 'new', expires_in: 3600 });
    if (calls === 1) return Response.json({}, { status: 401 });
    return Response.json({ error: {} }, { status: 429, headers: { 'retry-after': '60' } });
  });
  s.tokens.expiresAt = Date.now() + 3600000;
  await assert.rejects(s.api('/me'), { status: 429 });
  assert.equal(calls, 3);
  await assert.rejects(s.api('/me'), { status: 429 }); assert.equal(calls, 3);
});

test('quota exhaustion stops automatic API retries', async (t) => {
  let calls = 0;
  const s = await service(t, async () => { calls++; return Response.json({ error: { reason: 'QUOTA_EXCEEDED' } }, { status: 429 }); });
  s.tokens.expiresAt = Date.now() + 3600000;
  await assert.rejects(s.api('/me')); s.retryAt = 0;
  await assert.rejects(s.api('/me')); assert.equal(calls, 1);
});

test('disconnect clears tokens and retains cache and cannot be undone by a late refresh', async (t) => {
  let finish;
  const s = await service(t, () => new Promise((resolve) => { finish = resolve; }));
  const pending = s.accessToken();
  await s.disconnect();
  finish(Response.json({ access_token: 'late', expires_in: 3600 }));
  await assert.rejects(pending, /connection changed/);
  assert.equal(s.tokens, null); assert.deepEqual(s.cache.collections, []);
  await assert.rejects(readFile(path.join(s.directory, 'tokens.bin')), { code: 'ENOENT' });
});

test('OAuth uses state + PKCE, preserves loopback URI and rejects a forged callback', async (t) => {
  let authorized, tokenBody;
  const s = await service(t, async (url, options) => {
    if (url.includes('/api/token')) { tokenBody = options.body; return Response.json({ access_token: 'new', refresh_token: 'r', expires_in: 3600 }); }
    return Response.json({ id: 'me' });
  });
  s.refreshLibrary = async () => s.snapshot();
  s.openExternal = async (url) => {
    authorized = new URL(url);
    const callback = new URL(authorized.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'code', state: 'wrong' }).toString();
    assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', authorized.searchParams.get('state'));
    assert.equal((await fetch(callback)).status, 200);
  };
  await s.connect('a'.repeat(32));
  assert.equal(tokenBody.get('redirect_uri'), authorized.searchParams.get('redirect_uri'));
  assert.equal(authorized.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(tokenBody.get('code_verifier')); assert.equal(s.snapshot().connected, true);
  assert.ok(!JSON.stringify(s.snapshot()).includes('access_token'));
});

test('library sync preserves positions and paged playlists contain only music', async (t) => {
  const s = await service(t, async (url) => {
    if (url.includes('/me/albums')) return Response.json({ items: [{ album: { id: 'a', name: 'Album', total_tracks: 2 } }], next: null });
    if (url.includes('/me/playlists')) return Response.json({ items: [{ id: 'p', name: 'Mine', owner: { id: 'me' }, items: { total: 3 } }, { id: 'q', name: 'Other', owner: { id: 'someone' } }], next: null });
    if (url.includes('/playlists/p/items')) return Response.json({ items: [{ item: { type: 'episode', id: 'ep' } }, { item: { type: 'track', id: 'music', name: 'Song' } }], next: 'next-page' });
    return Response.json({ items: [], total: 0, next: null });
  });
  s.tokens.expiresAt = Date.now() + 3600000; s.cache.account = 'me';
  s.cache.collections = [{ id: 'spotify:playlist:p', title: 'Old name' }, { id: 'spotify:album:a', title: 'Old album' }];
  await s.refreshLibrary();
  s.generation++; await s.discovery;
  assert.deepEqual(s.cache.collections.slice(0, 2).map((c) => c.id), ['spotify:playlist:p', 'spotify:album:a']);
  assert.equal(s.cache.collections[0].title, 'Mine');
  assert.equal(s.cache.collections.find((c) => c.id === 'spotify:playlist:q').available, false);
  const page = await s.tracks('spotify:playlist:p', 0);
  assert.deepEqual(page.tracks.map((x) => x.id), ['spotify:track:music']); assert.equal(page.next, 50);
  await assert.rejects(s.tracks('spotify:playlist:q', 0), /does not expose/);
});

test('remote start targets one selected device and one music URI with native shuffle/repeat off', async (t) => {
  const requests = [];
  const s = await service(t, async (url, options) => {
    if (options.method === 'GET') return Response.json({ device: { id: 'mac' } });
    requests.push({ url, body: options.body }); return new Response(null, { status: 204 });
  });
  s.tokens.expiresAt = Date.now() + 3600000; s.config.deviceId = 'mac';
  await assert.rejects(s.command('play', 'spotify:episode:podcast'), /Only Spotify music/);
  await s.command('play', 'spotify:track:music');
  assert.equal(requests.length, 3);
  assert.ok(requests[0].url.includes('shuffle?state=false'));
  assert.ok(requests[1].url.includes('repeat?state=off'));
  assert.ok(requests.every((r) => r.url.includes('device_id=mac')));
  assert.deepEqual(JSON.parse(requests[2].body), { uris: ['spotify:track:music'], position_ms: 0 });
});

test('an inactive selected device is transferred without autoplay before queue control', async (t) => {
  const requests = []; let device = 'phone';
  const s = await service(t, async (url, options) => {
    if (options.method === 'GET') return Response.json({ device: { id: device } });
    const body = options.body && JSON.parse(options.body);
    requests.push({ url, body });
    if (body?.device_ids) device = body.device_ids[0];
    return new Response(null, { status: 204 });
  });
  s.tokens.expiresAt = Date.now() + 3600000; s.config.deviceId = 'mac';
  await s.command('play', 'spotify:track:music');
  assert.deepEqual(requests[0].body, { device_ids: ['mac'], play: false });
  assert.ok(requests[1].url.includes('shuffle'));
});

test('connection refuses to persist credentials without OS encryption', async (t) => {
  const s = await service(t, async () => { throw new Error('Should not call Spotify'); });
  s.secureStorage.isEncryptionAvailable = () => false;
  await assert.rejects(s.connect('a'.repeat(32)), /encryption is unavailable/);
});

test('disconnect retains account metadata through restart; removal deletes it', async t => {
  const s = await service(t, async () => { throw new Error('No network'); });
  s.cache.account = 'me'; s.cache.collections = [{ id: 'spotify:playlist:p', kind: 'playlist', available: true }];
  s.cache.index.sources.p = undefined;
  await s.disconnect();
  assert.equal(s.snapshot().availability, 'disconnected'); assert.equal(s.cache.collections.length, 1);
  await s.init(); assert.equal(s.cache.account, 'me'); assert.equal(s.cache.collections.length, 1);
  await s.removeLibrary(); await s.init(); assert.equal(s.cache.collections.length, 0);
  await assert.rejects(readFile(path.join(s.directory, 'library.json')), { code: 'ENOENT' });
});

test('partial cached playlist remains partial and never requests the network while disconnected', async t => {
  let calls = 0;
  const s = await service(t, async () => { calls++; throw new Error('No network'); });
  s.cache.collections = [{ id: 'spotify:playlist:p', kind: 'playlist', available: true }];
  s.cache.index.pending['spotify:playlist:p'] = { tracks: Array.from({ length: 60 }, (_, i) => ({ id: String(i) })), next: 100 };
  await s.disconnect();
  const first = await s.tracks('spotify:playlist:p'); assert.equal(first.tracks.length, 50); assert.equal(first.next, 50);
  const last = await s.tracks('spotify:playlist:p', 50); assert.equal(last.tracks.length, 10); assert.equal(last.incomplete, true);
  assert.equal(calls, 0); assert.equal(s.cache.index.sources['spotify:playlist:p'], undefined);
});

test('availability checks serialize, retain appearance on one network failure, and recover', async t => {
  let calls = 0, mode = 'ready';
  const s = await service(t, async () => {
    calls++; await new Promise(r => setTimeout(r, 5));
    if (mode === 'network') throw new TypeError('offline');
    if (mode === 'restricted') return Response.json({}, { status: 403 });
    if (mode === 'revoked') return Response.json({}, { status: 400 });
    return Response.json({ devices: mode === 'missing' ? [] : [{ id: 'mac', is_restricted: false }] });
  });
  s.tokens.expiresAt = Date.now() + 3600000; s.config.deviceId = 'mac';
  await Promise.all([s.checkAvailability(true), s.checkAvailability(true)]); assert.equal(calls, 1); assert.equal(s.availability, 'ready');
  mode = 'network'; await s.checkAvailability(true); assert.equal(s.availability, 'ready');
  await s.checkAvailability(true); assert.equal(s.availability, 'offline');
  mode = 'missing'; await s.checkAvailability(true); assert.equal(s.availability, 'device-unavailable');
  mode = 'restricted'; await s.checkAvailability(true); assert.equal(s.availability, 'restricted');
  mode = 'ready'; await s.checkAvailability(true); assert.equal(s.availability, 'ready');
  mode = 'revoked'; s.tokens.expiresAt = 0; await s.checkAvailability(true); assert.equal(s.availability, 'reconnect');
  const before = calls; s.retryAt = Date.now() + 60000; await s.checkAvailability(true); assert.equal(calls, before);
});

for (const account of ['me', 'different']) test(`OAuth connection preserves only the matching account cache: ${account}`, async t => {
  const s = await service(t, async url => url.includes('/api/token') ? Response.json({ access_token: 'new', refresh_token: 'r', expires_in: 3600 }) : Response.json({ id: account }));
  s.cache.account = 'me'; s.cache.collections = [{ id: 'saved', kind: 'playlist' }];
  s.refreshLibrary = async () => s.snapshot(); s.checkAvailability = async () => s.snapshot();
  s.openExternal = async url => {
    const auth = new URL(url), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'code', state: auth.searchParams.get('state') }).toString(); await fetch(callback);
  };
  await s.connect('a'.repeat(32)); assert.equal(s.cache.account, account); assert.equal(s.cache.collections.length, account === 'me' ? 1 : 0);
});

test('failed OAuth account verification preserves the previous credentials and cache', async t => {
  const s = await service(t, async url => url.includes('/api/token') ? Response.json({ access_token: 'new', expires_in: 3600 }) : Response.json({}, { status: 403 }));
  s.cache.account = 'me'; s.cache.collections = [{ id: 'saved', kind: 'playlist' }];
  s.openExternal = async url => {
    const auth = new URL(url), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'code', state: auth.searchParams.get('state') }).toString(); await fetch(callback);
  };
  await assert.rejects(s.connect('a'.repeat(32)), { status: 403 });
  assert.equal(s.tokens.access_token, 'old'); assert.equal(s.cache.collections[0].id, 'saved');
});
