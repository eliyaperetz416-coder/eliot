import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../src/core/workout.mjs';
import { completeSet } from '../src/core/live.mjs';
import { postWorkout, afterEdit, bestsFrom, ratingsOf, rankIndex, rankChange, recalcAll } from '../src/core/post.mjs';
import { overallRating, tierFor, aggregate } from '../src/core/ranks.mjs';

const { exercises } = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url)));
const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
const DAY = 24 * 3600 * 1000, T0 = 1_750_000_000_000;
const ID = { bench: 'barbell-bench-press-medium-grip', squat: 'barbell-squat', dead: 'barbell-deadlift', curl: 'barbell-curl', plank: 'plank' };

/** plan: [[exerciseKey, weight, reps, type?], ...] done in order; returns the draft */
function draftWith(plan, workouts, now, bw = 80, extra = {}) {
  const w = W.newWorkout({ now });
  let t = now;
  const entries = {};
  for (const [key, weight, reps, type = 'normal'] of plan) {
    const e = (entries[key] ??= W.addEntry(w, byId[ID[key]], { sets: 0 }));
    const s = W.addSet(w, e.id); Object.assign(s, { weight, reps, type });
    completeSet({ workout: w, entryId: e.id, idx: s.idx, now: (t += 1000), bodyweightKg: bw, sex: 'm', workouts, byId });
  }
  return Object.assign(w, extra);
}
const post = (draft, workouts, now, sex = 'm') => postWorkout({ draft, workouts, now, byId, sex });

test('posting stores ratings with bodyweight snapshot, best per exercise, and drops unfinished sets', () => {
  const d = draftWith([['bench', 100, 5], ['bench', 60, 8]], [], T0);
  const e = d.entries[0]; W.addSet(d, e.id); // an unfinished extra set
  const r = post(d, [], T0 + 3_600_000);
  assert.equal(r.workout.entries[0].sets.length, 2);
  assert.deepEqual(r.workout.entries[0].sets.map((s) => s.rating), [563, 415]);
  assert.equal(r.bests[ID.bench].rating, 563);
  assert.equal(r.workout.endedMs, T0 + 3_600_000);
  assert.equal(r.workout.sex, 'm');
  assert.equal(r.summary.stats.workingSets, 2); assert.equal(r.summary.stats.volume, 100 * 5 + 60 * 8);
  assert.equal(d.entries[0].sets.length, 3, 'the draft itself is not mutated by posting');
});

test('"Rank pending" until 3 ranked exercises exist; the third creates the first rank', () => {
  const d1 = draftWith([['bench', 100, 5], ['squat', 140, 5]], [], T0);
  const r1 = post(d1, [], T0 + 1e6);
  assert.equal(r1.summary.overallAfter.pending, true); assert.equal(r1.summary.overallAfter.remaining, 1);
  assert.equal(r1.summary.rankChange, null);
  const d2 = draftWith([['dead', 180, 5]], r1.workouts, T0 + DAY);
  const r2 = post(d2, r1.workouts, T0 + DAY + 1e6);
  assert.equal(r2.summary.overallAfter.pending, false);
  assert.equal(r2.summary.rankChange.kind, 'first');
  const muscles = aggregate([563, 652, 597]); // chest, back, quads each one exercise
  assert.equal(r2.summary.overallAfter.strength, muscles);
  assert.equal(r2.summary.overallAfter.bonus, 2); // two training days in the last 4 weeks
  assert.equal(r2.summary.overallAfter.rating, muscles + 2);
  assert.equal(tierFor(muscles).tier, 'diamond');
});

test('rank-up: beating a best raises the overall tier/division and reports from/to', () => {
  const base = post(draftWith([['bench', 60, 8], ['squat', 80, 5], ['dead', 100, 5]], [], T0), [], T0 + 1e6);
  assert.equal(base.summary.rankChange.kind, 'first');
  const up = post(draftWith([['bench', 140, 3], ['squat', 200, 3], ['dead', 250, 3]], base.workouts, T0 + 2 * DAY), base.workouts, T0 + 2 * DAY + 1e6);
  assert.equal(up.summary.rankChange.kind, 'up');
  assert.ok(rankIndex(up.summary.overallAfter.rating) > rankIndex(base.summary.overallAfter.rating));
  assert.ok(up.summary.ratingChanges.length === 3);
  assert.ok(up.summary.muscleChanges.length >= 3);
  // lighter session afterwards: nothing changes, no rank change
  const flat = post(draftWith([['bench', 40, 5]], up.workouts, T0 + 3 * DAY), up.workouts, T0 + 3 * DAY + 1e6);
  assert.equal(flat.summary.rankChange, null); assert.equal(flat.summary.ratingChanges.length, 0);
  assert.equal(rankChange({ pending: false, rating: 700 }, { pending: false, rating: 1100 }).kind, 'up');
  assert.equal(rankChange({ pending: false, rating: 1100 }, { pending: false, rating: 1300 }), null, 'Greek God score growth is not a rank-up');
});

