import test from 'node:test';
import assert from 'node:assert/strict';
import { startRest, remainingSec, isExpired, adjustRest, progress, formatClock, clampRest, defaultRestSec } from '../src/core/timer.mjs';

test('remaining time is computed from the end timestamp, so a long background gap is handled', () => {
  const t = startRest(1_000_000, 120);
  assert.equal(t.endAt, 1_120_000);
  assert.equal(remainingSec(t, 1_000_000), 120);
  assert.equal(remainingSec(t, 1_030_400), 90, 'rounds up partial seconds');
  assert.equal(remainingSec(t, 1_000_000 + 10 * 60_000), 0, 'phone locked for 10 minutes: expired, never negative');
  assert.equal(isExpired(t, 1_119_999), false); assert.equal(isExpired(t, 1_120_000), true);
  assert.equal(remainingSec(null, 5), 0); assert.equal(isExpired(null, 5), false);
});

test('adjust +/-15 s works on the remaining time and clamps', () => {
  const t = startRest(0, 90);
  const plus = adjustRest(t, 15, 30_000); // 60 s left -> 75 s
  assert.equal(remainingSec(plus, 30_000), 75);
  const minus = adjustRest(t, -15, 30_000);
  assert.equal(remainingSec(minus, 30_000), 45);
  assert.equal(remainingSec(adjustRest(t, -15, 85_000), 85_000), 0, 'cannot go below zero');
  assert.equal(adjustRest(null, 15, 0), null);
});

test('progress, clock format, default rests', () => {
  const t = startRest(0, 100);
  assert.equal(progress(t, 0), 0); assert.equal(progress(t, 50_000), 0.5); assert.equal(progress(t, 999_999), 1);
  assert.equal(formatClock(75), '1:15'); assert.equal(formatClock(5), '0:05');
  assert.equal(clampRest(5), 15); assert.equal(clampRest(9999), 600);
  assert.equal(defaultRestSec(undefined), 60);
});
