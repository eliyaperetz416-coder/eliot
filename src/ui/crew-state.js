// The crew on this phone: membership (kept in IndexedDB), unread count, and sending your numbers after workouts.
import { dbGet, dbPut } from './db.js';
import { rpc, newToken, vapidKey } from './crew-api.js';
import { store, todayKey, saveGame } from './store.js';
import { showToast } from './components.js';
import { t } from '../core/i18n.mjs';
import { statsFromState, planPayload, unreadCount, errorKey, base64UrlToBytes } from '../core/crew.mjs';
import { view } from '../core/streak.mjs';
import { getSettings } from './storage.js';
import { data } from './data.js';
import { nextPlanDay } from '../core/generator.mjs';

export const crew = { local: null, unread: 0, ownerKey: null, returnsUsed: 0 };
const listeners = new Set();
export const onCrew = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());
const persist = () => dbPut('kv', crew.local, 'crew');

export async function initCrew() {
  crew.local = (await dbGet('kv', 'crew').catch(() => null)) ?? null;
  crew.ownerKey = (await dbGet('kv', 'ownerKey').catch(() => null)) ?? null;
  if (crew.local) { fetchView().catch(() => {}); refreshUnread(); syncStats(true); claimGifts(); }
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
/** Only the owner can open a crew: the server hands his phone a key (see supabase/migrations/007) and refuses create_group without it. */
export const createCrew = (name, nickname) => enter('create_group', { p_name: name, p_nick: nickname, p_owner_key: crew.ownerKey }, nickname);
export const joinCrew = (code, nickname) => enter('join_group', { p_code: code, p_nick: nickname }, nickname);

export async function leaveCrew() {
  if (!crew.local) return;
  try { await rpc('leave_group', { p_token: crew.local.token }); } catch (e) { if (errorKey(e) !== 'not_member') throw e; }
  crew.local = null; crew.unread = 0;
  await dbPut('kv', null, 'crew');
  emit();
}

const tok = () => crew.local.token;
const nameOf = (id) => { const ex = data().byId[id]; return ex ? ex.nameEn : ''; };

/** The leader's tools (OUR DESIGN). The server checks the role; the app only shows the buttons to the leader. */
export const kickMember = (id, announce = true) => rpc('kick_member', { p_token: tok(), p_member_id: id, p_announce: announce });
export const makeLeader = (id, announce = true) => rpc('make_leader', { p_token: tok(), p_member_id: id, p_announce: announce });
export async function renameGroup(name) { const n = await rpc('rename_group', { p_token: tok(), p_name: name }); crew.local = { ...crew.local, name: n }; await persist(); emit(); return n; }
export async function newInviteCode() { const c = await rpc('new_code', { p_token: tok() }); crew.local = { ...crew.local, code: c }; await persist(); emit(); return c; }
/** More leader tools: suspend (hours; 0 lifts it), rating adjustment (0 or lower), a drachma gift. No limits; the leader decides for each one whether the chat is told (announce). */
export const suspendMember = (id, hours, announce = true) => rpc('suspend_member', { p_token: tok(), p_member_id: id, p_hours: hours, p_announce: announce });
export const setAdjust = (id, value, announce = true) => rpc('set_adjust', { p_token: tok(), p_member_id: id, p_value: value, p_announce: announce });
export const giveDrachmas = (id, amount, announce = true) => rpc('give_drachmas', { p_token: tok(), p_member_id: id, p_amount: amount, p_announce: announce });
/** The member's daily history and latest heavy sets, for the leader to look at before a gift or a punishment. */
export const fetchReview = (id) => rpc('get_member_review', { p_token: tok(), p_member_id: id });
/** Counts one shop return on the server (2 per month). Throws 'return_limit' or 'offline'. */
export async function recordReturn() { const n = Number(await rpc('record_return', { p_token: tok() })) || 0; crew.returnsUsed = n; return n; }
/** Drachmas the leader gave you since the last time: the server hands each gift over once. */
export async function claimGifts() {
  if (!crew.local) return 0;
  try {
    const n = Number(await rpc('claim_gifts', { p_token: tok() })) || 0;
    if (n > 0) { await saveGame({ ...store.game, drachmas: store.game.drachmas + n }); showToast({ message: t('crew.gift.got', { n }), duration: 6000 }); }
    return n;
  } catch { return 0; }
}

/** The leader may have renamed the crew or made a new code: follow the server. */
export async function syncGroupInfo(group) {
  if (!crew.local || !group || (group.name === crew.local.name && group.code === crew.local.code)) return;
  crew.local = { ...crew.local, name: group.name, code: group.code };
  await persist();
}
export async function fetchView() {
  const v = await rpc('my_group', { p_token: tok() });
  crew.returnsUsed = Number(v?.me?.returns_used) || 0;
  const key = v?.me?.owner_key;
  if (key && key !== crew.ownerKey) { crew.ownerKey = key; await dbPut('kv', key, 'ownerKey').catch(() => {}); emit(); }
  return v;
}
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
    syncPlan();
    await rpc('update_stats', { p_token: tok(), p_stats: statsFromState({ workouts: store.workouts, overall: store.overall, game: store.game, streakNow: view(store.game.streak, today).current, todayKey: today, nameOf }) });
  } catch { /* next time */ }
}

/** The exercise lists of a member's strength workouts (only if they share their plan): { '0-0': [{ e, s, a, b }] }. */
export const fetchPlanDetail = (memberId) => rpc('get_plan_detail', { p_token: tok(), p_member_id: memberId });

/** Shares your weekly plan with the crew when you switched that on; clears it on the server when it is off. Silent on failure. */
export async function syncPlan() {
  if (!crew.local) return;
  try {
    const mine = store.plans[store.plans.length - 1] ?? null;
    const planNext = mine ? nextPlanDay(mine)?.entries ?? null : null;
    const isShareable = (id) => { const ex = data().byId[id]; return !!ex && !ex.custom; };
    const plan = getSettings().sharePlan ? planPayload({ schedule: store.schedule, routines: store.routines, workouts: store.workouts, todayKey: todayKey(), planNext, isShareable }) : null;
    await rpc('update_plan', { p_token: tok(), p_plan: plan });
  } catch { /* next time */ }
}

export function startCrewWatcher() {
  const tick = () => { if (document.visibilityState === 'visible' && crew.local) { refreshUnread(); syncStats(); claimGifts(); } };
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
