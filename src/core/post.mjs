// Posting a workout, recalculating history, and rank changes. Pure.
import { estimateOneRM, ratingForSet, tierFor, TIERS, muscleRatings, overallRating } from './ranks.mjs';
import { consistencyBonus } from './consistency.mjs';
import { metricOf, evaluatePR } from './prs.mjs';
import { compactForPost, isWorking, stats, SCHEMA_VERSION } from './workout.mjs';

const bw = (s, fallback) => (s.bwAtSet > 0 ? s.bwAtSet : fallback);

/** Recompute oneRM / rating / PR flags of every done set of one workout, given earlier history. Mutates w. */
export function computeWorkout(w, events, byId) {
  const sets = [];
  let seq = 0;
  for (const e of w.entries) for (const s of e.sets) if (s.done) sets.push({ e, s, order: s.doneAt ?? w.startedMs + seq++ });
  sets.sort((a, b) => a.order - b.order);
  for (const { e, s, order } of sets) {
    const ex = byId[e.exerciseId];
    delete s.rating; delete s.oneRM; delete s.metric; delete s.prFirst; delete s.prWeekly; delete s.prAllTime;
    if (!ex) continue;
    s.doneAt = s.doneAt ?? order;
    if (s.type === 'warmup') continue;
    const b = bw(s, 0);
    const metric = metricOf(ex, s, b);
    s.metric = Math.round(metric * 100) / 100;
    if (ex.ranked && b > 0) {
      s.oneRM = Math.round(estimateOneRM(ex, Number(s.weight) || 0, Number(s.reps) || 0, b) * 10) / 10;
      s.rating = ratingForSet(ex, { weight: Number(s.weight) || 0, reps: Number(s.reps) || 0 }, b, w.sex ?? 'm');
    }
    const hist = events.get(e.exerciseId) ?? [];
    const pr = evaluatePR({ metric, at: s.doneAt, history: hist });
    s.prFirst = pr.first; s.prWeekly = pr.weekly; s.prAllTime = pr.allTime;
    if (metric > 0) { hist.push({ metric, at: s.doneAt }); events.set(e.exerciseId, hist); }
  }
  return w;
}

/** Recompute all workouts in chronological order (history-dependent PR flags). Mutates and returns the sorted list. */
export function recalcAll(workouts, byId) {
  const sorted = [...workouts].sort((a, b) => a.startedMs - b.startedMs);
  const events = new Map();
  for (const w of sorted) { computeWorkout(w, events, byId); w.stats = stats(w, byId); }
  return sorted;
}

/** Best rating ever per ranked exercise: { exerciseId: {rating, oneRM, dateKey, workoutId, weight, reps} } */
export function bestsFrom(workouts) {
  const bests = {};
  for (const w of workouts) for (const e of w.entries) for (const s of e.sets) {
    if (!isWorking(s) || !(s.rating > 0)) continue;
    const cur = bests[e.exerciseId];
    if (!cur || s.rating > cur.rating) bests[e.exerciseId] = { rating: s.rating, oneRM: s.oneRM, dateKey: w.dateKey, workoutId: w.id, weight: s.weight, reps: s.reps };
  }
  return bests;
}
export const ratingsOf = (bests) => Object.fromEntries(Object.entries(bests).map(([id, b]) => [id, b.rating]));

/** Tier index * 5 + division (V=0..I=4). Greek God = 45. */
export function rankIndex(rating) {
  const t = tierFor(rating);
  if (t.unranked) return -1;
  if (t.tier === 'greekgod') return TIERS.length * 5 - 5;
  return TIERS.findIndex((x) => x.id === t.tier) * 5 + t.divisionIndex;
}

/** { kind: 'first' | 'up', from, to } or null. `before`/`after` come from overallRating(). */
export function rankChange(before, after) {
  if (after.pending) return null;
  if (before.pending) return { kind: 'first', from: null, to: tierFor(after.rating) };
  return rankIndex(after.rating) > rankIndex(before.rating) ? { kind: 'up', from: tierFor(before.rating), to: tierFor(after.rating) } : null;
}

export function postWorkout({ draft, workouts, now, byId, sex = 'm' }) {
  const w = structuredClone(draft);
  compactForPost(w);
  w.schemaVersion = SCHEMA_VERSION;
  w.endedMs = now; w.endedAt = new Date(now).toISOString(); w.sex = sex; w.timer = null;
  const beforeBests = bestsFrom(workouts);
  const all = recalcAll([...workouts.map((x) => structuredClone(x)), w], byId);
  const posted = all.find((x) => x.id === w.id);
  const afterBests = bestsFrom(all);
  const rb = ratingsOf(beforeBests), ra = ratingsOf(afterBests);
  const overallBefore = overallRating(rb, byId, consistencyBonus(workouts, now).total), overallAfter = overallRating(ra, byId, consistencyBonus(all, now).total);
  const mb = muscleRatings(rb, byId), ma = muscleRatings(ra, byId);
  const ratingChanges = Object.keys(ra).filter((id) => ra[id] > (rb[id] ?? 0)).map((id) => ({ exerciseId: id, before: rb[id] ?? 0, after: ra[id] }));
  const prs = [];
  for (const e of posted.entries) for (const s of e.sets) {
    if (s.prAllTime) prs.push({ exerciseId: e.exerciseId, idx: s.idx, kind: 'allTime' });
    else if (s.prWeekly) prs.push({ exerciseId: e.exerciseId, idx: s.idx, kind: 'weekly' });
    else if (s.prFirst) prs.push({ exerciseId: e.exerciseId, idx: s.idx, kind: 'first' });
  }
  return {
    workout: posted, workouts: all, bests: afterBests,
    summary: {
      stats: posted.stats, ratingChanges, prs, overallBefore, overallAfter, rankChange: rankChange(overallBefore, overallAfter),
      muscleChanges: Object.keys(ma).filter((g) => ma[g] > mb[g]).map((g) => ({ group: g, before: mb[g], after: ma[g] })),
    },
  };
}

/** Delete or edit helpers: run after changing `workouts`; returns { workouts, bests, overall }. */
export function afterEdit(workouts, byId, now = Date.now()) {
  const all = recalcAll(workouts, byId);
  const bests = bestsFrom(all);
  return { workouts: all, bests, overall: overallRating(ratingsOf(bests), byId, consistencyBonus(all, now).total) };
}

/** Map exerciseId -> [{metric, at}] from posted workouts (done, non-warm-up sets). */
export function buildEvents(workouts) {
  const events = new Map();
  for (const w of workouts) for (const e of w.entries) for (const s of e.sets) {
    if (!isWorking(s) || !(s.metric > 0)) continue;
    const list = events.get(e.exerciseId) ?? [];
    list.push({ metric: s.metric, at: s.doneAt ?? w.endedMs ?? w.startedMs });
    events.set(e.exerciseId, list);
  }
  return events;
}
