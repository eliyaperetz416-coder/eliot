// Daily and weekly quests. Deterministic from the local date: no rerolls, reset at local midnight / Monday 00:00. Pure.
import { hashSeed, mulberry32 } from './generator.mjs';
import { weekStart } from './charts.mjs';
import { dateKey } from './workout.mjs';
import { isValid, workingSetsOf, prSetsOf } from './game.mjs';
import { RANK_GROUPS } from './ranks.mjs';

export const DAILY_COUNT = 3;

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Quests of the day: 3 daily distinct quests (same every time for that date). */
export function dailyQuests(pool, dayKey) {
  const rng = mulberry32(hashSeed(`daily:${dayKey}`));
  return shuffled(pool.daily, rng).slice(0, DAILY_COUNT).map((q) => ({ ...q, period: 'daily', key: dayKey, claimKey: `d:${dayKey}:${q.id}`, group: q.param === 'group' ? RANK_GROUPS[Math.floor(rng() * RANK_GROUPS.length)] : null, reward: pool.reward.daily }));
}
/** The weekly quest (Monday-based week of the given date). */
export function weeklyQuest(pool, dayKey, nowMs) {
  const [y, m, d] = dayKey.split('-').map(Number);
  const wk = dateKey(weekStart(new Date(y, m - 1, d, 12).getTime()));
  const rng = mulberry32(hashSeed(`weekly:${wk}`));
  const q = shuffled(pool.weekly, rng)[0];
  return { ...q, period: 'weekly', key: wk, claimKey: `w:${wk}:${q.id}`, group: null, reward: pool.reward.weekly };
}

const inPeriod = (q, w) => (q.period === 'daily' ? w.dateKey === q.key : dateKey(weekStart(w.startedMs)) === q.key);

/** Progress of a quest from valid workouts (derived, so edits and deletes stay consistent). `all` = every workout, used for "never done before". */
export function questProgress(q, workouts, byId) {
  const valid = workouts.filter(isValid);
  const inP = valid.filter((w) => inPeriod(q, w));
  switch (q.metric) {
    case 'workouts': return inP.length;
    case 'sets': return inP.reduce((n, w) => n + workingSetsOf(w), 0);
    case 'prs': return inP.reduce((n, w) => n + prSetsOf(w), 0);
    case 'volume': return inP.reduce((n, w) => n + (w.stats?.volume ?? 0), 0);
    case 'sets_group': return inP.reduce((n, w) => n + w.entries.reduce((m, e) => m + (byId[e.exerciseId]?.muscleGroup === q.group ? e.sets.filter((s) => s.done && s.type !== 'warmup').length : 0), 0), 0);
    case 'groups': {
      const g = new Set();
      for (const w of inP) for (const e of w.entries) { const mg = byId[e.exerciseId]?.muscleGroup; if (RANK_GROUPS.includes(mg) && e.sets.some((s) => s.done && s.type !== 'warmup')) g.add(mg); }
      return g.size;
    }
    case 'new_exercises': {
      const firstSeen = new Map();
      for (const w of [...valid].sort((a, b) => a.startedMs - b.startedMs)) for (const e of w.entries) if (e.sets.some((s) => s.done) && !firstSeen.has(e.exerciseId)) firstSeen.set(e.exerciseId, w);
      let n = 0; for (const w of firstSeen.values()) if (inPeriod(q, w)) n++;
      return n;
    }
    default: return 0;
  }
}

/** [{...quest, progress, complete, claimed}] for today (3 daily + the weekly one). */
export function questBoard(pool, dayKey, nowMs, workouts, byId, claimed = {}) {
  return [...dailyQuests(pool, dayKey), weeklyQuest(pool, dayKey, nowMs)].map((q) => {
    const progress = Math.min(q.target, questProgress(q, workouts, byId));
    return { ...q, progress, complete: progress >= q.target, claimed: !!claimed[q.claimKey] };
  });
}
export function claimQuest(game, board, claimKey, nowMs) {
  const q = board.find((x) => x.claimKey === claimKey);
  if (!q || !q.complete || game.quests.claimed[claimKey]) return null;
  const g = structuredClone(game);
  g.quests.claimed[claimKey] = nowMs;
  g.drachmas += q.reward;
  // keep the record small: forget claims older than 60 days of keys
  return { game: g, reward: q.reward };
}
