import type { Collection, Track } from '../music';
import type { Station } from './layout';

// Album identity, rather than title or image URL, defines a playlist's artworks.
export function playlistArtworks(tracks: Track[], known: Collection[] = []): Collection[] {
  const catalog = new Map(known.map(album => [album.id, album]));
  const albums = new Map<string, Collection>();
  for (const track of tracks) {
    const id = track.albumInfo?.id ?? track.albumId;
    if (!id) continue;
    const previous = albums.get(id);
    const found = catalog.get(id) ?? track.albumInfo;
    if (previous) { if (!found) previous.count++; continue; }
    if (found) albums.set(id, { ...found });
    else albums.set(id, { id, rawId: id.replace(/^(?:local|spotify):album:/, ''), source: track.source, kind: 'album', title: track.album || 'Untitled album', sub: track.artist || '', cover: track.cover, count: 1, available: track.available, incomplete: true });
  }
  return [...albums.values()];
}

export function playlistStations(parent: Station, albums: Collection[], narrow = false): Station[] {
  return albums.map((album, index) => {
    const lane = index % 3 - 1, row = Math.floor(index / 3);
    const x = narrow && index === 0 ? 0 : lane * 12 + (row % 2 ? 3 : -2), z = narrow && index === 0 ? 0 : -12 - row * 15;
    return { album, year: album.year ?? null, slot: parent.slot * 10000 + index + 100000, x: parent.x + Math.cos(parent.yaw) * x + Math.sin(parent.yaw) * z, y: parent.y + (index % 3 === 1 ? 2 : 0) + Math.sin(index * 2.4) * 2, z: parent.z - Math.sin(parent.yaw) * x + Math.cos(parent.yaw) * z, yaw: narrow && index === 0 ? parent.yaw : parent.yaw + lane * -0.16 };
  });
}

// Bounded, deterministic flight keeps physical addresses useful as catalog data settles.
export function artworkFlight(station: Station, seconds: number, amount = 1) {
  const phase = station.slot * 2.39996323;
  const t = seconds * (0.17 + (station.slot % 5) * 0.017) + phase;
  return { x: station.x + Math.sin(t) * 4 * amount, y: station.y + Math.sin(t * 0.83 + 1) * 2.4 * amount, z: station.z + Math.cos(t * 0.71) * 6 * amount, pitch: Math.sin(t * 0.63) * 0.17 * amount, yaw: station.yaw + Math.sin(t * 0.57 + 0.7) * 0.48 * amount, roll: Math.sin(t * 0.8 + 2) * 0.12 * amount };
}
