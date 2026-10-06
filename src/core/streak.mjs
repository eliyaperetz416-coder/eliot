// Streak with restores. OUR interpretation of Liftoff's wording. Dates are local calendar keys (YYYY-MM-DD); all day maths is UTC based,
// so time zones and daylight-saving changes cannot shift a day. Pure; every function takes the date it should act on.
export const STREAK_MAX_GAP_DAYS = 3;        // distance between consecutive workout days <= 3 keeps the streak alive
export const RESTORE_WINDOW_DAYS = 7;
export const MILESTONES = Object.freeze({ 7: 50, 30: 200, 100: 500 }); // drachmas, paid once per streak
export const RESTORES = Object.freeze({ super: { maxLength: 30, price: 150 }, mega: { maxLength: 60, price: 300 }, revive: { maxLength: Infinity, price: 500 } });

export const dayNumber = (key) => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
export const diffDays = (a, b) => dayNumber(b) - dayNumber(a);

export const newStreak = () => ({ current: 0, best: 0, lastWorkoutDate: null, milestonesPaid: [], broken: null });

/** Applies passive changes for `todayKey`: a streak dies when more than 3 days passed, a missed restore window expires. Returns a new object. */
export function settle(streak, todayKey) {
  const s = { ...streak, milestonesPaid: [...streak.milestonesPaid], broken: streak.broken ? { ...streak.broken } : null };
  if (s.lastWorkoutDate && s.current > 0 && diffDays(s.lastWorkoutDate, todayKey) > STREAK_MAX_GAP_DAYS) {
    const brokenOn = addDays(s.lastWorkoutDate, STREAK_MAX_GAP_DAYS + 1);
    s.broken = { lostLength: s.current, brokenOn, expiresOn: addDays(brokenOn, RESTORE_WINDOW_DAYS - 1), milestonesPaid: s.milestonesPaid };
    s.current = 0; s.milestonesPaid = [];
  }
  if (s.broken && diffDays(s.broken.expiresOn, todayKey) > 0) s.broken = null;
  return s;
}

/** What to show today: { current, best, broken: {lostLength, daysLeft} | null } */
export function view(streak, todayKey) {
  const s = settle(streak, todayKey);
  return { current: s.current, best: s.best, lastWorkoutDate: s.lastWorkoutDate, broken: s.broken ? { lostLength: s.broken.lostLength, daysLeft: diffDays(todayKey, s.broken.expiresOn) + 1, expiresOn: s.broken.expiresOn } : null };
}

/** A valid workout was done on dateKey. Returns { streak, milestones: [{days, drachmas}], extended }. */
export function recordWorkout(streak, dateKey) {
  const s = settle(streak, dateKey);
  if (s.lastWorkoutDate && diffDays(s.lastWorkoutDate, dateKey) <= 0) return { streak: s, milestones: [], extended: false };
  if (!s.lastWorkoutDate || s.current === 0) { s.current = 1; s.milestonesPaid = []; } else s.current += 1;
  s.lastWorkoutDate = dateKey;
  s.best = Math.max(s.best, s.current);
  const milestones = [];
  for (const [d, drachmas] of Object.entries(MILESTONES)) {
    if (s.current >= Number(d) && !s.milestonesPaid.includes(Number(d))) { s.milestonesPaid.push(Number(d)); milestones.push({ days: Number(d), drachmas }); }
  }
  return { streak: s, milestones, extended: true };
}

export function canRestore(streak, kind, todayKey) {
  const s = settle(streak, todayKey);
  const r = RESTORES[kind];
  return !!(r && s.broken && diffDays(todayKey, s.broken.expiresOn) >= 0 && s.broken.lostLength <= r.maxLength);
}

/** Reinstates the lost streak as if there had been no gap: the days worked since the break are added on top. One restore per break. */
export function restore(streak, kind, todayKey) {
  if (!canRestore(streak, kind, todayKey)) return null;
  const s = settle(streak, todayKey);
  const lost = s.broken.lostLength;
  const paid = [...new Set([...s.broken.milestonesPaid, ...s.milestonesPaid])];
  const hadNew = s.current > 0;
  s.current = lost + s.current;
  s.milestonesPaid = paid;
  if (!hadNew) s.lastWorkoutDate = todayKey; // keeps it alive from today without counting a workout
  s.best = Math.max(s.best, s.current);
  s.broken = null;
  return s;
}
