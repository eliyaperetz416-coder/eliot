// Recovery mode of the muscle map. OUR DESIGN, a rough guide, not medical advice. Pure.
import { GROUP_OF_MUSCLE } from './muscles.mjs';

const H = 3600 * 1000;
export const RECOVERY_WINDOW_DAYS = 14;
const LARGE = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes']);
const SMALL_IDS = new Set(['forearm']);

/** OUR DESIGN: large groups 72 h, medium 48 h, small (calves, forearms) 36 h. Neck/adductors/abductors count as medium. */
export function recoveryHoursFor(muscleId) {
  if (SMALL_IDS.has(muscleId) || GROUP_OF_MUSCLE[muscleId] === 'calves') return 36;
  const g = GROUP_OF_MUSCLE[muscleId];
  return g && LARGE.has(g) ? 72 : 48;
}

/**
 * Per muscle id: { freshness 0..1, hoursLeft } from the most demanding recent session.
 * Primary muscles count a full set, secondary muscles half a set. A session that gave a muscle >= 10 effective
 * sets needs 1.25x the base time; a muscle that was only a helper needs half the base time.
 * Muscles with no session in the last 14 days are fully fresh (freshness 1).
 */
export function freshnessByMuscle(workouts, byId, nowMs, muscleIds) {
  const out = {};
  for (const id of muscleIds) out[id] = { freshness: 1, hoursLeft: 0, trainedAt: null };
  const since = nowMs - RECOVERY_WINDOW_DAYS * 24 * H;
  for (const w of workouts) {
    const sessions = new Map(); // muscle -> {sets, primary, lastAt}
    for (const e of w.entries) {
      const ex = byId[e.exerciseId];
      if (!ex) continue;
      for (const s of e.sets) {
        if (!s.done || s.type === 'warmup') continue;
        const at = s.doneAt ?? w.endedMs ?? w.startedMs;
        for (const [list, weight, primary] of [[ex.primaryMuscles, 1, true], [ex.secondaryMuscles, 0.5, false]]) {
          for (const m of list) {
            const cur = sessions.get(m) ?? { sets: 0, primary: false, lastAt: 0 };
            cur.sets += weight; cur.primary ||= primary; cur.lastAt = Math.max(cur.lastAt, at);
            sessions.set(m, cur);
          }
        }
      }
    }
    for (const [m, s] of sessions) {
      if (!out[m] || s.lastAt < since) continue;
      const needed = recoveryHoursFor(m) * (s.sets >= 10 ? 1.25 : 1) * (s.primary ? 1 : 0.5);
      const hours = Math.max(0, (nowMs - s.lastAt) / H);
      const freshness = Math.min(1, Math.max(0, hours / needed));
      if (out[m].trainedAt == null || freshness < out[m].freshness) out[m] = { freshness, hoursLeft: Math.max(0, needed - hours), trainedAt: s.lastAt };
    }
  }
  return out;
}

const lerp = (a, b, k) => Math.round(a + (b - a) * k);
const RAMP = [[0, [255, 59, 78]], [0.5, [255, 176, 46]], [1, [58, 214, 130]]]; // red -> amber -> green
export function freshColor(f) {
  const x = Math.min(1, Math.max(0, f));
  const [a, b] = x <= 0.5 ? [RAMP[0], RAMP[1]] : [RAMP[1], RAMP[2]];
  const k = (x - a[0]) / (b[0] - a[0]);
  return `#${a[1].map((c, i) => lerp(c, b[1][i], k).toString(16).padStart(2, '0')).join('')}`;
}
