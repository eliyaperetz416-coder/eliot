// Rank engine. Everything here is OUR CALIBRATION (Liftoff's per-exercise curves are not public).
// Retune by editing CALIBRATION and src/data/calibration.json, never the formulas.

export const CALIBRATION = Object.freeze({
  REF_BODYWEIGHT: 80,        // OUR CALIBRATION: kg of the reference lifter the exercise R values are quoted for
  BW_EXPONENT: 0.85,         // OUR CALIBRATION: how strongly bodyweight scales strength
  CURVE_EXPONENT: 1.4,       // OUR CALIBRATION: shape of the rating curve
  RATING_AT_R: 900,          // rating (start of Olympian) reached at 1RM = R
  SEX_FACTOR: Object.freeze({ m: 1.0, f: 0.62 }), // OUR CALIBRATION: which strength curve to use
  MAX_REPS_FOR_EPLEY: 30,
  MIN_RANKED_EXERCISES: 3,   // OUR DESIGN: overall rank appears after this many ranked exercises
});

export const TIERS = Object.freeze([
  { id: 'wood', floor: 1 }, { id: 'bronze', floor: 200 }, { id: 'silver', floor: 300 },
  { id: 'gold', floor: 400 }, { id: 'platinum', floor: 500 }, { id: 'diamond', floor: 600 },
  { id: 'champion', floor: 700 }, { id: 'titan', floor: 800 }, { id: 'olympian', floor: 900 },
  { id: 'greekgod', floor: 1000 },
]);
export const DIVISIONS = Object.freeze(['V', 'IV', 'III', 'II', 'I']); // V lowest, I highest
export const RANK_GROUPS = Object.freeze(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abs']);

/** Epley 1RM. Reps above 30 are capped (see isUnreliable). */
export function epley(weight, reps) {
  return weight * (1 + Math.min(reps, CALIBRATION.MAX_REPS_FOR_EPLEY) / 30);
}
export const isUnreliable = (reps) => reps > CALIBRATION.MAX_REPS_FOR_EPLEY;

/** Load that counts for the curve. addedKg may be negative (assisted machines). Dumbbell inputs are per hand. */
export function effectiveLoad(ex, addedKg, bodyweightKg) {
  return ex.bwFactor ? Math.max(0, bodyweightKg * ex.bwFactor + addedKg) : addedKg;
}

export function estimateOneRM(ex, addedKg, reps, bodyweightKg) {
  return epley(effectiveLoad(ex, addedKg, bodyweightKg), reps);
}

const bwScale = (bw) => Math.pow(CALIBRATION.REF_BODYWEIGHT / bw, CALIBRATION.BW_EXPONENT);

/** Rating (>=1, no maximum) of one set. Returns 0 (unranked) for unusable sets or unranked exercises. */
export function ratingForSet(ex, { weight, reps }, bodyweightKg, sex = 'm') {
  if (!ex || ex.ranked === false || !ex.R) return 0;
  if (!(reps > 0) || !(bodyweightKg > 0)) return 0;
  const oneRM = estimateOneRM(ex, weight, reps, bodyweightKg);
  if (!(oneRM > 0)) return 0;
  const scaled = (oneRM * bwScale(bodyweightKg)) / CALIBRATION.SEX_FACTOR[sex];
  const rating = Math.round(CALIBRATION.RATING_AT_R * Math.pow(scaled / ex.R, 1 / CALIBRATION.CURVE_EXPONENT));
  return Math.max(1, rating);
}

/** 1RM (kg, of the effective load) needed to reach `rating`. */
export function oneRMForRating(ex, rating, bodyweightKg, sex = 'm') {
  return (ex.R * Math.pow(rating / CALIBRATION.RATING_AT_R, CALIBRATION.CURVE_EXPONENT) * CALIBRATION.SEX_FACTOR[sex]) / bwScale(bodyweightKg);
}

/** Added/bar load (kg) needed for `rating` at `reps` reps. Can be <= 0 when bodyweight alone is enough. */
export function loadForRating(ex, rating, bodyweightKg, sex = 'm', reps = 5) {
  const total = oneRMForRating(ex, rating, bodyweightKg, sex) / (1 + Math.min(reps, CALIBRATION.MAX_REPS_FOR_EPLEY) / 30);
  return total - (ex.bwFactor ? ex.bwFactor * bodyweightKg : 0);
}

/** Tier, division and LP for a rating. rating < 1 => unranked. Greek God: open-ended, no division, no LP. */
export function tierFor(rating) {
  if (!(rating >= 1)) return { unranked: true, tier: null, division: null, lp: 0, rating: 0 };
  if (rating >= 1000) return { unranked: false, tier: 'greekgod', division: null, lp: null, rating, floor: 1000, next: null };
  let i = 0;
  while (TIERS[i + 1].floor <= rating) i++;
  const f = TIERS[i].floor, n = TIERS[i + 1].floor;
  const size = (n - f) / 5;
  const rel = rating - f;
  const d = Math.min(4, Math.floor(rel / size));
  const lp = Math.min(100, Math.floor(((rel - d * size) * 100) / size));
  return { unranked: false, tier: TIERS[i].id, division: DIVISIONS[d], divisionIndex: d, lp, rating, floor: f, next: n };
}

/** Lowest rating of the next division (or tier start after division I). null for Greek God / unranked. */
export function nextDivisionFloor(rating) {
  const t = tierFor(rating);
  if (t.unranked) return 1;
  if (t.tier === 'greekgod') return null;
  const size = (t.next - t.floor) / 5;
  if (t.divisionIndex === 4) return t.next;
  return Math.ceil(t.floor + (t.divisionIndex + 1) * size - 1e-9);
}
export function nextTierFloor(rating) {
  const t = tierFor(rating);
  return t.unranked ? 1 : t.next;
}

/** round(sum r^2 / sum r) over positive ratings: weights higher ratings, ignores zeros. */
export function aggregate(list) {
  let s1 = 0, s2 = 0;
  for (const r of list) if (r > 0) { s1 += r; s2 += r * r; }
  return s1 ? Math.round(s2 / s1) : 0;
}

/** bests: { exerciseId: bestRating }. exercisesById: { id: exercise }. */
export function muscleRating(group, bests, exercisesById) {
  const list = [];
  for (const [id, r] of Object.entries(bests)) {
    const ex = exercisesById[id];
    if (ex && ex.ranked !== false && ex.muscleGroup === group && r > 0) list.push(r);
  }
  return aggregate(list);
}

export function muscleRatings(bests, exercisesById) {
  return Object.fromEntries(RANK_GROUPS.map((g) => [g, muscleRating(g, bests, exercisesById)]));
}

export function rankedCount(bests, exercisesById) {
  return Object.entries(bests).filter(([id, r]) => r > 0 && exercisesById[id]?.ranked !== false && exercisesById[id]?.muscleGroup !== 'other').length;
}

/** { pending, remaining, rating, strength, bonus } - overall appears only after MIN_RANKED_EXERCISES ranked exercises.
 *  rating = strength + bonus (the consistency bonus, see consistency.mjs; OUR DESIGN). */
export function overallRating(bests, exercisesById, bonus = 0) {
  const count = rankedCount(bests, exercisesById);
  if (count < CALIBRATION.MIN_RANKED_EXERCISES) {
    return { pending: true, remaining: CALIBRATION.MIN_RANKED_EXERCISES - count, rating: 0, strength: 0, bonus: 0 };
  }
  const groups = Object.values(muscleRatings(bests, exercisesById)).filter((r) => r > 0);
  const strength = aggregate(groups);
  return { pending: false, remaining: 0, rating: strength + bonus, strength, bonus };
}

// OUR DESIGN: tier colours (also the app accent while that tier is the overall rank).
export const TIER_COLORS = Object.freeze({
  wood: '#a98764', bronze: '#d08a4a', silver: '#b9c3d3', gold: '#ffc43d', platinum: '#4fe3d0',
  diamond: '#5aa2ff', champion: '#b46bff', titan: '#ff5577', olympian: '#ffd76a',
  greekgod: '#fff1b8', // static fallback; animated gradient #fff1b8 -> #7df9ff elsewhere
});
export const GREEK_GOD_GRADIENT = Object.freeze(['#fff1b8', '#7df9ff']);
