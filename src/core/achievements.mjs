// Achievements: ~27 in src/data/achievements.json. Unlocked once, with a small drachma reward. Pure.
import { isValid, prSetsOf } from './game.mjs';

/** stats: { workouts, streak (best), prs, rank (highest overall rank index ever), volume, tried, custom, plans } */
export function computeStats({ workouts, game, customCount = 0, plansCount = 0 }) {
  const valid = workouts.filter(isValid);
  const tried = new Set();
  let volume = 0, prs = 0;
  for (const w of valid) {
    volume += w.stats?.volume ?? 0; prs += prSetsOf(w);
    for (const e of w.entries) if (e.sets.some((s) => s.done)) tried.add(e.exerciseId);
  }
  return { workouts: valid.length, streak: game.streak.best, prs, rank: game.maxRankIndex ?? -1, volume, tried: tried.size, custom: customCount, plans: plansCount };
}

export const isUnlockable = (a, stats) => (stats[a.metric] ?? 0) >= a.target;

/** Newly unlocked achievements (not in game.achievements.unlocked yet). */
export function newlyUnlocked(list, stats, game) {
  return list.filter((a) => !game.achievements.unlocked[a.id] && isUnlockable(a, stats));
}
export function unlock(game, achievements, dayKey) {
  const g = structuredClone(game);
  let reward = 0;
  for (const a of achievements) { if (g.achievements.unlocked[a.id]) continue; g.achievements.unlocked[a.id] = dayKey; reward += a.reward; }
  g.drachmas += reward;
  return { game: g, reward };
}
/** Progress toward a locked achievement: 0..1 */
export const progressOf = (a, stats) => Math.min(1, (stats[a.metric] ?? 0) / a.target);
