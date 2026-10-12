// Rank bonuses on top of strength (OUR DESIGN, v1.34). Strength (your best sets) stays the main thing; these are the other ways to rise
// when you cannot add weight. Each one has its own maximum. Everything is worked out from your workouts, so all of them except the
// milestones fade by themselves if you stop. Pure.
import { consistencyBonus, BONUS } from './consistency.mjs';
import { muscleRatings } from './ranks.mjs';

export const PARTS = Object.freeze({
  VOLUME_MAX: 38,          // this week's volume vs your average week over the 4 weeks before: 1.25 points per 1% more, up to +30%
  VOLUME_PER_PCT: 1.25,
  COVER_PER_GROUP: 2.5,    // points per main muscle group trained in the last 7 days (rounded)
  COVER_MAX: 25,
  BALANCE_MAX: 13,         // weakest main group relative to your strongest one (needs all 10 groups ranked)
  MILESTONES: Object.freeze([[25, 8], [50, 15], [100, 25], [200, 38]]), // permanent: workouts done -> points
  GOAL_WEEKS: 5,           // the current week and the 4 before it
  GOAL_POINTS_PER_WEEK: 5, // for each week with at least your weekly goal of training days
  GOAL_MAX: 25,
});
export const MAIN_GROUPS = Object.freeze(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs']);

let defaultGoal = 3;
/** The weekly goal (training days) comes from Settings; the app sets it here so the pure rank code can use it. */
export const setWeeklyGoal = (n) => { defaultGoal = Math.min(7, Math.max(1, Math.round(Number(n)) || 3)); };

const DAY = 86400000;
const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
const mondayOf = (ms) => { const d = new Date(dayStart(ms)); return d.getTime() - ((d.getDay() + 6) % 7) * DAY; };

/** This week's (last 7 days) volume against the average week of the 28 days before. */
export function volumeBonus(workouts, now) {
  const vol = (w) => w.stats?.volume ?? 0;
  const done = workouts.filter((w) => w.endedMs && w.endedMs <= now);
  const cur = done.filter((w) => now - w.endedMs < 7 * DAY).reduce((n, w) => n + vol(w), 0);
  const prior = done.filter((w) => now - w.endedMs >= 7 * DAY && now - w.endedMs < 35 * DAY);
  const avg = prior.reduce((n, w) => n + vol(w), 0) / 4;
  if (prior.length < 2 || !(avg > 0)) return { points: 0, pct: 0, week: Math.round(cur), avg: Math.round(avg || 0) };
  const pct = Math.round((cur / avg - 1) * 100);
  return { points: Math.max(0, Math.min(PARTS.VOLUME_MAX, Math.floor(pct * PARTS.VOLUME_PER_PCT))), pct, week: Math.round(cur), avg: Math.round(avg) };
}

/** Main muscle groups trained in the last 7 days + how even your group ratings are. */
export function balanceBonus(workouts, byId, ratings, now) {
  const hit = new Set();
  for (const w of workouts) {
    if (!w.endedMs || w.endedMs > now || now - w.endedMs >= 7 * DAY) continue;
    for (const e of w.entries ?? []) {
      const g = byId[e.exerciseId]?.muscleGroup;
      if (MAIN_GROUPS.includes(g) && e.sets?.some((s) => s.done && s.type !== 'warmup')) hit.add(g);
    }
  }
  const coverPoints = Math.min(PARTS.COVER_MAX, Math.round(hit.size * PARTS.COVER_PER_GROUP));
  const g = muscleRatings(ratings ?? {}, byId);
  const list = MAIN_GROUPS.map((x) => g[x] ?? 0);
  const balancePoints = list.every((r) => r > 0) ? Math.round((PARTS.BALANCE_MAX * Math.min(...list)) / Math.max(...list)) : 0;
  return { cover: hit.size, coverPoints, balancePoints, points: coverPoints + balancePoints };
}

export function milestoneBonus(workouts) {
  const n = new Set(workouts.filter((w) => w.endedMs).map((w) => w.id ?? w.endedMs)).size;
  let points = 0, next = null;
  for (const [count, pts] of PARTS.MILESTONES) { if (n >= count) points = pts; else if (!next) next = { count, pts }; }
  return { points, workouts: n, next };
}

/** Weeks (Monday to Sunday, the current one and the 4 before) with at least `goal` training days. */
export function goalBonus(workouts, now, goal = defaultGoal) {
  const days = new Set(workouts.filter((w) => w.endedMs && w.endedMs <= now).map((w) => dayStart(w.endedMs)));
  const thisMonday = mondayOf(now);
  let weeks = 0;
  for (let i = 0; i < PARTS.GOAL_WEEKS; i++) {
    const start = thisMonday - i * 7 * DAY;
    let n = 0;
    for (let d = 0; d < 7; d++) if (days.has(start + d * DAY)) n++;
    if (n >= goal) weeks++;
  }
  return { points: Math.min(PARTS.GOAL_MAX, weeks * PARTS.GOAL_POINTS_PER_WEEK), weeks, goal };
}

/**
 * Everything that adds to the overall rating besides strength. `ratings` is { exerciseId: bestRating }.
 * Returns { total, max, parts: { consistency, volume, balance, milestones, goal } } (each part has its own `points`).
 */
export function rankBonus({ workouts, byId, ratings, now = Date.now(), weeklyGoal } = {}) {
  const consistency = consistencyBonus(workouts, now);
  const volume = volumeBonus(workouts, now);
  const balance = balanceBonus(workouts, byId, ratings, now);
  const milestones = milestoneBonus(workouts);
  const goal = goalBonus(workouts, now, weeklyGoal ?? defaultGoal);
  const parts = { consistency: { ...consistency, points: consistency.total }, volume, balance, milestones, goal };
  const total = Object.values(parts).reduce((n, p) => n + p.points, 0);
  return { total, max: MAX_BONUS, parts };
}
export const MAX_BONUS = BONUS.MAX + PARTS.VOLUME_MAX + PARTS.COVER_MAX + PARTS.BALANCE_MAX + PARTS.MILESTONES[PARTS.MILESTONES.length - 1][1] + PARTS.GOAL_MAX;
