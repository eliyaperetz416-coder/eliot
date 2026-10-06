// Rest timer based on an END TIMESTAMP, not a countdown loop (iOS pauses timers in the background).
export const REST_STEP = 15;      // seconds, +/- buttons
export const REST_MIN = 15;
export const REST_MAX = 600;

const COMPOUND = new Set(['bench-flat', 'bench-incline', 'db-bench', 'db-incline', 'chest-machine', 'dip', 'deadlift', 'rack-pull', 'row-barbell', 'row-db', 'row-cable', 'row-machine', 'pulldown', 'pullup', 'chinup', 'ohp', 'db-press-shoulder', 'machine-shoulder', 'push-press', 'squat', 'front-squat', 'leg-press', 'hack-machine', 'lunge-bb', 'lunge-db', 'stepup-db', 'rdl', 'hip-thrust', 'close-grip', 'clean', 'good-morning']);

/** OUR DESIGN: compound 120 s, isolation 75 s, unranked 60 s. */
export function defaultRestSec(ex) {
  if (!ex || !ex.ranked) return 60;
  return COMPOUND.has(ex.family) ? 120 : 75;
}
export const clampRest = (s) => Math.min(REST_MAX, Math.max(REST_MIN, Math.round(s)));

export function startRest(nowMs, seconds) {
  const total = clampRest(seconds);
  return { startedAt: nowMs, endAt: nowMs + total * 1000, total };
}
/** Whole seconds left (never negative). Works after the app was suspended: only compares timestamps. */
export function remainingSec(timer, nowMs) {
  return timer ? Math.max(0, Math.ceil((timer.endAt - nowMs) / 1000)) : 0;
}
export const isExpired = (timer, nowMs) => !!timer && nowMs >= timer.endAt;
export function adjustRest(timer, deltaSec, nowMs) {
  if (!timer) return timer;
  const left = Math.max(0, (timer.endAt - nowMs) / 1000);
  const next = Math.min(REST_MAX, Math.max(0, left + deltaSec));
  return { startedAt: timer.startedAt, endAt: nowMs + next * 1000, total: Math.max(timer.total, Math.round(next)) };
}
export const progress = (timer, nowMs) => (timer ? Math.min(1, Math.max(0, 1 - (timer.endAt - nowMs) / (timer.total * 1000))) : 0);
export function formatClock(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
