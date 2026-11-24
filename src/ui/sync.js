// Runs the account sync (OUR DESIGN, spec 4.3, hardened after the branch review). Decisions live in core/sync.mjs.
// kv 'sync' = { userId, syncedVersion, lastHash, needsRehash, consentAt, consentVersion, consentSent }
//  * every write is "only if the server still has version N" (compare-and-swap); a lost race reruns and merges
//  * "dirty" = the snapshot hashes differently from the one last synced (key order does not matter)
//  * a pull or merge is applied only if nothing changed on this phone since the decision, and never during a workout
import { getSession, authFetch, onAuth } from './auth.js';
import { collectData, applyImport, resetAll } from './backup.js';
import { store, subscribe } from './store.js';
import { onSettings } from './storage.js';
import { dbGet, dbPut } from './db.js';
import { decideSync, tooBig, hasLocalData, snapshotHash, newerApp, SYNC_DEBOUNCE_MS } from '../core/sync.mjs';
import { mergeData, validData } from '../core/backup.mjs';
import { APP_VERSION } from '../version.js';

/** status: 'idle' | 'syncing' | 'ok' | 'offline' | 'signed-out' | 'waiting' | 'too-big' | 'rejected' | 'other-user' | 'old-app' */
export const syncState = { status: 'idle', lastOkAt: null };
const listeners = new Set();
export const onSync = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (status) => { syncState.status = status; if (status === 'ok') syncState.lastOkAt = Date.now(); listeners.forEach((fn) => fn(syncState)); return status; };

const META = 'sync';
const getMeta = async () => ({ userId: null, syncedVersion: null, lastHash: null, needsRehash: false, ...((await dbGet('kv', META).catch(() => null)) ?? {}) });
const patchMeta = async (patch) => { const m = { ...(await getMeta()), ...patch }; await dbPut('kv', m, META); return m; };

/** Saved by the sign-in screen; sent with the first upload of this account. */
export const recordConsent = (version, now = Date.now()) => patchMeta({ consentAt: now, consentVersion: version, consentSent: false });
/** True once this phone has synced with the account at least once. */
export const syncedOnce = async () => (await getMeta()).syncedVersion != null;

const UPLOAD_MS = 60000;
const json = async (r) => { try { return await r.json(); } catch { return null; } };

async function remoteVersion(uid) {
  const r = await authFetch(`/rest/v1/user_data?select=version,app_version&user_id=eq.${uid}`);
  if (!r.ok) throw new Error(`http_${r.status}`);
  const row = (await json(r))?.[0];
  return { version: row?.version ?? null, appVersion: row?.app_version ?? null };
}
async function remoteFull(uid) {
  const r = await authFetch(`/rest/v1/user_data?select=data,version&user_id=eq.${uid}`, {}, UPLOAD_MS);
  if (!r.ok) throw new Error(`http_${r.status}`);
  const row = (await json(r))?.[0];
  return row ? { data: row.data, version: row.version } : null;
}

/** Writes the snapshot only if the server still holds `expected` (null = no row yet). -> { status: 'ok', version } | 'conflict' | 'too-big' | 'rejected' */
async function write(uid, data, expected, meta) {
  const row = { user_id: uid, data, app_version: APP_VERSION };
  if (!meta.consentSent && meta.consentAt) { row.consent_at = new Date(meta.consentAt).toISOString(); row.consent_version = meta.consentVersion; }
  const body = JSON.stringify(row);
  if (tooBig(body)) return 'too-big';
  const headers = { Prefer: 'return=representation' };
  const r = expected == null
    ? await authFetch('/rest/v1/user_data', { method: 'POST', headers, body }, UPLOAD_MS)
    : await authFetch(`/rest/v1/user_data?user_id=eq.${uid}&version=eq.${expected}`, { method: 'PATCH', headers, body }, UPLOAD_MS);
  if (r.status === 409) return 'conflict';
  if (r.status >= 400 && r.status < 500) return r.status === 401 ? 'offline' : 'rejected';
  if (!r.ok) throw new Error(`http_${r.status}`);
  const back = (await json(r))?.[0];
  if (!back) return 'conflict'; // the PATCH matched no row: another phone wrote first
  if (row.consent_at) await patchMeta({ consentSent: true });
  return { status: 'ok', version: back.version };
}

