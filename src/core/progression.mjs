// Double progression and starting loads. OUR DESIGN, general guidance. Pure.
import { epley } from './ranks.mjs';

/** OUR DESIGN: smallest sensible load jump per equipment. Dumbbell weights are per hand. */
export const LOAD_STEP = Object.freeze({ barbell: 2.5, 'ez-bar': 2.5, dumbbell: 2, machine: 5, cable: 5, bodyweight: 2.5, other: 2.5 });
export const START_PCT = Object.freeze({ strength: 0.8, hypertrophy: 0.7, general: 0.6 }); // of estimated 1RM, used as the starting working weight
export const stepFor = (ex) => LOAD_STEP[ex.equipment] ?? 2.5;
export const roundToStep = (kg, step) => Math.round(kg / step) * step;
const floorToStep = (kg, step) => Math.floor(kg / step + 1e-9) * step;

/**
 * history: working sets of previous sessions of this exercise, NEWEST FIRST: [[{weight, reps}, ...], ...]
 * target: { sets, repsMin, repsMax }
 * Returns { action: 'find' | 'start' | 'increase' | 'hold' | 'decrease', weight|null, reps: target reps, note }
 *  - find:     no data at all -> "find your working weight" (the first logged working set prefills the rest)
 *  - start:    no sessions of this exercise yet but a known estimated 1RM -> goal percentage of it
 *  - increase: every working set reached the top of the range -> next smallest load step, back to the bottom of the range
 *  - decrease: missed the bottom of the range two sessions in a row -> about 7.5% lighter
 *  - hold:     otherwise, same weight, aim for the top of the range
 */
export function suggestLoad({ ex, target, history = [], e1rm = 0, goal = 'hypertrophy' }) {
  const step = stepFor(ex);
  const sessions = history.map((s) => s.filter((x) => Number(x.reps) > 0));
  const last = sessions[0];
  if (!last?.length) {
    if (e1rm > 0) {
      const w = Math.max(step, roundToStep(e1rm * START_PCT[goal], step));
      return { action: 'start', weight: w, reps: target.repsMin, note: 'start' };
    }
    return { action: 'find', weight: null, reps: target.repsMin, note: 'find' };
  }
  const weight = Math.max(...last.map((x) => Number(x.weight) || 0));
  const atWeight = last.filter((x) => (Number(x.weight) || 0) === weight);
  const topHit = atWeight.length >= target.sets && atWeight.every((x) => x.reps >= target.repsMax);
  if (topHit) return { action: 'increase', weight: weight + step, reps: target.repsMin, note: 'increase' };
  const missed = (s) => s.length > 0 && s.some((x) => x.reps < target.repsMin);
  if (sessions.length >= 2 && missed(sessions[0]) && missed(sessions[1])) {
    const lighter = Math.max(0, floorToStep(weight * 0.925, step));
    return { action: 'decrease', weight: lighter < weight ? lighter : Math.max(0, weight - step), reps: target.repsMin, note: 'decrease' };
  }
  return { action: 'hold', weight, reps: Math.min(target.repsMax, Math.max(target.repsMin, Math.min(...last.map((x) => x.reps)) + 1)), note: 'hold' };
}

/** Estimated 1RM of an exercise from past working sets (best Epley value), 0 if none. */
export function bestE1RM(sessions) {
  let best = 0;
  for (const s of sessions) for (const x of s) if (x.weight > 0 && x.reps > 0) best = Math.max(best, epley(x.weight, x.reps));
  return best;
}
