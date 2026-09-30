import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretRemote } from '../src/lib/spotify-playback.ts';
import type { Track, SpotifyPlayback } from '../src/lib/music.ts';

const track: Track = { id: 'spotify:track:a', rawId: 'a', source: 'spotify', title: 'Song', cover: '', available: true, duration: 120 };
const state: SpotifyPlayback = { deviceId: 'mac', playing: true, progress: 60, track, type: 'track', shuffle: false, repeat: 'off', disallows: {} };

test('natural completion needs a recent same-track observation at the end', () => {
  const previous = { trackId: track.id, progress: 119.5, duration: 120, at: Date.now() - 1000, playing: true };
  assert.equal(interpretRemote({ ...state, playing: false, progress: 0 }, track, 'mac', previous), 'ended');
  assert.equal(interpretRemote({ ...state, playing: false, progress: 120 }, track, 'mac', previous), 'ended');
  assert.equal(interpretRemote({ ...state, playing: false, progress: 60 }, track, 'mac', previous), 'paused');
  assert.equal(interpretRemote({ ...state, playing: false, progress: 0 }, track, 'mac'), 'paused');
});

test('external device, track, podcast and mode changes yield ownership', () => {
  assert.equal(interpretRemote({ ...state, deviceId: 'speaker' }, track, 'mac'), 'external');
  assert.equal(interpretRemote({ ...state, track: { ...track, id: 'spotify:track:b' } }, track, 'mac'), 'external');
  assert.equal(interpretRemote({ ...state, type: 'episode', track: null }, track, 'mac'), 'external');
  assert.equal(interpretRemote({ ...state, shuffle: true }, track, 'mac'), 'external');
  assert.equal(interpretRemote({ ...state, repeat: 'context' }, track, 'mac'), 'external');
  assert.equal(interpretRemote(null, track, 'mac'), 'unavailable');
});

test('Spotify final-position jitter still advances, while near-end pauses stay paused', () => {
  const ending = { ...track, duration: 208.393 };
  const previous = { trackId: track.id, progress: 207.420, duration: 208.393, at: Date.now() - 879, playing: true };
  assert.equal(interpretRemote({ ...state, playing: false, progress: 0 }, ending, 'mac', previous), 'ended');
  assert.equal(interpretRemote({ ...state, playing: false, progress: 207.5 }, ending, 'mac', previous), 'paused');
  assert.equal(interpretRemote({ ...state, playing: false, progress: 0 }, ending, 'mac', { ...previous, progress: 205 }), 'paused');
});
