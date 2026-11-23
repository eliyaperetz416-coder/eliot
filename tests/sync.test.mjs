import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSync, tooBig, hasLocalData, snapshotHash, stableStringify, MAX_SYNC_BYTES, SYNC_DEBOUNCE_MS } from '../src/core/sync.mjs';

const D = (o) => decideSync({ remoteVersion: null, syncedVersion: null, localDirty: false, localHasData: false, ...o });

test('constants: the app stays under the server limit (8 MB of jsonb text)', () => {
  assert.equal(MAX_SYNC_BYTES, 7_000_000);
  assert.equal(SYNC_DEBOUNCE_MS, 3000);
});

test('1: no row on the server -> push when this phone has anything, else none', () => {
  assert.equal(D({ localHasData: true }), 'push');
  assert.equal(D({}), 'none');
});

test('2: first sync on this phone -> merge when it has anything (nothing is ever replaced), else pull', () => {
  assert.equal(D({ remoteVersion: 4, localHasData: true }), 'merge');
  assert.equal(D({ remoteVersion: 4 }), 'pull');
});

test('3: another phone wrote since -> pull when nothing changed here, merge when both changed (never push a stale copy)', () => {
  assert.equal(D({ remoteVersion: 5, syncedVersion: 4, localHasData: true }), 'pull');
  assert.equal(D({ remoteVersion: 5, syncedVersion: 4, localDirty: true, localHasData: true }), 'merge');
});

test('4: only this phone changed -> push; nothing changed -> none', () => {
  assert.equal(D({ remoteVersion: 4, syncedVersion: 4, localDirty: true, localHasData: true }), 'push');
  assert.equal(D({ remoteVersion: 4, syncedVersion: 4, localHasData: true }), 'none');
});

test('local data counts routines, plans, custom exercises and body weight, not only workouts', () => {
  assert.equal(hasLocalData({ workouts: [], routines: [{ id: 'r' }] }), true);
  assert.equal(hasLocalData({ bodyweight: [{ dateKeyTime: 'k' }] }), true);
  assert.equal(hasLocalData({ profile: { name: 'A' } }), true);
  assert.equal(hasLocalData({ workouts: [], routines: [], plans: [], custom: [], folders: [], bodyweight: [], profile: null, game: null }), false);
});

test('the snapshot hash ignores key order (jsonb re-sorts keys) but not content', () => {
  const a = { profile: { name: 'A', sex: 'm' }, workouts: [{ id: 'w', startedMs: 1 }], crew: null };
  const b = { crew: null, workouts: [{ startedMs: 1, id: 'w' }], profile: { sex: 'm', name: 'A' } };
  assert.equal(snapshotHash(a), snapshotHash(b));
  assert.notEqual(snapshotHash(a), snapshotHash({ ...a, workouts: [] }));
  assert.equal(stableStringify({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
});

test('tooBig counts UTF-8 bytes', () => {
  assert.equal(tooBig('x'.repeat(7_000_001)), true);
  assert.equal(tooBig('{}'), false);
  assert.equal(tooBig('א'.repeat(3_500_001)), true);
});
