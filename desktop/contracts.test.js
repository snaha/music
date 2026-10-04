import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHistoryRequest, validateDesktopRequest } from '../shared/contracts.js';
test('versioned history boundary rejects malformed snapshots and supports legacy batches', () => {
  const context = { id: 'context', queue: [{ id: 'local:track:1', rawId: '1', source: 'local', title: 'Song', cover: '', available: true }], order: 'normal', permutation: [] };
  const batch = { scope: 'desktop:admin', contexts: [context], entries: [{ id: 'play', contextId: 'context', index: 0, cursor: 0, playedAt: 1000 }] };
  assert.equal(validateHistoryRequest('write', batch), batch);
  assert.doesNotThrow(() => validateHistoryRequest('write', { ...batch, version: 1 }));
  assert.throws(() => validateHistoryRequest('write', { ...batch, version: 2 }), /version/);
  assert.throws(() => validateHistoryRequest('write', { ...batch, contexts: [{ ...context, queue: [{}] }] }), /batch/);
  assert.throws(() => validateHistoryRequest('list', { scope: batch.scope, offset: -1 }), /query/);
  assert.throws(() => validateHistoryRequest('clear', { scope: '' }), /scope/);
});
test('desktop command boundary accepts valid setup and rejects invalid profile/folder options', () => {
  assert.doesNotThrow(() => validateDesktopRequest('start', [{ source: 'folder', musicFolders: ['/Music', '/Archive'] }]));
  assert.throws(() => validateDesktopRequest('start', [{ musicFolders: [123] }]));
  assert.throws(() => validateDesktopRequest('switch-profile', ['invalid']));
  assert.throws(() => validateDesktopRequest('change-folder', ['erase', '/Music']));
  assert.throws(() => validateDesktopRequest('set-frame', ['yes']));
});
