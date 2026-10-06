// Pure builders for the Ranks tab: exercise table, "what do I need?", muscle best lists.
import { loadForRating, nextDivisionFloor, nextTierFloor, tierFor } from './ranks.mjs';

/** rows for ranked exercises with a best; sortBy 'rating' | 'name' | 'oneRM' | 'recent'. */
export function exerciseRankTable(bests, byId, sortBy = 'rating', nameOf = (e) => e.nameEn) {
  const rows = Object.entries(bests).filter(([id]) => byId[id]).map(([id, b]) => ({ id, ex: byId[id], ...b }));
  const cmp = {
    rating: (a, b) => b.rating - a.rating,
    name: (a, b) => nameOf(a.ex).localeCompare(nameOf(b.ex)),
    oneRM: (a, b) => b.oneRM - a.oneRM,
    recent: (a, b) => (b.dateKey > a.dateKey ? 1 : b.dateKey < a.dateKey ? -1 : b.rating - a.rating),
  }[sortBy];
  return rows.sort(cmp);
}

/** Up to n best exercises of a ranking group, strongest first. */
export function muscleBestExercises(group, bests, byId, n = 3) {
  return Object.entries(bests).filter(([id, b]) => byId[id]?.muscleGroup === group && byId[id].ranked !== false && b.rating > 0)
    .map(([id, b]) => ({ id, ex: byId[id], ...b })).sort((a, b) => b.rating - a.rating).slice(0, n);
}

const ceilHalf = (x) => Math.ceil(x * 2 - 1e-9) / 2;

/**
 * Loads needed for the next division and next tier at `reps` reps.
 * Returns { current, division: {rating, tier, division, load, bodyweightEnough} | null, tier: {...} | null }.
 * A tier target equal to the division target (division I -> next tier) is returned only once, as `tier`.
 */
export function nextTargets(ex, rating, bodyweightKg, sex, reps) {
  const current = tierFor(rating);
  if (current.tier === 'greekgod') return { current, division: null, tier: null };
  const make = (target) => {
    const t = tierFor(target);
    const raw = loadForRating(ex, target, bodyweightKg, sex, reps);
    return { rating: target, tier: t.tier, division: t.division, load: Math.max(0, ceilHalf(raw)), bodyweightEnough: raw <= 0, assisted: raw < 0 ? ceilHalf(-raw) : 0 };
  };
  const d = nextDivisionFloor(rating), tFloor = nextTierFloor(rating);
  const tier = tFloor ? make(tFloor) : null;
  const division = d && d !== tFloor ? make(d) : null;
  return { current, division, tier };
}
