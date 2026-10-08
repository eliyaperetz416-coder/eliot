// Live-workout data model and set-flow logic. Pure (mutates the workout object it is given, no DOM).
import { defaultRestSec, clampRest } from './timer.mjs';

export const SCHEMA_VERSION = 1;
export const SET_TYPES = ['normal', 'warmup', 'drop', 'failure'];
export const DEFAULT_SETS = 3;

export const uid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

/** Local calendar date key YYYY-MM-DD (time-zone safe: uses the device's local fields). */
export function dateKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function newWorkout({ now = Date.now(), name = '', routineId = null, planDayId = null } = {}) {
  return {
    id: uid(), schemaVersion: SCHEMA_VERSION, startedAt: new Date(now).toISOString(), startedMs: now, endedAt: null, endedMs: null,
    dateKey: dateKey(now), name, routineId, planDayId, notes: '', entries: [], timer: null, updatedMs: now,
  };
}

export const newSet = (idx, patch = {}) => ({ idx, type: 'normal', weight: null, reps: null, done: false, ...patch });

export function newEntry(ex, { sets = DEFAULT_SETS } = {}) {
  return {
    id: uid(), exerciseId: ex.id, supersetGroup: null, restSec: defaultRestSec(ex), notes: '',
    sets: Array.from({ length: sets }, (_, i) => newSet(i)),
  };
}

const find = (w, entryId) => {
  const e = w.entries.find((x) => x.id === entryId);
  if (!e) throw new Error(`entry not found: ${entryId}`);
  return e;
};
const renumber = (entry) => entry.sets.forEach((s, i) => { s.idx = i; });

export function addEntry(w, ex, opts) { const e = newEntry(ex, opts); w.entries.push(e); return e; }

export function removeEntry(w, entryId) {
  const e = find(w, entryId);
  w.entries = w.entries.filter((x) => x !== e);
  if (e.supersetGroup) cleanSupersets(w);
}

export function moveEntry(w, entryId, dir) {
  const i = w.entries.findIndex((x) => x.id === entryId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= w.entries.length) return false;
  [w.entries[i], w.entries[j]] = [w.entries[j], w.entries[i]];
  cleanSupersets(w);
  return true;
}

/** Keeps weights/reps, clears ratings and done flags (they belong to the old exercise). */
export function replaceExercise(w, entryId, ex) {
  const e = find(w, entryId);
  e.exerciseId = ex.id;
  e.restSec = defaultRestSec(ex);
  for (const s of e.sets) { s.done = false; delete s.rating; delete s.oneRM; delete s.metric; delete s.prWeekly; delete s.prAllTime; delete s.prFirst; delete s.doneAt; }
}

export function addSet(w, entryId) {
  const e = find(w, entryId);
  const last = e.sets[e.sets.length - 1];
  const s = newSet(e.sets.length, last ? { weight: last.weight, reps: last.reps, type: last.type === 'warmup' ? 'normal' : last.type } : {});
  e.sets.push(s);
  return s;
}

export function removeSet(w, entryId, idx) {
  const e = find(w, entryId);
  e.sets.splice(idx, 1);
  renumber(e);
}

export function setType(w, entryId, idx, type) {
  if (!SET_TYPES.includes(type)) throw new Error(`bad set type ${type}`);
  find(w, entryId).sets[idx].type = type;
}

export function setField(w, entryId, idx, field, value) {
  const s = find(w, entryId).sets[idx];
  const n = value === '' || value == null ? null : Number(String(value).replace(',', '.'));
  s[field] = Number.isFinite(n) ? n : null;
  s.touched = true; // typed by the user (prefilled numbers from last time are not)
}

export function adjustRestSec(w, entryId, delta) {
  const e = find(w, entryId);
  e.restSec = clampRest(e.restSec + delta);
  return e.restSec;
}

