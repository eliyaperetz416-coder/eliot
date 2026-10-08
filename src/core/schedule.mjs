// Weekly schedule (OUR DESIGN): for each weekday, what you plan: a strength workout, rest, or another activity (basketball, running...).
// Pure: no DOM, no storage (see src/ui/schedule.js).

export const ACTIVITIES = Object.freeze(['basketball', 'football', 'running', 'swimming', 'cycling', 'walking', 'martial', 'yoga', 'other']);
export const KINDS = Object.freeze(['workout', 'rest', 'activity']);
export const EMPTY_SCHEDULE = Object.freeze({ days: {}, done: {} });

/** 0 = Sunday ... 6 = Saturday, for a 'YYYY-MM-DD' key. */
export function weekdayOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Keeps only valid entries. workout: { kind, ref } with ref = a routine id, 'plan' (next day of your plan) or 'free'. */
export function cleanSchedule(raw) {
  const days = {};
  for (let d = 0; d < 7; d++) {
    const e = raw?.days?.[d];
    if (!e || !KINDS.includes(e.kind)) continue;
    if (e.kind === 'rest') days[d] = { kind: 'rest' };
    else if (e.kind === 'workout') days[d] = { kind: 'workout', ref: typeof e.ref === 'string' && e.ref ? e.ref : 'free' };
    else {
      const type = ACTIVITIES.includes(e.type) ? e.type : 'other';
      const label = String(e.label ?? '').trim().slice(0, 30);
      days[d] = { kind: 'activity', type, ...(label ? { label } : {}) };
    }
  }
  const done = {};
  for (const [k, v] of Object.entries(raw?.done ?? {})) if (v === true && /^\d{4}-\d{2}-\d{2}$/.test(k)) done[k] = true;
  return { days, done };
}

export const planFor = (schedule, dateKey) => schedule?.days?.[weekdayOf(dateKey)] ?? null;
export const isPlanned = (schedule) => Object.keys(schedule?.days ?? {}).length > 0;

export function setDay(schedule, weekday, entry) {
  const days = { ...(schedule?.days ?? {}) };
  if (entry == null) delete days[weekday]; else days[weekday] = entry;
  return cleanSchedule({ days, done: schedule?.done });
}

/** Marks an activity day done or undone. Done marks older than 60 days are dropped. */
export function markDone(schedule, dateKey, on, now = Date.now()) {
  const done = { ...(schedule?.done ?? {}) };
  if (on) done[dateKey] = true; else delete done[dateKey];
  const limit = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(done)) if (k < limit) delete done[k];
  return cleanSchedule({ days: schedule?.days, done });
}
