// Exercise requests -> the request "inbox" on the server (OUR DESIGN). Claude reads new requests there when Elia asks,
// adds the exercise in the next update and marks it 'added' (or 'rejected' with a short reply). The phone is known only by a
// random device code (its sha256 on the server). A request that could not be sent stays on the phone and is sent next time.
import { rpc, newToken } from './crew-api.js';
import { dbGet, dbPut } from './db.js';
import { store, saveRequests } from './store.js';
import { getLanguage } from '../core/i18n.mjs';

let device = null;
async function deviceCode() {
  device ??= (await dbGet('kv', 'reqDevice').catch(() => null)) ?? null;
  if (!device) { device = newToken(); await dbPut('kv', device, 'reqDevice').catch(() => {}); }
  return device;
}

/** Sends every request that was not sent yet. { sent, error } — error is 'offline' | 'too_many' | 'server_full' | ... */
export async function sendPendingRequests() {
  if (!store.requests.some((r) => !r.sentId)) return { sent: 0, error: null };
  const code = await deviceCode();
  const list = store.requests.map((r) => ({ ...r }));
  let sent = 0, error = null;
  for (const r of list) {
    if (r.sentId) continue;
    try {
      r.sentId = await rpc('submit_exercise_request', { p_device: code, p_name: r.name, p_links: r.links, p_notes: r.notes ?? '', p_lang: getLanguage() === 'en' ? 'en' : 'he' });
      r.status = 'new'; sent++;
    } catch (e) { error = String(e?.message ?? 'offline').match(/too_many|server_full|bad_name|offline/)?.[0] ?? 'offline'; break; }
  }
  if (sent) await saveRequests(list);
  return { sent, error };
}

/** Pulls the status of sent requests (new / added / rejected + reply). True when something changed. */
export async function refreshRequestStatus() {
  if (!store.requests.some((r) => r.sentId)) return false;
  try {
    const rows = await rpc('my_exercise_requests', { p_device: await deviceCode() });
    const by = new Map((Array.isArray(rows) ? rows : []).map((x) => [x.id, x]));
    let changed = false;
    const list = store.requests.map((r) => {
      const x = r.sentId ? by.get(r.sentId) : null;
      if (!x || (x.status === r.status && (x.reply ?? '') === (r.reply ?? ''))) return r;
      changed = true;
      return { ...r, status: x.status, reply: x.reply ?? '' };
    });
    if (changed) await saveRequests(list);
    return changed;
  } catch { return false; }
}
