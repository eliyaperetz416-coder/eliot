import test from 'node:test';
import assert from 'node:assert/strict';
import { rankBonus, volumeBonus, balanceBonus, milestoneBonus, goalBonus, PARTS, MAIN_GROUPS, MAX_BONUS } from '../src/core/bonus.mjs';
import { BONUS } from '../src/core/consistency.mjs';

const DAY = 86400000;
const now = new Date(2026, 9, 14, 18, 0).getTime(); // a Wednesday
const w = (daysAgo, volume = 1000, groups = ['chest'], id = null) => ({ id: id ?? `w${daysAgo}-${volume}`, endedMs: now - daysAgo * DAY, stats: { volume }, entries: groups.map((g) => ({ exerciseId: `ex-${g}`, sets: [{ done: true, type: 'normal' }] })) });
const byId = Object.fromEntries(MAIN_GROUPS.map((g) => [`ex-${g}`, { id: `ex-${g}`, muscleGroup: g, ranked: true }]));

test('volume: 1 point per 2% more than your usual week, capped, zero without history', () => {
  assert.equal(volumeBonus([w(1, 1000)], now).points, 0, 'no earlier weeks to compare with');
  const base = [w(10, 1000), w(17, 1000), w(24, 1000), w(31, 1000)]; // average week = 1000
  assert.equal(volumeBonus([...base, w(1, 1100)], now).points, 5, '+10% = 5 points');
  assert.equal(volumeBonus([...base, w(1, 5000)], now).points, PARTS.VOLUME_MAX, 'capped');
  assert.equal(volumeBonus([...base, w(1, 800)], now).points, 0, 'less volume never subtracts');
});

test('balance: one point per main group trained this week, plus evenness once all ten are ranked', () => {
  const week = [w(1, 100, ['chest', 'back', 'quads']), w(10, 100, ['abs'])];
  assert.equal(balanceBonus(week, byId, {}, now).coverPoints, 3, 'old workouts do not count');
  const even = Object.fromEntries(MAIN_GROUPS.map((g) => [`ex-${g}`, 500]));
  assert.equal(balanceBonus(week, byId, even, now).balancePoints, PARTS.BALANCE_MAX);
  assert.equal(balanceBonus(week, byId, { ...even, 'ex-abs': 250 }, now).balancePoints, 3, 'weakest group at half of the strongest: about half the points');
  const missing = { ...even }; delete missing['ex-abs'];
  assert.equal(balanceBonus(week, byId, missing, now).balancePoints, 0, 'a group with no rating gives no balance points');
});

test('milestones are permanent steps at 25, 50, 100 and 200 workouts', () => {
  const many = (n) => Array.from({ length: n }, (_, i) => w(i + 40, 1, ['chest'], `m${i}`));
  assert.equal(milestoneBonus(many(24)).points, 0);
  assert.equal(milestoneBonus(many(25)).points, 3);
  assert.equal(milestoneBonus(many(99)).points, 6);
  assert.equal(milestoneBonus(many(100)).points, 10);
  assert.equal(milestoneBonus(many(250)).points, 15);
  assert.deepEqual(milestoneBonus(many(30)).next, { count: 50, pts: 6 });
});

test('weekly goal: 2 points for each of the last 5 Monday-to-Sunday weeks with enough training days', () => {
  const week = (monday, n) => Array.from({ length: n }, (_, i) => ({ id: `g${monday}-${i}`, endedMs: monday + i * DAY + 3600000 }));
  const monday = new Date(2026, 9, 12).getTime(); // the Monday of the current week
  const ws = [...week(monday, 3), ...week(monday - 7 * DAY, 3), ...week(monday - 14 * DAY, 2)];
  const r = goalBonus(ws, now, 3);
  assert.equal(r.weeks, 2); assert.equal(r.points, 4);
  assert.equal(goalBonus(ws, now, 2).weeks, 3);
  assert.equal(goalBonus([], now, 3).points, 0);
});

test('the total is the sum of the parts and never passes the maximum', () => {
  const r = rankBonus({ workouts: [], byId, ratings: {}, now });
  assert.equal(r.total, 0);
  assert.equal(MAX_BONUS, BONUS.MAX + 15 + 10 + 5 + 15 + 10);
  const daily = Array.from({ length: 250 }, (_, i) => w(i, 1000 + (i === 1 ? 9000 : 0), MAIN_GROUPS, `d${i}`));
  const even = Object.fromEntries(MAIN_GROUPS.map((g) => [`ex-${g}`, 500]));
  const full = rankBonus({ workouts: daily, byId, ratings: even, now, weeklyGoal: 3 });
  assert.ok(full.total <= MAX_BONUS);
  assert.equal(full.total, Object.values(full.parts).reduce((n, p) => n + p.points, 0));
  assert.equal(full.parts.milestones.points, 15);
});
