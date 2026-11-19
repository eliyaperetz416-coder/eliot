import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repsIn, roundCount, schemeText, repsPerRound, loadFor, cleanScore, scoreValue, bestsByWod, isPr, buildWodWorkout, clock, clockState, FORMATS, SCORE_TYPES } from '../src/core/wods.mjs';

const read = (f) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url)));
const wods = read('wods.json').wods;
const ids = new Set([...read('exercises.json').exercises, ...read('extra-exercises.json').exercises].map((e) => e.id));
const byId = Object.fromEntries(wods.map((w) => [w.id, w]));

test('every workout is complete and uses real exercises', () => {
  assert.ok(wods.length >= 25);
  const seen = new Set();
  for (const w of wods) {
    assert.ok(!seen.has(w.id), `duplicate ${w.id}`); seen.add(w.id);
    assert.ok(w.name && ['girl', 'hero'].includes(w.kind), w.id);
    assert.ok(FORMATS.includes(w.format) && SCORE_TYPES.includes(w.score), w.id);
    if (w.format === 'amrap' || w.format === 'emom') assert.ok(w.minutes > 0, `${w.id} minutes`);
    assert.ok(w.movements.length >= 1);
    for (const m of w.movements) {
      assert.ok(ids.has(m.ex), `${w.id}: unknown exercise ${m.ex}`);
      assert.ok(m.reps != null || m.dist || m.max, `${w.id}: ${m.ex} needs reps, a distance or max`);
      if (m.load) assert.ok(m.load.m > m.load.f && m.load.f > 0, `${w.id}: loads`);
    }
    const schemes = w.movements.filter((m) => Array.isArray(m.reps)).map((m) => m.reps.length);
    assert.ok(new Set(schemes).size <= 1, `${w.id}: one scheme length`);
  }
  for (const id of ['cindy', 'fran', 'grace', 'helen', 'murph', 'dt']) assert.ok(byId[id], id);
});

test('rounds, schemes and loads', () => {
  assert.equal(schemeText(byId.fran), '21-15-9');
  assert.equal(roundCount(byId.fran), 3);
  assert.equal(roundCount(byId.helen), 3);
  assert.equal(repsIn(byId.fran.movements[0], 1), 15);
  assert.equal(repsPerRound(byId.cindy), 30);
  assert.deepEqual(loadFor(byId.fran.movements[0], { sex: 'm' }), { kg: 43, bw: null });
  assert.deepEqual(loadFor(byId.fran.movements[0], { sex: 'f' }), { kg: 29, bw: null });
  assert.equal(loadFor(byId.fran.movements[0], { sex: 'm', division: 'scaled' }).kg, 27.5);
  assert.equal(loadFor(byId.linda.movements[0], { bodyweightKg: 80 }).kg, 120);
  assert.equal(loadFor(byId.cindy.movements[0]), null);
});

test('scores: validation, comparison and personal bests', () => {
  assert.deepEqual(cleanScore('time', { seconds: 245 }), { type: 'time', seconds: 245 });
  assert.equal(cleanScore('time', { seconds: 0 }), null);
  assert.equal(cleanScore('time', { seconds: 999999 }), null);
  assert.deepEqual(cleanScore('rounds', { rounds: 18, reps: 7 }), { type: 'rounds', rounds: 18, reps: 7 });
  assert.equal(cleanScore('rounds', { rounds: 0, reps: 0 }), null);
  assert.equal(cleanScore('reps', { reps: 'abc' }), null);
  assert.ok(scoreValue({ type: 'time', seconds: 200 }) > scoreValue({ type: 'time', seconds: 250 }), 'faster is better');
  assert.ok(scoreValue({ type: 'time', seconds: 1500 }) > scoreValue({ type: 'time', capped: true, reps: 160 }), 'finished beats capped');
  assert.ok(scoreValue({ type: 'rounds', rounds: 15, reps: 0 }) > scoreValue({ type: 'rounds', rounds: 14, reps: 29 }));
  const a = buildWodWorkout({ id: 'a', wod: byId.fran, division: 'rx', score: { type: 'time', seconds: 400 }, startedMs: 0, endedMs: 400000 });
  assert.equal(a.wod.pr, true, 'the first result is a PR');
  assert.equal(a.entries.length, 0);
  const b = buildWodWorkout({ id: 'b', wod: byId.fran, division: 'rx', score: { type: 'time', seconds: 450 }, startedMs: 0, endedMs: 1e6, workouts: [a] });
  assert.equal(b.wod.pr, false);
  const c = buildWodWorkout({ id: 'c', wod: byId.fran, division: 'scaled', score: { type: 'time', seconds: 500 }, startedMs: 0, endedMs: 2e6, workouts: [a, b] });
  assert.equal(c.wod.pr, true, 'scaled has its own best');
  const best = bestsByWod([a, b, c]);
  assert.equal(best.fran.rx.id, 'a'); assert.equal(best.fran.scaled.id, 'c');
  assert.equal(isPr([a, b, c], 'fran', 'rx', { type: 'time', seconds: 399 }), true);
});

test('clock', () => {
  assert.equal(clock(65), '1:05'); assert.equal(clock(3725), '1:02:05');
  const s = clockState(byId.cindy, 61000);
  assert.equal(Math.round(s.remaining), 1139); assert.equal(s.done, false);
  assert.equal(clockState(byId.cindy, 1200000).done, true);
  const e = clockState(byId.chelsea, 125000);
  assert.equal(e.minute, 3); assert.equal(Math.round(e.secInMinute), 55);
  assert.equal(clockState(byId.fran, 5000).remaining, null);
  assert.equal(clockState(byId.fran, 5000, 10).remaining, 595);
});

test('WODs add rank points: 5 each and 5 more for a personal best, last 28 days, at most 40', async () => {
  const { wodBonus, PARTS } = await import('../src/core/bonus.mjs');
  const now = 100 * 86400000;
  const r = (days, pr) => ({ id: `${days}-${pr}`, endedMs: now - days * 86400000, entries: [], wod: { id: 'fran', division: 'rx', pr } });
  assert.deepEqual(wodBonus([r(1, true), r(2, false), r(40, true)], now), { points: 15, done: 2, prs: 1 });
  assert.equal(wodBonus(Array.from({ length: 10 }, (_, i) => r(i, true)), now).points, PARTS.WOD_MAX);
  assert.equal(wodBonus([{ id: 'x', endedMs: now, entries: [] }], now).points, 0, 'normal workouts do not count');
});
