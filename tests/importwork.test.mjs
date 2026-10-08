import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorkoutText, matchWorkout } from '../src/core/importwork.mjs';

test('parse: name line, numbering, sets x reps in several styles, defaults', () => {
  const p = parseWorkoutText(`Name: Push day
1. Bench press – 4 sets × 6-8
2) Shoulder press 3x10
- לחיצת חזה בשיפוע 4 סטים × 8-10

• Lateral raise`);
  assert.equal(p.name, 'Push day');
  assert.deepEqual(p.lines.map((l) => [l.query, l.sets, l.repsMin, l.repsMax]), [
    ['Bench press', 4, 6, 8], ['Shoulder press', 3, 10, 10], ['לחיצת חזה בשיפוע', 4, 8, 10], ['Lateral raise', 3, 8, 12],
  ]);
  assert.equal(parseWorkoutText('שם האימון: רגליים\nסקוואט 5×5').name, 'רגליים');
  assert.deepEqual(parseWorkoutText('').lines, []);
  assert.equal(parseWorkoutText('Squat 99x500').lines[0].sets, 10, 'sets are capped');
});

test('match: exercises found by name, the rest reported', () => {
  const ex = [{ id: 'bp', nameEn: 'Barbell Bench Press', nameHe: 'לחיצת חזה במוט', equipment: 'barbell', type: 'weight' }, { id: 'sq', nameEn: 'Barbell Squat', nameHe: 'סקוואט עם מוט', equipment: 'barbell', type: 'weight' }];
  const hay = (e) => [e.nameEn, e.nameHe];
  const r = matchWorkout(parseWorkoutText('Bench press 4x6-8\nSquat 3x5\nHolobody curls 3x12'), ex, hay);
  assert.deepEqual(r.entries.map((e) => [e.exerciseId, e.sets, e.repsMin, e.repsMax]), [['bp', 4, 6, 8], ['sq', 3, 5, 5]]);
  assert.deepEqual(r.unmatched, ['Holobody curls 3x12']);
});
