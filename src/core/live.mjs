// What happens when you tap the V on a set (and when you undo it). Pure.
import { computeWorkout, buildEvents } from './post.mjs';
import { tierFor } from './ranks.mjs';

function find(w, entryId, idx) {
  const e = w.entries.find((x) => x.id === entryId);
  return { e, s: e?.sets[idx] };
}

/**
 * Marks a set done, snapshots bodyweight, and refreshes ratings / PR flags of the whole draft against history.
 * Returns feedback for the UI: { rating, tier, division, pr: {first, weekly, allTime}, warmup }.
 * Ranks themselves only change when the workout is posted.
 */
export function completeSet({ workout, entryId, idx, now, bodyweightKg, sex, workouts, byId }) {
  const { e, s } = find(workout, entryId, idx);
  if (!s) throw new Error('set not found');
  s.done = true; s.doneAt = now; s.bwAtSet = bodyweightKg;
  workout.sex = sex; workout.updatedMs = now;
  computeWorkout(workout, buildEvents(workouts), byId);
  return feedbackOf(s);
}

export function reopenSet({ workout, entryId, idx, now, workouts, byId }) {
  const { s } = find(workout, entryId, idx);
  if (!s) throw new Error('set not found');
  s.done = false; delete s.doneAt; delete s.bwAtSet; workout.updatedMs = now;
  computeWorkout(workout, buildEvents(workouts), byId);
}

export function feedbackOf(s) {
  const t = s.rating > 0 ? tierFor(s.rating) : null;
  return {
    rating: s.rating ?? 0, tier: t?.tier ?? null, division: t?.division ?? null,
    pr: { first: !!s.prFirst, weekly: !!s.prWeekly, allTime: !!s.prAllTime }, warmup: s.type === 'warmup',
  };
}

/** Recompute ratings / PR flags of the draft after an edit to a done set. */
export function refreshWorkout(workout, workouts, byId) {
  computeWorkout(workout, buildEvents(workouts), byId);
}

/** Sets that have usable numbers but were never ticked with the V (people often fill the numbers and forget the tick). */
export function filledOpenSets(workout, byId) {
  const out = [];
  for (const e of workout.entries) {
    const ex = byId[e.exerciseId];
    for (const s of e.sets) {
      if (s.done || !(s.reps > 0)) continue;
      const needsWeight = ex && (ex.type === 'weight' || (ex.type !== 'bodyweight' && ex.type !== 'time' && ex.type !== 'cardio'));
      if (needsWeight && !(s.weight > 0)) continue;
      out.push({ entryId: e.id, idx: s.idx });
    }
  }
  return out;
}

/** Ticks every filled-but-open set. Returns how many were ticked. */
export function completeFilled({ workout, now, bodyweightKg, sex, workouts, byId }) {
  const list = filledOpenSets(workout, byId);
  for (const { entryId, idx } of list) {
    const { s } = find(workout, entryId, idx);
    if (s.type !== 'warmup' && s.weight == null) s.weight = 0;
    completeSet({ workout, entryId, idx, now, bodyweightKg, sex, workouts, byId });
  }
  return list.length;
}
