// How the weight you type relates to the total load (OUR DESIGN). Sets always store the TOTAL weight (bar or machine included),
// so ranks, PRs and volume use one convention. A per-exercise "base weight" (empty bar, sled, machine) lets you type only what you add.
const round2 = (n) => Math.round(n * 100) / 100;

export function cleanBase(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.min(500, round2(n)) : 0;
}
export const totalFromTyped = (typed, base) => (typed == null || !Number.isFinite(typed) ? null : round2(typed + base));
export const typedFromTotal = (total, base) => (total == null || !Number.isFinite(total) ? null : Math.max(0, round2(total - base)));

/** 'perhand' | 'bar' | 'machine' | 'added' | null (time / cardio). Decides the hint text and whether a base weight makes sense. */
export function weightMode(ex) {
  if (!ex || ex.type === 'time' || ex.type === 'cardio') return null;
  if (ex.type === 'bodyweight') return 'added';
  if (ex.perHand || ex.equipment === 'dumbbell') return 'perhand';
  if (ex.equipment === 'barbell' || ex.equipment === 'ez-bar') return 'bar';
  return 'machine';
}
export const supportsBase = (ex) => ['bar', 'machine'].includes(weightMode(ex));
export const BASE_PRESETS = Object.freeze({ bar: [0, 10, 15, 20], machine: [0, 5, 10, 15, 20, 25] });
