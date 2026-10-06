// Saved workouts ("routines"), folders, templates and starting a workout from them. Pure.
import { uid, newWorkout, newSet } from './workout.mjs';
import { defaultRestSec, clampRest } from './timer.mjs';

export const ROUTINE_VERSION = 1;
export const DEFAULT_ENTRY = Object.freeze({ sets: 3, repsMin: 8, repsMax: 12 });

export function newRoutine({ name = '', folderId = null, now = Date.now() } = {}) {
  return { id: uid(), schemaVersion: ROUTINE_VERSION, name, folderId, notes: '', entries: [], createdMs: now, updatedMs: now };
}
export function newFolder(name, now = Date.now()) { return { id: uid(), name: String(name).trim(), createdMs: now }; }

export function routineEntry(ex, patch = {}) {
  return { id: uid(), exerciseId: ex.id, sets: DEFAULT_ENTRY.sets, repsMin: DEFAULT_ENTRY.repsMin, repsMax: DEFAULT_ENTRY.repsMax, restSec: defaultRestSec(ex), weight: null, notes: '', ...patch };
}

export function addToRoutine(r, exercises, now = Date.now()) {
  for (const ex of exercises) r.entries.push(routineEntry(ex));
  r.updatedMs = now;
  return r;
}
/** Optional planned weight in kg: a number from 0 to 1000 (two decimals), or null for "use what I lifted last time". */
export function cleanWeight(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(1000, Math.round(n * 100) / 100);
}
export function updateEntry(r, entryId, patch, now = Date.now()) {
  const e = r.entries.find((x) => x.id === entryId);
  if (!e) throw new Error('entry not found');
  const next = { ...e, ...patch };
  next.sets = Math.min(10, Math.max(1, Math.round(next.sets)));
  next.repsMin = Math.min(60, Math.max(1, Math.round(next.repsMin)));
  next.repsMax = Math.min(60, Math.max(next.repsMin, Math.round(next.repsMax)));
  next.restSec = clampRest(next.restSec);
  next.weight = cleanWeight(next.weight);
  Object.assign(e, next);
  r.updatedMs = now;
  return e;
}
export function removeEntry(r, entryId, now = Date.now()) { r.entries = r.entries.filter((e) => e.id !== entryId); r.updatedMs = now; }
export function moveEntry(r, entryId, dir, now = Date.now()) {
  const i = r.entries.findIndex((e) => e.id === entryId), j = i + dir;
  if (i < 0 || j < 0 || j >= r.entries.length) return false;
  [r.entries[i], r.entries[j]] = [r.entries[j], r.entries[i]];
  r.updatedMs = now;
  return true;
}
export function duplicateRoutine(r, now = Date.now(), suffix = ' (copy)') {
  const copy = structuredClone(r);
  copy.id = uid(); copy.name = `${r.name}${suffix}`.trim(); copy.createdMs = now; copy.updatedMs = now;
  copy.entries = copy.entries.map((e) => ({ ...e, id: uid() }));
  return copy;
}
export function renameFolder(f, name) { f.name = String(name).trim(); return f; }
/** Deleting a folder keeps its routines: they move to the top level. */
export function deleteFolder(folders, routines, folderId) {
  for (const r of routines) if (r.folderId === folderId) r.folderId = null;
  return folders.filter((f) => f.id !== folderId);
}
export function moveToFolder(r, folderId, now = Date.now()) { r.folderId = folderId; r.updatedMs = now; }

/** [{folder|null, routines}] sorted by folder name; loose routines first. */
export function groupByFolder(folders, routines) {
  const by = (id) => routines.filter((r) => (r.folderId ?? null) === id).sort((a, b) => a.createdMs - b.createdMs);
  const out = [{ folder: null, routines: by(null) }];
  for (const f of [...folders].sort((a, b) => a.name.localeCompare(b.name))) out.push({ folder: f, routines: by(f.id) });
  return out.filter((g, i) => i === 0 || g.routines.length || true);
}

/**
 * A live-workout draft from planned entries. Prefills weights/reps from the previous performance of each exercise
 * (editable). `suggest(entry)` may return { weight, target } to override (used by generated plans).
 */
export function draftFromEntries(entries, { name = '', routineId = null, planDayId = null, now = Date.now(), previous = () => [], suggest = null } = {}) {
  const w = newWorkout({ now, name, routineId, planDayId });
  for (const e of entries) {
    const prev = previous(e.exerciseId);
    const sg = suggest?.(e) ?? null;
    const sets = Array.from({ length: e.sets }, (_, i) => {
      const p = prev[i] ?? prev[prev.length - 1];
      const planned = cleanWeight(e.weight);
      const weight = sg ? sg.weight : planned ?? p?.weight ?? null;
      const reps = sg ? null : p?.reps ?? null;
      return newSet(i, { weight: weight ?? null, reps: reps ?? null });
    });
    const entry = { id: uid(), exerciseId: e.exerciseId, supersetGroup: null, restSec: e.restSec, notes: e.notes ?? '', sets };
    entry.target = { repsMin: e.repsMin, repsMax: e.repsMax, sets: e.sets, ...(sg ? { action: sg.action, find: sg.action === 'find' } : {}) };
    w.entries.push(entry);
  }
  return w;
}
