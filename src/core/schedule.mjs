// Weekly schedule (OUR DESIGN): for each weekday, what you plan: strength workouts, rest, or other activities (basketball, running...).
// A day can hold several items (for example basketball and a strength workout). Pure: no DOM, no storage (see src/ui/schedule.js).

export const ACTIVITIES = Object.freeze(['basketball', 'football', 'running', 'swimming', 'cycling', 'walking', 'martial', 'yoga', 'other']);
export const KINDS = Object.freeze(['workout', 'rest', 'activity']);
export const MAX_PER_DAY = 4;
export const EMPTY_SCHEDULE = Object.freeze({ days: {}, done: {} });

/** 0 = Sunday ... 6 = Saturday, for a 'YYYY-MM-DD' key. */
export function weekdayOf(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

const ID = /^[\w-]{1,12}$/;
function cleanEntry(e, fallbackId) {
  if (!e || typeof e !== 'object' || !KINDS.includes(e.kind)) return null;
  const id = typeof e.id === 'string' && ID.test(e.id) ? e.id : fallbackId;
  if (e.kind === 'rest') return { id, kind: 'rest' };
  if (e.kind === 'workout') return { id, kind: 'workout', ref: typeof e.ref === 'string' && e.ref ? e.ref : 'free' };
  const type = ACTIVITIES.includes(e.type) ? e.type : 'other';
  const label = String(e.label ?? '').trim().slice(0, 30);
  return { id, kind: 'activity', type, ...(label ? { label } : {}) };
}

/**
 * Keeps only valid entries. days[weekday] is a list of up to 4 items: { id, kind: 'workout', ref } (ref = a saved workout id, 'plan' or 'free'),
 * { id, kind: 'rest' } (alone on its day) or { id, kind: 'activity', type, label? }. Older single-entry days are upgraded.
 * done: { 'YYYY-MM-DD|<item id>': true } (an older plain 'YYYY-MM-DD' key means every activity that day).
 */
export function cleanSchedule(raw) {
  const days = {};
  for (let d = 0; d < 7; d++) {
    const src = raw?.days?.[d];
    const list = (Array.isArray(src) ? src : src ? [src] : []).map((e, i) => cleanEntry(e, `l${d}${i}`)).filter(Boolean);
    const rest = list.find((e) => e.kind === 'rest');
    const out = rest ? [rest] : list.slice(0, MAX_PER_DAY);
    const seen = new Set();
    const unique = out.filter((e) => !seen.has(e.id) && seen.add(e.id));
    if (unique.length) days[d] = unique;
  }
  const done = {};
  for (const [k, v] of Object.entries(raw?.done ?? {})) if (v === true && /^\d{4}-\d{2}-\d{2}(\|[\w-]{1,12})?$/.test(k)) done[k] = true;
  return { days, done };
}

/** The planned items for a date (empty list when nothing is planned). */
export const planFor = (schedule, dateKey) => schedule?.days?.[weekdayOf(dateKey)] ?? [];
export const isPlanned = (schedule) => Object.keys(schedule?.days ?? {}).length > 0;

/** Adds an item to a weekday. Rest replaces everything; anything else replaces rest. Returns the same schedule when the day is full. */
export function addEntry(schedule, weekday, entry, id) {
  const list = schedule?.days?.[weekday] ?? [];
  const e = cleanEntry({ ...entry, id }, id);
  if (!e) return cleanSchedule(schedule);
  const next = e.kind === 'rest' ? [e] : [...list.filter((x) => x.kind !== 'rest'), e];
  if (next.length > MAX_PER_DAY) return cleanSchedule(schedule);
  return cleanSchedule({ days: { ...schedule?.days, [weekday]: next }, done: schedule?.done });
}

export function removeEntry(schedule, weekday, id) {
  const list = (schedule?.days?.[weekday] ?? []).filter((x) => x.id !== id);
  const days = { ...schedule?.days };
  if (list.length) days[weekday] = list; else delete days[weekday];
  return cleanSchedule({ days, done: schedule?.done });
}

export function clearDay(schedule, weekday) {
  const days = { ...schedule?.days };
  delete days[weekday];
  return cleanSchedule({ days, done: schedule?.done });
}

/** Has this item been marked done on this date? */
export const isDone = (schedule, dateKey, id) => !!(schedule?.done?.[`${dateKey}|${id}`] || schedule?.done?.[dateKey]);
/** Has anything been marked done on this date? */
export const dayDone = (schedule, dateKey) => Object.keys(schedule?.done ?? {}).some((k) => k === dateKey || k.startsWith(`${dateKey}|`));

/** Marks one item done or undone. Done marks older than 60 days are dropped. */
export function markDone(schedule, dateKey, id, on, now = Date.now()) {
  const done = { ...(schedule?.done ?? {}) };
  delete done[dateKey]; // an older "whole day" mark is replaced by per-item marks
  const key = `${dateKey}|${id}`;
  if (on) done[key] = true; else delete done[key];
  const limit = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(done)) if (k.slice(0, 10) < limit) delete done[k];
  return cleanSchedule({ days: schedule?.days, done });
}
