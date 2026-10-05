// Settings persistence: localStorage + IndexedDB copy. Every call is guarded (private mode, blocked storage).
import { migrateSettings, DEFAULT_SETTINGS } from '../core/settings.mjs';

const LS_KEY = 'dg.settings';
const DB = 'demigod', STORE = 'kv';

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}

export async function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* ignore */ }
  if (!raw) { try { raw = await idbGet(LS_KEY); } catch { /* ignore */ } }
  return raw ? migrateSettings(raw) : { ...DEFAULT_SETTINGS };
}

export async function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  try { await idbSet(LS_KEY, s); } catch { /* ignore */ }
}

export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}
