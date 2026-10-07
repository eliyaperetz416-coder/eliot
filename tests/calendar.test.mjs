import test from 'node:test';
import assert from 'node:assert/strict';
import { weekKeys, monthGrid, addMonths, byDay, monthStats, firstMonth, keyOf } from '../src/core/calendar.mjs';

test('month grid: whole weeks, correct leading days, Sunday or Monday first', () => {
  // October 2026 starts on a Thursday and has 31 days
  const sun = monthGrid(2026, 9, 0);
  assert.ok(sun.every((w) => w.length === 7));
  assert.equal(sun[0][4].key, '2026-10-01'); // Thursday is the 5th column (Sun, Mon, Tue, Wed, Thu)
  assert.equal(sun[0][0].inMonth, false);
  assert.equal(sun.flat().filter((c) => c.inMonth).length, 31);
  const mon = monthGrid(2026, 9, 1);
  assert.equal(mon[0][3].key, '2026-10-01');
  assert.equal(sun.flat().filter((c) => c.inMonth).map((c) => c.day).join(), Array.from({ length: 31 }, (_, i) => i + 1).join());
});

test('grid handles February, leap years, year boundaries and 4-week months', () => {
  const feb = monthGrid(2026, 1, 1); // Feb 2026 starts on a Sunday: 4 weeks with Monday first it is 5 rows (1 Sunday at the end of row 1)
  assert.equal(feb.flat().filter((c) => c.inMonth).length, 28);
  assert.equal(monthGrid(2024, 1, 0).flat().filter((c) => c.inMonth).length, 29);
  assert.equal(monthGrid(2021, 1, 1).length, 4, 'Feb 2021 fits exactly in 4 Monday-first weeks');
  const jan = monthGrid(2027, 0, 0);
  assert.equal(jan[0].find((c) => !c.inMonth)?.key.slice(0, 7), '2026-12');
});

test('add months across years', () => {
  assert.deepEqual(addMonths(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(addMonths(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(addMonths(2026, 5, 0), { year: 2026, month: 5 });
  assert.deepEqual(addMonths(2026, 5, -17), { year: 2025, month: 0 });
  assert.equal(keyOf(2026, 8, 5), '2026-09-05');
});

const w = (id, dateKey, startedMs, sets, volume, prs = 0) => ({ id, dateKey, startedMs, stats: { workingSets: sets, volume, prs } });
const list = [w('a', '2026-10-02', 2, 12, 4000, 1), w('b', '2026-10-02', 3, 5, 800), w('c', '2026-10-20', 4, 10, 3000, 2), w('d', '2026-09-30', 1, 9, 2000)];

test('workouts by day keep several per day, oldest first', () => {
  const m = byDay(list);
  assert.deepEqual(m.get('2026-10-02').map((x) => x.id), ['a', 'b']);
  assert.equal(m.get('2026-10-03'), undefined);
});

test('month stats count distinct days and sums', () => {
  assert.deepEqual(monthStats(list, 2026, 9), { days: 2, workouts: 3, sets: 27, volume: 7800, prs: 3 });
  assert.deepEqual(monthStats(list, 2026, 8), { days: 1, workouts: 1, sets: 9, volume: 2000, prs: 0 });
  assert.deepEqual(monthStats([], 2026, 0), { days: 0, workouts: 0, sets: 0, volume: 0, prs: 0 });
});

test('first month with a workout', () => {
  assert.deepEqual(firstMonth(list, { year: 2030, month: 0 }), { year: 2026, month: 8 });
  assert.deepEqual(firstMonth([], { year: 2030, month: 0 }), { year: 2030, month: 0 });
});

test('week keys: Sunday-first and Monday-first, across a month end', () => {
  assert.deepEqual(weekKeys('2026-10-07', 0), ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
  assert.deepEqual(weekKeys('2026-10-07', 1), ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  assert.equal(weekKeys('2026-10-04', 0)[0], '2026-10-04', 'Sunday itself, Sunday first');
  assert.equal(weekKeys('2026-10-04', 1)[0], '2026-09-28', 'Sunday itself, Monday first');
  assert.deepEqual(weekKeys('2026-12-31', 1).slice(-3), ['2027-01-01', '2027-01-02', '2027-01-03']);
});
