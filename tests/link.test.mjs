import test from 'node:test';
import assert from 'node:assert/strict';
import { linkSnapshot, linkCode, recentPRs, topSeries, LINK_CODE_PREFIX, LINK_MAX_CHARS, LINK_VERSION } from '../src/core/link.mjs';
import { newGame } from '../src/core/gamestate.mjs';
import { bestsFrom, ratingsOf } from '../src/core/post.mjs';
import { session, byId, ID, DAY } from './helpers.mjs';

const T0 = Date.UTC(2026, 9, 1, 9); // 2026-10-01

function history() {
  let ws = [];
  ws = session([['bench', 60, 8], ['bench', 60, 8], ['squat', 80, 5], ['squat', 80, 5]], ws, T0);
  ws = session([['bench', 65, 8], ['bench', 65, 8], ['squat', 85, 5], ['curl', 30, 10]], ws, T0 + 3 * DAY);
  ws = session([['bench', 70, 6], ['squat', 90, 5], ['squat', 90, 5], ['dead', 120, 5]], ws, T0 + 6 * DAY);
  return ws;
}

const build = (ws, nowMs, extra = {}) => linkSnapshot({
  workouts: ws, ratings: ratingsOf(bestsFrom(ws)), overall: { pending: true, remaining: 1, rating: 0 },
  game: { ...newGame(), xp: 260 }, streak: { current: 3, best: 4, lastWorkoutDate: '2026-10-07' }, byId, nowMs, todayKey: '2026-10-08', ...extra,
});

test('connection code: prefix + token', () => {
  assert.equal(linkCode('ab'.repeat(32)), `${LINK_CODE_PREFIX}${'ab'.repeat(32)}`);
});

test('snapshot: summary numbers, level, streak, counts, last workout', () => {
  const ws = history();
  const s = build(ws, T0 + 7 * DAY);
  assert.equal(s.v, LINK_VERSION);
  assert.deepEqual([s.level.level, s.level.into, s.level.need], [3, 35, 150]); // 260 xp: 100 (to 2) + 125 (to 3), 35 into level 3
  assert.equal(s.level.xp, 260);
  assert.deepEqual(s.streak, { current: 3, best: 4, last: '2026-10-07' });
  assert.equal(s.counts.total, 3);
  assert.equal(s.counts.month, 3);
  assert.equal(s.counts.week, 1, 'week of Monday 2026-10-05 holds only the 2026-10-07 workout (10-04 is the Sunday before)');
  assert.equal(s.last.date, '2026-10-07');
  assert.ok(s.last.volume > 0 && s.last.sets === 4);
  assert.equal(s.last.minutes > 0, true);
  assert.deepEqual(s.rank, { pending: true, remaining: 1 });
});

test('snapshot: rank when the overall rating exists', () => {
  const s = build(history(), T0 + 7 * DAY, { overall: { pending: false, rating: 612.4 } });
  assert.equal(s.rank.pending, false);
  assert.equal(s.rank.rating, 612);
  assert.equal(s.rank.tier, 'diamond');
  assert.equal(s.rank.division, 'V');
});

test('snapshot: never shares bodyweight, notes or raw sets', () => {
  const s = build(history(), T0 + 7 * DAY);
  const text = JSON.stringify(s);
  for (const word of ['bodyweight', 'notes', 'entries', '"sets":[', 'photo', 'token']) assert.equal(text.includes(word), false, word);
  assert.deepEqual(Object.keys(s).sort(), ['at', 'counts', 'last', 'level', 'muscles', 'prs', 'rank', 'streak', 'top', 'v', 'weeklyCount', 'weeklyVolume']);
});

test('PRs: latest all-time best per exercise, newest first, both names', () => {
  const ws = history();
  const prs = recentPRs(ws, byId, T0 + 7 * DAY);
  assert.ok(prs.length >= 2);
  assert.equal(prs[0].date, '2026-10-07');
  const ids = prs.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'one row per exercise');
  const bench = prs.find((p) => p.id === ID.bench);
  assert.ok(bench && bench.he && bench.en && bench.unit === 'kg' && bench.weight === 70 && bench.reps === 6);
  assert.deepEqual(recentPRs(ws, byId, T0 + 200 * DAY), [], 'older than 60 days is not recent');
});

test('top exercises: most trained first, with a dated series', () => {
  const top = topSeries(history(), byId, T0 + 7 * DAY);
  assert.equal(top.length, 3);
  assert.deepEqual(top.slice(0, 2).map((x) => x.id).sort(), [ID.bench, ID.squat].sort());
  const squat = top.find((x) => x.id === ID.squat);
  assert.equal(squat.points.length, 3);
  assert.match(squat.points[0].d, /^2026-10-0\d$/);
  assert.ok(squat.points[2].v > squat.points[0].v, 'heavier squats give a higher estimate');
});

test('charts: 12 weekly volume buckets and 8 weekly counts, newest last', () => {
  const s = build(history(), T0 + 7 * DAY);
  assert.equal(s.weeklyVolume.length, 12);
  assert.equal(s.weeklyCount.length, 8);
  assert.equal(s.weeklyCount.reduce((n, b) => n + b.v, 0), 3);
  assert.ok(s.weeklyVolume.at(-1).v > 0);
  assert.match(s.weeklyVolume[0].d, /^\d{4}-\d{2}-\d{2}$/);
});

test('muscles: only groups with a rating', () => {
  const s = build(history(), T0 + 7 * DAY);
  assert.ok(Object.values(s.muscles).every((r) => r > 0));
  assert.ok('chest' in s.muscles);
});

test('empty app: a valid small snapshot', () => {
  const s = linkSnapshot({ workouts: [], ratings: {}, overall: { pending: true, remaining: 3, rating: 0 }, game: newGame(), streak: { current: 0, best: 0, lastWorkoutDate: null }, byId, nowMs: T0, todayKey: '2026-10-01' });
  assert.equal(s.last, null);
  assert.deepEqual(s.prs, []);
  assert.deepEqual(s.top, []);
  assert.equal(s.counts.total, 0);
});

test('stays under the size cap with a long history', () => {
  let ws = [];
  const ids = Object.keys(byId).filter((id) => byId[id].ranked && byId[id].type !== 'time').slice(0, 30);
  for (let d = 0; d < 80; d++) ws = session(ids.slice(d % 10, d % 10 + 6).map((id) => [id, 40 + d, 8]), ws, T0 + d * DAY);
  const s = build(ws, T0 + 80 * DAY);
  assert.ok(JSON.stringify(s).length <= LINK_MAX_CHARS, String(JSON.stringify(s).length));
});
