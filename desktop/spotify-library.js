import { musicTrack } from './spotify-model.js';

export const emptyIndex = () => ({ version: 2, sources: {}, pending: {}, albumOrder: [], firstSeen: {} });
export function migrateIndex(cache) {
  cache.index = cache.index?.version === 2 ? cache.index : emptyIndex();
  cache.index.firstSeen ??= {};
  return cache.index;
}

// Album editions are grouped only by provider album ID, never title or artist matching.
export function deriveAlbums(cache) {
  const index = migrateIndex(cache), albums = new Map(), tracks = new Map();
  const catalog = new Map(cache.collections.map(c => [c.id, c]));
  const add = (track, origin) => {
    if (!track.albumId || !track.albumInfo) return;
    let album = albums.get(track.albumId);
    if (!album) {
      album = { ...track.albumInfo, count: 0, available: false, tracks: new Map(), origins: new Set(), addedAt: origin.addedAt ?? (index.firstSeen[track.albumId] ??= new Date().toISOString()) };
      albums.set(track.albumId, album);
    }
    album.origins.add(origin.id);
    if (origin.addedAt && origin.addedAt > album.addedAt) album.addedAt = origin.addedAt;
    const existing = album.tracks.get(track.id);
    const provenance = { id: origin.id, title: origin.title, kind: origin.kind };
    if (existing) {
      if (!existing.origins.some(p => p.id === origin.id)) existing.origins.push(provenance);
    } else album.tracks.set(track.id, { ...track, origins: [provenance] });
  };
  for (const [id, source] of Object.entries(index.sources)) {
    const origin = catalog.get(id);
    if (origin?.available) for (const track of source.tracks) add(track, origin);
  }
  for (const [id, pending] of Object.entries(index.pending)) {
    const origin = catalog.get(id);
    if (origin?.available) for (const track of pending.tracks) add(track, origin);
  }
  for (const saved of cache.collections.filter(c => c.kind === 'album')) {
    if (!albums.has(saved.id)) albums.set(saved.id, { ...saved, count: 0, available: false, indexing: !index.sources[saved.id] && !index.pending[saved.id]?.error, tracks: new Map(), origins: new Set([saved.id]) });
  }
  const values = new Map();
  for (const [id, album] of albums) {
    const included = [...album.tracks.values()].sort((a, b) => (a.disc ?? 1) - (b.disc ?? 1) || (a.track ?? 0) - (b.track ?? 0) || a.id.localeCompare(b.id));
    tracks.set(id, included);
    const { tracks: ignored, origins, ...tile } = album;
    values.set(id, { ...tile, count: included.length, available: included.some(t => t.available), origins: [...origins], saved: catalog.get(id)?.kind === 'album', incomplete: [...origins].some(origin => !index.sources[origin]) });
  }
  for (const id of Object.keys(index.firstSeen)) if (!values.has(id)) delete index.firstSeen[id];
  const known = new Set(index.albumOrder);
  index.albumOrder = [...index.albumOrder.filter(id => values.has(id)), ...[...values.keys()].filter(id => !known.has(id))];
  return { albums: index.albumOrder.map(id => values.get(id)), tracks,
    indexedTracks: new Set([...tracks.values()].flatMap(list => list.map(t => t.id))).size };
}

export async function discoverLibrary(service) {
  const generation = service.generation, index = migrateIndex(service.cache);
  const connected = () => generation === service.generation && !!service.tokens;
  let aborted = false, lastPublish = 0, lastSave = 0;
  const current = () => connected() && !aborted;
  const publish = async (force = false) => {
    if (!connected()) return;
    const now = Date.now();
    if (force || now - lastPublish >= 750) { lastPublish = now; service.rebuildIndex(); service.emit(); }
    if (force || now - lastSave >= 5000) { lastSave = now; await service.saveCache(); }
  };
  const catalog = service.cache.collections;
  const liked = catalog.find(t => t.id === 'spotify:liked');
  const saved = catalog.filter(t => t.kind === 'album');
  const playlists = catalog.filter(t => t.kind === 'playlist' && t.id !== 'spotify:liked' && t.available);
  let completed = 0;
  const total = (liked ? 1 : 0) + saved.length + playlists.length;
  service.indexing = true; service.indexError = '';
  const scan = async (tile) => {
    if (!current()) return;
    const previous = index.sources[tile.id];
    // Saved album membership is stable; refresh its details only on an explicit refresh.
    if (previous && ((tile.kind === 'playlist' && tile.id !== 'spotify:liked' && tile.snapshot && previous.snapshot === tile.snapshot) || (tile.kind === 'album' && !service.manualIndex))) { completed++; return; }
    const endpoint = tile.id === 'spotify:liked' ? '/me/tracks' : tile.kind === 'album' ? `/albums/${encodeURIComponent(tile.rawId)}/tracks` : `/playlists/${encodeURIComponent(tile.rawId)}/items`;
    let pending = index.pending[tile.id];
    if (!pending || !tile.snapshot || pending.snapshot !== tile.snapshot) pending = { tracks: [], next: 0, snapshot: tile.snapshot };
    delete pending.error; index.pending[tile.id] = pending;
    while (current()) {
      await service.waitForPlayback();
      if (!current()) return;
      const offset = pending.next;
      const page = await service.api(`${endpoint}?limit=50&offset=${offset}`);
      if (!current()) return;
      const parent = tile.kind === 'album' ? { id: tile.rawId, name: tile.title, artists: [{ name: tile.sub }], images: [{ url: tile.cover }], total_tracks: tile.count } : undefined;
      pending.tracks.push(...(page.items ?? []).map(x => musicTrack(x?.item ?? x?.track ?? x, parent)).filter(Boolean));
      pending.next = page.next ? offset + 50 : null;
      if (pending.next === null) {
        index.sources[tile.id] = { tracks: pending.tracks, snapshot: tile.snapshot, scannedAt: Date.now() };
        delete index.pending[tile.id]; completed++;
      }
      service.progress = `Discovering albums · ${completed}/${total} collections · ${tile.title}`;
      // Batched checkpoints retain partial progress without serializing the entire library on every page.
      await publish();
      if (pending.next === null) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };
  const attempt = async tile => {
    try { await scan(tile); }
    catch (error) {
      if (!connected()) return;
      service.indexError = error.message;
      if (index.pending[tile.id]) index.pending[tile.id].error = error.message;
      // Stop dispatching on account/network/rate errors, but drain both active requests before finalizing.
      if (error.status === 429 || error.status === 401 || !error.status) aborted = true;
    }
  };
  try {
    for (const phase of [[...(liked ? [liked] : [])], saved, playlists]) {
      let cursor = 0;
      await Promise.all(Array.from({ length: Math.min(2, phase.length) }, async () => {
        while (cursor < phase.length && current()) await attempt(phase[cursor++]);
      }));
    }
  } finally {
    if (connected()) { service.indexing = false; service.progress = ''; await publish(true); service.emit(); }
  }
}
