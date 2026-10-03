import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretRemote, settleRemoteObservation } from '../src/lib/spotify-playback.ts';
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


test('recent handoffs recover a stale Spotify snapshot without releasing the queue', async () => {
  const stale = { ...state, track: { ...track, id: 'spotify:track:old' } };
  let reads = 0;
  const observed = await settleRemoteObservation(stale, track, 'mac', undefined, true, async () => { reads++; return state; }, async () => {});
  assert.equal(interpretRemote(observed, track, 'mac'), 'playing');
  assert.equal(reads, 1);
});

test('persistent mismatches, changed devices and changes outside the handoff window yield control', async () => {
  const stale = { ...state, track: { ...track, id: 'spotify:track:external' } };
  let reads = 0;
  const read = async () => { reads++; return stale; };
  const observed = await settleRemoteObservation(stale, track, 'mac', undefined, true, read, async () => {});
  assert.equal(interpretRemote(observed, track, 'mac'), 'external'); assert.equal(reads, 2);
  reads = 0;
  await settleRemoteObservation({ ...stale, deviceId: 'speaker' }, track, 'mac', undefined, true, read, async () => {});
  await settleRemoteObservation(stale, track, 'mac', undefined, false, read, async () => {});
  assert.equal(reads, 0, 'external changes are not retried outside our own handoff');
});
