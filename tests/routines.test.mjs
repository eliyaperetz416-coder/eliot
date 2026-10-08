import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/core/routines.mjs';
import { buildCustomExercise, fitSize, PICKABLE_MUSCLES, countsLikeOptions } from '../src/core/custom.mjs';
import { byId, exercises, session, DAY } from './helpers.mjs';
import { previousPerformance } from '../src/core/workout.mjs';

const bench = byId['barbell-bench-press-medium-grip'], curl = byId['barbell-curl'], plank = byId['plank'], squat = byId['barbell-squat'];

test('routine CRUD: create, add many exercises at once, edit targets with clamping, reorder, remove', () => {
  const r = R.newRoutine({ name: 'Push', now: 1 });
  R.addToRoutine(r, [bench, curl, plank], 2);
  assert.equal(r.entries.length, 3);
  assert.deepEqual([r.entries[0].sets, r.entries[0].repsMin, r.entries[0].repsMax, r.entries[0].restSec], [3, 8, 12, 120]);
  assert.equal(r.entries[2].restSec, 60);
  const e = r.entries[0];
  R.updateEntry(r, e.id, { sets: 4, repsMin: 5, repsMax: 3, restSec: 5000 });
  assert.deepEqual([e.sets, e.repsMin, e.repsMax, e.restSec], [4, 5, 5, 600], 'max reps never below min reps, rest clamped');
  R.updateEntry(r, e.id, { sets: 0 }); assert.equal(e.sets, 1);
  assert.throws(() => R.updateEntry(r, 'nope', {}));
  assert.equal(R.moveEntry(r, r.entries[2].id, -1), true); assert.equal(r.entries[1].exerciseId, 'plank');
  assert.equal(R.moveEntry(r, r.entries[0].id, -1), false);
  R.removeEntry(r, r.entries[1].id); assert.equal(r.entries.length, 2);
  assert.equal(r.updatedMs > 1, true);
});

test('duplicate makes an independent copy with new ids; folders keep routines when deleted', () => {
  const r = R.newRoutine({ name: 'Legs' }); R.addToRoutine(r, [squat]);
  const c = R.duplicateRoutine(r, 5);
  assert.notEqual(c.id, r.id); assert.notEqual(c.entries[0].id, r.entries[0].id); assert.equal(c.name, 'Legs (copy)');
  c.entries[0].sets = 9; assert.equal(r.entries[0].sets, 3);
  const f = R.newFolder('  Winter  ');
  assert.equal(f.name, 'Winter');
  R.moveToFolder(r, f.id); R.moveToFolder(c, f.id);
  const g = R.groupByFolder([f], [r, c]);
  assert.equal(g[0].routines.length, 0); assert.equal(g[1].routines.length, 2);
  const left = R.deleteFolder([f], [r, c], f.id);
  assert.equal(left.length, 0); assert.equal(r.folderId, null); assert.equal(c.folderId, null);
  assert.equal(R.renameFolder(f, ' Summer ').name, 'Summer');
});

test('starting a workout from a routine: exercises and set targets are ready, previous values prefilled', () => {
  const ws = session([['bench', 100, 5], ['bench', 100, 5]], [], 1_750_000_000_000);
  const r = R.newRoutine({ name: 'Push' }); R.addToRoutine(r, [bench, curl]);
  r.entries[0].sets = 3;
  const draft = R.draftFromEntries(r.entries, { name: r.name, routineId: r.id, now: 2e12, previous: (id) => previousPerformance(ws, id) });
  assert.equal(draft.routineId, r.id); assert.equal(draft.name, 'Push');
  assert.equal(draft.entries.length, 2); assert.equal(draft.entries[0].sets.length, 3);
  assert.deepEqual(draft.entries[0].sets.map((s) => [s.weight, s.reps, s.done]), [[100, 5, false], [100, 5, false], [100, 5, false]], 'missing sets reuse the last previous set');
  assert.deepEqual(draft.entries[1].sets.map((s) => s.weight), [null, null, null], 'never done: empty');
  assert.deepEqual(draft.entries[0].target, { repsMin: 8, repsMax: 12, sets: 3 });
  const sug = R.draftFromEntries(r.entries, { suggest: (e) => ({ weight: 62.5, action: 'increase' }) });
  assert.deepEqual(sug.entries[0].sets.map((s) => s.weight), [62.5, 62.5, 62.5]);
  const find = R.draftFromEntries(r.entries, { suggest: () => ({ weight: null, action: 'find' }) });
  assert.equal(find.entries[0].target.find, true);
});

