// The player's game state and the orchestration of what happens when a workout is posted. Pure (explicit `now`).
import { newStreak, recordWorkout, view, settle, diffDays, addDays, STREAK_MAX_GAP_DAYS } from './streak.mjs';
import { dateKey as keyOf } from './workout.mjs';
import { newInventory } from './shop.mjs';
import { isValidWorkout, workoutRewards, levelFromXp, MAX_REWARDED_PER_DAY, XP_SHAKE_MULTIPLIER } from './game.mjs';
import { computeStats, newlyUnlocked, unlock } from './achievements.mjs';
import { questBoard } from './quests.mjs';

export const GAME_VERSION = 1;

export function newGame() {
  return { id: 'me', schemaVersion: GAME_VERSION, xp: 0, drachmas: 0, streak: newStreak(), inventory: newInventory(), quests: { claimed: {} }, achievements: { unlocked: {} }, maxRankIndex: -1 };
}

export function migrateGame(raw) {
  const base = newGame();
  if (!raw || typeof raw !== 'object') return base;
  return { ...base, ...raw, streak: { ...base.streak, ...(raw.streak ?? {}) }, inventory: { ...base.inventory, ...(raw.inventory ?? {}), equipped: { ...base.inventory.equipped, ...(raw.inventory?.equipped ?? {}) } }, quests: { claimed: { ...(raw.quests?.claimed ?? {}) } }, achievements: { unlocked: { ...(raw.achievements?.unlocked ?? {}) } }, schemaVersion: GAME_VERSION };
}

/** Achievements that may have been earned by something other than a workout (custom exercise, plan, ...). Returns { game, unlocked }. */
export function evaluateAchievements({ game, achievements, workouts, customCount, plansCount, dayKey }) {
  const stats = computeStats({ workouts, game, customCount, plansCount });
  const fresh = newlyUnlocked(achievements, stats, game);
  if (!fresh.length) return { game, unlocked: [], reward: 0 };
  const r = unlock(game, fresh, dayKey);
  return { game: r.game, unlocked: fresh, reward: r.reward };
}

/**
 * The streak the workout history itself shows: the run of training days (valid workouts, WODs included) with gaps of at most
 * 3 days, ending on the latest one. -> { current, lastWorkoutDate, firstDate, days } (current 0 when there is none). Pure.
 */
export function historyStreak(workouts, todayKey) {
  const keyOfW = (w) => w.dateKey ?? (w.startedMs ? keyOf(w.startedMs) : null);
  const days = [...new Set(workouts.filter((w) => isValidWorkout(w)).map(keyOfW).filter((k) => k && k <= todayKey))].sort();
  if (!days.length) return { current: 0, lastWorkoutDate: null, firstDate: null, days: [] };
  let i = days.length - 1;
  while (i > 0 && diffDays(days[i - 1], days[i]) <= STREAK_MAX_GAP_DAYS) i--;
  const run = days.slice(i);
  return { current: run.length, lastWorkoutDate: run[run.length - 1], firstDate: run[0], days: run };
}

/**
 * Before v1.50.4 a WOD result did not count for the streak (Elia 28.11: "the streak resets after a WOD"), so a streak could break
 * on a day that had a WOD. Such a result is a WOD with no rewards stored. Only when the history's live run includes one of those
 * and is longer than the game's streak, the game takes the history's run; a break is forgotten only when the run spans it.
 * It never lowers a streak (a bought restore stays) and keeps milestones already paid. OUR DESIGN. -> the game, or the same object.
 */
