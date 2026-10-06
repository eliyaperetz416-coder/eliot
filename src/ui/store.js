// App state: profile, bodyweight log, posted workouts, draft, bests. Loaded once, persisted to IndexedDB.
import { dbAll, dbGet, dbPut, dbBatch, dbDelete } from './db.js';
import { migrateWorkout, newestDraft } from '../core/draft.mjs';
import { bestsFrom, ratingsOf, afterEdit } from '../core/post.mjs';
import { overallRating } from '../core/ranks.mjs';
import { latestBodyweight, bodyweightEntry } from '../core/profile.mjs';
import { data, registerCustom, unregisterCustom } from './data.js';
import { markPlanDone } from '../core/generator.mjs';
import { newGame, migrateGame, evaluateAchievements } from '../core/gamestate.mjs';
import { dateKey } from '../core/workout.mjs';

export const store = { profile: null, bwLog: [], workouts: [], draft: null, bests: {}, overall: { pending: true, remaining: 3, rating: 0 }, routines: [], folders: [], plans: [], custom: [], game: newGame() };
export const todayKey = () => dateKey(Date.now());
let achievementListener = null;
export const onAchievements = (fn) => { achievementListener = fn; };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

const LS_DRAFT = 'dg.draft';
const lsDraft = () => { try { return JSON.parse(localStorage.getItem(LS_DRAFT)); } catch { return null; } };

export function recompute() {
  store.bests = bestsFrom(store.workouts);
  store.overall = overallRating(ratingsOf(store.bests), data().byId);
}

const urls = new Map();
async function loadCustom() {
  const list = await dbAll('custom').catch(() => []);
  store.custom = list;
  for (const ex of list) {
    let url = '';
    if (ex.imageBlobId) { const blob = await dbGet('blobs', ex.imageBlobId).catch(() => null); if (blob) { url = URL.createObjectURL(blob); urls.set(ex.id, url); } }
    registerCustom(ex, url);
  }
}

export async function initStore() {
  const [profile, bw, workouts, draftDb, routines, folders, plans, gameRaw] = await Promise.all([
    dbGet('profile', 'me').catch(() => null), dbAll('bodyweight').catch(() => []), dbAll('workouts').catch(() => []), dbGet('draft', 'current').catch(() => null),
    dbAll('routines').catch(() => []), dbAll('folders').catch(() => []), dbAll('plans').catch(() => []), dbGet('game', 'me').catch(() => null),
  ]);
  store.game = migrateGame(gameRaw);
  store.routines = routines.sort((a, b) => a.createdMs - b.createdMs); store.folders = folders; store.plans = plans.sort((a, b) => a.createdMs - b.createdMs);
  await loadCustom();
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
export async function saveGame(g) {
  store.game = g;
  await dbPut('game', g, 'me').catch(() => {});
  emit();
}
/** Achievements that can be earned outside a workout (custom exercise, generated plan). */
export async function awardAchievements() {
  const r = evaluateAchievements({ game: store.game, achievements: data().achievements, workouts: store.workouts, customCount: store.custom.length, plansCount: store.plans.length, dayKey: todayKey() });
  if (!r.unlocked.length) return [];
  await saveGame(r.game);
  achievementListener?.(r.unlocked, r.reward);
  return r.unlocked;
}

export async function commitPost(result, game = null) {
  store.workouts = result.workouts;
  if (game) store.game = game;
  const ops = [];
  const pid = result.workout.planDayId;
  if (pid) {
    const plan = store.plans.find((p) => pid.startsWith(`${p.id}:`));
    if (plan) { markPlanDone(plan, pid); ops.push(['put', 'plans', plan]); }
  }
  recompute();
  clearTimeout(timer);
  store.draft = null;
  try { localStorage.removeItem(LS_DRAFT); } catch { /* ignore */ }
  if (game) ops.push(['put', 'game', game, 'me']);
  await dbBatch([...ops, ...result.workouts.map((w) => ['put', 'workouts', w]), ['delete', 'draft', 'current']]);
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


/* ---- saved workouts, folders, plans ---- */
export async function saveRoutine(r) {
  const i = store.routines.findIndex((x) => x.id === r.id);
  if (i >= 0) store.routines[i] = r; else store.routines.push(r);
  await dbPut('routines', r); emit();
}
export async function deleteRoutine(id) { store.routines = store.routines.filter((r) => r.id !== id); await dbDelete('routines', id); emit(); }
export async function saveFolder(f) {
  const i = store.folders.findIndex((x) => x.id === f.id);
  if (i >= 0) store.folders[i] = f; else store.folders.push(f);
  await dbPut('folders', f); emit();
}
export async function removeFolder(id, folders, routines) {
  store.folders = folders;
  await dbBatch([['delete', 'folders', id], ...routines.filter((r) => r.folderId == null).map((r) => ['put', 'routines', r])]);
  emit();
}
export async function savePlan(p) {
  const i = store.plans.findIndex((x) => x.id === p.id);
  if (i >= 0) store.plans[i] = p; else store.plans.push(p);
  await dbPut('plans', p); emit();
  await awardAchievements();
}
export async function deletePlan(id) { store.plans = store.plans.filter((p) => p.id !== id); await dbDelete('plans', id); emit(); }

/* ---- custom exercises (record + photo blob) ---- */
export async function saveCustom(ex, blob = null) {
  const ops = [['put', 'custom', ex]];
  if (blob) ops.push(['put', 'blobs', blob, ex.imageBlobId]);
  await dbBatch(ops);
  const i = store.custom.findIndex((x) => x.id === ex.id);
  if (i >= 0) store.custom[i] = ex; else store.custom.push(ex);
  if (urls.has(ex.id)) URL.revokeObjectURL(urls.get(ex.id));
  let url = '';
  if (ex.imageBlobId) { const b = blob ?? await dbGet('blobs', ex.imageBlobId).catch(() => null); if (b) { url = URL.createObjectURL(b); urls.set(ex.id, url); } }
  const rec = registerCustom(ex, url);
  emit();
  await awardAchievements();
  return rec;
}
/** Where a custom exercise is used: blocks deleting it. */
export function customUsage(id) {
  const n = (list, f) => list.filter(f).length;
  return {
    workouts: n(store.workouts, (w) => w.entries.some((e) => e.exerciseId === id)) + (store.draft?.entries.some((e) => e.exerciseId === id) ? 1 : 0),
    routines: n(store.routines, (r) => r.entries.some((e) => e.exerciseId === id)),
    plans: n(store.plans, (p) => p.days.some((d) => d.entries.some((e) => e.exerciseId === id))),
  };
}
export async function deleteCustom(id) {
  const ex = store.custom.find((x) => x.id === id);
  const ops = [['delete', 'custom', id]];
  if (ex?.imageBlobId) ops.push(['delete', 'blobs', ex.imageBlobId]);
  await dbBatch(ops);
  store.custom = store.custom.filter((x) => x.id !== id);
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  unregisterCustom(id);
  emit();
}
