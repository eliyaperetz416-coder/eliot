import test from 'node:test';
import assert from 'node:assert/strict';
import { e1rmSeries, exercisesWithData, weekStart, weeklyVolume, bodyweightSeries, niceTicks, layoutSeries, linePath, areaPath } from '../src/core/charts.mjs';
import { cardModel, cardFileName } from '../src/core/card.mjs';
import { byId, session, DAY, ID } from './helpers.mjs';

const T0 = new Date(2026, 5, 3, 10, 0).getTime(); // a Wednesday, local time
let ws = session([['bench', 100, 5], ['squat', 140, 5]], [], T0);
ws = session([['bench', 105, 5], ['bench', 60, 10, 'warmup']], ws, T0 + 2 * DAY);
ws = session([['bench', 110, 3]], ws, T0 + 9 * DAY);

test('e1RM series: best per workout, warm-ups ignored, oldest first', () => {
  const s = e1rmSeries(ws, ID.bench, byId);
  assert.equal(s.length, 3);
  assert.ok(s[0].t < s[1].t && s[1].t < s[2].t);
  assert.equal(s[0].v, Math.round(100 * (1 + 5 / 30) * 10) / 10);
  assert.equal(s[1].v, Math.round(105 * (1 + 5 / 30) * 10) / 10);
  assert.equal(e1rmSeries(ws, ID.curl, byId).length, 0);
  assert.deepEqual(exercisesWithData(ws, byId), [ID.bench, ID.squat]);
});

test('week start is the local Monday; weekly volume buckets cover the last N weeks', () => {
  const mon = weekStart(T0);
  assert.equal(new Date(mon).getDay(), 1); assert.equal(new Date(mon).getHours(), 0);
  assert.equal(weekStart(mon), mon); assert.equal(new Date(weekStart(new Date(2026, 5, 7, 23, 59).getTime())).getDate(), 1, 'Sunday belongs to the week that started on Monday the 1st');
  const v = weeklyVolume(ws, T0 + 9 * DAY, 4);
  assert.equal(v.length, 4);
  assert.ok(v.every((b, i) => i === 0 || b.t > v[i - 1].t));
  const total = v.reduce((n, b) => n + b.v, 0);
  assert.equal(total, ws.reduce((n, w) => n + w.stats.volume, 0));
  assert.equal(v[3].v, 110 * 3, 'current week holds the last workout');
  assert.equal(v[2].v, ws[0].stats.volume + ws[1].stats.volume);
  assert.equal(weeklyVolume([], T0, 3).every((b) => b.v === 0), true);
});

test('weeks are correct across a DST change', () => {
  const beforeDst = new Date(2026, 2, 25, 12).getTime(), afterDst = new Date(2026, 2, 31, 12).getTime(); // Israel/EU spring forward
  const v = weeklyVolume([{ startedMs: afterDst, stats: { volume: 500 }, entries: [] }], afterDst, 3);
  assert.equal(v[2].v, 500);
  for (const b of v) assert.equal(new Date(b.t).getHours(), 0, 'every bucket starts at local midnight');
  assert.ok(weekStart(beforeDst) < weekStart(afterDst));
});

test('bodyweight series', () => {
  const s = bodyweightSeries([{ ms: 5, kg: 81 }, { ms: 1, kg: 80 }]);
  assert.deepEqual(s, [{ t: 1, v: 80 }, { t: 5, v: 81 }]);
});

test('niceTicks covers the range with round steps', () => {
  const t = niceTicks(73, 118, 4);
  assert.ok(t[0] <= 73 && t[t.length - 1] >= 118);
  const step = t[1] - t[0];
  assert.ok(t.every((v, i) => i === 0 || Math.abs(v - t[i - 1] - step) < 1e-6));
  assert.ok(niceTicks(5, 5).length >= 2);
});

test('layout: LTR puts old on the left, RTL mirrors time and moves the value axis to the right', () => {
  const series = [{ t: 0, v: 80 }, { t: 10, v: 90 }, { t: 20, v: 100 }];
  const l = layoutSeries(series, { rtl: false }), r = layoutSeries(series, { rtl: true });
  assert.ok(l.points[0].x < l.points[2].x && r.points[0].x > r.points[2].x);
  assert.ok(l.axisX < 100 && r.axisX > 200);
  for (const p of [...l.points, ...r.points]) assert.ok(p.x >= 0 && p.x <= 340 && p.y >= 0 && p.y <= 200);
  assert.ok(l.points[2].y < l.points[0].y, 'higher value is higher on screen');
  assert.equal(layoutSeries([{ t: 5, v: 70 }]).points.length, 1);
  assert.equal(layoutSeries([]).points.length, 0);
  const bars = layoutSeries(series, { bars: true, zeroBase: true });
  assert.equal(bars.yMin, 0); assert.ok(bars.barWidth > 0);
  assert.match(linePath(l.points), /^M[\d. ]+L/); assert.match(areaPath(l.points, 170), /Z$/); assert.equal(areaPath([], 1), '');
});

test('card model: pending vs ranked, placeholders, file name', () => {
  const profile = { name: 'Elia' };
  const pend = cardModel({ profile, overall: { pending: true, remaining: 2 } });
  assert.deepEqual([pend.pending, pend.remaining, pend.tier, pend.rating], [true, 2, null, 0]);
  const ranked = cardModel({ profile, overall: { pending: false, rating: 563 }, workoutsCount: 3 });
  assert.deepEqual([ranked.tier, ranked.division, ranked.lp, ranked.level, ranked.streak, ranked.achievements], ['platinum', 'II', 15, null, null, null]);
  assert.equal(ranked.slots.length, 3);
  assert.equal(cardModel({ profile, overall: { pending: false, rating: 1100 } }).division, null);
  assert.equal(cardFileName('Elia B.'), 'demigod-elia-b.png'); assert.equal(cardFileName(''), 'demigod-card.png'); assert.equal(cardFileName('אליה'), 'demigod-אליה.png');
});
