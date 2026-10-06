// Settings persistence: localStorage + IndexedDB copy. Every call is guarded (private mode, blocked storage).
import { migrateSettings, DEFAULT_SETTINGS } from '../core/settings.mjs';

const LS_KEY = 'dg.settings';
import { dbGet, dbPut } from './db.js';

const idbSet = (key, val) => dbPut('kv', val, key);
const idbGet = (key) => dbGet('kv', key);

let current = { ...DEFAULT_SETTINGS };
const subs = new Set();
export const getSettings = () => current;
export const onSettings = (fn) => { subs.add(fn); return () => subs.delete(fn); };
/** Merge a change into the settings, persist it and tell subscribers (main.js re-applies language, accent, motion). */
export async function updateSettings(patch) {
  current = { ...current, ...patch };
  subs.forEach((fn) => fn(current));
  await saveSettings(current);
}

export async function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(LS_KEY)); } catch { /* ignore */ }
  if (!raw) { try { raw = await idbGet(LS_KEY); } catch { /* ignore */ } }
  current = raw ? migrateSettings(raw) : { ...DEFAULT_SETTINGS };
  return current;
}

export async function saveSettings(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  try { await idbSet(LS_KEY, s); } catch { /* ignore */ }
}

export async function requestPersistence() {
  try { return (await navigator.storage?.persist?.()) ?? false; } catch { return false; }
}

export async function storageInfo() {
  let persisted = false, usage = null, quota = null;
  try { persisted = (await navigator.storage?.persisted?.()) ?? false; } catch { /* ignore */ }
  try { const e = await navigator.storage?.estimate?.(); usage = e?.usage ?? null; quota = e?.quota ?? null; } catch { /* ignore */ }
  return { persisted, usage, quota };
}
