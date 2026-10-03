import type { SpotifyPlayback, Track } from './music';

export type RemoteObservation = { trackId: string; progress: number; duration: number; at: number; playing: boolean };
export function interpretRemote(state: SpotifyPlayback | null, expected: Track, deviceId: string, previous?: RemoteObservation): 'playing' | 'paused' | 'ended' | 'external' | 'unavailable' {
  if (!state) return 'unavailable';
  if (state.deviceId !== deviceId || state.type !== 'track' || state.track?.id !== expected.id || state.shuffle || state.repeat !== 'off') return 'external';
  if (state.playing) return 'playing';
  const duration = expected.duration ?? 0;
  // A stopped player alone is not completion. Require an observation of this track
  // near its end, plus the terminal/reset position. Ambiguous pauses stay paused.
  // Spotify can report a slightly regressed final position before resetting to zero.
  // Allow half a second of reporting jitter, still requiring a terminal position.
  const reachedEnd = previous?.playing && previous.trackId === expected.id && previous.progress >= duration - 2 &&
    previous.progress + (Date.now() - previous.at) / 1000 >= duration - 0.5;
  if (duration > 0 && reachedEnd && (state.progress === 0 || state.progress >= duration - 0.2)) return 'ended';
  return 'paused';
}

export async function confirmSpotify(predicate: (state: SpotifyPlayback | null) => boolean): Promise<SpotifyPlayback | null> {
  for (let i = 0; i < 8; i++) {
    const state = await window.spotify!.playback();
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error('Spotify did not confirm playback. The queue is preserved; check Spotify Desktop and retry.');
}

// Spotify may briefly return an older snapshot even after confirming a handoff.
// Recheck same-device track/mode mismatches only near our own successful start.
// A changed device or media type still yields control immediately.
export async function settleRemoteObservation(state: SpotifyPlayback | null, expected: Track, deviceId: string, previous: RemoteObservation | undefined, recentHandoff: boolean,
  read: () => Promise<SpotifyPlayback | null> = () => window.spotify!.playback(),
  wait: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 350))) {
  for (let i = 0; recentHandoff && i < 2 && state?.deviceId === deviceId && state.type === 'track' && interpretRemote(state, expected, deviceId, previous) === 'external'; i++) {
    await wait(); state = await read();
  }
  return state;
}
