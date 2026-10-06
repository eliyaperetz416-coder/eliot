import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as W from '../src/core/workout.mjs';
import { newestDraft, migrateWorkout } from '../src/core/draft.mjs';

const { exercises } = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url)));
const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
const bench = byId['barbell-bench-press-medium-grip'], curl = byId['barbell-curl'], plank = byId['plank'], pull = byId['pullups'];

test('new entry has 3 empty working sets and a default rest (compound 120 / isolation 75 / unranked 60)', () => {
  const w = W.newWorkout({ now: 1_700_000_000_000 });
  const e = W.addEntry(w, bench);
  assert.equal(e.sets.length, 3);
  assert.ok(e.sets.every((s) => s.type === 'normal' && !s.done && s.weight === null));
  assert.equal(e.restSec, 120);
  assert.equal(W.addEntry(w, curl).restSec, 75);
  assert.equal(W.addEntry(w, plank).restSec, 60);
  assert.equal(w.dateKey.length, 10);
});

test('addSet copies the previous set values; warm-up becomes normal; removeSet renumbers', () => {
  const w = W.newWorkout(); const e = W.addEntry(w, bench, { sets: 1 });
  W.setField(w, e.id, 0, 'weight', '82,5'); W.setField(w, e.id, 0, 'reps', '8');
  W.setType(w, e.id, 0, 'warmup');
  const s = W.addSet(w, e.id);
  assert.deepEqual([s.weight, s.reps, s.type, s.done, s.idx], [82.5, 8, 'normal', false, 1]);
  W.addSet(w, e.id); W.removeSet(w, e.id, 0);
  assert.deepEqual(e.sets.map((x) => x.idx), [0, 1]);
  assert.throws(() => W.setType(w, e.id, 0, 'bogus'));
  W.setField(w, e.id, 0, 'weight', 'abc');
  assert.equal(e.sets[0].weight, null);
});

test('reorder, remove, replace exercise', () => {
  const w = W.newWorkout(); const a = W.addEntry(w, bench), b = W.addEntry(w, curl), c = W.addEntry(w, pull);
  assert.equal(W.moveEntry(w, c.id, -1), true);
  assert.deepEqual(w.entries.map((x) => x.exerciseId), [bench.id, pull.id, curl.id]);
  assert.equal(W.moveEntry(w, a.id, -1), false);
  a.sets[0].done = true; a.sets[0].rating = 400; W.setField(w, a.id, 0, 'weight', 60);
  W.replaceExercise(w, a.id, curl);
  assert.equal(a.exerciseId, curl.id); assert.equal(a.sets[0].done, false); assert.equal(a.sets[0].rating, undefined); assert.equal(a.sets[0].weight, 60);
  assert.equal(a.restSec, 75);
  W.removeEntry(w, b.id);
  assert.equal(w.entries.length, 2);
  assert.throws(() => W.removeEntry(w, 'nope'));
});

test('supersets: link with next, dissolve when broken, survive neighbours moving together', () => {
  const w = W.newWorkout(); const a = W.addEntry(w, bench), b = W.addEntry(w, curl), c = W.addEntry(w, pull);
  assert.equal(W.linkSuperset(w, a.id), true);
  assert.equal(a.supersetGroup, b.supersetGroup); assert.ok(a.supersetGroup);
  assert.equal(c.supersetGroup, null);
  assert.equal(W.linkSuperset(w, c.id), false, 'last entry has no next');
  W.moveEntry(w, c.id, -1); // c now sits between a and b -> group is not contiguous -> dissolves
  assert.equal(a.supersetGroup, null); assert.equal(b.supersetGroup, null);
  W.linkSuperset(w, w.entries[0].id);
  W.unlinkSuperset(w, w.entries[0].id);
  assert.ok(w.entries.every((e) => e.supersetGroup === null), 'unlinking one dissolves a pair');
});

