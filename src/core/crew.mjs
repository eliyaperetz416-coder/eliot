// The crew (friends group): what is shared, how the board is sorted, error names. Pure. The server part lives in src/ui/crew-api.js.
import { tierFor } from './ranks.mjs';
import { levelFromXp } from './game.mjs';
import { dayNumber } from './streak.mjs';

export const MAX_MEMBERS = 8;
export const MAX_MESSAGE = 280;
export const SORTS = ['rating', 'level', 'week', 'streak'];

/** Monday of the local week containing dateKey, as a dateKey. */
export function weekStart(dateKey) {
  const n = dayNumber(dateKey);
  const dow = (n + 3) % 7; // dayNumber 0 = 1970-01-01, a Thursday; Monday = 0
  const d = new Date((n - dow) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * What a member shares with the crew. Only rank, level, streak and volume numbers. Never bodyweight, never workouts or sets.
 * overall: { pending, rating }, game: the game state, streakNow: current streak (days).
 */
export function statsFromState({ workouts, overall, game, streakNow, todayKey }) {
  const wk = weekStart(todayKey);
  const month = todayKey.slice(0, 7);
  const dayOf = (w) => w.dateKey ?? '';
  const stats = {
    level: levelFromXp(game.xp).level,
    streak: streakNow,
    workouts: workouts.length,
    weekVolume: workouts.filter((w) => dayOf(w) >= wk && dayOf(w) <= todayKey).reduce((n, w) => n + (w.stats?.volume ?? 0), 0),
    monthWorkouts: workouts.filter((w) => dayOf(w).startsWith(month)).length,
  };
  if (!overall.pending && overall.rating > 0) {
    const t = tierFor(overall.rating);
    stats.rating = overall.rating;
    stats.tier = t.tier;
    if (t.division) stats.division = t.division;
  }
  return stats;
}

const VALUE = { rating: (s) => s.rating ?? -1, level: (s) => s.level ?? -1, week: (s) => s.weekVolume ?? -1, streak: (s) => s.streak ?? -1 };

/** Best first. Members who have not shared numbers yet go last. Ties: higher level, then nickname. */
export function sortBoard(members, by = 'rating') {
  const val = VALUE[by] ?? VALUE.rating;
  return [...members].sort((a, b) => {
    const d = val(b.stats ?? {}) - val(a.stats ?? {});
    if (d) return d;
    const l = (b.stats?.level ?? 0) - (a.stats?.level ?? 0);
    return l || a.nickname.localeCompare(b.nickname);
  });
}

/** Server error text -> i18n key suffix. */
export function errorKey(err) {
  const m = String(err?.message ?? err ?? '');
  for (const k of ['nick_taken', 'no_group', 'group_full', 'already_member', 'not_member', 'too_fast', 'bad_nick', 'bad_name', 'server_full', 'empty']) if (m.includes(k)) return k;
  if (m === 'offline' || /Failed to fetch|NetworkError|Load failed|aborted/i.test(m)) return 'offline';
  return 'generic';
}

export const normalizeCode = (s) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const validNick = (s) => { const n = String(s ?? '').trim().replace(/\s+/g, ' '); return n.length >= 1 && n.length <= 24 ? n : null; };

/** Unread = messages from other people newer than the last one you saw. */
export function unreadCount(messages, lastSeenId, myMemberId) {
  return messages.filter((m) => m.id > (lastSeenId ?? 0) && m.member_id !== myMemberId && m.kind !== 'system').length;
}

export function inviteText({ name, code, url }, lang) {
  return lang === 'he'
    ? `מצטרפים אליי לקבוצה "${name}" ב-Demigod?\nפותחים ${url} ובוחרים "הצטרף לקבוצה".\nקוד: ${code}`
    : `Join my crew "${name}" on Demigod.\nOpen ${url} and choose "Join a crew".\nCode: ${code}`;
}

/** The push key arrives as base64url text; the browser wants bytes. */
export function base64UrlToBytes(s) {
  const b = String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=');
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
}

/* ---------- sharing your weekly plan (opt-in; OUR DESIGN) ---------- */
const DAYKEY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`; };
/** The 7 date keys of the Sunday-first week containing todayKey; index = weekday (0 = Sunday). */
export const sundayWeek = (todayKey) => { const [y, m, d] = todayKey.split('-').map(Number); const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); return Array.from({ length: 7 }, (_, i) => addDays(todayKey, i - dow)); };

/**
 * What a friend sees: for each weekday the kind and a short name, plus which days of this week you trained.
 * Names are only what you typed yourself (a saved workout's name, an activity name) or a code like 'basketball'.
 * Never exercises, sets, weights or bodyweight.
 */
export function planPayload({ schedule, routines, workouts, todayKey }) {
  const days = {};
  for (const [d, e] of Object.entries(schedule?.days ?? {})) {
    if (e.kind === 'rest') days[d] = { k: 'rest' };
    else if (e.kind === 'activity') days[d] = { k: 'activity', n: e.label || e.type };
    else days[d] = { k: 'workout', n: routines.find((r) => r.id === e.ref)?.name ?? '' };
  }
  const week = sundayWeek(todayKey);
  const trained = week.filter((k) => workouts.some((w) => w.dateKey === k) || schedule?.done?.[k]);
  return { days, trained };
}

/** Rows for a friend's plan: [{ weekday, key, kind, name, trained }] for the 7 days, or null when they share nothing. */
export function planRows(plan, todayKey) {
  if (!plan || typeof plan !== 'object' || !plan.days) return null;
  const week = sundayWeek(todayKey);
  const trained = new Set((plan.trained ?? []).filter((k) => DAYKEY.test(k)));
  return week.map((key, weekday) => { const e = plan.days[weekday]; return { weekday, key, kind: e?.k ?? null, name: e?.n ?? '', trained: trained.has(key) }; });
}
