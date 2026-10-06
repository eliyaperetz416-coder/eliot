import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePR, metricOf, WEEK_MS } from '../src/core/prs.mjs';
import * as W from '../src/core/workout.mjs';
import { completeSet, reopenSet } from '../src/core/live.mjs';
import { epley } from '../src/core/ranks.mjs';

const { exercises } = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url)));
const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
const bench = byId['barbell-bench-press-medium-grip'];
const DAY = 24 * 3600 * 1000, T0 = 1_750_000_000_000;

test('evaluatePR: first record, weekly, all-time, ties and empty metrics', () => {
  assert.deepEqual(evaluatePR({ metric: 100, at: T0, history: [] }), { first: true, weekly: false, allTime: false });
  const hist = [{ metric: 120, at: T0 - 30 * DAY }, { metric: 90, at: T0 - 2 * DAY }];
  assert.deepEqual(evaluatePR({ metric: 95, at: T0, history: hist }), { first: false, weekly: true, allTime: false }, 'beats last week only');
  assert.deepEqual(evaluatePR({ metric: 125, at: T0, history: hist }), { first: false, weekly: true, allTime: true });
  assert.deepEqual(evaluatePR({ metric: 90, at: T0, history: hist }), { first: false, weekly: false, allTime: false }, 'a tie is not a PR');
  assert.deepEqual(evaluatePR({ metric: 80, at: T0, history: hist }), { first: false, weekly: false, allTime: false });
  assert.deepEqual(evaluatePR({ metric: 0, at: T0, history: hist }), { first: false, weekly: false, allTime: false });
});

test('no sets in the previous 7 days means no weekly PR, even if it beats the old best', () => {
  const hist = [{ metric: 100, at: T0 - 8 * DAY }];
  assert.deepEqual(evaluatePR({ metric: 110, at: T0, history: hist }), { first: false, weekly: false, allTime: true });
  assert.equal(WEEK_MS, 7 * DAY);
});

test('metricOf: estimated 1RM for lifts, reps/seconds for the rest, bodyweight snapshot for pull-ups', () => {
  assert.equal(metricOf(bench, { weight: 100, reps: 5 }, 80), epley(100, 5));
  assert.equal(metricOf(bench, { weight: 100, reps: 0 }, 80), 0);
  assert.equal(metricOf(byId['plank'], { weight: null, reps: 75 }, 80), 75);
  const pull = byId['pullups'];
  assert.equal(metricOf(pull, { weight: 0, reps: 10 }, 80), epley(80, 10));
  assert.ok(metricOf(pull, { weight: 10, reps: 10 }, 80) > metricOf(pull, { weight: 0, reps: 10 }, 80));
  const crunch = byId['crunches']; // unranked bodyweight
  assert.ok(metricOf(crunch, { weight: 0, reps: 20 }, 80) > metricOf(crunch, { weight: 0, reps: 10 }, 80));
  assert.equal(metricOf(byId['seated-palm-up-barbell-wrist-curl'], { weight: 0, reps: 10 }, 80), 0, 'unranked weight lift with no weight');
});

function session(workouts, now) {
  const w = W.newWorkout({ now });
  const e = W.addEntry(w, bench, { sets: 5 });
  const done = (idx, weight, reps, type = 'normal', at = now + idx * 1000) => {
    Object.assign(e.sets[idx], { weight, reps, type });
    return completeSet({ workout: w, entryId: e.id, idx, now: at, bodyweightKg: 80, sex: 'm', workouts, byId });
  };
  return { w, e, done };
}

test('very first set ever is a "first record", not a PR; a better set in the same workout is an all-time PR', () => {
  const { done } = session([], T0);
  const a = done(0, 60, 8);
  assert.deepEqual(a.pr, { first: true, weekly: false, allTime: false });
  const b = done(1, 70, 8);
  assert.equal(b.pr.allTime, true); assert.equal(b.pr.weekly, true); assert.equal(b.pr.first, false);
  const c = done(2, 65, 8);
  assert.deepEqual(c.pr, { first: false, weekly: false, allTime: false }, 'compared against the better earlier set of this workout');
});

test('warm-ups never PR, rate or count; completing one later does not change earlier flags', () => {
  const { done, e } = session([], T0);
  const wu = done(0, 200, 10, 'warmup');
  assert.equal(wu.warmup, true); assert.equal(wu.rating, 0); assert.deepEqual(wu.pr, { first: false, weekly: false, allTime: false });
  const real = done(1, 60, 8);
  assert.equal(real.pr.first, true, 'the heavy warm-up is not history');
  assert.equal(e.sets[0].rating, undefined);
});

test('history from posted workouts is used; weekly vs all-time differ', () => {
  const old = session([], T0 - 30 * DAY); old.done(0, 100, 5); old.w.endedMs = T0 - 30 * DAY + 60_000;
  const recent = session([old.w], T0 - 3 * DAY); const r = recent.done(0, 80, 5); recent.w.endedMs = T0 - 3 * DAY + 60_000;
  assert.deepEqual(r.pr, { first: false, weekly: false, allTime: false }, 'recent set below the old best, no earlier week data');
  const now = session([old.w, recent.w], T0);
  const f = now.done(0, 90, 5);
  assert.deepEqual(f.pr, { first: false, weekly: true, allTime: false }, 'beats last week (80) but not the old best (100)');
  const g = now.done(1, 110, 5);
  assert.equal(g.pr.allTime, true);
});

test('undoing a set removes its flags and restores the next set\'s comparison', () => {
  const { done, e, w } = session([], T0);
  done(0, 60, 8); done(1, 70, 8);
  assert.equal(e.sets[1].prAllTime, true);
  reopenSet({ workout: w, entryId: e.id, idx: 0, now: T0 + 5000, workouts: [], byId });
  assert.equal(e.sets[0].done, false);
  // set 1 is now the first record
  assert.equal(e.sets[1].prFirst, true); assert.equal(e.sets[1].prAllTime, false);
});

test('ratings use the bodyweight snapshot of each set', () => {
  const w = W.newWorkout({ now: T0 }); const e = W.addEntry(w, bench, { sets: 2 });
  Object.assign(e.sets[0], { weight: 100, reps: 5 }); Object.assign(e.sets[1], { weight: 100, reps: 5 });
  completeSet({ workout: w, entryId: e.id, idx: 0, now: T0 + 1, bodyweightKg: 80, sex: 'm', workouts: [], byId });
  completeSet({ workout: w, entryId: e.id, idx: 1, now: T0 + 2, bodyweightKg: 100, sex: 'm', workouts: [], byId });
  assert.equal(e.sets[0].rating, 563); assert.equal(e.sets[1].rating, 492);
  assert.equal(e.sets[0].bwAtSet, 80);
});
