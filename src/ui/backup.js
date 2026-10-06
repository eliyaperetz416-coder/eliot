// Export / import / reset. All-or-nothing: an import is one IndexedDB transaction, so a failure leaves the old data untouched.
import { dbAll, dbGet, dbBatch, openDb, STORES } from './db.js';
import { store } from './store.js';
import { getSettings, updateSettings } from './storage.js';
import { APP_VERSION } from '../version.js';
import { buildBackup, mergeData, validateBackup } from '../core/backup.mjs';

const blobToDataUrl = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
const dataUrlToBlob = (url) => fetch(url).then((r) => r.blob());

/** Everything that belongs to the user, as plain JSON (photos become data URLs). The draft is not included. */
export async function collectData() {
  const [profile, bodyweight, workouts, routines, folders, plans, custom, game, renames, requests] = await Promise.all([
    dbGet('profile', 'me'), dbAll('bodyweight'), dbAll('workouts'), dbAll('routines'), dbAll('folders'), dbAll('plans'), dbAll('custom'), dbGet('game', 'me'), dbGet('kv', 'renames'), dbGet('kv', 'requests'),
  ]);
  const blobs = {};
  for (const ex of custom) {
    if (!ex.imageBlobId) continue;
    const b = await dbGet('blobs', ex.imageBlobId);
    if (b) blobs[ex.imageBlobId] = await blobToDataUrl(b);
  }
  const { lang, accentMode, reducedMotion } = getSettings();
  return { profile: profile ?? null, bodyweight, workouts, routines, folders, plans, custom, blobs, game: game ?? null, renames: renames ?? {}, requests: requests ?? [], settings: { lang, accentMode, reducedMotion } };
}

export const backupFileName = (now = Date.now()) => `demigod-backup-${new Date(now).toISOString().slice(0, 10)}.json`;

/** Returns 'shared' | 'downloaded' | 'cancelled'. Records the export time only when the file really left the app. */
export async function exportBackup(now = Date.now()) {
  const backup = buildBackup({ data: await collectData(), appVersion: APP_VERSION, now });
  const name = backupFileName(now);
  const file = new File([JSON.stringify(backup)], name, { type: 'application/json' });
  let result = 'downloaded';
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Demigod' }); result = 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  if (result === 'downloaded') {
    const url = URL.createObjectURL(file);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  await updateSettings({ lastExportAt: now });
  return result;
}

export async function readBackupFile(file) {
  if (file.size > 100 * 1024 * 1024) return { ok: false, error: 'format' };
  return validateBackup(await file.text());
}

/** mode: 'replace' | 'merge'. Throws if the transaction fails (then nothing was changed). */
export async function applyImport(backup, mode) {
  const incoming = backup.data;
  const data = mode === 'merge' ? mergeData(await collectData(), incoming) : incoming;
  const blobs = {};
  for (const [id, url] of Object.entries(data.blobs ?? {})) blobs[id] = await dataUrlToBlob(url);
  const ops = [];
  if (mode === 'replace') for (const s of Object.keys(STORES)) if (s !== 'kv') ops.push(['clear', s]);
  if (data.profile) ops.push(['put', 'profile', data.profile, 'me']);
  for (const e of data.bodyweight ?? []) ops.push(['put', 'bodyweight', e]);
  for (const w of data.workouts ?? []) ops.push(['put', 'workouts', w]);
  for (const k of ['routines', 'folders', 'plans', 'custom']) for (const x of data[k] ?? []) ops.push(['put', k, x]);
  for (const [id, b] of Object.entries(blobs)) ops.push(['put', 'blobs', b, id]);
  if (data.game) ops.push(['put', 'game', data.game, 'me']);
  ops.push(['put', 'kv', data.renames ?? {}, 'renames'], ['put', 'kv', data.requests ?? [], 'requests']);
  await openDb();
  await dbBatch(ops);
  try { localStorage.removeItem('dg.draft'); } catch { /* ignore */ }
  if (mode === 'replace' && backup.data.settings) {
    const { lang, accentMode, reducedMotion } = backup.data.settings;
    await updateSettings({ ...(lang ? { lang } : {}), ...(accentMode ? { accentMode } : {}), ...(typeof reducedMotion === 'boolean' ? { reducedMotion } : {}) });
  }
}

/** Wipes every store and every dg.* key. The caller reloads the page afterwards. */
export async function resetAll() {
  await openDb();
  await dbBatch(Object.keys(STORES).map((s) => ['clear', s]));
  try { Object.keys(localStorage).filter((k) => k.startsWith('dg.')).forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
}

export const hasData = () => store.workouts.length > 0 || store.routines.length > 0 || store.plans.length > 0 || store.custom.length > 0;
