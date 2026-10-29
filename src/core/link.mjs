// The link to Habit Coach (the owner's habit app): what is shared and the connection code. Pure. The server part is in src/ui/link-state.js.
// OUR DESIGN: only a summary is shared. Never bodyweight, photos, notes or the raw list of sets.
import { tierFor, muscleRatings } from './ranks.mjs';
import { levelFromXp } from './game.mjs';
import { weeklyVolume, weeklyCount, e1rmSeries } from './charts.mjs';
import { weekStart } from './crew.mjs';
import { dateKey } from './workout.mjs';

export const LINK_VERSION = 1;
export const LINK_CODE_PREFIX = 'DG1-';
/** The snapshot must stay under the server cap (24 KB); we aim well below it. */
export const LINK_MAX_CHARS = 16000;
const DAY = 86400000;
const PR_DAYS = 60;
const MAX_PRS = 10;
const TOP_EXERCISES = 3;
const SERIES_POINTS = 20;

/** The code you paste into Habit Coach. Hex token, 64 characters. */
export const linkCode = (token) => `${LINK_CODE_PREFIX}${token}`;

const name = (ex, id) => ({ id: String(id), he: String(ex?.nameHe ?? '').slice(0, 40), en: String(ex?.nameEn ?? '').slice(0, 40) });
const unitOf = (ex) => (ex?.type === 'time' || ex?.type === 'cardio' ? 's' : ex?.ranked || Number(ex?.R) > 0 ? 'kg' : 'reps');
const round1 = (n) => Math.round(Number(n) * 10) / 10;
const endOf = (w) => w.endedMs ?? w.startedMs ?? 0;

/** Latest all-time best per exercise in the last PR_DAYS days, newest first. */
export function recentPRs(workouts, byId, nowMs) {
  const since = nowMs - PR_DAYS * DAY;
  const seen = new Set();
  const out = [];
  for (const w of [...workouts].sort((a, b) => endOf(b) - endOf(a))) {
    if (endOf(w) < since) break;
    for (const e of w.entries ?? []) {
      if (seen.has(e.exerciseId)) continue;
      let best = null;
      for (const s of e.sets ?? []) if (s.done && s.type !== 'warmup' && s.prAllTime && (!best || (s.oneRM ?? s.metric ?? 0) > (best.oneRM ?? best.metric ?? 0))) best = s;
      if (!best) continue;
      seen.add(e.exerciseId);
      const ex = byId[e.exerciseId];
      out.push({ ...name(ex, e.exerciseId), date: w.dateKey ?? dateKey(endOf(w)), weight: round1(best.weight ?? 0), reps: Math.round(Number(best.reps) || 0), best: round1(best.oneRM > 0 ? best.oneRM : best.metric ?? 0), unit: unitOf(ex) });
      if (out.length >= MAX_PRS) return out;
    }
  }
  return out;
}

/** The exercises trained most often in the last 90 days, with their best-per-workout series (last SERIES_POINTS). */
export function topSeries(workouts, byId, nowMs, count = TOP_EXERCISES) {
  const since = nowMs - 90 * DAY;
  const freq = new Map();
  for (const w of workouts) if (endOf(w) >= since) for (const e of w.entries ?? []) if (byId[e.exerciseId] && (e.sets ?? []).some((s) => s.done && s.type !== 'warmup')) freq.set(e.exerciseId, (freq.get(e.exerciseId) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, count).map(([id]) => {
    const ex = byId[id];
    const points = e1rmSeries(workouts, id, byId).slice(-SERIES_POINTS).map((p) => ({ d: dateKey(p.t), v: p.v }));
    return { ...name(ex, id), unit: unitOf(ex), points };
  }).filter((s) => s.points.length > 0);
}

/**
 * Everything Habit Coach shows, built from the app state. ratings: { exerciseId: rating } (ratingsOf(store.bests)).
 * overall: store.overall ({ pending, remaining, rating }), game: store.game, streak: view(game.streak, todayKey).
 */
export function linkSnapshot({ workouts, ratings, overall, game, streak, byId, nowMs, todayKey }) {
  const lvl = levelFromXp(game?.xp ?? 0);
  const wk = weekStart(todayKey);
  const month = todayKey.slice(0, 7);
  const dayOf = (w) => w.dateKey ?? '';
  const last = [...workouts].sort((a, b) => endOf(b) - endOf(a))[0];
  const rank = overall?.pending || !(overall?.rating > 0)
    ? { pending: true, remaining: Number(overall?.remaining) || 0 }
    : (() => { const t = tierFor(overall.rating); return { pending: false, rating: Math.round(overall.rating), tier: t.tier, division: t.division ?? null, lp: t.lp ?? null }; })();
  const muscles = Object.fromEntries(Object.entries(muscleRatings(ratings ?? {}, byId)).filter(([, r]) => r > 0));
  const snap = {
    v: LINK_VERSION,
    at: new Date(nowMs).toISOString(),
    level: { level: lvl.level, into: lvl.into, need: lvl.need, xp: Math.floor(game?.xp ?? 0) },
    rank,
    streak: { current: streak?.current ?? 0, best: streak?.best ?? 0, last: streak?.lastWorkoutDate ?? null },
    counts: { total: workouts.length, week: workouts.filter((w) => dayOf(w) >= wk && dayOf(w) <= todayKey).length, month: workouts.filter((w) => dayOf(w).startsWith(month)).length },
    last: last ? { date: last.dateKey ?? dateKey(endOf(last)), name: String(last.name ?? '').slice(0, 40), volume: Math.round(last.stats?.volume ?? 0), sets: last.stats?.workingSets ?? 0, minutes: last.endedMs && last.startedMs ? Math.max(0, Math.round((last.endedMs - last.startedMs) / 60000)) : null } : null,
    prs: recentPRs(workouts, byId, nowMs),
    weeklyVolume: weeklyVolume(workouts, nowMs, 12).map((b) => ({ d: dateKey(b.t), v: Math.round(b.v) })),
    weeklyCount: weeklyCount(workouts, nowMs, 8).map((b) => ({ d: dateKey(b.t), v: b.v })),
    muscles,
    top: topSeries(workouts, byId, nowMs),
  };
  // Stay well under the server cap: drop the heaviest parts first.
  while (JSON.stringify(snap).length > LINK_MAX_CHARS && snap.top.length) snap.top.pop();
  while (JSON.stringify(snap).length > LINK_MAX_CHARS && snap.prs.length) snap.prs.pop();
  return snap;
}