let applying = false;
/** Replaces this phone's data with `data` unless something changed since the decision; then reloads. -> 'applied' | 'changed' */
async function applyLocal(data, version, hashAtDecision) {
  if (store.draft || snapshotHash(await collectData()) !== hashAtDecision) return 'changed';
  applying = true;
  await applyImport({ data }, 'replace');
  await patchMeta({ syncedVersion: version, needsRehash: true }); // the next start hashes what is really on the phone
  location.reload();
  return 'applied';
}

/** One round. -> a status, or 'again' when it lost a race and must run once more. */
async function once(fromChange) {
  const s = await getSession();
  if (!s) return 'signed-out';
  if (navigator.onLine === false) return 'offline';
  const uid = s.user.id;
  let meta = await getMeta();
  let local = await collectData();
  let hash = snapshotHash(local);
  if (meta.userId && meta.userId !== uid) { // another account signed in on this phone
    if (meta.lastHash !== hash) return 'other-user'; // the previous account has unsaved changes here: never mix them in
    await resetAll(); // everything here is already in the previous account
    await dbPut('kv', s, 'session');
    meta = await patchMeta({ userId: uid, syncedVersion: null, lastHash: null, needsRehash: false, consentSent: false, consentAt: meta.consentAt ?? null, consentVersion: meta.consentVersion ?? null });
    local = await collectData(); hash = snapshotHash(local);
  }
  if (!meta.userId) meta = await patchMeta({ userId: uid });
  if (meta.needsRehash) meta = await patchMeta({ lastHash: hash, needsRehash: false });
  const localDirty = hash !== meta.lastHash;
  if (fromChange && !localDirty) return 'ok'; // a change that left the data as it was (opening a screen, a recompute)
  const { version: rv, appVersion } = await remoteVersion(uid);
  // a newer app wrote last: this older copy must not write over it (it may drop what it does not know). Its own changes wait here.
  if (newerApp(appVersion, APP_VERSION)) return 'old-app';
  const action = decideSync({ remoteVersion: rv, syncedVersion: meta.syncedVersion, localDirty, localHasData: hasLocalData(local) });
  if (action === 'none') return 'ok';
  if (action === 'push') {
    const w = await write(uid, local, rv, meta);
    if (w === 'conflict') return 'again';
    if (typeof w === 'string') return w;
    await patchMeta({ syncedVersion: w.version, lastHash: hash });
    return 'ok';
  }
  if (store.draft) return 'waiting'; // pull and merge replace the phone's data: never during a workout
  const remote = await remoteFull(uid);
  if (!remote) return 'again';
  if (!validData(remote.data)) return 'rejected'; // never replace the phone's data with something that is not ours
  if (action === 'pull') return (await applyLocal(remote.data, remote.version, hash)) === 'changed' ? 'again' : 'ok';
  const merged = mergeData(local, remote.data);
  const w = await write(uid, merged, remote.version, meta);
  if (w === 'conflict') return 'again';
  if (typeof w === 'string') return w;
  return (await applyLocal(merged, w.version, hash)) === 'changed' ? 'again' : 'ok';
}

let running = null, rerun = false, timer = null, started = false;
/** One sync (repeated when it lost a race or a change came in meanwhile). Never throws; the result is also in syncState. */
export function syncNow({ fromChange = false } = {}) {
  if (running) { rerun = true; return running; }
  running = (async () => {
    let res = 'ok';
    try {
      set('syncing');
      for (let i = 0; i < 4; i++) {
        rerun = false;
        res = await once(fromChange && i === 0);
        if (res !== 'again' && !rerun) break;
        fromChange = false;
      }
      if (res === 'again') res = 'offline';
    } catch { res = 'offline'; } finally { running = null; }
    return set(res);
  })();
  return running;
}

const onChange = () => {
  if (applying) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow({ fromChange: true }); }, SYNC_DEBOUNCE_MS);
};

export function startSync() {
  if (started) return;
  started = true;
  subscribe(onChange);
  onSettings(onChange);
  addEventListener('online', () => { syncNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  onAuth((s) => { if (s) syncNow(); });
  syncNow();
}
