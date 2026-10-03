import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeMusicFolders, prepareMusicRoot, profileMusicFolders } from './music-folders.js';

const fixture = t => {
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'music-folders-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const data = path.join(root, 'profile'), music = path.join(root, 'Music'), archive = path.join(root, 'Archive');
  for (const folder of [data, music, archive]) mkdirSync(folder);
  return { root, data, music, archive };
};

test('legacy single-folder profiles retain their folder', () => {
  assert.deepEqual(profileMusicFolders({ musicFolder: '/music' }), ['/music']);
  assert.deepEqual(profileMusicFolders({ musicFolder: '/music', musicFolders: [] }), []);
});
test('canonicalize and deduplicate nested folders and aliases', t => {
  const { root, data, music, archive } = fixture(t);
  const album = path.join(music, 'Album'), alias = path.join(root, 'alias');
  mkdirSync(album); symlinkSync(music, alias);
  assert.deepEqual(normalizeMusicFolders([album, music, alias, archive, archive], data), [music, archive]);
  assert.throws(() => normalizeMusicFolders([], data), /at least one/);
  assert.throws(() => normalizeMusicFolders(['relative'], data), /available music folder/);
  assert.throws(() => normalizeMusicFolders([path.join(root, 'missing')], data), /Cannot read/);
  assert.throws(() => normalizeMusicFolders([root], data), /outside Music/);
  assert.throws(() => normalizeMusicFolders([data], data), /outside Music/);
});
test('combined folders link in place with stable names and never modify audio', t => {
  const { data, music, archive } = fixture(t);
  const song = path.join(archive, 'song.mp3');
  writeFileSync(song, 'original audio');
  assert.equal(prepareMusicRoot(data, [music]), music);
  const combined = prepareMusicRoot(data, [music, archive]);
  const names = readdirSync(combined);
  assert.deepEqual(new Set(names.map(name => readlinkSync(path.join(combined, name)))), new Set([music, archive]));
  assert.equal(prepareMusicRoot(data, [archive, music]), combined);
  assert.deepEqual(readdirSync(combined), names);
  assert.equal(prepareMusicRoot(data, [archive], true), combined);
  assert.equal(readdirSync(combined).length, 1);
  assert.equal(readFileSync(song, 'utf8'), 'original audio');
  writeFileSync(path.join(combined, 'unexpected.mp3'), 'keep me');
  assert.throws(() => prepareMusicRoot(data, [archive], true), /unexpected file/);
  assert.equal(readFileSync(path.join(combined, 'unexpected.mp3'), 'utf8'), 'keep me');
});
