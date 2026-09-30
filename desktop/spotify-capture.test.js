import test from 'node:test';
import assert from 'node:assert/strict';
import { SpotifyCapture } from './spotify-capture.js';
import { PCMBuffer } from '../frontend/src/lib/spotify-pcm.js';
test('capture never queues more than one unacknowledged batch and stop releases native capture', () => {
  const sent = []; let stops = 0;
  const capture = new SpotifyCapture({ sameMac: () => true, send: (type, data) => sent.push({ type, data }) });
  capture.native = { read: () => new Float32Array([.5, -.5]), stop: () => stops++ };
  capture.state.sampleRate = 48000; capture.state.status = 'listening';
  for (let i = 0; i < 100; i++) capture.pump();
  assert.equal(sent.filter(s => s.type === 'samples').length, 1);
  capture.ack(-1); capture.pump(); assert.equal(sent.filter(s => s.type === 'samples').length, 1);
  capture.ack(capture.inflight); capture.pump(); assert.equal(sent.filter(s => s.type === 'samples').length, 2);
  capture.stop(); assert.equal(stops, 1); assert.equal(capture.state.status, 'off');
});
test('PCM buffering is bounded, resamples and emits silence on underflow', () => {
  const pcm = new PCMBuffer(48000), input = new Float32Array(200000).fill(.5);
  pcm.push(input, 44100); assert.ok(pcm.write - pcm.read <= Math.ceil(44100 / 8));
  const output = [new Float32Array(128), new Float32Array(128)]; pcm.render(output);
  assert.equal(output[0][0], .5); assert.equal(output[1][0], .5); assert.equal(pcm.data.length, 65536);
  for (let i = 0; i < 100; i++) pcm.render(output);
  assert.ok(output.every(c => c.every(v => v === 0)));
  pcm.push(new Float32Array([1, 1, 0, 0, -1, -1]), 24000); pcm.render(output);
  assert.deepEqual([...output[0].slice(0, 4)], [1, .5, 0, -.5]);
});
test('capture recovers from Spotify restarts and output changes, and stops for a remote device', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'] });
  let present = false, signature = '', starts = 0, sameMac = true;
  const native = { start() { if (!present) throw new Error('Open Spotify Desktop'); starts++; return 48000; }, stop() {}, signature: () => signature, read: () => new Float32Array(0) };
  const capture = new SpotifyCapture({ send() {}, sameMac: () => sameMac, loadNative: () => native, platform: 'darwin' });
  try {
    capture.start(); assert.equal(capture.state.status, 'unavailable');
    present = true; signature = 'spotify1:output1'; t.mock.timers.tick(2000); assert.equal(starts, 1);
    signature = 'spotify2:output1'; t.mock.timers.tick(2000); assert.equal(starts, 2);
    signature = 'spotify2:output2'; t.mock.timers.tick(2000); assert.equal(starts, 3);
    sameMac = false; t.mock.timers.tick(2000); assert.equal(capture.timer, null); assert.equal(capture.state.status, 'unavailable');
  } finally { capture.stop(); }
});
test('denied permission stays actionable; unsupported platforms never load a tap', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const capture = new SpotifyCapture({ send() {}, sameMac: () => true, platform: 'darwin', loadNative: () => ({ start() { throw new Error('Allow Music in System Settings > Privacy & Security'); }, stop() {}, signature: () => '' }) });
  capture.start(); assert.match(capture.state.message, /System Settings/); capture.stop();
  const unsupported = new SpotifyCapture({ send() {}, sameMac: () => true, platform: 'linux', loadNative() { assert.fail('must not load'); } });
  assert.throws(() => unsupported.start(), /macOS 14.2/);
});
