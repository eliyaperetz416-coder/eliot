// App state: profile, bodyweight log, posted workouts, draft, bests. Loaded once, persisted to IndexedDB.
import { dbAll, dbGet, dbPut, dbBatch, dbDelete } from './db.js';
import { migrateWorkout, newestDraft } from '../core/draft.mjs';
import { bestsFrom, ratingsOf, afterEdit } from '../core/post.mjs';
import { overallRating } from '../core/ranks.mjs';
import { latestBodyweight, bodyweightEntry } from '../core/profile.mjs';
import { data } from './data.js';

export const store = { profile: null, bwLog: [], workouts: [], draft: null, bests: {}, overall: { pending: true, remaining: 3, rating: 0 } };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

const LS_DRAFT = 'dg.draft';
const lsDraft = () => { try { return JSON.parse(localStorage.getItem(LS_DRAFT)); } catch { return null; } };

export function recompute() {
  store.bests = bestsFrom(store.workouts);
  store.overall = overallRating(ratingsOf(store.bests), data().byId);
}

export async function initStore() {
  const [profile, bw, workouts, draftDb] = await Promise.all([
    dbGet('profile', 'me').catch(() => null), dbAll('bodyweight').catch(() => []), dbAll('workouts').catch(() => []), dbGet('draft', 'current').catch(() => null),
  ]);
  store.profile = profile ?? null;
  store.bwLog = bw.sort((a, b) => a.ms - b.ms);
  store.workouts = workouts.map(migrateWorkout).filter(Boolean).sort((a, b) => a.startedMs - b.startedMs);
  store.draft = newestDraft(draftDb, lsDraft());
  recompute();
}

export const bodyweightKg = () => latestBodyweight(store.bwLog);

export async function saveProfile(profile, kg, now = Date.now()) {
  store.profile = profile;
  const ops = [['put', 'profile', profile, 'me']];
  if (kg != null && kg !== bodyweightKg()) {
    const entry = bodyweightEntry(kg, now);
    store.bwLog.push(entry);
    ops.push(['put', 'bodyweight', entry]);
  }
  await dbBatch(ops);
  emit();
}

/* ---- draft: sync mirror in localStorage on every change, IndexedDB write debounced ---- */
let timer = null;
export function setDraft(w) { store.draft = w; touchDraft(); emit(); }
export function touchDraft() {
  const w = store.draft;
  if (!w) return;
  w.updatedMs = Date.now();
  try { localStorage.setItem(LS_DRAFT, JSON.stringify(w)); } catch { /* ignore */ }
  clearTimeout(timer);
  timer = setTimeout(flushDraft, 400);
}
export async function flushDraft() {
  clearTimeout(timer);
  if (store.draft) await dbPut('draft', store.draft, 'current').catch(() => {});
}
export async function clearDraft() {
  clearTimeout(timer);
  store.draft = null;
  try { localStorage.removeItem(LS_DRAFT); } catch { /* ignore */ }
  await dbDelete('draft', 'current').catch(() => {});
  emit();
}
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushDraft(); });
addEventListener('pagehide', flushDraft);

/** Commit a posted workout (result of postWorkout). Atomic: workout + cleared draft in one transaction. */
export async function commitPost(result) {
  store.workouts = result.workouts;
  recompute();
  clearTimeout(timer);
  store.draft = null;
  try { localStorage.removeItem(LS_DRAFT); } catch { /* ignore */ }
  await dbBatch([...result.workouts.map((w) => ['put', 'workouts', w]), ['delete', 'draft', 'current']]);
  emit();
}

/** After editing or deleting history: recalculates everything and persists changed/removed records. */
export async function commitHistory(workouts, removedIds = []) {
  const r = afterEdit(workouts, data().byId);
  store.workouts = r.workouts;
  recompute();
  await dbBatch([...r.workouts.map((w) => ['put', 'workouts', w]), ...removedIds.map((id) => ['delete', 'workouts', id])]);
  emit();
}
