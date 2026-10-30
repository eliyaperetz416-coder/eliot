// Draft persistence helpers: pick the newest of two copies (IndexedDB vs localStorage mirror) and migrate old shapes.
import { SCHEMA_VERSION, saneSetValue } from './workout.mjs';

export function migrateWorkout(w) {
  if (!w || typeof w !== 'object') return null;
  const out = { ...w };
  if (!Number.isInteger(out.schemaVersion)) out.schemaVersion = 0;
  // 0 -> 1: sets gained explicit idx/type/done; entries gained restSec
  if (out.schemaVersion < 1) {
    out.entries = (out.entries ?? []).map((e) => ({
      supersetGroup: null, notes: '', restSec: 90, ...e,
      sets: (e.sets ?? []).map((s, i) => ({ idx: i, type: 'normal', weight: null, reps: null, done: false, ...s })),
    }));
    out.schemaVersion = 1;
  }
  out.entries ??= [];
  // Heal absurd numbers saved before the limits existed (they froze the app on open).
  out.entries = out.entries.map((e) => ({ ...e, sets: (e.sets ?? []).map((s) => {
    const bad = (k) => s[k] != null && saneSetValue(k, Number(s[k])) == null;
    return bad('weight') || bad('reps') ? { ...s, weight: bad('weight') ? null : s.weight, reps: bad('reps') ? null : s.reps } : s;
  }) }));
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

export function newestDraft(a, b) {
  const x = migrateWorkout(a), y = migrateWorkout(b);
  if (!x) return y;
  if (!y) return x;
  return (y.updatedMs ?? 0) > (x.updatedMs ?? 0) ? y : x;
}