export function healStreak(game, workouts, todayKey) {
  const hist = historyStreak(workouts, todayKey);
  if (!hist.current) return game;
  const inRun = new Set(hist.days);
  const missed = workouts.some((w) => w.wod && !w.rewards && isValidWorkout(w) && inRun.has(w.dateKey ?? (w.startedMs ? keyOf(w.startedMs) : null)));
  if (!missed) return game;
  const live = settle({ ...newStreak(), current: hist.current, lastWorkoutDate: hist.lastWorkoutDate }, todayKey).current; // 0 when the run is over
  const now = settle(game.streak, todayKey);
  if (live <= now.current) return game;
  const spansBreak = now.broken && hist.firstDate <= addDays(now.broken.brokenOn, -(STREAK_MAX_GAP_DAYS + 1));
  const streak = { ...now, current: live, best: Math.max(now.best ?? 0, live),
    lastWorkoutDate: now.lastWorkoutDate && now.lastWorkoutDate > hist.lastWorkoutDate ? now.lastWorkoutDate : hist.lastWorkoutDate,
    broken: spansBreak ? null : now.broken,
    milestonesPaid: [...new Set([...(spansBreak ? now.broken.milestonesPaid ?? [] : []), ...now.milestonesPaid])] }; // never paid twice
  return { ...game, streak };
}

/**
 * A workout was just posted. `workouts` holds every workout including this one (already recalculated).
 * Returns { game, rewards } where rewards is stored on the workout and shown on the summary.
 */
export function applyPost({ game, workout, workouts, byId, now, overallRankIndex = -1, customCount = 0, plansCount = 0, achievements = [], pool = null }) {
  let g = structuredClone(game);
  const dayKey = workout.dateKey;
  const others = workouts.filter((w) => w.id !== workout.id);
  const valid = isValidWorkout(workout);
  const rewardedToday = others.filter((w) => w.dateKey === dayKey && w.rewards?.rewarded).length;
  const rewarded = valid && rewardedToday < MAX_REWARDED_PER_DAY;
  const levelBefore = levelFromXp(g.xp);
  const streakBefore = view(g.streak, dayKey).current;
  const boardBefore = pool ? questBoard(pool, dayKey, now, others, byId, g.quests.claimed) : [];
  const rewards = { valid, rewarded, limitReached: valid && !rewarded, xp: 0, xpBase: 0, shake: false, drachmas: 0, breakdown: null, streak: streakBefore, milestones: [], achievements: [], achievementDrachmas: 0, levelBefore: levelBefore.level, levelAfter: levelBefore.level, questsCompleted: [] };

  if (rewarded) {
    const base = workoutRewards(workout);
    rewards.xpBase = base.xp; rewards.breakdown = base.breakdown;
    rewards.shake = g.inventory.shakeActive;
    rewards.xp = base.xp * (rewards.shake ? XP_SHAKE_MULTIPLIER : 1);
    if (rewards.shake) g.inventory.shakeActive = false;
    g.xp += rewards.xp;
    rewards.boost = !!g.inventory.boostActive;
    rewards.drachmas = base.drachmas * (rewards.boost ? 2 : 1);
    if (rewards.boost) g.inventory.boostActive = false;
    rewards.drachmasBase = base.drachmas;
    const s = recordWorkout(g.streak, dayKey);
    g.streak = s.streak;
    rewards.streak = s.streak.current;
    rewards.milestones = s.milestones;
    rewards.drachmas += s.milestones.reduce((n, m) => n + m.drachmas, 0);
    g.drachmas += rewards.drachmas;
  }
  g.maxRankIndex = Math.max(g.maxRankIndex ?? -1, overallRankIndex);
  rewards.levelAfter = levelFromXp(g.xp).level;

  // the workout carries its rewards, then achievements and quests are evaluated with it included
  workout.rewards = rewards;
  const ev = evaluateAchievements({ game: g, achievements, workouts, customCount, plansCount, dayKey });
  g = ev.game;
  rewards.achievements = ev.unlocked.map((a) => a.id); rewards.achievementDrachmas = ev.reward;
  if (pool) {
    const after = questBoard(pool, dayKey, now, workouts, byId, g.quests.claimed);
    rewards.questsCompleted = after.filter((q) => q.complete && !q.claimed && !boardBefore.find((b) => b.claimKey === q.claimKey)?.complete).map((q) => q.claimKey);
  }
  return { game: g, rewards };
}