test('PRs are reported on the summary with their kind', () => {
  const first = post(draftWith([['bench', 100, 5]], [], T0), [], T0 + 1e6);
  assert.deepEqual(first.summary.prs.map((p) => p.kind), ['first']);
  const second = post(draftWith([['bench', 110, 5], ['bench', 112.5, 5]], first.workouts, T0 + DAY), first.workouts, T0 + DAY + 1e6);
  assert.deepEqual(second.summary.prs.map((p) => p.kind), ['allTime', 'allTime']);
  assert.equal(second.summary.stats.prs, 2);
});

test('edit recalculates ratings, bests and PR flags from stored data; delete falls back to earlier bests', () => {
  const a = post(draftWith([['bench', 100, 5]], [], T0), [], T0 + 1e6);
  const b = post(draftWith([['bench', 120, 5], ['curl', 40, 8]], a.workouts, T0 + DAY), a.workouts, T0 + DAY + 1e6);
  assert.equal(b.bests[ID.bench].rating, ratingsOf(bestsFrom(b.workouts))[ID.bench]);
  const bestBefore = b.bests[ID.bench].rating;
  // edit: lower the second workout's bench to 90 x 5
  const ws = b.workouts.map((w) => structuredClone(w));
  ws[1].entries[0].sets[0].weight = 90;
  const edited = afterEdit(ws, byId);
  assert.ok(edited.bests[ID.bench].rating < bestBefore);
  assert.equal(edited.bests[ID.bench].workoutId, ws[0].id, 'best falls back to the first workout (100x5)');
  assert.equal(edited.workouts[1].entries[0].sets[0].prAllTime, false, 'no longer a PR');
  assert.equal(edited.workouts[1].entries[0].sets[0].rating < 563, true);
  // delete the second workout
  const del = afterEdit([structuredClone(b.workouts[0])], byId);
  assert.equal(del.bests[ID.bench].rating, 563); assert.equal(del.bests[ID.curl], undefined);
  assert.equal(del.workouts[0].entries[0].sets[0].prFirst, true);
  // deleting everything leaves empty bests and a pending overall
  const none = afterEdit([], byId);
  assert.deepEqual(none.bests, {}); assert.equal(none.overall.pending, true);
});

test('editing a set type to warm-up removes it from ratings, PRs and volume', () => {
  const a = post(draftWith([['bench', 100, 5], ['bench', 60, 8]], [], T0), [], T0 + 1e6);
  const ws = a.workouts.map((w) => structuredClone(w));
  ws[0].entries[0].sets[0].type = 'warmup';
  const r = afterEdit(ws, byId);
  assert.equal(r.bests[ID.bench].rating, 415);
  assert.equal(r.workouts[0].stats.workingSets, 1); assert.equal(r.workouts[0].stats.volume, 480);
  assert.equal(r.workouts[0].entries[0].sets[0].rating, undefined);
});

test('female curve is stored on the workout and used when recalculating', () => {
  const d = draftWith([['bench', 40, 8]], [], T0, 60);
  const r = postWorkout({ draft: d, workouts: [], now: T0 + 1e6, byId, sex: 'f' });
  assert.equal(r.workout.entries[0].sets[0].rating, 520);
  const again = recalcAll([structuredClone(r.workout)], byId);
  assert.equal(again[0].entries[0].sets[0].rating, 520);
});

test('unranked exercises are tracked with PRs but never create a rating or count for rank', () => {
  const r = post(draftWith([['plank', null, 60], ['bench', 100, 5]], [], T0), [], T0 + 1e6);
  assert.equal(r.bests[ID.plank], undefined);
  assert.equal(r.workout.entries[0].sets[0].prFirst, true);
  assert.equal(overallRating(ratingsOf(r.bests), byId).remaining, 2);
});
