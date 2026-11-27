// Elia 27.11: (1) a benchmark workout (WOD, e.g. Cindy) showed nothing on the recovery map; (2) the inner-thigh muscles
// (adductors / abductors) never lit up: they belong to no rank group and each machine lit only one of the two areas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshnessByMuscle } from '../src/core/recovery.mjs';
import { expandIds } from '../src/core/muscles.mjs';
import { wodSets, buildWodWorkout } from '../src/core/wods.mjs';
import { polygonRating, polygonBestExercises } from '../src/core/views.mjs';
import { aggregate } from '../src/core/ranks.mjs';
import { byId as libById, HOUR } from './helpers.mjs';

const extra = JSON.parse(readFileSync('src/data/extra-exercises.json', 'utf8'));
const byId = { ...libById, ...Object.fromEntries((extra.exercises ?? extra).map((e) => [e.id, e])) };
const wods = JSON.parse(readFileSync('src/data/wods.json', 'utf8')).wods;
const wodById = Object.fromEntries(wods.map((w) => [w.id, w]));
const T0 = 1_750_000_000_000;

test('the two inner-thigh areas go together: either machine lights both', () => {
  assert.deepEqual(expandIds(['adductor']).sort(), ['abductors', 'adductor']);
  assert.deepEqual(expandIds(['abductors']).sort(), ['abductors', 'adductor']);
  assert.deepEqual(expandIds(['chest']), ['chest'], 'other muscles unchanged');
});

test('wodSets: Cindy 17 rounds = a lot of pull-ups, push-ups and squats (capped at 10 sets each)', () => {
  const s = wodSets(wodById.cindy, { type: 'rounds', rounds: 17, reps: 0 });
  const by = Object.fromEntries(s.map((x) => [x.exerciseId, x.sets]));
  assert.deepEqual(Object.keys(by).sort(), ['air-squat', 'pullups', 'pushups']);
  assert.equal(by.pullups, 9); // 85 reps
  assert.equal(by.pushups, 10);
  assert.equal(by['air-squat'], 10);
});

test('wodSets: Fran (21-15-9 for time) gives about 5 sets of each movement; a missing workout gives nothing', () => {
  const s = wodSets(wodById.fran, { type: 'time', seconds: 300 });
  assert.ok(s.length >= 2 && s.every((x) => x.sets === 5), JSON.stringify(s));
  assert.deepEqual(wodSets(null, { type: 'time', seconds: 1 }), []);
  assert.deepEqual(wodSets(wodById.cindy, null), []);
});

test('recovery counts a WOD result (no sets stored) through the workout definition', () => {
  const w = buildWodWorkout({ id: 'w1', wod: wodById.cindy, division: 'rx', score: { type: 'rounds', rounds: 17, reps: 0 }, startedMs: T0, endedMs: T0 + 20 * 60000 });
  const ids = ['chest', 'upper-back', 'quadriceps', 'calves'];
  const fresh = freshnessByMuscle([w], byId, T0 + 24 * HOUR, ids, wodById);
  assert.ok(fresh.chest.freshness < 0.5 && fresh.chest.trainedAt != null, 'push-ups tire the chest');
  assert.ok(fresh.quadriceps.freshness < 0.5, 'squats tire the quads');
  assert.equal(fresh.calves.trainedAt, null);
  const none = freshnessByMuscle([w], byId, T0 + 24 * HOUR, ids); // old callers without the definitions: unchanged
  assert.equal(none.chest.trainedAt, null);
});

test('recovery: the adductor machine tires both inner-thigh areas', () => {
  const w = { id: 'x', startedMs: T0, endedMs: T0 + HOUR, entries: [{ exerciseId: 'thigh-adductor', sets: [{ done: true, type: 'normal', doneAt: T0 }] }] };
  const fresh = freshnessByMuscle([w], byId, T0 + 12 * HOUR, ['adductor', 'abductors']);
  assert.ok(fresh.adductor.trainedAt != null && fresh.abductors.trainedAt != null);
});

test('rank map: an area outside the rank groups is coloured by the exercises that train it', () => {
  const bests = { 'thigh-adductor': { rating: 400 }, 'thigh-abductor': { rating: 200 }, 'barbell-bench-press-medium-grip': { rating: 900 } };
  assert.equal(polygonRating('adductor', bests, byId), aggregate([400, 200]));
  assert.equal(polygonRating('abductors', bests, byId), aggregate([400, 200]));
  assert.equal(polygonRating('neck', bests, byId), 0);
  assert.deepEqual(polygonBestExercises('adductor', bests, byId).map((b) => b.id), ['thigh-adductor', 'thigh-abductor']);
});
