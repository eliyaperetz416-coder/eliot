import test from 'node:test';
import assert from 'node:assert/strict';
import { decideSync, tooBig, hasLocalData, snapshotHash, stableStringify, MAX_SYNC_BYTES, SYNC_DEBOUNCE_MS } from '../src/core/sync.mjs';

const D = (o) => decideSync({ remoteVersion: null, syncedVersion: null, localDirty: false, localHasData: false, ...o });

test('constants: the app stays under the server limit (1 MB of jsonb text)', () => {
  assert.equal(MAX_SYNC_BYTES, 800_000); // the server allows 1 MB of jsonb text (migration 020), which is wider than compact JSON
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
  assert.equal(tooBig('x'.repeat(800_001)), true);
  assert.equal(tooBig('x'.repeat(800_000)), false);
  assert.equal(tooBig('{}'), false);
  assert.equal(tooBig('א'.repeat(400_001)), true);
});

test('validData: what comes down from the account must look like our data before it replaces the phone (M-1)', async () => {
  const { validData } = await import('../src/core/backup.mjs');
  assert.equal(validData({ profile: { name: 'A' }, workouts: [{ id: 'w', startedMs: 1 }], routines: [], blobs: {} }), true);
  assert.equal(validData(null), false);
  assert.equal(validData('x'), false);
  assert.equal(validData([]), false);
  assert.equal(validData({ workouts: 'nope' }), false);
  assert.equal(validData({ workouts: [{ id: 5 }] }), false);
  assert.equal(validData({ blobs: [] }), false);
});

test('newerApp: an older app never writes over data from a newer one (M-2)', async () => {
  const { newerApp } = await import('../src/core/sync.mjs');
  assert.equal(newerApp('1.49.0', '1.48.2'), true);
  assert.equal(newerApp('1.48.10', '1.48.9'), true);
  assert.equal(newerApp('2.0', '1.99.99'), true);
  assert.equal(newerApp('1.48.2', '1.48.2'), false);
  assert.equal(newerApp('1.47.1', '1.48.0'), false);
  assert.equal(newerApp(null, '1.48.0'), false, 'unknown: not newer');
  assert.equal(newerApp('garbage', '1.48.0'), false);
});
