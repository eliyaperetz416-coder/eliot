import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPARISONS, compareVolume } from '../src/core/compare.mjs';

test('comparisons are in increasing order with unique ids', () => {
  for (let i = 1; i < COMPARISONS.length; i++) assert.ok(COMPARISONS[i].kg > COMPARISONS[i - 1].kg);
  assert.equal(new Set(COMPARISONS.map((c) => c.id)).size, COMPARISONS.length);
});

test('volume to comparison: the biggest one reached, the ratio and what is next', () => {
  assert.equal(compareVolume(3), null);
  assert.equal(compareVolume(null), null);
  const e = compareVolume(5000);
  assert.deepEqual([e.item.id, e.ratio, e.next.id, e.remaining], ['elephant', 1, 'trex', 3000]);
  const m = compareVolume(7400);
  assert.deepEqual([m.item.id, m.ratio, m.remaining], ['elephant', 1.5, 600]);
  assert.equal(compareVolume(4999).item.id, 'rhino');
  const last = compareVolume(900000);
  assert.deepEqual([last.item.id, last.ratio, last.next, last.remaining], ['bluewhale', 6, null, 0]);
});
