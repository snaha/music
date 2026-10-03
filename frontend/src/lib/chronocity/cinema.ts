import type { Point, Station } from './layout';

export type CameraPose = Point & { yaw: number; pitch: number };
export type CameraShot = { from: CameraPose; station: Station; narrow: boolean; approachSeconds: number };
export const orbitSeconds = 16;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => { const t = clamp(value); return t * t * t * (t * (t * 6 - 15) + 10); };
const angle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

// A front-facing arc keeps the original cover readable while foreground scenery
// reveals depth. No roll or FOV pumping: the horizon stays calm on small screens.
export function orbitPose(station: Station, seconds: number, narrow: boolean): CameraPose {
  const phase = clamp(seconds / orbitSeconds) * Math.PI * 2;
  const lift = (1 - Math.cos(phase)) / 2;
  const yaw = station.yaw - Math.cos(phase) * (narrow ? 0.15 : 0.24);
  const distance = (narrow ? 23 : 18) + lift * 2;
  const rise = 1 + lift * 1.4;
  return { x: station.x + Math.sin(yaw) * distance, y: station.y + rise,
    z: station.z + Math.cos(yaw) * distance, yaw,
    pitch: -Math.atan2(rise, distance) - (narrow ? 0.19 : 0) };
}

export function cameraShot(from: CameraPose, station: Station, narrow: boolean): CameraShot {
  const to = orbitPose(station, 0, narrow);
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  return { from: { ...from }, station, narrow, approachSeconds: Math.max(3, distance / 6) };
}

export function sampleShot(shot: CameraShot, seconds: number): CameraPose {
  if (seconds >= shot.approachSeconds) return orbitPose(shot.station, seconds - shot.approachSeconds, shot.narrow);
  const t = ease(seconds / shot.approachSeconds), to = orbitPose(shot.station, 0, shot.narrow);
  return { x: shot.from.x + (to.x - shot.from.x) * t,
    y: shot.from.y + (to.y - shot.from.y) * t,
    z: shot.from.z + (to.z - shot.from.z) * t,
    yaw: shot.from.yaw + angle(shot.from.yaw, to.yaw) * t,
    pitch: shot.from.pitch + (to.pitch - shot.from.pitch) * t };
}

// Stay in the current gallery; a tour never races across remote catalog rooms.
// Recently visited covers are preferred last, with distance breaking ties.
export function nextTourStation(current: Station, candidates: Station[], visited: ReadonlySet<string>): Station {
  return candidates.filter(station => station.album.id !== current.album.id &&
    Math.hypot(station.x - current.x, station.y - current.y, station.z - current.z) <= 45)
    .sort((a, b) => Number(visited.has(a.album.id)) - Number(visited.has(b.album.id)) ||
      Math.hypot(a.x - current.x, a.y - current.y, a.z - current.z) - Math.hypot(b.x - current.x, b.y - current.y, b.z - current.z))[0] ?? current;
}
