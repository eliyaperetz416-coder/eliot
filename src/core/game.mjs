// XP, levels, drachmas and the valid-workout rule. All numbers are OUR DESIGN. Pure.
export const MIN_VALID_SETS = 3;
export const MAX_REWARDED_PER_DAY = 2;
export const XP_PER_SET = 10, XP_SET_CAP = 40, XP_PER_PR = 25, XP_WORKOUT = 50;
export const DRACHMA_WORKOUT = 20, DRACHMA_PER_SET = 3, DRACHMA_SET_PART_CAP = 60, DRACHMA_PER_PR = 15;
export const DRACHMA_DAILY_QUEST = 15, DRACHMA_WEEKLY_QUEST = 60;
export const XP_SHAKE_MULTIPLIER = 2;

/** XP needed to go from level n to n+1 (level 1 is the start). */
export const xpToNext = (n) => 100 + 25 * (n - 1);
export function levelFromXp(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp));
  while (left >= xpToNext(level)) { left -= xpToNext(level); level += 1; }
  return { level, into: left, need: xpToNext(level), progress: left / xpToNext(level) };
}
export const xpForLevel = (level) => { let t = 0; for (let n = 1; n < level; n++) t += xpToNext(n); return t; };

export const workingSetsOf = (w) => w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done && s.type !== 'warmup').length, 0);
export const prSetsOf = (w) => w.entries.reduce((n, e) => n + e.sets.filter((s) => s.done && s.type !== 'warmup' && (s.prWeekly || s.prAllTime)).length, 0);
export const isValidWorkout = (w) => workingSetsOf(w) >= MIN_VALID_SETS;
/** Valid as stored (rewards decided when it was posted), or computed for older workouts. */
export const isValid = (w) => (w.rewards ? w.rewards.valid : isValidWorkout(w));

/** Base rewards of one rewarded workout (before XP Shake). */
export function workoutRewards(w) {
  const sets = workingSetsOf(w), prs = prSetsOf(w);
  const setXp = XP_PER_SET * Math.min(sets, XP_SET_CAP), prXp = XP_PER_PR * prs;
  const setDr = Math.min(DRACHMA_PER_SET * sets, DRACHMA_SET_PART_CAP), prDr = DRACHMA_PER_PR * prs;
  return { sets, prs, xp: setXp + prXp + XP_WORKOUT, drachmas: DRACHMA_WORKOUT + setDr + prDr, breakdown: { setXp, prXp, completionXp: XP_WORKOUT, baseDrachmas: DRACHMA_WORKOUT, setDrachmas: setDr, prDrachmas: prDr } };
}
