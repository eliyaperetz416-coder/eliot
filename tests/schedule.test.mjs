import test from 'node:test';
import assert from 'node:assert/strict';
import { weekdayOf, cleanSchedule, planFor, setDay, markDone, isPlanned } from '../src/core/schedule.mjs';

test('weekday of a date key (0 = Sunday)', () => {
  assert.equal(weekdayOf('2026-10-11'), 0); // Sunday
  assert.equal(weekdayOf('2026-10-08'), 4); // Thursday
  assert.equal(weekdayOf('2026-10-10'), 6);
});

test('clean: keeps valid entries, fixes unknown activity, drops junk', () => {
  const s = cleanSchedule({ days: { 0: { kind: 'workout', ref: 'r1' }, 1: { kind: 'rest' }, 2: { kind: 'activity', type: 'basketball', label: ' with Dan ' }, 3: { kind: 'activity', type: 'nope' }, 4: { kind: 'x' }, 9: { kind: 'rest' }, 5: { kind: 'workout' } }, done: { '2026-10-08': true, bad: true, '2026-10-09': false } });
  assert.deepEqual(s.days, { 0: { kind: 'workout', ref: 'r1' }, 1: { kind: 'rest' }, 2: { kind: 'activity', type: 'basketball', label: 'with Dan' }, 3: { kind: 'activity', type: 'other' }, 5: { kind: 'workout', ref: 'free' } });
  assert.deepEqual(s.done, { '2026-10-08': true });
  assert.deepEqual(cleanSchedule(null), { days: {}, done: {} });
});

test('plan for a date, set and clear a day, planned or not', () => {
  let s = setDay({ days: {}, done: {} }, 0, { kind: 'workout', ref: 'plan' });
  assert.equal(isPlanned(s), true);
  assert.deepEqual(planFor(s, '2026-10-11'), { kind: 'workout', ref: 'plan' });
  assert.equal(planFor(s, '2026-10-12'), null);
  s = setDay(s, 0, null);
  assert.equal(isPlanned(s), false);
});

test('done marks: toggle and expire', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  let s = markDone({ days: {}, done: {} }, '2026-10-08', true, now);
  assert.deepEqual(s.done, { '2026-10-08': true });
  s = markDone({ days: {}, done: { '2026-07-01': true } }, '2026-10-08', true, now);
  assert.deepEqual(s.done, { '2026-10-08': true });
  assert.deepEqual(markDone(s, '2026-10-08', false, now).done, {});
});
