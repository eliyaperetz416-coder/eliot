import test from 'node:test';
import assert from 'node:assert/strict';
import { newStreak, recordWorkout, settle, view, canRestore, restore, dayNumber, addDays, diffDays, STREAK_MAX_GAP_DAYS, RESTORES } from '../src/core/streak.mjs';
import { dateKey } from '../src/core/workout.mjs';

const run = (dates) => dates.reduce((s, d) => recordWorkout(s, d).streak, newStreak());

test('distance between workout days of 3 or less keeps the streak; 4 or more breaks it', () => {
  assert.equal(STREAK_MAX_GAP_DAYS, 3);
  assert.equal(run(['2026-06-01', '2026-06-02']).current, 2);
  assert.equal(run(['2026-06-01', '2026-06-04']).current, 2, '3 days apart: alive');
  const s = run(['2026-06-01', '2026-06-05']);
  assert.equal(s.current, 1, '4 days apart: a new streak starts');
  assert.deepEqual([s.broken.lostLength, s.broken.brokenOn, s.broken.expiresOn], [1, '2026-06-05', '2026-06-11']);
  assert.equal(s.best, 1);
});

test('two workouts on the same day count once; backdated ones are ignored', () => {
  const s = run(['2026-06-01', '2026-06-01']);
  assert.equal(s.current, 1);
  const r = recordWorkout(run(['2026-06-02']), '2026-06-01');
  assert.equal(r.streak.current, 1); assert.equal(r.extended, false);
});

test('the streak dies passively once 3 empty days have passed', () => {
  const s = run(['2026-06-01', '2026-06-02', '2026-06-03']);
  assert.equal(view(s, '2026-06-06').current, 3, 'days 4, 5, 6: still alive');
  const v = view(s, '2026-06-07');
  assert.equal(v.current, 0); assert.equal(v.broken.lostLength, 3); assert.equal(v.broken.daysLeft, 7);
  assert.equal(view(s, '2026-06-13').broken.daysLeft, 1);
  assert.equal(view(s, '2026-06-14').broken, null, 'restore window over');
  assert.equal(settle(settle(s, '2026-06-07'), '2026-06-07').broken.lostLength, 3, 'settling is idempotent');
});

test('milestones 7, 30 and 100 pay once per streak', () => {
  let s = newStreak(); const paid = [];
  for (let i = 0; i < 101; i++) { const r = recordWorkout(s, addDays('2026-01-01', i)); s = r.streak; paid.push(...r.milestones); }
  assert.deepEqual(paid, [{ days: 7, drachmas: 50 }, { days: 30, drachmas: 200 }, { days: 100, drachmas: 500 }]);
  assert.equal(s.best, 101);
  // a new streak after a break can pay 7 again
  const broken = recordWorkout(run(['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04', '2026-01-05', '2026-01-06', '2026-01-07']), '2026-01-20').streak;
  assert.deepEqual(broken.milestonesPaid, []);
  let t = broken; let again = [];
  for (let i = 1; i < 7; i++) { const r = recordWorkout(t, addDays('2026-01-20', i)); t = r.streak; again.push(...r.milestones); }
  assert.deepEqual(again, [{ days: 7, drachmas: 50 }]);
});

test('restore eligibility: Super up to 30, Mega up to 60, Revive any length, inside the 7 day window', () => {
  const mk = (n) => { let s = newStreak(); for (let i = 0; i < n; i++) s = recordWorkout(s, addDays('2026-01-01', i)).streak; return { s, last: addDays('2026-01-01', n - 1) }; };
  for (const [n, sup, meg, rev] of [[10, true, true, true], [30, true, true, true], [31, false, true, true], [60, false, true, true], [61, false, false, true]]) {
    const { s, last } = mk(n);
    const day = addDays(last, 5); // broken since last + 4
    assert.deepEqual([canRestore(s, 'super', day), canRestore(s, 'mega', day), canRestore(s, 'revive', day)], [sup, meg, rev], `streak ${n}`);
  }
  const { s, last } = mk(20);
  assert.equal(canRestore(s, 'super', addDays(last, 2)), false, 'not broken yet');
  assert.equal(canRestore(s, 'super', addDays(last, 4 + 6)), true, 'last day of the window');
  assert.equal(canRestore(s, 'super', addDays(last, 4 + 7)), false, 'window over');
  assert.equal(canRestore(s, 'nope', addDays(last, 5)), false);
  assert.equal(Object.keys(RESTORES).length, 3);
});

