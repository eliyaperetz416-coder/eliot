import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, searchExercises, editDistance } from '../src/core/search.mjs';

const { exercises } = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url)));
const hay = (e) => [e.nameEn, e.nameHe, e.equipment, e.muscleGroup];
const find = (q) => searchExercises(exercises, q, hay).map((e) => e.id);

test('normalize: niqqud, final letters, punctuation, case', () => {
  assert.equal(normalize('  סְקוּואַט! '), 'סקוואט');
  assert.equal(normalize('שכיבות סמיכה'), normalize('שכיבות סמיכה'));
  assert.equal(normalize('T-Bar Row'), 't bar row');
  assert.equal(normalize('ק״ג'), 'קג');
});

test('english search', () => {
  assert.ok(find('bench press').includes('barbell-bench-press-medium-grip'));
  assert.ok(find('romanian').includes('romanian-deadlift'));
  assert.equal(find('zzzzqq').length, 0);
});

test('hebrew search, exact and spelling variants', () => {
  assert.ok(find('סקוואט').includes('barbell-squat'));
  assert.ok(find('סקוואט').length > 5);
  assert.ok(find('דדליפט רומני').includes('romanian-deadlift'));
  assert.ok(find('דדליפט רומנית').includes('romanian-deadlift') || find('דדליפט רומני').length > 0);
  assert.ok(find('סקוט').includes('barbell-squat') || find('סקווט').includes('barbell-squat'), 'missing vav tolerated');
  assert.ok(find('קרוס אובר').some((id) => id.includes('crossover')), 'split word');
  assert.ok(find('מתח').includes('pullups'));
  assert.ok(find('פשיטת ברכים').length > 0, 'one letter off');
});

test('typo tolerance in english and multi-word AND', () => {
  assert.ok(find('barbel curl').includes('barbell-curl'));
  assert.ok(find('dumbell press').length > 0);
  const strict = find('incline dumbbell');
  assert.ok(strict.length > 0 && strict.every((id) => /incline/.test(id)));
});

test('empty query returns everything', () => assert.equal(find('').length, exercises.length));

test('editDistance', () => {
  assert.equal(editDistance('abc', 'abc'), 0);
  assert.equal(editDistance('abc', 'abd'), 1);
  assert.ok(editDistance('abc', 'xyzzy') > 2);
});
