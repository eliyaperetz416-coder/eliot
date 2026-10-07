// The crew on this phone: membership (kept in IndexedDB), unread count, and sending your numbers after workouts.
import { dbGet, dbPut } from './db.js';
import { rpc, newToken, vapidKey } from './crew-api.js';
import { store, todayKey } from './store.js';
import { statsFromState, unreadCount, errorKey, base64UrlToBytes } from '../core/crew.mjs';
import { view } from '../core/streak.mjs';

export const crew = { local: null, unread: 0 };
const listeners = new Set();
export const onCrew = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());
const persist = () => dbPut('kv', crew.local, 'crew');

export async function initCrew() {
  crew.local = (await dbGet('kv', 'crew').catch(() => null)) ?? null;
  if (crew.local) { refreshUnread(); syncStats(true); }
}

async function enter(fn, args, nickname) {
  const token = newToken();
  const r = await rpc(fn, { ...args, p_token: token });
  crew.local = { token, code: r.code, name: r.name, nickname, memberId: r.member_id, lastSeenId: 0 };
  crew.unread = 0;
  await persist();
  await syncStats(true);
  emit();
}
export const createCrew = (name, nickname) => enter('create_group', { p_name: name, p_nick: nickname }, nickname);
export const joinCrew = (code, nickname) => enter('join_group', { p_code: code, p_nick: nickname }, nickname);

export async function leaveCrew() {
  if (!crew.local) return;
  try { await rpc('leave_group', { p_token: crew.local.token }); } catch (e) { if (errorKey(e) !== 'not_member') throw e; }
  crew.local = null; crew.unread = 0;
  await dbPut('kv', null, 'crew');
  emit();
}

const tok = () => crew.local.token;
export const fetchView = () => rpc('my_group', { p_token: tok() });
export const fetchMessages = (after = 0, limit = 60) => rpc('get_messages', { p_token: tok(), p_after: after, p_limit: limit });
export const sendMessage = (kind, body) => rpc('post_message', { p_token: tok(), p_kind: kind, p_body: body });

export async function markSeen(id) {
  if (!crew.local || !(id > crew.local.lastSeenId)) { if (crew.unread) { crew.unread = 0; emit(); } return; }
  crew.local.lastSeenId = id; crew.unread = 0;
  await persist(); emit();
}

export async function refreshUnread() {
  if (!crew.local) return;
  try {
    const msgs = await fetchMessages(crew.local.lastSeenId, 100);
    const n = unreadCount(msgs, crew.local.lastSeenId, crew.local.memberId);
    if (n !== crew.unread) { crew.unread = n; emit(); }
  } catch { /* offline or removed: try again later */ }
}

let lastSync = 0;
/** Sends your rank / level / streak / weekly volume. At most every 30 s unless forced. Silent on failure. */
export async function syncStats(force = false) {
  if (!crew.local || (!force && Date.now() - lastSync < 30000)) return;
  lastSync = Date.now();
  try {
    const today = todayKey();
    await rpc('update_stats', { p_token: tok(), p_stats: statsFromState({ workouts: store.workouts, overall: store.overall, game: store.game, streakNow: view(store.game.streak, today).current, todayKey: today }) });
  } catch { /* next time */ }
}

export function startCrewWatcher() {
  const tick = () => { if (document.visibilityState === 'visible' && crew.local) { refreshUnread(); syncStats(); } };
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 60000);
}

/* ---------- notifications (Web Push) ---------- */
/** 'unsupported' (older browser, or on iPhone not added to the home screen) | 'denied' | 'off' | 'on' */
export async function pushStatus() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub && crew.local?.push ? 'on' : 'off';
  } catch { return 'off'; }
}

export async function enablePush() {
  if (!crew.local) throw new Error('not_member');
  if (await pushStatus() === 'unsupported') throw new Error('unsupported');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(await vapidKey()) });
  await rpc('save_push', { p_token: tok(), p_sub: sub.toJSON() });
  crew.local.push = true; await persist(); emit();
}

export async function disablePush() {
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); await sub?.unsubscribe(); } catch { /* ignore */ }
  if (crew.local) { try { await rpc('delete_push', { p_token: tok() }); } catch { /* offline: it is switched off locally anyway */ } crew.local.push = false; await persist(); emit(); }
}
