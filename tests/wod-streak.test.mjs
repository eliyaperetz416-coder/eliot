// Elia 28.11: "after a WOD the streak still resets". A WOD extends the streak like a regular workout, and WOD days saved before
// v1.50.4 (when a WOD did not count) are put back into the streak from the history.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyPost, healStreak, historyStreak, newGame } from '../src/core/gamestate.mjs';
import { view, addDays } from '../src/core/streak.mjs';
import { buildWodWorkout } from '../src/core/wods.mjs';
import { dateKey } from '../src/core/workout.mjs';
import { byId } from './helpers.mjs';

const wods = Object.fromEntries(JSON.parse(readFileSync('src/data/wods.json', 'utf8')).wods.map((w) => [w.id, w]));
const DAY = 86400000, T0 = new Date(2026, 10, 1, 9).getTime();
const wod = (i, t = T0 + i * DAY) => buildWodWorkout({ id: `w${i}`, wod: wods.cindy, division: 'rx', score: { type: 'rounds', rounds: 15, reps: 0 }, startedMs: t, endedMs: t + 20 * 60000 });
const lift = (i, t = T0 + i * DAY) => ({ id: `l${i}`, dateKey: dateKey(t), startedMs: t, endedMs: t + 3600000, entries: [{ exerciseId: 'x', sets: [1, 2, 3].map((n) => ({ idx: n, type: 'normal', done: true, weight: 50, reps: 8 })) }] });

test('WOD results on following days extend the streak and it stays alive between them', () => {
  let g = newGame(); const all = [];
  for (const i of [0, 1, 3, 6]) { const w = wod(i); all.push(w); g = applyPost({ game: g, workout: w, workouts: all, byId, now: w.endedMs }).game; }
  assert.equal(g.streak.current, 4);
  assert.equal(view(g.streak, dateKey(T0 + 8 * DAY)).current, 4, 'a 2-day gap keeps it');
});

test('a mix of regular workouts and WODs is one streak', () => {
  let g = newGame(); const all = [];
  for (const [i, mk] of [[0, lift], [1, wod], [2, lift], [4, wod]]) { const w = mk(i); all.push(w); g = applyPost({ game: g, workout: w, workouts: all, byId, now: w.endedMs }).game; }
  assert.equal(g.streak.current, 4);
});

test('historyStreak counts training days with gaps of at most 3 days, WODs included, old WODs without a dateKey too', () => {
  const old = wod(2); delete old.dateKey;
  const list = [lift(0), lift(1), old, lift(5), wod(9), lift(10)];
  const h1 = historyStreak(list, dateKey(T0 + 10 * DAY));
  assert.equal(h1.current, 2); assert.equal(h1.lastWorkoutDate, dateKey(T0 + 10 * DAY)); assert.equal(h1.firstDate, dateKey(T0 + 9 * DAY));
  const h2 = historyStreak(list.slice(0, 4), dateKey(T0 + 5 * DAY));
  assert.equal(h2.current, 4); assert.equal(h2.firstDate, dateKey(T0));
  assert.equal(historyStreak([], '2026-11-01').current, 0);
});

test('healStreak puts back a streak that broke on WOD days (saved before WODs counted) and clears the break', () => {
  const today = dateKey(T0 + 8 * DAY);
  // the game only saw the regular workouts on days 0 and 6 (the WODs on days 2 and 4 were not counted): it broke and restarted at 1
  const g = { ...newGame(), streak: { current: 1, best: 3, lastWorkoutDate: dateKey(T0 + 6 * DAY), milestonesPaid: [], broken: { lostLength: 1, brokenOn: dateKey(T0 + 4 * DAY), expiresOn: addDays(dateKey(T0 + 4 * DAY), 6), milestonesPaid: [] } } };
  const healed = healStreak(g, [lift(0), wod(2), wod(4), lift(6)], today);
  assert.notEqual(healed, g);
  assert.equal(healed.streak.current, 4);
  assert.equal(healed.streak.best, 4);
  assert.equal(healed.streak.broken, null);
  assert.equal(healed.streak.lastWorkoutDate, dateKey(T0 + 6 * DAY));
});

test('healStreak never lowers a streak (a bought restore stays) and leaves an ended run alone', () => {
  const g = { ...newGame(), streak: { current: 20, best: 20, lastWorkoutDate: dateKey(T0 + 6 * DAY), milestonesPaid: [7], broken: null } };
  assert.equal(healStreak(g, [wod(5), lift(6)], dateKey(T0 + 7 * DAY)), g);
  const over = { ...newGame() };
  assert.equal(healStreak(over, [wod(0), wod(1)], dateKey(T0 + 9 * DAY)), over, 'the history run is over too');
});

test('healStreak keeps milestones paid before the break, so they are not paid twice', () => {
  const days = Array.from({ length: 9 }, (_, i) => (i === 4 ? wod(i) : lift(i)));
  const g = { ...newGame(), streak: { current: 4, best: 4, lastWorkoutDate: dateKey(T0 + 8 * DAY), milestonesPaid: [], broken: { lostLength: 4, brokenOn: dateKey(T0 + 7 * DAY), expiresOn: dateKey(T0 + 20 * DAY), milestonesPaid: [7] } } };
  const healed = healStreak(g, days, dateKey(T0 + 8 * DAY));
  assert.equal(healed.streak.current, 9);
  assert.deepEqual(healed.streak.milestonesPaid, [7]);
});

test('healStreak leaves the game alone when no WOD in the run was missed (results that already earned count as usual)', () => {
  const today = dateKey(T0 + 8 * DAY);
  const counted = wod(4); counted.rewards = { rewarded: true };
  const g = { ...newGame(), streak: { current: 1, best: 3, lastWorkoutDate: dateKey(T0 + 6 * DAY), milestonesPaid: [], broken: null } };
  assert.equal(healStreak(g, [lift(0), lift(2), counted, lift(6)], today), g);
});

test('a break the healed run does not span stays (the restore offer is kept)', () => {
  // lost 12 days ending on day 0; trained again on days 5 (an old WOD) and 6: the run is days 5-6, the break before it stays
  const g = { ...newGame(), streak: { current: 1, best: 12, lastWorkoutDate: dateKey(T0 + 6 * DAY), milestonesPaid: [], broken: { lostLength: 12, brokenOn: dateKey(T0 + 4 * DAY), expiresOn: dateKey(T0 + 10 * DAY), milestonesPaid: [7] } } };
  const healed = healStreak(g, [lift(0), wod(5), lift(6)], dateKey(T0 + 6 * DAY));
  assert.equal(healed.streak.current, 2);
  assert.equal(healed.streak.broken.lostLength, 12);
  assert.deepEqual(healed.streak.milestonesPaid, []);
});