test('restore reinstates the streak as if there had been no gap, once per break', () => {
  let s = run(['2026-03-01', '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05']); // 5 days
  const today = '2026-03-12'; // broken since 03-09
  const fixed = restore(s, 'super', today);
  assert.equal(fixed.current, 5); assert.equal(fixed.broken, null);
  assert.equal(view(fixed, today).current, 5, 'alive today');
  assert.equal(view(fixed, '2026-03-15').current, 5, 'and for the usual 3 days after');
  assert.equal(recordWorkout(fixed, '2026-03-13').streak.current, 6, 'the next workout continues the old streak');
  assert.equal(restore(fixed, 'super', today), null, 'one restore per break');
  // workouts after the break are added on top
  const after = recordWorkout(s, '2026-03-10').streak; // new streak of 1 (since 03-09 break)
  const merged = restore(after, 'revive', '2026-03-11');
  assert.equal(merged.current, 6); assert.equal(merged.best, 6);
  assert.equal(restore(newStreak(), 'revive', '2026-03-11'), null);
  // too long for a Super
  let long = newStreak(); for (let i = 0; i < 31; i++) long = recordWorkout(long, addDays('2026-01-01', i)).streak;
  assert.equal(restore(long, 'super', addDays('2026-01-31', 5)), null);
  assert.equal(restore(long, 'mega', addDays('2026-01-31', 5)).current, 31);
});

test('milestones already paid before a break are not paid again after a restore', () => {
  let s = newStreak(); for (let i = 0; i < 7; i++) s = recordWorkout(s, addDays('2026-05-01', i)).streak;
  assert.deepEqual(s.milestonesPaid, [7]);
  const fixed = restore(s, 'super', addDays('2026-05-07', 6));
  const r = recordWorkout(fixed, addDays('2026-05-07', 7));
  assert.deepEqual(r.milestones, [], '7 was already paid for this streak');
});

test('day maths is independent of time zone and daylight saving', () => {
  assert.equal(diffDays('2026-03-07', '2026-03-09'), 2); assert.equal(diffDays('2026-10-24', '2026-10-26'), 2);
  assert.equal(addDays('2026-03-28', 1), '2026-03-29'); assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(dayNumber('1970-01-02'), 1);
  const saved = process.env.TZ;
  try {
    for (const tz of ['America/New_York', 'Asia/Jerusalem', 'Pacific/Auckland', 'UTC']) {
      process.env.TZ = tz;
      // noon and 23:30 around the spring and autumn clock changes: local keys must be consecutive days
      for (const [y, m, d] of [[2026, 2, 7], [2026, 2, 28], [2026, 9, 24], [2026, 9, 31 - 5]]) {
        const keys = [0, 1, 2, 3].flatMap((i) => [new Date(y, m, d + i, 12, 0).getTime(), new Date(y, m, d + i, 23, 30).getTime()]).map(dateKey);
        for (let i = 0; i < keys.length; i += 2) assert.equal(keys[i], keys[i + 1], `${tz}: same local day ${keys[i]}`);
        for (let i = 2; i < keys.length; i += 2) assert.equal(diffDays(keys[i - 2], keys[i]), 1, `${tz}: consecutive days across a clock change`);
      }
      const s = run([dateKey(new Date(2026, 2, 28, 22).getTime()), dateKey(new Date(2026, 2, 29, 0, 30).getTime()), dateKey(new Date(2026, 2, 31, 8).getTime())]);
      assert.equal(s.current, 3, `${tz}: a streak over a clock change`);
    }
  } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
});
