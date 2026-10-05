// Muscle-map logic (pure). Polygon ids come from src/data/muscles.json.
export const MAP_COLORS = Object.freeze({ primary: '#ff2d4a', secondary: '#ff8a3d', neutral: '#343a5a', dim: '#2a2f4a' });

/** Ranking group of a polygon id; null = neutral (not ranked). */
export const GROUP_OF_MUSCLE = Object.freeze({
  chest: 'chest', 'upper-back': 'back', 'lower-back': 'back', trapezius: 'back',
  'front-deltoids': 'shoulders', 'back-deltoids': 'shoulders', biceps: 'biceps', triceps: 'triceps',
  quadriceps: 'quads', hamstring: 'hamstrings', gluteal: 'glutes', calves: 'calves', abs: 'abs', obliques: 'abs',
  forearm: null, neck: null, adductor: null, abductors: null,
});

/** Some muscles are drawn as several polygon ids. */
const ALIASES = { calves: ['calves', 'left-soleus', 'right-soleus'] };
export const expandIds = (ids) => [...new Set(ids.flatMap((i) => ALIASES[i] ?? [i]))];

/** Which polygon ids to colour, and how, for an exercise. */
export function exerciseHighlight(ex) {
  const primary = new Set(expandIds(ex.primaryMuscles));
  const secondary = new Set(expandIds(ex.secondaryMuscles).filter((m) => !primary.has(m)));
  return { primary, secondary };
}

/** Role of one polygon id for an exercise: 'primary' | 'secondary' | null. */
export function roleOf(ex, id) {
  const h = exerciseHighlight(ex);
  return h.primary.has(id) ? 'primary' : h.secondary.has(id) ? 'secondary' : null;
}

/** Display ids (alias soleus -> calves) for chips. */
export const chipIds = (ids) => [...new Set(ids.filter((i) => !/soleus/.test(i)))];