/** Superset = a grouping of two exercises in the UI, not a set type. Links the entry with the next one. */
export function linkSuperset(w, entryId) {
  const i = w.entries.findIndex((x) => x.id === entryId);
  const a = w.entries[i], b = w.entries[i + 1];
  if (!a || !b) return false;
  const g = a.supersetGroup ?? b.supersetGroup ?? uid();
  a.supersetGroup = g; b.supersetGroup = g;
  return true;
}
export function unlinkSuperset(w, entryId) {
  find(w, entryId).supersetGroup = null;
  cleanSupersets(w);
}
/** A group must have at least 2 neighbouring members; otherwise it dissolves. */
export function cleanSupersets(w) {
  const groups = new Map();
  w.entries.forEach((e, i) => { if (e.supersetGroup) (groups.get(e.supersetGroup) ?? groups.set(e.supersetGroup, []).get(e.supersetGroup)).push(i); });
  for (const [g, idxs] of groups) {
    const contiguous = idxs.every((v, k) => k === 0 || v === idxs[k - 1] + 1);
    if (idxs.length < 2 || !contiguous) w.entries.forEach((e) => { if (e.supersetGroup === g) e.supersetGroup = null; });
  }
}

/** Counts toward volume, PRs, ratings: done and not a warm-up. */
export const isWorking = (s) => s.done && s.type !== 'warmup';
export const workingSets = (entry) => entry.sets.filter(isWorking);

export function stats(w, byId, nowMs = w.endedMs ?? Date.now()) {
  let volume = 0, sets = 0, prs = 0;
  for (const e of w.entries) {
    const ex = byId[e.exerciseId];
    for (const s of workingSets(e)) {
      sets++;
      if (s.prWeekly || s.prAllTime) prs++;
      if (ex && (ex.type === 'weight' || ex.type === 'bodyweight')) volume += (Number(s.weight) > 0 ? s.weight : 0) * (Number(s.reps) || 0);
    }
  }
  return { volume: Math.round(volume), workingSets: sets, prs, durationSec: Math.max(0, Math.round((nowMs - w.startedMs) / 1000)) };
}

/** The previous time this exercise was done in a posted workout: its sets, by index. */
export function previousPerformance(workouts, exerciseId, beforeMs = Infinity) {
  let best = null;
  for (const w of workouts) {
    if (!w.endedMs || w.startedMs >= beforeMs) continue;
    const e = w.entries.find((x) => x.exerciseId === exerciseId && x.sets.some((s) => s.done));
    if (e && (!best || w.startedMs > best.w.startedMs)) best = { w, e };
  }
  return best ? best.e.sets.filter((s) => s.done).map((s) => ({ weight: s.weight, reps: s.reps, type: s.type })) : [];
}

/** Drops sets that were never completed and entries left with no sets. Returns how many sets were dropped. */
export function compactForPost(w) {
  let dropped = 0;
  for (const e of w.entries) {
    const before = e.sets.length;
    e.sets = e.sets.filter((s) => s.done);
    dropped += before - e.sets.length;
    renumber(e);
  }
  w.entries = w.entries.filter((e) => e.sets.length);
  cleanSupersets(w);
  return dropped;
}

/** A copy of a posted workout as a fresh draft ("repeat last workout"): same exercises and set targets, nothing done. */
export function repeatWorkout(src, { now = Date.now() } = {}) {
  const w = newWorkout({ now, name: src.name, routineId: src.routineId });
  const groupMap = new Map();
  for (const e of src.entries) {
    const ne = { id: uid(), exerciseId: e.exerciseId, supersetGroup: null, restSec: e.restSec, notes: '', sets: e.sets.map((s, i) => newSet(i, { type: s.type, weight: s.weight, reps: s.reps })) };
    if (e.supersetGroup) { if (!groupMap.has(e.supersetGroup)) groupMap.set(e.supersetGroup, uid()); ne.supersetGroup = groupMap.get(e.supersetGroup); }
    w.entries.push(ne);
  }
  return w;
}
