import { test } from "node:test";
import assert from "node:assert/strict";

test('absurd typed numbers are rejected and healed (froze the app once)', async () => {
  const W = await import('../src/core/workout.mjs');
  const { migrateWorkout } = await import('../src/core/draft.mjs');
  const { platesPerSide } = await import('../src/core/load.mjs');
  assert.equal(W.saneSetValue('weight', 99999999999), null);
  assert.equal(W.saneSetValue('weight', 100), 100);
  assert.equal(W.saneSetValue('reps', 30000), null);
  const healed = migrateWorkout({ schemaVersion: 99, entries: [{ sets: [{ idx: 0, weight: 9e15, reps: 8 }, { idx: 1, weight: 60, reps: 1e9 }] }] });
  assert.deepEqual(healed.entries[0].sets.map((s) => [s.weight, s.reps]), [[null, 8], [60, null]]);
  const t0 = Date.now();
  assert.equal(platesPerSide(1e12, 20), null);
  assert.ok(Date.now() - t0 < 200);
});
