// "Where am I weakest and what do I need?" (OUR DESIGN, v1.36). Pure.
// Lists the ten main muscle groups from the weakest (not trained yet first) with the exercise to push and the load for the next step,
// and the bonus parts you are not full on, with a hint for each.
import { muscleRatings, tierFor } from './ranks.mjs';
import { MAIN_GROUPS, PARTS, rankBonus } from './bonus.mjs';
import { muscleBestExercises, nextTargets } from './views.mjs';
import { BONUS } from './consistency.mjs';

const EQUIP_ORDER = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'ez-bar', 'other'];

/** An exercise to start a group that has no rating yet: a plain ranked lift, barbell and dumbbell first. */
export function starterExercise(group, exercises) {
  const list = exercises.filter((e) => e.muscleGroup === group && e.ranked && !e.custom && (e.type === 'weight' || e.type === 'bodyweight'));
  return list.sort((a, b) => EQUIP_ORDER.indexOf(a.equipment) - EQUIP_ORDER.indexOf(b.equipment) || a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * groups: weakest first. { group, rating, tier (tierFor or null), ex, best, target } where `target` is the next division
 * (or tier) of that group's best exercise from nextTargets (null for a group with no rating yet: do the starter exercise once).
 */
export function weakestGroups({ ratings, bests, byId, exercises, bodyweightKg, sex = 'm' }) {
  const g = muscleRatings(ratings, byId);
  const list = MAIN_GROUPS.map((group) => {
    const rating = g[group] ?? 0;
    const top = muscleBestExercises(group, bests, byId, 1)[0] ?? null;
    if (!top) return { group, rating: 0, tier: null, ex: starterExercise(group, exercises), best: null, target: null };
    const reps = Math.min(12, Math.max(3, top.reps ?? 5));
    const nt = nextTargets(top.ex, top.rating, bodyweightKg, sex, reps);
    return { group, rating, tier: tierFor(rating), ex: top.ex, best: top, reps, target: nt.division ?? nt.tier ?? null };
  });
  return list.sort((a, b) => (a.rating || -1) - (b.rating || -1) || a.group.localeCompare(b.group));
}

/** The bonus parts that are not full yet, biggest gap first: [{ id, points, max, missing, args }]. */
export function bonusTips({ workouts, byId, ratings, now, claims }) {
  const b = rankBonus({ workouts, byId, ratings, now, claims });
  const p = b.parts;
  const notTrained = MAIN_GROUPS.filter((x) => !p.balance.trained.includes(x));
  const tips = [
    { id: 'days', points: p.consistency.dayPoints, max: BONUS.DAY_POINTS_CAP, args: { n: p.consistency.days } },
    { id: 'streak', points: p.consistency.streakPoints, max: BONUS.STREAK_POINTS_CAP, args: { n: p.consistency.streakWeeks } },
    { id: 'volume', points: p.volume.points, max: PARTS.VOLUME_MAX, args: { pct: p.volume.pct } },
    { id: 'cover', points: p.balance.coverPoints, max: PARTS.COVER_MAX, args: { n: notTrained.length }, groups: notTrained },
    { id: 'balance', points: p.balance.balancePoints, max: PARTS.BALANCE_MAX, args: {} },
    { id: 'goal', points: p.goal.points, max: PARTS.GOAL_MAX, args: { goal: p.goal.goal } },
    { id: 'quests', points: p.quests.points, max: PARTS.QUEST_MAX, args: {} },
  ];
  return tips.map((x) => ({ ...x, missing: x.max - x.points })).filter((x) => x.missing > 0).sort((a, b) => b.missing - a.missing);
}
