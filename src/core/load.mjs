// How the weight you type relates to the total load (OUR DESIGN). You always type the TOTAL weight (bar or machine included)
// and sets store that total, so ranks, PRs and volume use one convention. A per-exercise "base weight" (empty bar, sled,
// machine) is only used to work out the plates to load on each side. (Until v1.15 the base was added to what you typed.)
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
export const BASE_PRESETS = Object.freeze({ bar: [0, 10, 15, 20], machine: [0, 20, 40, 50, 75, 100] });

/** Plates you can load, kg, biggest first (OUR DESIGN: a common gym set). */
export const PLATES = Object.freeze([25, 20, 15, 10, 5, 2.5, 1.25]);
const BAR_DEFAULT = Object.freeze({ barbell: 20, 'ez-bar': 10 });

/** The empty weight to load plates on: your saved base, else a standard bar for barbells, else none (stack machines). */
export function plateBase(ex, savedBase = 0) {
  if (!supportsBase(ex)) return null;
  if (savedBase > 0) return savedBase;
  return BAR_DEFAULT[ex.equipment] ?? null;
}

/** { perSide, plates, left } for a total on a base, or null when it cannot be loaded (below the base). left = kg per side the plates could not make. */
export function platesPerSide(total, base, plates = PLATES) {
  if (!(total > 0) || base == null || total < base) return null;
  const perSide = round2((total - base) / 2);
  // Fewest plates; on a tie the more even set (smaller biggest plate): 35 = 20 + 15 rather than 25 + 10. Units of 0.05 kg.
  const U = 20, target = Math.round(perSide * U), ps = plates.map((p) => Math.round(p * U));
  const best = new Array(target + 1).fill(null);
  best[0] = [];
  const better = (a, b) => !b || a.length < b.length || (a.length === b.length && Math.max(...a) < Math.max(...b));
  for (let v = 1; v <= target; v++) for (const p of ps) {
    if (p > v || !best[v - p]) continue;
    const cand = [...best[v - p], p].sort((x, y) => y - x);
    if (better(cand, best[v])) best[v] = cand;
  }
  let v = target;
  while (v > 0 && !best[v]) v--;
  return { perSide, plates: best[v].map((p) => p / U), left: round2((target - v) / U) };
}
