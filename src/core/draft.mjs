// Draft persistence helpers: pick the newest of two copies (IndexedDB vs localStorage mirror) and migrate old shapes.
import { SCHEMA_VERSION } from './workout.mjs';

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
  out.schemaVersion = SCHEMA_VERSION;
  return out;
}

export function newestDraft(a, b) {
  const x = migrateWorkout(a), y = migrateWorkout(b);
  if (!x) return y;
  if (!y) return x;
  return (y.updatedMs ?? 0) > (x.updatedMs ?? 0) ? y : x;
}
