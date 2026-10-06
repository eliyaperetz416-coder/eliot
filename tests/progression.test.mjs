import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestLoad, stepFor, bestE1RM, START_PCT } from '../src/core/progression.mjs';
import { byId } from './helpers.mjs';

const bench = byId['barbell-bench-press-medium-grip'], dbp = byId['dumbbell-bench-press'], mach = byId['machine-bench-press'], cable = byId['standing-biceps-cable-curl'];
const target = { sets: 3, repsMin: 8, repsMax: 12 };
const sess = (...sets) => sets.map(([weight, reps]) => ({ weight, reps }));

test('load steps: barbell 2.5, dumbbell 2 per hand, machine/cable 5', () => {
  assert.deepEqual([bench, dbp, mach, cable].map(stepFor), [2.5, 2, 5, 5]);
});

test('no data: "find your working weight"; with a known 1RM: goal percentage', () => {
  const r = suggestLoad({ ex: bench, target, history: [] });
  assert.deepEqual([r.action, r.weight], ['find', null]);
  const s = suggestLoad({ ex: bench, target, history: [], e1rm: 100, goal: 'strength' });
  assert.deepEqual([s.action, s.weight], ['start', 80]);
  assert.equal(suggestLoad({ ex: bench, target, history: [], e1rm: 100, goal: 'hypertrophy' }).weight, 70);
  assert.equal(suggestLoad({ ex: bench, target, history: [], e1rm: 100, goal: 'general' }).weight, 60);
  assert.equal(suggestLoad({ ex: dbp, target, history: [], e1rm: 50, goal: 'hypertrophy' }).weight, 36, 'rounded to the 2 kg dumbbell step');
  assert.ok(START_PCT.strength > START_PCT.hypertrophy && START_PCT.hypertrophy > START_PCT.general);
});

test('double progression: every set at the top of the range -> add the smallest load step, back to the bottom of the range', () => {
  const r = suggestLoad({ ex: bench, target, history: [sess([60, 12], [60, 12], [60, 12])] });
  assert.deepEqual([r.action, r.weight, r.reps], ['increase', 62.5, 8]);
  assert.equal(suggestLoad({ ex: dbp, target, history: [sess([20, 12], [20, 12], [20, 12])] }).weight, 22);
  assert.equal(suggestLoad({ ex: mach, target, history: [sess([60, 12], [60, 12], [60, 12])] }).weight, 65);
});

test('not at the top yet: hold the weight and aim one rep higher', () => {
  const r = suggestLoad({ ex: bench, target, history: [sess([60, 12], [60, 10], [60, 9])] });
  assert.deepEqual([r.action, r.weight, r.reps], ['hold', 60, 10]);
  assert.equal(suggestLoad({ ex: bench, target, history: [sess([60, 12], [60, 12])] }).action, 'hold', 'fewer sets than planned does not count as done');
});

test('missing the bottom of the range two sessions in a row: lighter by about 7.5%; once only: hold', () => {
  const miss = sess([80, 6], [80, 5], [80, 5]);
  assert.equal(suggestLoad({ ex: bench, target, history: [miss] }).action, 'hold');
  const r = suggestLoad({ ex: bench, target, history: [miss, sess([80, 7], [80, 6], [80, 6])] });
  assert.equal(r.action, 'decrease'); assert.ok(r.weight < 80 && r.weight >= 80 * 0.9 - 2.5, `lighter weight ${r.weight}`);
  assert.equal(r.weight % 2.5, 0);
  const ok = suggestLoad({ ex: bench, target, history: [sess([80, 9], [80, 8], [80, 8]), sess([80, 6], [80, 6], [80, 6])] });
  assert.equal(ok.action, 'hold', 'recovered last time, so no drop');
});

test('only the heaviest weight of the last session counts; empty sets are ignored; e1RM helper', () => {
  const r = suggestLoad({ ex: bench, target, history: [[{ weight: 40, reps: 12 }, { weight: 60, reps: 12 }, { weight: 60, reps: 12 }, { weight: 60, reps: 12 }, { weight: 60, reps: 0 }]] });
  assert.equal(r.action, 'increase'); assert.equal(r.weight, 62.5);
  assert.ok(Math.abs(bestE1RM([sess([100, 5]), sess([90, 10])]) - 120) < 0.01);
  assert.equal(bestE1RM([]), 0);
});