const form = (o = {}) => ({ name: 'Cable Row Variation', equipment: 'cable', type: 'weight', primary: ['upper-back'], secondary: ['biceps'], countsLike: null, notes: 'Line one\nLine two', ...o });

test('custom exercise: validation', () => {
  const bad = buildCustomExercise({ name: ' ', equipment: 'x', type: 'y', primary: [] }, byId);
  assert.equal(bad.ok, false); assert.deepEqual(Object.keys(bad.errors).sort(), ['equipment', 'name', 'primary', 'type']);
  assert.equal(buildCustomExercise(form({ countsLike: 'plank' }), byId).errors.countsLike, 'countsLike', 'cannot count like an unranked exercise');
  assert.equal(buildCustomExercise(form({ countsLike: 'nope' }), byId).errors.countsLike, 'countsLike');
  assert.equal(buildCustomExercise(form({ type: 'time', countsLike: 'barbell-curl' }), byId).errors.countsLike, 'countsLike', 'timed holds cannot be ranked');
  assert.ok(PICKABLE_MUSCLES.every((m) => typeof m === 'string'));
});

test('custom exercise: unranked by default, tracked like a library exercise', () => {
  const r = buildCustomExercise(form({ primary: ['upper-back', 'upper-back'], secondary: ['upper-back', 'biceps', 'nope'] }), byId, { now: 5 });
  assert.equal(r.ok, true);
  const ex = r.exercise;
  assert.match(ex.id, /^custom-/); assert.equal(ex.custom, true); assert.equal(ex.ranked, false);
  assert.deepEqual(ex.primaryMuscles, ['upper-back']); assert.deepEqual(ex.secondaryMuscles, ['biceps']);
  assert.equal(ex.muscleGroup, 'back'); assert.deepEqual(ex.instructionsEn, ['Line one', 'Line two']);
  assert.equal(ex.R, undefined);
  assert.equal(buildCustomExercise(form({ primary: ['forearm'] }), byId).exercise.muscleGroup, 'other');
  assert.equal(buildCustomExercise(form(), byId, { id: 'custom-fixed' }).exercise.id, 'custom-fixed');
});

test('custom exercise: "count like" borrows the curve and ranking group', () => {
  const ex = buildCustomExercise(form({ name: 'My bench', equipment: 'barbell', primary: ['chest'], countsLike: bench.id }), byId).exercise;
  assert.equal(ex.ranked, true); assert.equal(ex.R, bench.R); assert.equal(ex.family, bench.family); assert.equal(ex.muscleGroup, 'chest'); assert.equal(ex.countsLike, bench.id);
  const pull = buildCustomExercise(form({ type: 'bodyweight', countsLike: 'pullups', primary: ['upper-back'] }), byId).exercise;
  assert.equal(pull.bwFactor, 1);
  assert.ok(countsLikeOptions(exercises).length > 200 && countsLikeOptions(exercises).every((e) => e.ranked));
});

test('photo is scaled so the longer side is at most 800 px, never enlarged', () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 800, height: 600 });
  assert.deepEqual(fitSize(3000, 4000), { width: 600, height: 800 });
  assert.deepEqual(fitSize(500, 400), { width: 500, height: 400 });
  assert.deepEqual(fitSize(1, 5000), { width: 1, height: 800 });
});

