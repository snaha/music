import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrap } from './fixture.mjs';

test('synthetic desktop bridge matches the ready profile contract and disposes listeners', async t => {
  const previous = { window: globalThis.window, location: globalThis.location, localStorage: globalThis.localStorage };
  const storage = new Map();
  globalThis.window = {};
  globalThis.location = { origin: 'http://127.0.0.1:4178' };
  globalThis.localStorage = { clear: () => storage.clear(), setItem: (key, value) => storage.set(key, value) };
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  bootstrap();
  const desktop = window.desktop;
  for (const method of ['status', 'onChange', 'profiles', 'chooseFolder', 'start', 'finishSetup', 'setFrame', 'changeFolder', 'switchProfile', 'showData', 'restart', 'lanIp']) {
    assert.equal(typeof desktop[method], 'function', `desktop.${method} is available to the real frontend`);
  }
  const status = await desktop.status();
  assert.equal(status.phase, 'ready');
  assert.equal(status.onboarding, false);
  assert.equal(status.url, location.origin);
  assert.deepEqual(status.musicFolders, [status.defaultMusicFolder]);
  assert.equal(status.musicFolder, status.musicFolders[0]);
  assert.ok(status.profile.name && status.profile.directory && status.build.version);
  status.musicFolders.push('/must-not-mutate-fixture');
  assert.deepEqual((await desktop.status()).musicFolders, ['/synthetic/Music']);

  const updates = [];
  const dispose = desktop.onChange(value => updates.push(value));
  await desktop.setFrame(false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].frame, false);
  dispose();
  await desktop.setFrame(true);
  assert.equal(updates.length, 1, 'removed listener is not called again');
  assert.equal((await desktop.status()).frame, true);
  assert.deepEqual(await desktop.profiles(), []);
  await desktop.changeFolder('add');
  assert.deepEqual(window.__auditDesktopCommands.at(-1), ['changeFolder', 'add']);
});
