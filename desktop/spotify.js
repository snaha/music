import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { deriveAlbums, discoverLibrary, migrateIndex } from './spotify-library.js';
import { albumTile, musicTrack, playlistTile } from './spotify-model.js';

const SCOPES = 'user-library-read playlist-read-private playlist-read-collaborative user-read-playback-state user-modify-playback-state';
const readJSON = async (file, fallback) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; } };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emptyCache = () => ({ account: '', collections: [], pages: {}, updatedAt: 0 });

export class SpotifyError extends Error {
  constructor(message, status = 0, retryAt = 0) { super(message); this.status = status; this.retryAt = retryAt; }
}

// Tokens and all Spotify requests stay in the main process. The renderer never supplies API URLs.
export class SpotifyService {
  constructor({ directory, secureStorage, openExternal, fetchImpl = fetch, notify = () => {}, callbackPort = 8888 }) {
    this.directory = directory; this.secureStorage = secureStorage; this.openExternal = openExternal;
    this.fetch = fetchImpl; this.notify = notify;
    this.callbackPort = callbackPort;
    this.config = { clientId: '', deviceId: '', deviceName: '', sameMac: false };
    this.cache = emptyCache(); this.tokens = null; this.generation = 0; this.loginAttempt = 0;
    this.syncing = false; this.progress = ''; this.error = ''; this.retryAt = 0; this.quotaBlocked = false;
    this.indexing = false; this.indexError = ''; this.indexed = { albums: [], tracks: new Map(), indexedTracks: 0 }; this.transitionUntil = 0; this.albumPages = new Map();
    this.refreshing = null; this.cancelLogin = null; this.writeTail = Promise.resolve();
  }

  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    this.config = { ...this.config, ...await readJSON(path.join(this.directory, 'config.json'), {}) };
    if (this.secureStorage.isEncryptionAvailable()) {
      try {
        this.tokens = JSON.parse(this.secureStorage.decryptString(await readFile(path.join(this.directory, 'tokens.bin'))));
        this.cache = await readJSON(path.join(this.directory, 'library.json'), emptyCache());
        if (this.cache.account !== this.tokens.account) this.cache = emptyCache();
      } catch { this.tokens = null; }
    }
    this.rebuildIndex();
    return this.snapshot();
  }

  rebuildIndex() { this.indexed = deriveAlbums(this.cache); }
  async waitForPlayback() { while (Date.now() < this.transitionUntil) await delay(100); }
  transition(active) { this.transitionUntil = active ? Date.now() + 30000 : 0; }
  albumTracks(id, offset = 0, snapshot) {
    if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid album page.');
    for (const [key, value] of this.albumPages) if (value.until < Date.now()) this.albumPages.delete(key);
    if (offset === 0) {
      const tracks = this.indexed.tracks.get(id);
      if (!tracks) throw new Error('This album is no longer in your library.');
      snapshot = randomBytes(16).toString('hex');
      if (this.albumPages.size >= 32) this.albumPages.delete(this.albumPages.keys().next().value);
      this.albumPages.set(snapshot, { id, tracks, until: Date.now() + 600000 });
    }
    const page = this.albumPages.get(snapshot);
    if (!page || page.id !== id) throw new Error('Album selection expired. Open the album again.');
    const next = offset + 50 < page.tracks.length ? offset + 50 : null;
    if (next === null) this.albumPages.delete(snapshot);
    return { tracks: page.tracks.slice(offset, offset + 50), next, snapshot };
  }

  snapshot() {
    return { connected: !!this.tokens, account: this.cache.account, clientId: this.config.clientId,
      collections: this.cache.collections, albums: this.indexed.albums, indexedTracks: this.indexed.indexedTracks, indexing: this.indexing, indexError: this.indexError,
      inaccessiblePlaylists: this.cache.collections.filter(t => t.kind === 'playlist' && !t.available).length, updatedAt: this.cache.updatedAt, syncing: this.syncing,
      progress: this.progress, error: this.error, retryAt: this.retryAt, quotaBlocked: this.quotaBlocked,
      deviceId: this.config.deviceId, deviceName: this.config.deviceName, sameMac: this.config.sameMac };
  }
  emit() { this.notify(this.snapshot()); }

  // Serialize atomic writes so disconnect cannot be followed by an old token/cache write.
  persist(name, bytes) {
    const generation = this.generation;
    this.writeTail = this.writeTail.catch(() => {}).then(async () => {
      if (generation !== this.generation) return;
      const file = path.join(this.directory, name);
      await writeFile(`${file}.tmp`, bytes, { mode: 0o600 });
      if (generation === this.generation) await rename(`${file}.tmp`, file);
      else await rm(`${file}.tmp`, { force: true });
    });
    return this.writeTail;
  }
  saveConfig() { return this.persist('config.json', JSON.stringify(this.config)); }
  saveCache() { return this.persist('library.json', JSON.stringify(this.cache)); }
  saveTokens() {
    if (!this.secureStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable. Spotify credentials were not saved.');
    return this.persist('tokens.bin', this.secureStorage.encryptString(JSON.stringify(this.tokens)));
  }

  async tokenRequest(body) {
    const r = await this.fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body), signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new SpotifyError('Spotify login expired or was rejected. Connect Spotify again.', r.status);
    return r.json();
  }

  async accessToken() {
    if (!this.tokens) throw new SpotifyError('Connect Spotify in Settings first.', 401);
    if (this.tokens.expiresAt > Date.now() + 60000) return this.tokens.access_token;
    if (!this.refreshing) {
      const generation = this.generation, refresh = this.tokens.refresh_token;
      this.refreshing = (async () => {
        const t = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh, client_id: this.config.clientId });
        if (generation !== this.generation) throw new Error('Spotify connection changed.');
        this.tokens = { ...this.tokens, ...t, refresh_token: t.refresh_token ?? refresh, expiresAt: Date.now() + t.expires_in * 1000 };
        await this.saveTokens();
        return this.tokens.access_token;
      })().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  async api(endpoint, { method = 'GET', body, retry = true } = {}) {
    if (this.quotaBlocked) throw new SpotifyError('Spotify API quota exhausted. Retry from Settings later.', 429);
    if (Date.now() < this.retryAt) throw new SpotifyError('Spotify is rate limiting requests. Please wait.', 429, this.retryAt);
    const generation = this.generation;
    const token = await this.accessToken();
    if (generation !== this.generation) throw new Error('Spotify connection changed.');
    const r = await this.fetch(`https://api.spotify.com/v1${endpoint}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    if (generation !== this.generation) throw new Error('Spotify connection changed.');
    if (r.status === 401 && retry) {
      this.tokens.expiresAt = 0;
      return this.api(endpoint, { method, body, retry: false });
    }
    if (r.status === 204) return null;
    const data = await r.json().catch(() => ({}));
    if (r.status === 429) {
      this.quotaBlocked = data.error?.reason === 'QUOTA_EXCEEDED';
      this.retryAt = Date.now() + Math.max(1, Number(r.headers.get('retry-after')) || 30) * 1000;
      this.error = this.quotaBlocked ? 'Spotify API quota exhausted. Retry later from Settings.' : 'Spotify is rate limiting requests. The queue is preserved.';
      this.emit(); throw new SpotifyError(this.error, 429, this.retryAt);
    }
    if (!r.ok) throw new SpotifyError(r.status === 403 ? 'Spotify denied access. Check Premium, the app allowlist, and device permissions.' :
      r.status === 404 ? 'Spotify device unavailable. Open Spotify Desktop and select it again in Settings.' :
      r.status === 401 ? 'Reconnect Spotify in Settings.' : `Spotify request failed (${r.status}).`, r.status);
    return data;
  }

  async connect(clientId) {
    if (!/^[a-f\d]{32}$/i.test(clientId)) throw new Error('Enter the 32-character Spotify client ID, not the client secret.');
    if (!this.secureStorage.isEncryptionAvailable()) throw new Error('OS credential encryption is unavailable.');
    this.cancelLogin?.();
    const attempt = ++this.loginAttempt;
    const verifier = randomBytes(48).toString('base64url'), state = randomBytes(24).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const code = await new Promise((resolve, reject) => {
      let redirectUri = '';
      const server = createServer((req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
        if (u.searchParams.get('state') !== state) { res.writeHead(400).end('Invalid login state.'); return; }
        res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }).end('Return to Music. You may close this tab.');
        finish(u.searchParams.has('error') ? new Error('Spotify login was canceled.') : null, u.searchParams.get('code'));
      });
      const timer = setTimeout(() => finish(new Error('Spotify login timed out. Try connecting again.')), 600000);
      const finish = (error, value) => {
        clearTimeout(timer); server.close(); this.cancelLogin = null;
        error ? reject(error) : resolve({ code: value, redirectUri });
      };
      server.on('error', (error) => { clearTimeout(timer); this.cancelLogin = null; reject(error.code === 'EADDRINUSE' ? new Error('Spotify login needs local port 8888. Close the application using that port and retry.') : error); });
      this.cancelLogin = () => finish(new Error('Spotify login canceled.'));
      server.listen(this.callbackPort, '127.0.0.1', () => {
        redirectUri = `http://127.0.0.1:${server.address().port}/callback`;
        const url = new URL('https://accounts.spotify.com/authorize');
        url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, scope: SCOPES,
          redirect_uri: redirectUri, state, code_challenge_method: 'S256', code_challenge: challenge }).toString();
        this.openExternal(url.href).catch((error) => finish(error));
      });
    });
    const token = await this.tokenRequest({ grant_type: 'authorization_code', code: code.code,
      redirect_uri: code.redirectUri, client_id: clientId, code_verifier: verifier });
    if (attempt !== this.loginAttempt) throw new Error('Spotify login was canceled.');
    await this.disconnect();
    this.config.clientId = clientId;
    this.tokens = { ...token, expiresAt: Date.now() + token.expires_in * 1000 };
    try {
      const account = await this.api('/me');
      this.tokens.account = account.id; this.cache.account = account.id;
      await this.saveTokens(); await this.saveConfig();
      this.error = ''; this.emit();
      void this.refreshLibrary();
      return this.snapshot();
    } catch (error) { await this.disconnect(); throw error; }
  }

  async disconnect() {
    this.cancelLogin?.(); this.loginAttempt++; this.generation++; this.tokens = null; this.refreshing = null;
    this.albumPages.clear(); this.cache = emptyCache(); this.rebuildIndex(); this.indexing = false; this.indexError = ''; this.syncing = false; this.progress = ''; this.error = '';
    this.quotaBlocked = false; this.retryAt = 0;
    this.config.deviceId = ''; this.config.deviceName = ''; this.config.sameMac = false;
    await this.writeTail.catch(() => {});
    await Promise.all(['tokens.bin', 'library.json'].map((name) => rm(path.join(this.directory, name), { force: true })));
    await this.saveConfig(); this.emit(); return this.snapshot();
  }

  async refreshLibrary(manual = false) {
    if (!this.tokens || this.syncing || this.indexing) return this.snapshot();
    if (manual) this.quotaBlocked = false;
    this.manualIndex = manual;
    const generation = this.generation;
    this.syncing = true; this.error = ''; this.progress = 'Reading Spotify library…'; this.emit();
    const next = [];
    const merge = () => {
      const replacements = new Map(next.map((t) => [t.id, t]));
      const previous = this.cache.collections;
      const previousIds = new Set(previous.map((t) => t.id));
      this.cache.collections = [...previous.map((t) => replacements.get(t.id) ?? t), ...next.filter((t) => !previousIds.has(t.id))];
      this.emit();
    };
    try {
      for (const kind of ['albums', 'playlists']) {
        for (let offset = 0; ; offset += 50) {
          const page = await this.api(`/me/${kind}?limit=50&offset=${offset}`);
          if (generation !== this.generation) return this.snapshot();
          for (const value of page.items ?? []) {
            if (kind === 'albums' && value.album) next.push(albumTile(value.album, value.added_at));
            if (kind === 'playlists' && value) next.push(playlistTile(value, this.cache.account));
          }
          this.progress = `Reading Spotify ${kind}… ${offset + (page.items?.length ?? 0)}`; merge();
          if (!page.next) break;
          await delay(100); // yield between pages; player commands do not wait on the library scan
        }
      }
      const liked = await this.api('/me/tracks?limit=1');
      if (generation !== this.generation) return this.snapshot();
      next.push({ id: 'spotify:liked', rawId: 'liked', source: 'spotify', kind: 'playlist', title: 'Liked Songs',
        sub: 'Spotify · Liked Songs', cover: liked.items?.[0]?.track?.album?.images?.[0]?.url ?? '',
        count: liked.total ?? 0, available: true, externalUrl: 'https://open.spotify.com/collection/tracks' });
      const nextMap = new Map(next.map((t) => [t.id, t]));
      const oldIds = new Set(this.cache.collections.map((t) => t.id));
      this.cache.collections = [...this.cache.collections.filter((t) => nextMap.has(t.id)).map((t) => nextMap.get(t.id)), ...next.filter((t) => !oldIds.has(t.id))];
      this.cache.pages = {}; this.cache.updatedAt = Date.now();
      const index = migrateIndex(this.cache);
      for (const id of Object.keys(index.sources)) if (!nextMap.has(id)) delete index.sources[id];
      for (const id of Object.keys(index.pending)) if (!nextMap.has(id)) delete index.pending[id];
      this.rebuildIndex();
      await this.saveCache();
    } catch (error) { if (generation === this.generation) this.error = error.message; }
    finally { if (generation === this.generation) { this.syncing = false; this.progress = ''; this.emit(); } }
    if (generation === this.generation && !this.error) {
      this.discovery = discoverLibrary(this);
      void this.discovery.catch(error => { this.indexError = error.message; this.emit(); });
    }
    return this.snapshot();
  }

  async tracks(id, offset = 0) {
    const tile = this.cache.collections.find((t) => t.id === id);
    if (!tile || !tile.available) throw new Error('Spotify does not expose the contents of this collection.');
    if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid page.');
    const key = `${id}:${offset}`;
    if (this.cache.pages[key]) return this.cache.pages[key];
    const indexed = this.cache.index?.sources[id];
    if (indexed) return { tracks: indexed.tracks.slice(offset, offset + 50), next: offset + 50 < indexed.tracks.length ? offset + 50 : null };
    const generation = this.generation;
    const endpoint = id === 'spotify:liked' ? '/me/tracks' : tile.kind === 'album' ? `/albums/${encodeURIComponent(tile.rawId)}/tracks` : `/playlists/${encodeURIComponent(tile.rawId)}/items`;
    const data = await this.api(`${endpoint}?limit=50&offset=${offset}`);
    if (generation !== this.generation) throw new Error('Spotify connection changed.');
    const album = { id: tile.rawId, name: tile.title, images: [{ url: tile.cover }] };
    const tracks = (data.items ?? []).map((x) => musicTrack(x?.item ?? x?.track ?? x, tile.kind === 'album' ? album : undefined)).filter(Boolean);
    const page = { tracks, next: data.next ? offset + 50 : null };
    this.cache.pages[key] = page; await this.saveCache(); return page;
  }

  async devices() { return (await this.api('/me/player/devices'))?.devices ?? []; }
  async selectDevice(id, sameMac) {
    const device = (await this.devices()).find((d) => d.id === id);
    if (!device || device.is_restricted) throw new Error('Choose an available Spotify device.');
    if (sameMac && device.type?.toLowerCase() !== 'computer') throw new Error('Mixed playback needs Spotify Desktop on this Mac.');
    Object.assign(this.config, { deviceId: id, deviceName: device.name, sameMac: !!sameMac });
    await this.saveConfig(); this.emit(); return this.snapshot();
  }
  async playback() {
    const state = await this.api('/me/player');
    if (process.env.MUSIC_PLAYBACK_TRACE === '1') console.info('spotify-playback', JSON.stringify({ at: Date.now(), playing: state?.is_playing, progress: state?.progress_ms, duration: state?.item?.duration_ms, type: state?.currently_playing_type }));
    if (!state) return null;
    return { deviceId: state.device?.id, playing: !!state.is_playing, progress: (state.progress_ms ?? 0) / 1000,
      track: musicTrack(state.item), type: state.currently_playing_type, shuffle: state.shuffle_state,
      repeat: state.repeat_state, disallows: state.actions?.disallows ?? {} };
  }
  async command(action, value) {
    if (!this.config.deviceId) throw new Error('Select Spotify Desktop in Settings first.');
    const q = `device_id=${encodeURIComponent(this.config.deviceId)}`;
    if (action === 'play') {
      if (!/^spotify:track:[A-Za-z0-9]+$/.test(value)) throw new Error('Only Spotify music tracks can be played.');
      const before = await this.api('/me/player');
      if (before?.device?.id !== this.config.deviceId) {
        await this.api('/me/player', { method: 'PUT', body: { device_ids: [this.config.deviceId], play: false } });
        let activated = false;
        for (let i = 0; i < 6; i++) {
          const state = await this.api('/me/player');
          if (state?.device?.id === this.config.deviceId) { activated = true; break; }
          await delay(300);
        }
        if (!activated) throw new Error('Spotify did not activate the selected output. Play a track once in Spotify Desktop, then retry here.');
      }
      await this.api(`/me/player/shuffle?state=false&${q}`, { method: 'PUT' });
      await this.api(`/me/player/repeat?state=off&${q}`, { method: 'PUT' });
      return this.api(`/me/player/play?${q}`, { method: 'PUT', body: { uris: [value], position_ms: 0 } });
    }
    if (action === 'pause' || action === 'resume') return this.api(`/me/player/${action === 'resume' ? 'play' : 'pause'}?${q}`, { method: 'PUT' });
    if (action === 'seek' && Number.isFinite(value) && value >= 0) return this.api(`/me/player/seek?position_ms=${Math.round(value * 1000)}&${q}`, { method: 'PUT' });
    throw new Error('Unsupported Spotify command.');
  }
  async external(url) {
    const u = new URL(url);
    if (u.origin !== 'https://open.spotify.com') throw new Error('Invalid Spotify link.');
    await this.openExternal(u.href);
  }
}
