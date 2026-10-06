// PR logic (OUR interpretation of "vs last week"). Pure.
import { epley, effectiveLoad } from './ranks.mjs';

export const WEEK_MS = 7 * 24 * 3600 * 1000;
const UNRANKED_BW_FACTOR = 0.5; // OUR DESIGN: unranked bodyweight moves treat half the bodyweight as the base load

/** One comparable number per set. Estimated 1RM for lifts, reps/seconds for the rest. 0 = nothing to compare. */
export function metricOf(ex, set, bodyweightKg) {
  const reps = Number(set.reps) || 0;
  const w = Number(set.weight) || 0;
  if (!(reps > 0)) return 0;
  if (ex.type === 'time' || ex.type === 'cardio') return reps;
  if (ex.ranked) return epley(effectiveLoad(ex, w, bodyweightKg), reps);
  if (ex.type === 'bodyweight') return epley(Math.max(0, bodyweightKg * UNRANKED_BW_FACTOR + w), reps);
  return w > 0 ? epley(w, reps) : 0;
}

/**
 * history: [{metric, at}] of earlier counted sets of this exercise (posted workouts + earlier sets of this workout).
 * Returns { first, weekly, allTime }. Warm-ups are filtered out by the caller.
 */
export function evaluatePR({ metric, at, history }) {
  if (!(metric > 0)) return { first: false, weekly: false, allTime: false };
  if (!history.length) return { first: true, weekly: false, allTime: false };
  const best = Math.max(...history.map((h) => h.metric));
  const recent = history.filter((h) => h.at >= at - WEEK_MS && h.at <= at);
  const weekly = recent.length > 0 && metric > Math.max(...recent.map((h) => h.metric));
  return { first: false, weekly, allTime: metric > best };
}
