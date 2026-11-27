import { dateKey } from './workout.mjs';

// Benchmark workouts ("WODs": the Girls and Hero workouts). OUR DESIGN on top of the well-known public workouts. Pure.
// A result is stored as a posted workout with no sets and a `wod` field, so it counts for training days, streaks and milestones,
// but never touches the strength ratings (reps done for time are not sets taken near failure).
//   wod: { id, name, division: 'rx' | 'scaled', score: { type, seconds?, capped?, rounds?, reps? }, pr }

export const FORMATS = Object.freeze(['amrap', 'fortime', 'emom', 'rounds']);
export const SCORE_TYPES = Object.freeze(['time', 'rounds', 'reps']);
export const LIMITS = Object.freeze({ seconds: 86400, rounds: 999, reps: 99999 });
export const SCALE_LOAD = 0.65; // scaled loads: about two thirds of RX, rounded to 2.5 kg

const round25 = (kg) => Math.max(2.5, Math.round(kg / 2.5) * 2.5);

/** Reps of a movement in round i (0-based). A scheme like [21, 15, 9] gives the rounds; a number is the same every round. */
export const repsIn = (m, i = 0) => (Array.isArray(m.reps) ? m.reps[i] ?? null : m.reps ?? null);

/** How many rounds the workout has: a scheme sets it (21-15-9 = 3), else `rounds`, else 1. AMRAP/EMOM are open-ended. */
export function roundCount(wod) {
  const scheme = wod.movements.find((m) => Array.isArray(m.reps));
  return scheme ? scheme.reps.length : wod.rounds ?? 1;
}
/** The rep scheme as text ("21-15-9") or null. */
export function schemeText(wod) {
  const s = wod.movements.find((m) => Array.isArray(m.reps));
  return s ? s.reps.join('-') : null;
}
/** Reps in one full round (only counted movements; runs and max sets do not count). Used to turn rounds + reps into total reps. */
export const repsPerRound = (wod) => wod.movements.reduce((n, m) => n + (typeof m.reps === 'number' ? m.reps : 0), 0);

/** The load for a person: { kg } from the RX table, or { bw: factor, kg } relative to bodyweight. Scaled is about 65 % of RX. */
export function loadFor(m, { sex = 'm', division = 'rx', bodyweightKg = null } = {}) {
  let kg = null;
  if (m.load) kg = sex === 'f' ? m.load.f : m.load.m;
  else if (m.bw && bodyweightKg) kg = m.bw * bodyweightKg;
  if (kg == null) return m.bw ? { bw: m.bw, kg: null } : null;
  if (division === 'scaled') kg = round25(kg * SCALE_LOAD);
  else kg = Math.round(kg * 2) / 2;
  return { kg, bw: m.bw ?? null };
}

/** A score is valid when it has the right numbers in range. Returns the cleaned score or null. */
export function cleanScore(type, input = {}) {
  const int = (v, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= max ? n : null; };
  if (type === 'time') {
    const seconds = int(input.seconds, LIMITS.seconds);
    if (input.capped) { const reps = int(input.reps, LIMITS.reps); return reps == null ? null : { type, capped: true, reps, seconds: seconds ?? null }; }
    return seconds && seconds > 0 ? { type, seconds } : null;
  }
  if (type === 'rounds') {
    const rounds = int(input.rounds, LIMITS.rounds), reps = int(input.reps ?? 0, LIMITS.reps);
    return rounds == null || reps == null || (rounds === 0 && reps === 0) ? null : { type, rounds, reps };
  }
  if (type === 'reps') { const reps = int(input.reps, LIMITS.reps); return reps ? { type, reps } : null; }
  return null;
}

/** One number to compare scores of the same workout: bigger is better. A finished time always beats a time-capped result. */
export function scoreValue(score) {
  if (!score) return -Infinity;
  if (score.type === 'time') return score.capped ? score.reps : 1e9 - score.seconds;
  if (score.type === 'rounds') return score.rounds * 10000 + score.reps;
  return score.reps;
}

/** All results of one workout (oldest first), optionally only one division. */
export const resultsOf = (workouts, wodId, division) =>
  workouts.filter((w) => w.wod?.id === wodId && (!division || w.wod.division === division)).sort((a, b) => a.endedMs - b.endedMs);

