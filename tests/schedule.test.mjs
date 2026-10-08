import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf, cleanSchedule, planFor, addEntry, removeEntry, clearDay, markDone, isDone, dayDone, isPlanned, MAX_PER_DAY } from '../src/core/schedule.mjs';

test('weekday of a date key (0 = Sunday)', () => {
  assert.equal(weekdayOf('2026-10-11'), 0);
  assert.equal(weekdayOf('2026-10-08'), 4);
  assert.equal(weekdayOf('2026-10-10'), 6);
});

test('clean: lists of valid items, old single entries upgraded, junk dropped', () => {
  const s = cleanSchedule({ days: {
    0: { kind: 'workout', ref: 'r1' },
    1: [{ id: 'a', kind: 'activity', type: 'basketball', label: ' with Dan ' }, { id: 'b', kind: 'workout' }],
    2: [{ kind: 'rest' }, { id: 'x', kind: 'workout', ref: 'r2' }],
    3: [{ id: 'q', kind: 'activity', type: 'nope' }, { kind: 'bad' }, { id: 'q', kind: 'rest' }],
    9: { kind: 'rest' },
  }, done: { '2026-10-08|a': true, '2026-10-09': true, bad: true, '2026-10-10|a': false } });
  assert.deepEqual(s.days[0], [{ id: 'l00', kind: 'workout', ref: 'r1' }]);
  assert.deepEqual(s.days[1], [{ id: 'a', kind: 'activity', type: 'basketball', label: 'with Dan' }, { id: 'b', kind: 'workout', ref: 'free' }]);
  assert.deepEqual(s.days[2], [{ id: 'l20', kind: 'rest' }], 'rest is alone on its day');
  assert.deepEqual(s.days[3], [{ id: 'q', kind: 'rest' }], 'a rest in the list wins; bad items are dropped');
  assert.equal(s.days[9], undefined);
  assert.deepEqual(s.done, { '2026-10-08|a': true, '2026-10-09': true });
  assert.deepEqual(cleanSchedule(null), { days: {}, done: {} });
});

test('several items on one day: add, rest replaces, others replace rest, limit', () => {
  let s = { days: {}, done: {} };
  s = addEntry(s, 0, { kind: 'activity', type: 'basketball' }, 'a1');
  s = addEntry(s, 0, { kind: 'workout', ref: 'r1' }, 'w1');
  assert.deepEqual(planFor(s, '2026-10-11').map((e) => e.kind), ['activity', 'workout']);
  assert.equal(isPlanned(s), true);
  s = addEntry(s, 0, { kind: 'rest' }, 'z1');
  assert.deepEqual(planFor(s, '2026-10-11').map((e) => e.kind), ['rest']);
  s = addEntry(s, 0, { kind: 'workout', ref: 'r1' }, 'w2');
  assert.deepEqual(planFor(s, '2026-10-11').map((e) => e.id), ['w2'], 'a workout replaces rest');
  for (let i = 0; i < 6; i++) s = addEntry(s, 0, { kind: 'activity', type: 'running' }, `r${i}`);
  assert.equal(planFor(s, '2026-10-11').length, MAX_PER_DAY);
  s = removeEntry(s, 0, 'w2');
  assert.equal(planFor(s, '2026-10-11').some((e) => e.id === 'w2'), false);
  s = clearDay(s, 0);
  assert.equal(isPlanned(s), false);
  assert.deepEqual(planFor(s, '2026-10-11'), []);
});

test('done marks per item, whole-day legacy marks, expiry', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  let s = markDone({ days: {}, done: {} }, '2026-10-08', 'a', true, now);
  assert.equal(isDone(s, '2026-10-08', 'a'), true);
  assert.equal(isDone(s, '2026-10-08', 'b'), false);
  assert.equal(dayDone(s, '2026-10-08'), true);
  assert.equal(dayDone(s, '2026-10-07'), false);
  assert.equal(isDone({ days: {}, done: { '2026-10-08': true } }, '2026-10-08', 'zzz'), true, 'old whole-day mark');
  s = markDone({ days: {}, done: { '2026-07-01|a': true } }, '2026-10-08', 'a', true, now);
  assert.deepEqual(s.done, { '2026-10-08|a': true });
  assert.deepEqual(markDone(s, '2026-10-08', 'a', false, now).done, {});
});
