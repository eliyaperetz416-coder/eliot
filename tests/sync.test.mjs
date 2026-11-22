import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSync, tooBig, MAX_SYNC_BYTES, SYNC_DEBOUNCE_MS } from '../src/core/sync.mjs';

const W = { workouts: [{ id: 'w1', startedMs: 1 }], profile: { name: 'A' } };
const EMPTY = { workouts: [], profile: null };
const remote = (updatedAt) => ({ data: W, updatedAt });

test('constants', () => { assert.equal(MAX_SYNC_BYTES, 8_000_000); assert.equal(SYNC_DEBOUNCE_MS, 3000); });

test('1: no remote row -> push when there is something local, else none', () => {
  assert.deepEqual(decideSync({ local: W, remote: null, meta: { dirtyAt: null, syncedRemoteAt: null } }), { action: 'push' });
  assert.deepEqual(decideSync({ local: { workouts: [], profile: { name: 'A' } }, remote: null, meta: { dirtyAt: null, syncedRemoteAt: null } }), { action: 'push' });
  assert.deepEqual(decideSync({ local: EMPTY, remote: null, meta: { dirtyAt: null, syncedRemoteAt: null } }), { action: 'none' });
});

test('2: first sign-in on this phone -> merge when local has workouts, else pull', () => {
  assert.deepEqual(decideSync({ local: W, remote: remote(50), meta: { dirtyAt: null, syncedRemoteAt: null } }), { action: 'merge' });
  assert.deepEqual(decideSync({ local: EMPTY, remote: remote(50), meta: { dirtyAt: 10, syncedRemoteAt: null } }), { action: 'pull' });
});

test('3: remote is newer and nothing changed here -> pull', () => {
  assert.deepEqual(decideSync({ local: W, remote: remote(200), meta: { dirtyAt: null, syncedRemoteAt: 100 } }), { action: 'pull' });
});

test('4: both changed -> the last change wins', () => {
  assert.deepEqual(decideSync({ local: W, remote: remote(200), meta: { dirtyAt: 300, syncedRemoteAt: 100 } }), { action: 'push' });
  assert.deepEqual(decideSync({ local: W, remote: remote(200), meta: { dirtyAt: 150, syncedRemoteAt: 100 } }), { action: 'pull' });
});

test('5: only this phone changed -> push', () => {
  assert.deepEqual(decideSync({ local: W, remote: remote(100), meta: { dirtyAt: 120, syncedRemoteAt: 100 } }), { action: 'push' });
});

test('6: nothing changed anywhere -> none', () => {
  assert.deepEqual(decideSync({ local: W, remote: remote(100), meta: { dirtyAt: null, syncedRemoteAt: 100 } }), { action: 'none' });
});

test('tooBig counts UTF-8 bytes', () => {
  assert.equal(tooBig('x'.repeat(8_000_001)), true);
  assert.equal(tooBig('{}'), false);
  assert.equal(tooBig('א'.repeat(4_000_001)), true); // 2 bytes each
});
