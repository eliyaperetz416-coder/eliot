import test from 'node:test';
import assert from 'node:assert/strict';
import { xpToNext, levelFromXp, xpForLevel, isValidWorkout, workoutRewards, workingSetsOf, XP_SET_CAP } from '../src/core/game.mjs';
import { playSession, newGame, THREE, DAY, HOUR } from './helpers.mjs';
import { migrateGame } from '../src/core/gamestate.mjs';
import { newWorkout } from '../src/core/workout.mjs';

const T0 = new Date(2026, 5, 3, 10, 0).getTime();

test('level curve: n -> n+1 costs 100 + 25(n-1)', () => {
  assert.deepEqual([1, 2, 3, 10].map(xpToNext), [100, 125, 150, 325]);
  assert.deepEqual(levelFromXp(0), { level: 1, into: 0, need: 100, progress: 0 });
  assert.equal(levelFromXp(99).level, 1); assert.equal(levelFromXp(100).level, 2);
  assert.equal(levelFromXp(224).level, 2); assert.equal(levelFromXp(225).level, 3);
  assert.equal(levelFromXp(225 + 149).level, 3); assert.equal(levelFromXp(225 + 150).level, 4);
  assert.equal(xpForLevel(4), 375);
  for (const lvl of [1, 2, 5, 20, 100]) { assert.equal(levelFromXp(xpForLevel(lvl)).level, lvl); assert.equal(levelFromXp(xpForLevel(lvl) - 1).level, Math.max(1, lvl - 1)); }
  assert.equal(levelFromXp(-50).level, 1);
  assert.ok(Math.abs(levelFromXp(150).progress - 0.4) < 1e-9);
});

test('valid workout: at least 3 done working sets; warm-ups and undone sets do not count', () => {
  const mk = (n, type = 'normal', done = true) => { const w = newWorkout(); w.entries = [{ id: 'e', exerciseId: 'x', sets: Array.from({ length: n }, (_, i) => ({ idx: i, type, done })) }]; return w; };
  assert.equal(isValidWorkout(mk(2)), false); assert.equal(isValidWorkout(mk(3)), true);
  assert.equal(isValidWorkout(mk(5, 'warmup')), false); assert.equal(isValidWorkout(mk(5, 'normal', false)), false);
  assert.equal(workingSetsOf(mk(3, 'drop')), 3, 'drop sets count');
});

test('rewards: 10 XP per set (capped at 40 sets), +25 per PR, +50 for finishing; drachmas 20 + 3/set (part capped at 60) + 15/PR', () => {
  const w = (sets, prs) => { const x = newWorkout(); x.entries = [{ id: 'e', exerciseId: 'x', sets: Array.from({ length: sets }, (_, i) => ({ idx: i, type: 'normal', done: true, prWeekly: i < prs })) }]; return x; };
  assert.deepEqual([workoutRewards(w(3, 0)).xp, workoutRewards(w(3, 0)).drachmas], [10 * 3 + 50, 20 + 9]);
  assert.deepEqual([workoutRewards(w(10, 2)).xp, workoutRewards(w(10, 2)).drachmas], [100 + 50 + 50, 20 + 30 + 30]);
  const big = workoutRewards(w(60, 0));
  assert.equal(big.xp, 10 * XP_SET_CAP + 50, 'XP set cap'); assert.equal(big.drachmas, 20 + 60, 'drachma set part capped at 60');
  assert.equal(workoutRewards(w(20, 0)).drachmas, 20 + 60);
  assert.equal(workoutRewards(w(19, 0)).drachmas, 20 + 57);
  const first = w(3, 0); first.entries[0].sets[0].prFirst = true;
  assert.equal(workoutRewards(first).prs, 0, 'a first record is not a PR');
});

