import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyQuests, weeklyQuest, questBoard, questProgress, claimQuest, DAILY_COUNT } from '../src/core/quests.mjs';
import { weekStart } from '../src/core/charts.mjs';
import { dateKey } from '../src/core/workout.mjs';
import { addDays } from '../src/core/streak.mjs';
import { pool, byId, newGame, playSession, DAY, HOUR } from './helpers.mjs';
import { RANK_GROUPS } from '../src/core/ranks.mjs';

const T0 = new Date(2026, 5, 3, 10, 0).getTime(); // Wednesday 2026-06-03
const KEY = dateKey(T0);

test('daily quests: 3 distinct, deterministic for a date, different across dates, no rerolls', () => {
  const a = dailyQuests(pool, KEY), b = dailyQuests(pool, KEY);
  assert.equal(a.length, DAILY_COUNT);
  assert.deepEqual(a.map((q) => [q.id, q.group]), b.map((q) => [q.id, q.group]));
  assert.equal(new Set(a.map((q) => q.id)).size, 3);
  const days = new Set(); for (let i = 0; i < 30; i++) days.add(dailyQuests(pool, addDays(KEY, i)).map((q) => q.id).join());
  assert.ok(days.size > 5, 'varies over the month');
  for (const q of a) { assert.equal(q.reward, 15); assert.equal(q.period, 'daily'); assert.equal(q.claimKey, `d:${KEY}:${q.id}`); }
  for (let i = 0; i < 40; i++) for (const q of dailyQuests(pool, addDays(KEY, i))) if (q.param === 'group') assert.ok(RANK_GROUPS.includes(q.group)); else assert.equal(q.group, null);
});

test('weekly quest: same all week (Monday to Sunday), changes next Monday, worth 60', () => {
  const mon = '2026-06-01';
  const ids = Array.from({ length: 7 }, (_, i) => weeklyQuest(pool, addDays(mon, i)).id);
  assert.equal(new Set(ids).size, 1);
  assert.equal(weeklyQuest(pool, mon).key, mon); assert.equal(weeklyQuest(pool, '2026-06-07').key, mon, 'Sunday belongs to the week of the 1st');
  assert.equal(weeklyQuest(pool, '2026-06-08').key, '2026-06-08');
  const q = weeklyQuest(pool, mon); assert.equal(q.reward, 60); assert.equal(q.period, 'weekly');
  const seen = new Set(); for (let i = 0; i < 20; i++) seen.add(weeklyQuest(pool, addDays(mon, 7 * i)).id);
  assert.ok(seen.size >= 3, 'rotates between weeks');
});

test('quest board resets at local midnight and the week at Monday 00:00', () => {
  const late = new Date(2026, 5, 3, 23, 59).getTime(), early = new Date(2026, 5, 4, 0, 1).getTime();
  assert.notEqual(dateKey(late), dateKey(early));
  assert.notDeepEqual(dailyQuests(pool, dateKey(late)).map((q) => q.claimKey), dailyQuests(pool, dateKey(early)).map((q) => q.claimKey));
  const sun = new Date(2026, 5, 7, 23, 59).getTime(), mon = new Date(2026, 5, 8, 0, 1).getTime();
  assert.notEqual(dateKey(weekStart(sun)), dateKey(weekStart(mon)));
});

const find = (board, metric) => board.find((q) => q.metric === metric);
const fixedPool = (daily, weekly) => ({ reward: pool.reward, daily, weekly });
const only = (id) => [pool.daily.find((q) => q.id === id), pool.daily.find((q) => q.id === id), pool.daily.find((q) => q.id === id)];

test('progress comes from valid workouts only (3+ working sets), within the period', () => {
  let s = playSession([['bench', 100, 5], ['bench', 100, 5]], [], newGame(), T0); // invalid
  const q = { ...pool.daily.find((x) => x.id === 'd_finish'), period: 'daily', key: KEY };
  assert.equal(questProgress(q, s.workouts, byId), 0);
  s = playSession([['bench', 100, 5], ['bench', 100, 5], ['bench', 102.5, 5], ['squat', 100, 5]], s.workouts, s.game, T0 + 2 * HOUR);
  assert.equal(questProgress(q, s.workouts, byId), 1);
  assert.equal(questProgress({ ...q, key: addDays(KEY, 1) }, s.workouts, byId), 0, 'yesterday and tomorrow are separate');
  const sets = { ...pool.daily.find((x) => x.id === 'd_sets'), period: 'daily', key: KEY };
  assert.equal(questProgress(sets, s.workouts, byId), 4);
  const pr = { ...pool.daily.find((x) => x.id === 'd_pr'), period: 'daily', key: KEY };
  assert.ok(questProgress(pr, s.workouts, byId) >= 1);
  const groups = { ...pool.daily.find((x) => x.id === 'd_groups'), period: 'daily', key: KEY };
  assert.equal(questProgress(groups, s.workouts, byId), 2, 'chest and quads');
  const grp = { ...pool.daily.find((x) => x.id === 'd_group'), period: 'daily', key: KEY, group: 'chest' };
  assert.equal(questProgress(grp, s.workouts, byId), 3);
  assert.equal(questProgress({ ...grp, group: 'back' }, s.workouts, byId), 0);
});