/** Best result per workout and division: { [wodId]: { rx?: workout, scaled?: workout } }. */
export function bestsByWod(workouts) {
  const out = {};
  for (const w of workouts) {
    if (!w.wod?.id) continue;
    const d = w.wod.division === 'scaled' ? 'scaled' : 'rx';
    const cur = out[w.wod.id]?.[d];
    if (!cur || scoreValue(w.wod.score) > scoreValue(cur.wod.score)) (out[w.wod.id] ??= {})[d] = w;
  }
  return out;
}

/** Is this score a personal best for the workout + division (the first one counts too)? */
export function isPr(workouts, wodId, division, score) {
  const prev = resultsOf(workouts, wodId, division);
  return !prev.length || prev.every((w) => scoreValue(score) > scoreValue(w.wod.score));
}

/**
 * What a result did to the body, for the recovery map (Elia 27.11: a WOD showed nothing there). A result stores no sets,
 * so the movements are counted from the workout itself: total reps of each movement / 10 = "sets" (1..10). Runs and
 * max-effort movements count 10 reps a round. OUR DESIGN, a rough guide like the rest of recovery.
 * Returns [{ exerciseId, sets }], one per movement.
 */
export function wodSets(def, score) {
  if (!def?.movements?.length || !score) return [];
  const rounds = roundCount(def), perRound = repsPerRound(def);
  let done; // full rounds done (may be a fraction)
  if (score.type === 'rounds') done = score.rounds + (perRound ? (score.reps ?? 0) / perRound : 0);
  else if (score.type === 'time' && !score.capped) done = def.format === 'emom' ? def.minutes ?? rounds : rounds;
  else done = perRound ? (score.reps ?? 0) / perRound : 1;
  const repsOf = (m) => {
    if (Array.isArray(m.reps)) { const full = Math.floor(done), part = done - full; return m.reps.slice(0, full).reduce((a, b) => a + b, 0) + (m.reps[full] ?? 0) * part; }
    return (typeof m.reps === 'number' ? m.reps : 10) * done;
  };
  const total = new Map();
  for (const m of def.movements) total.set(m.ex, (total.get(m.ex) ?? 0) + repsOf(m));
  return [...total].filter(([, r]) => r > 0).map(([exerciseId, r]) => ({ exerciseId, sets: Math.min(10, Math.max(1, Math.round(r / 10))) }));
}

/** The workout record that stores a result. */
export function buildWodWorkout({ id, wod, division, score, startedMs, endedMs, notes = '', workouts = [] }) {
  return {
    id, schemaVersion: 1, name: wod.name, dateKey: dateKey(startedMs), startedMs, endedMs, endedAt: new Date(endedMs).toISOString(),
    entries: [], notes: String(notes).slice(0, 500), stats: { volume: 0, workingSets: 0, prs: 0, durationSec: Math.max(0, Math.round((endedMs - startedMs) / 1000)) },
    wod: { id: wod.id, name: wod.name, kind: wod.kind, division: division === 'scaled' ? 'scaled' : 'rx', score, pr: isPr(workouts, wod.id, division, score) },
  };
}

/** "12:34" (or "1:02:03"). */
export function clock(sec) {
  const s = Math.max(0, Math.floor(sec)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(r)}` : `${m}:${p(r)}`;
}

/** Where the clock is: { elapsed, remaining (amrap/emom/cap), minute (emom, 1-based), done }. */
export function clockState(wod, elapsedMs, capMin = null) {
  const elapsed = Math.max(0, elapsedMs / 1000);
  const total = wod.format === 'amrap' || wod.format === 'emom' ? wod.minutes * 60 : capMin ? capMin * 60 : null;
  const remaining = total == null ? null : Math.max(0, total - elapsed);
  const minute = wod.format === 'emom' ? Math.min(wod.minutes, Math.floor(elapsed / 60) + 1) : null;
  return { elapsed, remaining, minute, secInMinute: wod.format === 'emom' ? 60 - (elapsed % 60) : null, done: total != null && elapsed >= total };
}