test('stats: warm-ups and undone sets never count; volume from weight x reps; time/cardio add no volume', () => {
  const w = W.newWorkout({ now: 0 }); const e = W.addEntry(w, bench, { sets: 4 }); const p = W.addEntry(w, plank, { sets: 1 });
  const set = (i, wt, r, type, done) => Object.assign(e.sets[i], { weight: wt, reps: r, type, done, doneAt: 1 });
  set(0, 40, 10, 'warmup', true); set(1, 100, 5, 'normal', true); set(2, 90, 6, 'drop', true); set(3, 100, 5, 'normal', false);
  Object.assign(p.sets[0], { reps: 60, done: true });
  const s = W.stats(w, byId, 3_600_000);
  assert.deepEqual([s.workingSets, s.volume, s.durationSec], [3, 100 * 5 + 90 * 6, 3600]);
});

test('previousPerformance: latest posted workout with that exercise, by set index', () => {
  const mk = (ms, wt) => { const w = W.newWorkout({ now: ms }); const e = W.addEntry(w, bench, { sets: 2 }); e.sets.forEach((s) => Object.assign(s, { weight: wt, reps: 5, done: true })); w.endedMs = ms + 1; return w; };
  const ws = [mk(1000, 60), mk(3000, 70), mk(2000, 65)];
  assert.deepEqual(W.previousPerformance(ws, bench.id).map((s) => s.weight), [70, 70]);
  assert.deepEqual(W.previousPerformance(ws, bench.id, 2500).map((s) => s.weight), [65, 65]);
  assert.deepEqual(W.previousPerformance(ws, curl.id), []);
  const draft = W.newWorkout(); W.addEntry(draft, bench);
  assert.deepEqual(W.previousPerformance([draft], bench.id), [], 'unposted workouts are ignored');
});

test('compactForPost drops undone sets and empty entries; repeatWorkout copies targets only', () => {
  const w = W.newWorkout(); const a = W.addEntry(w, bench, { sets: 3 }), b = W.addEntry(w, curl, { sets: 2 });
  a.sets[0].done = true; a.sets[0].weight = 50; a.sets[0].reps = 8;
  assert.equal(W.compactForPost(w), 4);
  assert.equal(w.entries.length, 1); assert.deepEqual(w.entries[0].sets.map((s) => s.idx), [0]);
  W.linkSuperset(w, a.id);
  const r = W.repeatWorkout(w);
  assert.equal(r.entries[0].sets[0].weight, 50); assert.equal(r.entries[0].sets[0].done, false); assert.notEqual(r.id, w.id);
  assert.ok(b);
});

test('draft restore: newest copy wins, old shapes migrate', () => {
  const a = { ...W.newWorkout({ now: 1 }), updatedMs: 100, name: 'old' }, b = { ...a, updatedMs: 200, name: 'new' };
  assert.equal(newestDraft(a, b).name, 'new'); assert.equal(newestDraft(b, a).name, 'new');
  assert.equal(newestDraft(null, a).name, 'old'); assert.equal(newestDraft(null, null), null);
  const legacy = migrateWorkout({ id: 'x', entries: [{ exerciseId: 'e', sets: [{ weight: 5 }] }] });
  assert.equal(legacy.schemaVersion, W.SCHEMA_VERSION);
  assert.deepEqual([legacy.entries[0].sets[0].type, legacy.entries[0].sets[0].done, legacy.entries[0].restSec], ['normal', false, 90]);
  const json = JSON.parse(JSON.stringify(a));
  assert.deepEqual(migrateWorkout(json), a, 'JSON round trip restores the workout exactly');
});

test('dateKey is the local calendar date', () => {
  const d = new Date(2026, 2, 29, 23, 59); // local time, DST-sensitive month in many zones
  assert.equal(W.dateKey(d.getTime()), '2026-03-29');
  assert.equal(W.dateKey(new Date(2026, 0, 1, 0, 0).getTime()), '2026-01-01');
});
