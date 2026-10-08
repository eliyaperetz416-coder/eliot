import test from 'node:test';
import assert from 'node:assert/strict';
import { consistencyBonus, BONUS } from '../src/core/consistency.mjs';
import { overallRating } from '../src/core/ranks.mjs';

const DAY = 86400000;
const now = new Date(2026, 9, 8, 18, 0).getTime();
const at = (daysAgo) => ({ endedMs: now - daysAgo * DAY });

test('no workouts, no bonus', () => {
  assert.equal(consistencyBonus([], now).total, 0);
});

test('one point per training day in the last 4 weeks, capped', () => {
  assert.equal(consistencyBonus([at(1), at(1), at(3)], now).dayPoints, 2); // two on the same day count once
  assert.equal(consistencyBonus([at(30)], now).dayPoints, 0);              // too old
  const many = Array.from({ length: 20 }, (_, i) => at(i));
  assert.equal(consistencyBonus(many, now).dayPoints, BONUS.DAY_POINTS_CAP);
});

test('streak weeks add points; a gap over 3 days breaks it', () => {
  const steady = Array.from({ length: 8 }, (_, i) => at(i * 2)); // every 2 days for 15 days
  assert.equal(consistencyBonus(steady, now).streakWeeks, 2);
  assert.equal(consistencyBonus(steady, now).streakPoints, 4);
  assert.equal(consistencyBonus([at(0), at(5), at(7)], now).streakWeeks, 0); // broken by the 5-day gap
  assert.equal(consistencyBonus(steady.map((w) => ({ endedMs: w.endedMs - 5 * DAY })), now).streakWeeks, 0); // last workout 5+ days ago
});

test('the total never passes one division', () => {
  const daily = Array.from({ length: 120 }, (_, i) => at(i));
  assert.equal(consistencyBonus(daily, now).total, BONUS.MAX);
});

test('overall rating adds the bonus on top of strength, never while pending', () => {
  const byId = { a: { muscleGroup: 'chest' }, b: { muscleGroup: 'back' }, c: { muscleGroup: 'quads' } };
  const base = overallRating({ a: 400, b: 400, c: 400 }, byId);
  const plus = overallRating({ a: 400, b: 400, c: 400 }, byId, 12);
  assert.equal(plus.rating, base.rating + 12);
  assert.equal(plus.strength, base.rating);
  assert.equal(plus.bonus, 12);
  const pending = overallRating({ a: 400 }, byId, 12);
  assert.equal(pending.pending, true);
  assert.equal(pending.rating, 0);
});