test('weekly volume, workouts and "never done before" quests', () => {
  let s = playSession([['bench', 100, 10], ['bench', 100, 10], ['bench', 100, 10], ['bench', 100, 10], ['bench', 100, 10], ['bench', 100, 10]], [], newGame(), T0); // 6000 kg
  const wk = dateKey(weekStart(T0));
  const vol = { ...pool.weekly.find((x) => x.id === 'w_volume'), period: 'weekly', key: wk };
  assert.equal(questProgress(vol, s.workouts, byId), 6000);
  assert.equal(questProgress({ ...vol, key: '2026-06-08' }, s.workouts, byId), 0);
  const nw = { ...pool.daily.find((x) => x.id === 'd_new'), period: 'daily', key: KEY };
  assert.equal(questProgress(nw, s.workouts, byId), 1);
  s = playSession([['bench', 100, 5], ['bench', 100, 5], ['bench', 100, 5]], s.workouts, s.game, T0 + DAY);
  assert.equal(questProgress({ ...nw, key: addDays(KEY, 1) }, s.workouts, byId), 0, 'bench is no longer new');
  s = playSession([['squat', 100, 5], ['squat', 100, 5], ['squat', 100, 5]], s.workouts, s.game, T0 + 2 * DAY);
  assert.equal(questProgress({ ...nw, key: addDays(KEY, 2) }, s.workouts, byId), 1);
  const wo = { ...pool.weekly.find((x) => x.id === 'w_workouts'), period: 'weekly', key: wk };
  assert.equal(questProgress(wo, s.workouts, byId), 3);
});

test('board: progress is capped at the target; claiming pays once and only when complete', () => {
  const p = fixedPool(pool.daily, [pool.weekly.find((x) => x.id === 'w_workouts')]);
  let g = newGame();
  let board = questBoard(p, KEY, T0, [], byId, g.quests.claimed);
  assert.equal(board.length, 4); assert.ok(board.every((q) => !q.complete && !q.claimed));
  assert.equal(claimQuest(g, board, board[0].claimKey, T0), null, 'cannot claim an unfinished quest');
  const s = playSession([['bench', 100, 5], ['bench', 100, 5], ['bench', 100, 5], ['squat', 100, 5], ['squat', 100, 5], ['squat', 100, 5], ['bench', 120, 5], ['bench', 120, 5], ['bench', 120, 5], ['squat', 100, 5], ['deadlift' === 'x' ? 'x' : 'squat', 100, 5], ['squat', 100, 5], ['squat', 100, 5], ['squat', 100, 5], ['squat', 100, 5]], [], g, T0);
  board = questBoard(p, KEY, T0 + 3 * HOUR, s.workouts, byId, s.game.quests.claimed);
  const done = board.filter((q) => q.complete);
  assert.ok(done.length >= 2);
  for (const q of done) assert.ok(q.progress <= q.target);
  const c = claimQuest(s.game, board, done[0].claimKey, T0);
  assert.equal(c.reward, done[0].reward); assert.equal(c.game.drachmas, s.game.drachmas + done[0].reward);
  assert.equal(claimQuest(c.game, questBoard(p, KEY, T0, s.workouts, byId, c.game.quests.claimed), done[0].claimKey, T0), null, 'claimed only once');
  assert.equal(questBoard(p, KEY, T0, s.workouts, byId, c.game.quests.claimed).find((q) => q.claimKey === done[0].claimKey).claimed, true);
});

test('posting reports the quests that just became complete', () => {
  const s = playSession([['bench', 100, 5], ['bench', 100, 5], ['bench', 100, 5]], [], newGame(), T0);
  const board = questBoard(pool, KEY, T0, s.workouts, byId, {});
  const finishToday = board.find((q) => q.id === 'd_finish');
  if (finishToday) assert.ok(s.rewards.questsCompleted.includes(finishToday.claimKey));
  assert.ok(Array.isArray(s.rewards.questsCompleted));
});

test('quest pool is valid: unique ids, both languages, placeholders match, rewards 15 and 60', () => {
  const all = [...pool.daily, ...pool.weekly];
  assert.equal(new Set(all.map((q) => q.id)).size, all.length);
  assert.deepEqual(pool.reward, { daily: 15, weekly: 60 });
  assert.ok(pool.daily.length >= 5 && pool.weekly.length >= 4);
  for (const q of all) {
    assert.ok(q.textEn && q.textHe && q.target > 0, q.id);
    for (const ph of ['{target}', '{group}']) assert.equal(q.textEn.includes(ph), q.textHe.includes(ph), `${q.id} ${ph}`);
    assert.equal(q.textEn.includes('{group}'), q.param === 'group');
    assert.ok(['workouts', 'sets', 'prs', 'volume', 'sets_group', 'groups', 'new_exercises'].includes(q.metric));
  }
  assert.ok(pool.weekly.some((q) => q.metric === 'volume' && q.target === 5000), '5,000 kg weekly volume quest');
});