test('planned weight: cleaned, optional, and wins over last time when starting', async () => {
  const R = await import('../src/core/routines.mjs');
  assert.equal(R.cleanWeight(''), null); assert.equal(R.cleanWeight(null), null); assert.equal(R.cleanWeight('abc'), null);
  assert.equal(R.cleanWeight('-5'), null); assert.equal(R.cleanWeight('62,5'), 62.5); assert.equal(R.cleanWeight(99999), 1000);
  const r = R.newRoutine({});
  R.addToRoutine(r, [{ id: 'bp', type: 'weight', equipment: 'barbell', ranked: true }]);
  const e = r.entries[0];
  assert.equal(e.weight, null);
  R.updateEntry(r, e.id, { weight: '70' });
  assert.equal(e.weight, 70);
  const prev = () => [{ weight: 50, reps: 8 }];
  const w1 = R.draftFromEntries(r.entries, { previous: prev });
  assert.deepEqual(w1.entries[0].sets.map((s) => s.weight), [70, 70, 70]);
  assert.equal(w1.entries[0].sets[0].reps, 8);
  R.updateEntry(r, e.id, { weight: '' });
  const w2 = R.draftFromEntries(r.entries, { previous: prev });
  assert.equal(w2.entries[0].sets[0].weight, 50);
});

test('bumpPlannedWeights raises only planned weights, never lowers, ignores warm-ups', async () => {
  const mk = (weight, id = 'bp') => ({ id: `e-${id}`, exerciseId: id, sets: 3, repsMin: 6, repsMax: 8, restSec: 90, weight, notes: '' });
  const set = (weight, type = 'normal', done = true) => ({ idx: 0, type, weight, reps: 5, done });
  const r = { entries: [mk(60, 'bp'), mk(null, 'sq'), mk(100, 'dl'), mk(40, 'ohp')], updatedMs: 0 };
  const w = { entries: [
    { exerciseId: 'bp', sets: [set(60), set(62.5), set(100, 'warmup')] },   // warm-up is ignored, top working set 62.5
    { exerciseId: 'sq', sets: [set(120)] },                               // no planned weight: untouched
    { exerciseId: 'dl', sets: [set(90)] },                                // lighter day: plan stays
    { exerciseId: 'ohp', sets: [set(45, 'normal', false)] },              // not done: ignored
  ] };
  const ch = R.bumpPlannedWeights(r, w, 5);
  assert.deepEqual(ch, [{ exerciseId: 'bp', from: 60, to: 62.5 }]);
  assert.deepEqual(r.entries.map((e) => e.weight), [62.5, null, 100, 40]);
  assert.equal(r.updatedMs, 5);
  assert.deepEqual(R.bumpPlannedWeights(r, w), [], 'second time nothing changes');
});

test('bumpPlannedWeights matches a repeated exercise entry by entry', async () => {
  const mk = (weight) => ({ id: Math.random().toString(36), exerciseId: 'bp', sets: 3, repsMin: 6, repsMax: 8, restSec: 90, weight, notes: '' });
  const r = { entries: [mk(60), mk(40)], updatedMs: 0 };
  const w = { entries: [{ exerciseId: 'bp', sets: [{ idx: 0, type: 'normal', weight: 65, done: true }] }, { exerciseId: 'bp', sets: [{ idx: 0, type: 'normal', weight: 45, done: true }] }] };
  R.bumpPlannedWeights(r, w);
  assert.deepEqual(r.entries.map((e) => e.weight), [65, 45]);
});

test('missedEntries: exercises with no ticked working set, ready for a one-time make-up workout', async () => {
  const { missedEntries } = await import('../src/core/routines.mjs');
  const w = { entries: [
    { exerciseId: 'a', restSec: 90, target: { repsMin: 6, repsMax: 8 }, sets: [{ type: 'normal', done: true, weight: 60, reps: 8 }, { type: 'normal', done: false, weight: 60, reps: 8 }] },
    { exerciseId: 'b', restSec: 120, target: { repsMin: 8, repsMax: 10 }, sets: [{ type: 'warmup', done: true, weight: 20, reps: 10 }, { type: 'normal', done: false, weight: 40, reps: 10 }, { type: 'normal', done: false, weight: null, reps: null }] },
    { exerciseId: 'c', restSec: 60, sets: [{ type: 'normal', done: false, weight: null, reps: 12 }] },
  ] };
  assert.deepEqual(missedEntries(w), [
    { exerciseId: 'b', sets: 2, repsMin: 8, repsMax: 10, restSec: 120, weight: 40, notes: '' },
    { exerciseId: 'c', sets: 1, repsMin: 12, repsMax: 12, restSec: 60, weight: null, notes: '' },
  ]);
});
