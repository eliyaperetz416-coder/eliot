// Notifications tied to the account (OUR DESIGN, spec 4.6): the phone's Web Push subscription and the end-of-rest reminder.
// The server sends the reminder (pg_cron + the rest-push edge function), so it also arrives when the phone is locked.
import { authFetch, getSession } from './auth.js';
import { vapidKey } from './crew-api.js';
import { getSettings } from './storage.js';
import { base64UrlToBytes } from '../core/crew.mjs';

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** The phone's push subscription (asks for permission first). Throws 'unsupported' or 'denied'. */
export async function ensureSubscription() {
  if (!pushSupported()) throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  return (await reg.pushManager.getSubscription()) ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(await vapidKey()) });
}

/** Turns on the account's notifications (rest alarm). Returns 'on' | 'denied' | 'unsupported' | 'offline'. */
export async function enablePush() {
  let sub;
  try { sub = await ensureSubscription(); } catch (e) { return e.message === 'denied' ? 'denied' : 'unsupported'; }
  const s = await getSession();
  if (!s) return 'offline';
  try {
    const r = await authFetch('/rest/v1/user_push?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.user.id, sub: sub.toJSON(), rest_enabled: true, updated_at: new Date().toISOString() }) });
    return r.ok ? 'on' : 'offline';
  } catch { return 'offline'; }
}

/** Stops rest notifications for this account (the crew notifications are separate). */
export async function setRestPush(on) {
  const s = await getSession();
  if (!s) return;
  try { await authFetch(`/rest/v1/user_push?user_id=eq.${s.user.id}`, { method: 'PATCH', body: JSON.stringify({ rest_enabled: !!on }) }); } catch { /* offline: the setting still stops new reminders */ }
}

/** The account keeps one push address. The phone you train on claims it when a rest starts (no question asked: only when
 *  notifications are already allowed here), so the reminder reaches the phone in your hand, not the one that enabled it last. */
async function claimPushRow(s) {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
  if (!sub) return;
  await authFetch('/rest/v1/user_push?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.user.id, sub: sub.toJSON(), rest_enabled: true, updated_at: new Date().toISOString() }) });
}

// Reminder requests go out one after another, in the order they were made: a slow "schedule" must never land after the
// "cancel" that followed it (the server would keep a reminder nobody wants).
let chain = Promise.resolve();
const inOrder = (fn) => (chain = chain.then(fn, fn));

/** Asks the server to notify at fireAtMs. Silent on every failure: the in-app alert still works. */
export const scheduleRestAlarm = (fireAtMs, title, body) => inOrder(() => sendRestAlarm(fireAtMs, title, body));
export const cancelRestAlarm = () => inOrder(sendCancel);

async function sendRestAlarm(fireAtMs, title, body) {
  if (!getSettings().restPush) return;
  try {
    const s = await getSession();
    if (!s) return;
    await claimPushRow(s).catch(() => {});
    await authFetch('/rest/v1/rest_alarms?on_conflict=user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ user_id: s.user.id, fire_at: new Date(fireAtMs).toISOString(), title: String(title).slice(0, 80), body: String(body).slice(0, 160) }) });
  } catch { /* offline */ }
}

async function sendCancel() {
  try {
    const s = await getSession();
    if (!s) return;
    await authFetch(`/rest/v1/rest_alarms?user_id=eq.${s.user.id}`, { method: 'DELETE' });
  } catch { /* offline */ }
}
