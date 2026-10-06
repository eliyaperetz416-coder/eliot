// Settings persistence: localStorage + IndexedDB copy. Every call is guarded (private mode, blocked storage).
import { migrateSettings, DEFAULT_SETTINGS } from '../core/settings.mjs';

const LS_KEY = 'dg.settings';
import { dbGet, dbPut } from './db.js';

const idbSet = (key, val) => dbPut('kv', val, key);
const idbGet = (key) => dbGet('kv', key);

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
