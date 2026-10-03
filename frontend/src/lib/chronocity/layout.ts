import type { Collection } from '../music';

export type Point = { x: number; y: number; z: number };
export type Station = Point & { album: Collection; year: number | null; yaw: number; slot: number };
export const releaseYear = (year?: number): number | null => Number.isInteger(year) && year! > 0 && year! <= 9999 ? year! : null;

// A square spiral of open rooms with layered entrances. Slots are permanent addresses.
function address(slot: number): Omit<Station, 'album' | 'year'> {
  const room = Math.floor(slot / 24), local = slot % 24;
  const ring = Math.ceil((Math.sqrt(room + 1) - 1) / 2);
  const side = 2 * ring, distance = (2 * ring + 1) ** 2 - 1 - room;
  const edge = side ? Math.floor(distance / side) : 0, offset = side ? distance % side : 0;
  const centers = [[ring - offset, -ring], [-ring, -ring + offset], [-ring + offset, ring], [ring, ring - offset]];
  const [cx, cz] = room ? centers[edge] : [0, 0];
  const entrance = [[-8, 7, -10], [11, 11, -23], [-21, 15, -31], [24, 6, -43], [-4, 18, -51], [35, 14, -59]];
  const angle = (local - 6) * 2.39996323;
  const radius = 43 + Math.floor((local - 6) / 6) * 13;
  const [x, y, z] = local < entrance.length ? entrance[local] : [Math.sin(angle) * radius, 6 + local % 4 * 4, Math.cos(angle) * radius - 10];
  return { x: cx * 170 + x, y, z: cz * 170 + z, yaw: Math.atan2(-x, 18 - z), slot };
}

export function reconcileStations(previous: Station[], albums: Collection[], yearOf: (album: Collection) => number | undefined, reset = false): Station[] {
  const year = (album: Collection) => album.kind === 'playlist' ? null : releaseYear(yearOf(album));
  const incoming = new Map(albums.filter(album => album.kind === 'album' || album.kind === 'playlist').map(album => [album.id, album]));
  const retained = reset ? [] : previous.filter(station => incoming.has(station.album.id)).map(station => ({ ...station, album: incoming.get(station.album.id)!, year: year(incoming.get(station.album.id)!) }));
  const known = new Set(retained.map(station => station.album.id));
  const additions = [...incoming.values()].filter(album => !known.has(album.id));
  additions.sort((a, b) => (year(a) ?? 10000) - (year(b) ?? 10000) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  let slot = previous.length && !reset ? Math.max(...previous.map(station => station.slot)) + 1 : 0;
  for (const album of additions) retained.push({ ...address(slot++), album, year: year(album) });
  return retained;
}

export function approach(station: Station): Point & { yaw: number; pitch: number } {
  return { x: station.x + Math.sin(station.yaw) * 17, y: station.y + 1, z: station.z + Math.cos(station.yaw) * 17, yaw: station.yaw, pitch: -0.06 };
}

// Query nearby buckets when crossing a cell, rather than every album every frame.
export function spatialIndex(stations: Station[]) {
  const cells = new Map<string, Station[]>();
  for (const station of stations) {
    const key = `${Math.floor(station.x / 40)},${Math.floor(station.z / 40)}`;
    const bucket = cells.get(key) ?? []; bucket.push(station); cells.set(key, bucket);
  }
  return (point: Point, limit = 24): Station[] => {
    const x = Math.floor(point.x / 40), z = Math.floor(point.z / 40);
    const candidates: Station[] = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) candidates.push(...cells.get(`${x + dx},${z + dz}`) ?? []);
    return candidates.sort((a, b) => (a.x - point.x) ** 2 + (a.z - point.z) ** 2 - (b.x - point.x) ** 2 - (b.z - point.z) ** 2).slice(0, limit);
  };
}
