// The link to Habit Coach on this phone: the secret token (IndexedDB kv 'link', never in the backup) and sending the summary.
// The server keeps only the token's hash (supabase/migrations/008_link.sql). What is sent is built in src/core/link.mjs.
import { dbGet, dbPut } from './db.js';
import { rpc, newToken } from './crew-api.js';
import { store, todayKey } from './store.js';
import { data } from './data.js';
import { linkSnapshot } from '../core/link.mjs';
import { ratingsOf } from '../core/post.mjs';
import { view } from '../core/streak.mjs';

/** local: { token, connectedMs, lastSyncMs } or null. */
export const link = { local: null };
const listeners = new Set();
export const onLink = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());
const persist = () => dbPut('kv', link.local, 'link');

export function buildSnapshot(now = Date.now()) {
  const today = todayKey();
  return linkSnapshot({
    workouts: store.workouts, ratings: ratingsOf(store.bests), overall: store.overall, game: store.game,
    streak: view(store.game.streak, today), byId: data().byId, nowMs: now, todayKey: today,
  });
}

export async function initLink() {
  link.local = (await dbGet('kv', 'link').catch(() => null)) ?? null;
  if (link.local) syncLink(true);
}

/** Creates the link and uploads the first summary. Throws 'offline' (or a server error name) so the screen can say so. */
export async function connectLink() {
  const token = newToken();
  await rpc('link_put', { p_token: token, p_snapshot: buildSnapshot() });
  const now = Date.now();
  link.local = { token, connectedMs: now, lastSyncMs: now };
  await persist();
  emit();
}

let lastTry = 0;
/** Sends the current summary. At most every 30 s unless forced (the server allows 60 an hour). Returns true when sent. Silent on failure. */
export async function syncLink(force = false) {
  if (!link.local || (!force && Date.now() - lastTry < 30000)) return false;
  lastTry = Date.now();
  try {
    await rpc('link_put', { p_token: link.local.token, p_snapshot: buildSnapshot() });
    link.local = { ...link.local, lastSyncMs: Date.now() };
    await persist();
    emit();
    return true;
  } catch { return false; }
}

/** Empties the summary on the server first, then forgets the token. Throws 'offline' when the server can't be reached, so nothing stays readable by mistake. */
export async function disconnectLink() {
  if (!link.local) return;
  await rpc('link_revoke', { p_token: link.local.token });
  link.local = null;
  await dbPut('kv', null, 'link');
  emit();
}

/** Before "delete everything": best effort, a wiped phone can't disconnect later. */
export async function revokeLinkQuietly() {
  if (!link.local) return;
  try { await rpc('link_revoke', { p_token: link.local.token }); } catch { /* offline: Habit Coach can still disconnect on its side */ }
}
