import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, newlyUnlocked, unlock, progressOf } from '../src/core/achievements.mjs';
import { evaluateAchievements } from '../src/core/gamestate.mjs';
import { achievements, playSession, newGame, THREE, DAY, HOUR } from './helpers.mjs';
import { rankIndex } from '../src/core/post.mjs';

const T0 = new Date(2026, 5, 3, 10, 0).getTime();

test('about 25 achievements, unique ids, both languages, each with a reward', () => {
  assert.ok(achievements.length >= 25 && achievements.length <= 30, `${achievements.length}`);
  assert.equal(new Set(achievements.map((a) => a.id)).size, achievements.length);
  for (const a of achievements) { assert.ok(a.nameEn && a.nameHe && a.descEn && a.descHe && a.icon && a.target > 0 && a.reward > 0, a.id); assert.ok(['workouts', 'streak', 'prs', 'rank', 'volume', 'tried', 'custom', 'plans'].includes(a.metric)); }
  const by = (m) => achievements.filter((a) => a.metric === m).map((a) => a.target);
  assert.deepEqual(by('workouts'), [1, 10, 50, 100, 250]); assert.deepEqual(by('streak'), [7, 30, 100]); assert.deepEqual(by('prs'), [1, 10, 50]);
  assert.deepEqual(by('volume'), [10000, 100000, 1000000]); assert.deepEqual(by('tried'), [10, 50]);
  assert.equal(by('rank').length, 9); assert.deepEqual(by('rank'), [5, 10, 15, 20, 25, 30, 35, 40, 45]);
  assert.equal(rankIndex(200), 5, 'Bronze V'); assert.equal(rankIndex(1000), 45, 'Greek God');
});

test('workout achievements unlock when posting and pay a small reward once', () => {
  const s = playSession(THREE, [], newGame(), T0);
  assert.ok(s.rewards.achievements.includes('workouts_1'));
  assert.ok(s.game.achievements.unlocked.workouts_1);
  assert.equal(s.rewards.achievementDrachmas > 0, true);
  const again = playSession(THREE, s.workouts, s.game, T0 + DAY);
  assert.equal(again.rewards.achievements.includes('workouts_1'), false, 'only once');
  assert.equal(again.game.drachmas, s.game.drachmas + again.rewards.drachmas + again.rewards.achievementDrachmas);
});

test('invalid workouts do not count; volume, PR and exercise-tried triggers', () => {
  const inv = playSession([['bench', 100, 5]], [], newGame(), T0);
  assert.equal(inv.rewards.achievements.length, 0);
  const s = playSession([['bench', 200, 10], ['bench', 200, 10], ['bench', 210, 10], ['squat', 150, 10], ['squat', 150, 10], ['dead', 150, 10], ['row', 60, 10], ['ohp', 40, 10], ['curl', 30, 10], ['plank', null, 60]], [], newGame(), T0);
  assert.ok(s.game.achievements.unlocked.volume_10k, 'volume > 10,000 kg');
  assert.ok(s.game.achievements.unlocked.prs_1);
  assert.equal(s.game.achievements.unlocked.tried_10, undefined, '8 or 9 exercises is not 10');
  const stats = computeStats({ workouts: s.workouts, game: s.game });
  assert.ok(stats.tried >= 7 && stats.volume > 10000);
});

test('streak and rank achievements follow the game state; rank never goes backwards', () => {
  let s = playSession(THREE, [], newGame(), T0);
  for (let i = 1; i < 7; i++) s = playSession(THREE, s.workouts, s.game, T0 + i * DAY);
  assert.equal(s.game.streak.current, 7);
  assert.ok(s.game.achievements.unlocked.streak_7); assert.equal(s.game.achievements.unlocked.streak_30, undefined);
  const g = structuredClone(s.game); g.maxRankIndex = 26;
  const ev = evaluateAchievements({ game: g, achievements, workouts: s.workouts, customCount: 0, plansCount: 0, dayKey: '2026-06-10' });
  const ids = ev.unlocked.map((a) => a.id);
  assert.ok(['tier_bronze', 'tier_silver', 'tier_gold', 'tier_platinum', 'tier_diamond'].every((id) => ids.includes(id) || g.achievements.unlocked[id]));
  assert.equal(ids.includes('tier_champion'), false);
});

test('custom exercise and generated plan achievements unlock outside of workouts', () => {
  const g = newGame();
  const a = evaluateAchievements({ game: g, achievements, workouts: [], customCount: 1, plansCount: 0, dayKey: '2026-06-03' });
  assert.deepEqual(a.unlocked.map((x) => x.id), ['custom_1']); assert.equal(a.game.drachmas, 30);
  const b = evaluateAchievements({ game: a.game, achievements, workouts: [], customCount: 1, plansCount: 1, dayKey: '2026-06-04' });
  assert.deepEqual(b.unlocked.map((x) => x.id), ['plan_1']);
  const c = evaluateAchievements({ game: b.game, achievements, workouts: [], customCount: 3, plansCount: 2, dayKey: '2026-06-05' });
  assert.deepEqual(c.unlocked, []); assert.equal(c.game, b.game);
});

test('helpers: newlyUnlocked, unlock rewards, progress fraction', () => {
  const stats = { workouts: 10, streak: 0, prs: 0, rank: -1, volume: 0, tried: 0, custom: 0, plans: 0 };
  const fresh = newlyUnlocked(achievements, stats, newGame());
  assert.deepEqual(fresh.map((a) => a.id), ['workouts_1', 'workouts_10']);
  const r = unlock(newGame(), fresh, '2026-06-03');
  assert.equal(r.reward, fresh.reduce((n, a) => n + a.reward, 0)); assert.equal(r.game.achievements.unlocked.workouts_10, '2026-06-03');
  assert.equal(progressOf(achievements.find((a) => a.id === 'workouts_50'), stats), 0.2);
});
