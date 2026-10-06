import { readFileSync } from 'node:fs';
import * as W from '../src/core/workout.mjs';
import { completeSet } from '../src/core/live.mjs';
import { postWorkout } from '../src/core/post.mjs';

export const { exercises } = JSON.parse(readFileSync(new URL('../src/data/exercises.json', import.meta.url)));
export const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
export const DAY = 24 * 3600 * 1000;
export const HOUR = 3600 * 1000;
export const ID = {
  bench: 'barbell-bench-press-medium-grip', squat: 'barbell-squat', dead: 'barbell-deadlift', curl: 'barbell-curl', plank: 'plank',
  ohp: 'standing-military-press', row: 'bent-over-barbell-row', calf: 'standing-calf-raises', pullup: 'pullups',
};

/** plan: [[key, weight, reps, type?], ...] in order; sets are completed one second apart. */
export function draftWith(plan, workouts, now, bw = 80) {
  const w = W.newWorkout({ now });
  let t = now;
  const entries = {};
  for (const [key, weight, reps, type = 'normal'] of plan) {
    const e = (entries[key] ??= W.addEntry(w, byId[ID[key] ?? key], { sets: 0 }));
    const s = W.addSet(w, e.id); Object.assign(s, { weight, reps, type });
    completeSet({ workout: w, entryId: e.id, idx: s.idx, now: (t += 1000), bodyweightKg: bw, sex: 'm', workouts, byId });
  }
  return w;
}
/** Posts a plan at `now` (the workout ends one hour later) and returns the new workouts list. */
export function session(plan, workouts, now, bw = 80, sex = 'm') {
  const d = draftWith(plan, workouts, now, bw);
  return postWorkout({ draft: d, workouts, now: now + HOUR, byId, sex }).workouts;
}
