// Runs the account sync (OUR DESIGN, spec section 4.3). Decisions live in core/sync.mjs; this file only moves data.
// kv 'sync' = { dirtyAt, syncedRemoteAt, lastHash, consentAt, consentVersion, consentSent }
import { getSession, authFetch, onAuth } from './auth.js';
import { collectData, applyImport } from './backup.js';
import { store, subscribe } from './store.js';
import { onSettings } from './storage.js';
import { dbGet, dbPut } from './db.js';
import { decideSync, tooBig, SYNC_DEBOUNCE_MS } from '../core/sync.mjs';
import { mergeData, checksum } from '../core/backup.mjs';
import { APP_VERSION } from '../version.js';

export const syncState = { status: 'idle', lastOkAt: null };
const listeners = new Set();
export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (status) => { syncState.status = status; if (status === 'ok') syncState.lastOkAt = Date.now(); listeners.forEach((fn) => fn(syncState)); return status; };

const META = 'sync';
const getMeta = async () => ({ dirtyAt: null, syncedRemoteAt: null, lastHash: null, ...((await dbGet('kv', META).catch(() => null)) ?? {}) });
const patchMeta = async (patch) => { const m = { ...(await getMeta()), ...patch }; await dbPut('kv', m, META); return m; };
const hashOf = (data) => checksum(JSON.stringify(data));

let timer = null, running = null, started = false, applying = false;

/** Remembers when this phone first changed something since the last sync (kept on the phone, so it survives a restart). */
async function markDirty() {
  if (applying) return;
  const m = await getMeta();
  if (m.dirtyAt == null) await patchMeta({ dirtyAt: Date.now() });
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, SYNC_DEBOUNCE_MS);
}

/** Saved by the sign-in screen; sent with the first upload. */
export const recordConsent = (version, now = Date.now()) => patchMeta({ consentAt: now, consentVersion: version });

async function fetchRemote() {
  const r = await authFetch('/rest/v1/user_data?select=data,updated_at');
  if (!r.ok) throw new Error(`http_${r.status}`);
  const rows = await r.json();
  return rows[0] ? { data: rows[0].data, updatedAt: Date.parse(rows[0].updated_at) } : null;
}

async function push(data, startedAt) {
  const s = await getSession();
  if (!s) return 'signed-out';
  const meta = await getMeta();
  const row = { user_id: s.user.id, data, app_version: APP_VERSION, updated_at: new Date(startedAt).toISOString() };
  if (!meta.consentSent && meta.consentAt) { row.consent_at = new Date(meta.consentAt).toISOString(); row.consent_version = meta.consentVersion; }
  const body = JSON.stringify(row);
  if (tooBig(body)) return 'too-big';
  const r = await authFetch('/rest/v1/user_data?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body });
  if (!r.ok) throw new Error(`http_${r.status}`);
  const now = await getMeta(); // a change made while uploading stays dirty
  await patchMeta({ syncedRemoteAt: startedAt, lastHash: hashOf(data), dirtyAt: now.dirtyAt != null && now.dirtyAt > startedAt ? now.dirtyAt : null, consentSent: now.consentSent || !!row.consent_at });
  return 'ok';
}

/** Replaces this phone's data with the server copy, then reloads so every screen starts from it. */
async function applyRemote(data, updatedAt) {
  applying = true;
  await applyImport({ data }, 'replace');
  await patchMeta({ syncedRemoteAt: updatedAt, lastHash: hashOf(data), dirtyAt: null });
  location.reload();
}

/** One sync round. Never throws; the result is also in syncState.status. */
export function syncNow() {
  running ??= (async () => {
    try {
      if (!(await getSession())) return set('signed-out');
      if (navigator.onLine === false) return set('offline');
      set('syncing');
      const startedAt = Date.now();
      const [remote, local, meta0] = await Promise.all([fetchRemote(), collectData(), getMeta()]);
      // A change that leaves the data as it was (opening a screen, a recompute) is not a change.
      const meta = meta0.dirtyAt != null && meta0.lastHash === hashOf(local) ? await patchMeta({ dirtyAt: null }) : meta0;
      const { action } = decideSync({ local, remote, meta });
      if ((action === 'pull' || action === 'merge') && store.draft) return set('waiting'); // never replace data during a workout
      if (action === 'push') return set(await push(local, startedAt));
      if (action === 'pull') { await applyRemote(remote.data, remote.updatedAt); return set('ok'); }
      if (action === 'merge') {
        const merged = mergeData(local, remote.data);
        const res = await push(merged, startedAt);
        if (res !== 'ok') return set(res);
        await applyRemote(merged, startedAt);
        return set('ok');
      }
      return set('ok');
    } catch {
      return set('offline');
    } finally {
      running = null;
    }
  })();
  return running;
}

export function startSync() {
  if (started) return;
  started = true;
  subscribe(() => { markDirty(); });
  onSettings(() => { markDirty(); });
  addEventListener('online', () => { syncNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  onAuth((s) => { if (s) syncNow(); });
  syncNow();
}

/** True once this phone has synced with the account at least once. */
export const syncedOnce = async () => (await getMeta()).syncedRemoteAt != null;
