import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesForBuild, readBuildNotes, formatBuildNotes, releaseTitle } from './scripts/build-notes.mjs';

test('preview notes are authored for the selected branch only', async () => {
  const notes = await readBuildNotes({ channel: 'preview', branch: 'jose/3d-space' });
  assert.match(notes.title, /3D/);
  assert.match(notes.tryIt, /Chronocity/);
  assert.equal(await readBuildNotes({ channel: 'stable', branch: 'jose/3d-space' }), undefined);
  assert.equal(await readBuildNotes({ channel: 'preview', branch: 'jose/spotify-experiment' }), undefined);
  assert.equal(await readBuildNotes({ channel: 'preview', branch: 'toString' }), undefined);
  assert.throws(() => notesForBuild({ channel: 'preview', branch: 'broken' }, { broken: { title: 'Incomplete' } }), /instructions/);
});

test('download descriptions include features, instructions and source identity', async () => {
  const notes = await readBuildNotes({ channel: 'preview', branch: 'jose/3d-space' });
  const markdown = formatBuildNotes(notes);
  for (const highlight of notes.highlights) assert.ok(markdown.includes(`- ${highlight}`));
  assert.ok(markdown.includes(notes.tryIt));
  assert.equal(formatBuildNotes(undefined), '');
  const build = { channel: 'preview', branch: 'jose/3d-space', commit: '1234567890', notes };
  assert.equal(releaseTitle(build), `Music Preview · jose/3d-space · ${notes.title} · 1234567`);
  assert.equal(releaseTitle({ ...build, notes: undefined }), 'Music Preview · jose/3d-space · 1234567');
  assert.equal(releaseTitle({ ...build, channel: 'stable', tag: 'v1.0.0' }), 'Music v1.0.0');
});
