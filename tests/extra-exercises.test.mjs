import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeExtras } from '../src/ui/data.js';
import { searchExercises } from '../src/core/search.mjs';

const read = (p) => JSON.parse(readFileSync(new URL(`../src/data/${p}`, import.meta.url), 'utf8'));
const base = read('exercises.json').exercises;
const extra = read('extra-exercises.json');
const muscles = new Set(['chest', 'obliques', 'abs', 'biceps', 'triceps', 'neck', 'front-deltoids', 'abductors', 'quadriceps', 'knees', 'back-deltoids', 'upper-back', 'lower-back', 'forearm', 'gluteal', 'adductor', 'hamstring', 'calves', 'trapezius']);

test('extra exercises are complete, unique and use known muscles', () => {
  const ids = new Set(base.map((e) => e.id));
  for (const e of extra.exercises) {
    assert.ok(!ids.has(e.id), `${e.id} already exists`);
    ids.add(e.id);
    for (const k of ['nameEn', 'nameHe', 'equipment', 'muscleGroup', 'type']) assert.ok(e[k], `${e.id}.${k}`);
    assert.ok(e.primaryMuscles.length > 0);
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) assert.ok(muscles.has(m), `${e.id}: muscle ${m}`);
    assert.ok(e.instructionsEn.length >= 3 && e.instructionsHe.length === e.instructionsEn.length, `${e.id}: steps in both languages`);
    assert.equal(typeof e.ranked, 'boolean');
  }
});

test('aliases point to real exercises', () => {
  const all = mergeExtras(structuredClone(base), structuredClone(extra));
  const ids = new Set(all.map((e) => e.id));
  for (const id of Object.keys(extra.aliases)) assert.ok(ids.has(id), id);
  assert.equal(all.length, base.length + extra.exercises.length);
});

test('gym slang finds the right machines and the new exercise', () => {
  const all = mergeExtras(structuredClone(base), structuredClone(extra));
  const hay = (ex) => [ex.nameEn, ex.nameHe, ...(ex.aliases ?? [])];
  const first = (q) => searchExercises(all, q, hay)[0]?.id;
  assert.equal(first('מקרבים'), 'thigh-adductor');
  assert.equal(first('מרחיקים'), 'thigh-abductor');
  assert.equal(first('הולובאדי'), 'hollow-body-crunch');
  assert.equal(first('hollow body'), 'hollow-body-crunch');
});
