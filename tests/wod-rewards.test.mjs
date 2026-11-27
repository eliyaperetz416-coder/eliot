// Elia 27.11: a WOD result should earn XP and drachmas like any workout, and use an active XP Shake / Drachma Boost.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isValidWorkout, workoutRewards, XP_WORKOUT, WOD_XP, DRACHMA_WORKOUT, WOD_DRACHMAS, XP_PER_PR, DRACHMA_PER_PR } from '../src/core/game.mjs';
import { applyPost } from '../src/core/gamestate.mjs';
import { buildWodWorkout } from '../src/core/wods.mjs';
import { byId, newGame } from './helpers.mjs';

const wods = Object.fromEntries(JSON.parse(readFileSync('src/data/wods.json', 'utf8')).wods.map((w) => [w.id, w]));
const T0 = Date.UTC(2026, 10, 27, 9);
const cindy = (id, pr = false, t = T0) => { const w = buildWodWorkout({ id, wod: wods.cindy, division: 'rx', score: { type: 'rounds', rounds: 17, reps: 0 }, startedMs: t, endedMs: t + 20 * 60000 }); w.wod.pr = pr; return w; };

test('a WOD result is a valid workout with its own base rewards (+ a PR bonus)', () => {
  assert.equal(isValidWorkout(cindy('a')), true);
  const r = workoutRewards(cindy('a'));
  assert.equal(r.xp, XP_WORKOUT + WOD_XP);
  assert.equal(r.drachmas, DRACHMA_WORKOUT + WOD_DRACHMAS);
  const p = workoutRewards(cindy('b', true));
  assert.equal(p.xp, XP_WORKOUT + WOD_XP + XP_PER_PR);
  assert.equal(p.drachmas, DRACHMA_WORKOUT + WOD_DRACHMAS + DRACHMA_PER_PR);
});

test('posting a WOD uses the active XP Shake and Drachma Boost and counts for the streak', () => {
  const game = newGame();
  game.inventory.shakeActive = true; game.inventory.boostActive = true;
  const w = cindy('c');
  const { game: g, rewards } = applyPost({ game, workout: w, workouts: [w], byId, now: T0 + 21 * 60000 });
  assert.equal(rewards.rewarded, true);
  assert.equal(rewards.shake, true);
  assert.equal(rewards.xp, 2 * (XP_WORKOUT + WOD_XP));
  assert.equal(rewards.drachmas >= 2 * (DRACHMA_WORKOUT + WOD_DRACHMAS), true);
  assert.equal(g.inventory.shakeActive, false);
  assert.equal(g.inventory.boostActive, false);
  assert.equal(rewards.streak >= 1, true);
});
