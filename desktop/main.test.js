import test from 'node:test';
import assert from 'node:assert/strict';
import { mainHarness, until } from './tests/main-harness.mjs';

for (const migrationError of [undefined, new Error('fixture import unavailable')]) {
  test(`main shows a window before ${migrationError ? 'failed' : 'successful'} storage import and remains usable`, async () => {
    const { state, dispose } = await mainHarness({ migrationError });
    try {
      assert.deepEqual(state.trace.at(-1), ['migrate', true], 'a visible window exists while import is pending');
      assert.equal(state.windows[0].url, 'app://music/__music_starting');
      state.finishMigration();
      await until(() => state.windows[0].url === 'app://music/', 'Library document did not load after migration');
      const { value: status } = await state.invoke('status');
      assert.equal(status.phase, 'setup');
      assert.equal(Boolean(status.warning), Boolean(migrationError));
      assert.equal(state.fatal, undefined);
      assert.equal(state.stopped, undefined);
      const { value } = await state.invoke('start', { source: 'empty' });
      assert.equal(value.phase, 'ready', 'an import error must not prevent local library startup');
    } finally { await dispose(); }
  });
}

test('main retry after a server exit closes the prior HTTP server and database before reusing saved ports', async () => {
  const { state, dispose } = await mainHarness();
  try {
    state.finishMigration();
    const { value: initial } = await state.invoke('start', { source: 'empty' });
    assert.equal(initial.phase, 'ready');
    assert.equal((await fetch(`http://127.0.0.1:${initial.share.webPort}`)).status, 200);
    const child = state.children[0];
    child.exitCode = 1;
    child.emit('exit', 1, null);
    assert.equal((await state.invoke('status')).value.phase, 'error');
    const { value: retry } = await state.invoke('start');
    assert.equal(retry.phase, 'ready');
    assert.equal(retry.share.webPort, initial.share.webPort, 'old frontend server must not force a new share port');
    assert.equal(retry.share.port, initial.share.port);
    assert.equal(state.databases[0].closed, true);
    assert.equal(state.databases[1].closed, undefined);
    const history = state.handlers.get('music-history:list');
    assert.deepEqual(await history(state.event(), { scope: 'desktop:admin' }), { databaseId: 1 }, 'history IPC belongs to the replacement worker');
    const write = state.handlers.get('music-history:write');
    // The mocked worker accepts contents here; contracts/store tests establish
    // full rejection there. Main must only validate this request's envelope.
    assert.deepEqual(await write(state.event(), { scope: 'desktop:admin', contexts: [{}], entries: [{}] }), { databaseId: 1 }, 'snapshot validation belongs to the worker, not the UI thread');
    assert.equal((await fetch(`http://127.0.0.1:${retry.share.webPort}`)).status, 200);
  } finally { await dispose(); }
});

test('main cleans up a partially completed start and trusted IPC rejects subframes', async () => {
  const { state, dispose } = await mainHarness();
  try {
    state.finishMigration();
    state.saveError = new Error('fixture profile write failure');
    const failed = await state.invoke('start', { source: 'empty' });
    assert.match(failed.error, /profile write failure/);
    assert.equal(state.databases[0].closed, true);
    assert.equal(state.children[0].exitCode, 0);
    const saved = (await state.invoke('status')).value.share;
    await assert.rejects(fetch(`http://127.0.0.1:${saved.webPort}`), /fetch failed/);
    const { value: ready } = await state.invoke('start');
    assert.equal(ready.phase, 'ready');
    assert.equal(ready.share.webPort, saved.webPort);
    const status = state.handlers.get('desktop:status');
    assert.equal((await status(state.event('app://music/?view=queue#history'))).value.phase, 'ready');
    await assert.rejects(status(state.event('https://music/')), /only in Music/);
    const subframe = state.event();
    subframe.senderFrame = { url: 'app://music/' };
    await assert.rejects(status(subframe), /only in Music/);
  } finally { await dispose(); }
});
