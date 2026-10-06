import test from 'node:test';
import assert from 'node:assert/strict';
import { PlaybackController, type PlaybackAdapter } from '../src/lib/playback-controller.ts';
import type { Source, Track } from '../src/lib/music.ts';

const track = (source: Source, id = '1'): Track => ({ id: `${source}:track:${id}`, rawId: id, source, title: id, cover: '', available: true });
function setup() {
  const events: string[] = [], sounding = new Set<Source>();
  const adapter = (source: Source): PlaybackAdapter => ({
    available: (t) => { if (!t.available) throw new Error('Unavailable'); },
    prepare: async () => { events.push(`prepare:${source}`); },
    start: async (t) => { assert.equal(sounding.size, 0, 'players never overlap'); sounding.add(source); events.push(`play:${t.id}`); },
    pause: async () => { sounding.delete(source); events.push(`pause:${source}`); },
    resume: async () => { sounding.add(source); }, seek: async () => {},
  });
  const adapters = { local: adapter('local') };
  return { controller: new PlaybackController(adapters), adapters, events, sounding };
}

test('successive local tracks stop outgoing audio before starting', async () => {
  const { controller, events } = setup();
  await controller.play(track('local')); await controller.play(track('local'));
  await controller.play(track('local', '2')); await controller.play(track('local', '2'));
  assert.deepEqual(events, ['prepare:local', 'play:local:track:1', 'pause:local', 'prepare:local', 'play:local:track:1',
    'pause:local', 'prepare:local', 'play:local:track:2', 'pause:local', 'prepare:local', 'play:local:track:2']);
});

test('rapid skips cancel queued work and stop an in-flight start before the next player', async () => {
  const { controller, adapters, events } = setup();
  let finish!: () => void;
  const original = adapters.local.start;
  adapters.local.start = async (t) => { await new Promise<void>((resolve) => { finish = resolve; }); await original(t); };
  const first = controller.play(track('local'));
  while (!finish) await new Promise((r) => setTimeout(r, 0));
  const skipped = controller.play(track('local', 'skip'));
  const last = controller.play(track('local', 'last'));
  adapters.local.start = original;
  finish(); await Promise.all([first, skipped, last]);
  assert.ok(!events.some((e) => e.includes('skip')));
  assert.equal(events.at(-1), 'play:local:track:last');
});

test('a failed outgoing pause cannot start the next source', async () => {
  const { controller, adapters, events } = setup();
  await controller.play(track('local'));
  adapters.local.pause = async () => { throw new Error('Network lost'); };
  await assert.rejects(controller.play(track('local', '2')), /Network lost/);
  assert.ok(!events.includes('play:local:track:2'));
});

test('unavailable tracks retain the current source and external release stops ownership', async () => {
  const { controller, sounding } = setup(); await controller.play(track('local'));
  await assert.rejects(controller.play({ ...track('local'), available: false }), /Unavailable/);
  assert.equal(controller.active, 'local'); assert.ok(sounding.has('local'), 'blocked handoff leaves current audio playing'); controller.release(); assert.equal(controller.active, undefined);
});


test('an unsupported saved source cannot replace local playback', async () => {
  const { controller, sounding, events } = setup();
  await controller.play(track('local'));
  const before = [...events];
  await assert.rejects(controller.play({ ...track('local'), source: 'unsupported' as Source }), /not supported/);
  assert.deepEqual(events, before);
  assert.ok(sounding.has('local'));
  assert.equal(controller.current?.id, 'local:track:1');
});