test('posting a valid workout pays XP and drachmas and stores the rewards on the workout', () => {
  const r = playSession(THREE, [], newGame(), T0);
  assert.equal(r.rewards.valid, true); assert.equal(r.rewards.rewarded, true);
  const base = 10 * 3 + 25 * 0 + 50; // first sets are "first record", only later beats are PRs
  assert.equal(r.rewards.xp >= base, true);
  assert.equal(r.game.xp, r.rewards.xp);
  assert.equal(r.game.drachmas, r.rewards.drachmas + r.rewards.achievementDrachmas);
  assert.equal(r.workout.rewards, r.rewards);
  assert.equal(r.rewards.streak, 1); assert.equal(r.game.streak.current, 1);
});

test('an invalid workout (fewer than 3 sets) gives nothing: no XP, drachmas, streak or shake use', () => {
  let g = newGame(); g.inventory.shakeActive = true;
  const r = playSession([['bench', 100, 5], ['bench', 100, 5]], [], g, T0);
  assert.deepEqual([r.rewards.valid, r.rewards.rewarded, r.rewards.xp, r.rewards.drachmas], [false, false, 0, 0]);
  assert.equal(r.game.xp, 0); assert.equal(r.game.streak.current, 0); assert.equal(r.game.inventory.shakeActive, true, 'the shake waits for a rewarded workout');
});

test('at most 2 rewarded workouts per calendar day; the 3rd is valid but gives nothing', () => {
  let s = playSession(THREE, [], newGame(), T0);
  s = playSession(THREE, s.workouts, s.game, T0 + 2 * HOUR);
  assert.equal(s.rewards.rewarded, true);
  const third = playSession(THREE, s.workouts, s.game, T0 + 4 * HOUR);
  assert.deepEqual([third.rewards.valid, third.rewards.rewarded, third.rewards.limitReached, third.rewards.xp], [true, false, true, 0]);
  assert.equal(third.game.xp, s.game.xp);
  const nextDay = playSession(THREE, third.workouts, third.game, T0 + DAY);
  assert.equal(nextDay.rewards.rewarded, true, 'the counter resets on the next calendar day');
});

test('XP Shake doubles the next rewarded workout only, then is used up', () => {
  const plain = playSession(THREE, [], newGame(), T0);
  const g = newGame(); g.inventory.shakeActive = true;
  const shaken = playSession(THREE, [], g, T0);
  assert.equal(shaken.rewards.shake, true); assert.equal(shaken.rewards.xp, plain.rewards.xp * 2); assert.equal(shaken.rewards.xpBase, plain.rewards.xpBase);
  assert.equal(shaken.game.inventory.shakeActive, false);
  const next = playSession(THREE, shaken.workouts, shaken.game, T0 + DAY);
  assert.equal(next.rewards.shake, false);
});

test('migrateGame fills missing fields', () => {
  const g = migrateGame({ xp: 50, inventory: { super: 2 } });
  assert.equal(g.xp, 50); assert.equal(g.inventory.super, 2); assert.deepEqual(g.inventory.equipped, { background: null, frame: null, effect: null, theme: null, title: null, sound: null }); assert.equal(g.inventory.dboost, 0); assert.equal(g.inventory.boostActive, false);
  assert.deepEqual(migrateGame(null), newGame());
});

test('Drachma Boost doubles the workout drachmas (not the milestones) once, then is used up', () => {
  const plain = playSession(THREE, [], newGame(), T0);
  const g = newGame(); g.inventory.boostActive = true;
  const boosted = playSession(THREE, [], g, T0);
  assert.equal(boosted.rewards.boost, true);
  assert.equal(boosted.rewards.drachmasBase, plain.rewards.drachmasBase);
  assert.equal(boosted.rewards.drachmas - boosted.rewards.milestones.reduce((n, m) => n + m.drachmas, 0), plain.rewards.drachmasBase * 2);
  assert.equal(boosted.game.inventory.boostActive, false);
  assert.equal(boosted.rewards.xp, plain.rewards.xp, 'xp is not affected');
  assert.equal(playSession(THREE, boosted.workouts, boosted.game, T0 + DAY).rewards.boost, false);
});
