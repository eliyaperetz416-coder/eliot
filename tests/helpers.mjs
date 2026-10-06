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

import { readFileSync as _read } from 'node:fs';
import { applyPost, newGame } from '../src/core/gamestate.mjs';
import { rankIndex } from '../src/core/post.mjs';
export const pool = JSON.parse(_read(new URL('../src/data/quests.json', import.meta.url), 'utf8'));
export const achievements = JSON.parse(_read(new URL('../src/data/achievements.json', import.meta.url), 'utf8'));
export const shop = JSON.parse(_read(new URL('../src/data/shop.json', import.meta.url), 'utf8'));
export { newGame };

/** Posts a plan and applies the game rules, the way the app does. Returns { workouts, game, rewards, workout }. */
export function playSession(plan, workouts, game, now, { bw = 80, extra = {} } = {}) {
  const draft = draftWith(plan, workouts, now, bw);
  const r = postWorkout({ draft, workouts, now: now + HOUR, byId, sex: 'm' });
  const rankIdx = r.summary.overallAfter.pending ? -1 : rankIndex(r.summary.overallAfter.rating);
  const res = applyPost({ game, workout: r.workout, workouts: r.workouts, byId, now: now + HOUR, overallRankIndex: rankIdx, achievements, pool, ...extra });
  return { workouts: r.workouts, game: res.game, rewards: res.rewards, workout: r.workout };
}
export const THREE = [['bench', 100, 5], ['bench', 100, 5], ['bench', 100, 5]]; // a valid workout (3 working sets)
