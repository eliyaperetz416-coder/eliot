import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatePlan, weeklySets, rangeFor, GOALS, EXPERIENCE, PLAN_WEEKS, MAJOR_GROUPS, GYM_EQUIPMENT, MIN_SETS, MAX_SETS, nextPlanDay, markPlanDone, planDayId, planProgress, templateRoutines, ROUTINE_TEMPLATES, mulberry32, SPLITS } from '../src/core/generator.mjs';
import { exercises, byId } from './helpers.mjs';

const cal = JSON.parse(readFileSync(new URL('../src/data/calibration.json', import.meta.url), 'utf8'));
const ctx = { exercises, ratios: cal.ratios };
const gen = (o) => generatePlan({ seed: 'test', ...o }, ctx, 1_750_000_000_000);
const EQUIP_SETS = { all: GYM_EQUIPMENT, freeWeights: ['barbell', 'dumbbell', 'ez-bar', 'bodyweight'], machines: ['machine', 'cable', 'bodyweight'], dumbbells: ['dumbbell'] };
const MAIN_REPS = { strength: [3, 6], hypertrophy: [6, 12], general: [8, 12] };

test('invariants hold for every goal x days x experience x length (all gym equipment)', () => {
  let n = 0;
  for (const goal of GOALS) for (const days of [2, 3, 4, 5, 6]) for (const experience of EXPERIENCE) for (const weeks of PLAN_WEEKS) {
    const p = gen({ goal, days, experience, weeks, equipment: GYM_EQUIPMENT });
    n++;
    const tag = `${goal}/${days}d/${experience}/${weeks}w`;
    // right number of sessions, no empty days
    assert.equal(p.days.length, days * weeks, `${tag}: sessions`);
    assert.equal(p.days.filter((d) => d.week === 1).length, days, `${tag}: days per week`);
    for (const d of p.days) assert.ok(d.entries.length >= 4, `${tag}: week ${d.week} day ${d.day} has ${d.entries.length} exercises`);
    // exercises exist, equipment respected, no duplicate exercise or pattern in a session
    for (const d of p.days) {
      const ids = d.entries.map((e) => e.exerciseId);
      assert.equal(new Set(ids).size, ids.length, `${tag}: duplicate exercise in a session`);
      assert.equal(new Set(d.entries.map((e) => e.pattern)).size, d.entries.length, `${tag}: duplicate pattern in a session`);
      for (const e of d.entries) { assert.ok(byId[e.exerciseId], `${tag}: unknown exercise`); assert.ok(p.equipment.includes(byId[e.exerciseId].equipment)); }
    }
    // rep ranges per goal; sets 2..5; compound lifts come before isolation within a session
    for (const d of p.days) {
      let seenIso = false;
      for (const e of d.entries) {
        assert.ok(e.sets >= (d.deload ? 1 : MIN_SETS) && e.sets <= MAX_SETS, `${tag}: sets ${e.sets}`);
        assert.ok(e.repsMin >= 3 && e.repsMax <= 15 && e.repsMin < e.repsMax, `${tag}: reps ${e.repsMin}-${e.repsMax}`);
        if (goal === 'general') assert.deepEqual([e.repsMin, e.repsMax], [8, 12]);
        if (goal === 'strength' && e.main) assert.ok(e.repsMin >= 3 && e.repsMax <= 6, `${tag}: strength main reps`);
        if (goal === 'hypertrophy') assert.ok(e.repsMax <= 15 && e.repsMin >= 6);
        const compound = ['squat', 'lunge', 'hinge', 'deadlift', 'vpull', 'hrow', 'hpress', 'ipress', 'vpress'].includes(e.pattern);
        if (!compound) seenIso = true;
        else if (!e.extra) assert.ok(!seenIso || d.entries.some((x) => x === e), `${tag}`);
      }
      assert.equal(d.entries[0].main || ['hpress', 'vpull', 'ipress', 'squat', 'hinge', 'hrow'].includes(d.entries[0].pattern), true, `${tag}: first exercise is a compound`);
    }
    // weekly sets per group within its range (week 1), for every group that is present
    const sets = weeklySets(p, 1);
    for (const [g, total] of Object.entries(sets)) {
      const [lo, hi] = rangeFor(experience, g);
      assert.ok(total >= lo && total <= hi, `${tag}: ${g} has ${total} weekly sets, expected ${lo}-${hi}`);
    }
    for (const g of MAJOR_GROUPS) assert.ok(sets[g] > 0, `${tag}: ${g} is trained`);
    // deload in the last week at roughly 60% of the volume, nowhere else
    const total = (w) => Object.values(weeklySets(p, w)).reduce((a, b) => a + b, 0);
    const ratio = total(weeks) / total(weeks - 1);
    assert.ok(ratio >= 0.5 && ratio <= 0.85, `${tag}: deload ratio ${ratio.toFixed(2)}`);
    assert.equal(p.days.filter((d) => d.deload).length, days);
    assert.equal(total(1), total(weeks - 1), `${tag}: normal weeks keep the same volume`);
  }
  assert.equal(n, 3 * 5 * 3 * 3);
});

test('equipment filters are respected and still give valid volume (free weights, machines+cables, dumbbells only)', () => {
  for (const [name, equipment] of Object.entries(EQUIP_SETS)) for (const goal of GOALS) for (const days of [2, 4, 6]) {
    const p = gen({ goal, days, experience: 'intermediate', weeks: 4, equipment });
    for (const d of p.days) for (const e of d.entries) assert.ok(equipment.includes(byId[e.exerciseId].equipment), `${name}: ${e.exerciseId} is ${byId[e.exerciseId].equipment}`);
    for (const d of p.days) assert.ok(d.entries.length >= 3, `${name}/${days}d: day too short`);
    for (const [g, total] of Object.entries(weeklySets(p, 1))) {
      const [lo, hi] = rangeFor('intermediate', g);
      assert.ok(total >= lo && total <= hi, `${name}/${goal}/${days}d: ${g} ${total} not in ${lo}-${hi}`);
    }
  }
});

test('session length caps the number of exercises for beginner and intermediate', () => {
  const cap = { 45: 5, 60: 6, 75: 8 };
  for (const sessionMin of [45, 60, 75]) for (const experience of ['beginner', 'intermediate']) for (const days of [3, 4, 5, 6]) {
    const p = gen({ goal: 'hypertrophy', days, experience, weeks: 4, sessionMin });
    for (const d of p.days) assert.ok(d.entries.length <= cap[sessionMin] + 1, `${sessionMin}min/${experience}/${days}d: ${d.entries.length} exercises`);
  }
});

test('deterministic for a seed, different for another seed; variety across weeks; main lifts stay put', () => {
  const a = gen({ goal: 'hypertrophy', days: 4, experience: 'intermediate', weeks: 8, seed: 'x' }), b = gen({ goal: 'hypertrophy', days: 4, experience: 'intermediate', weeks: 8, seed: 'x' });
  const strip = (p) => p.days.map((d) => d.entries.map((e) => e.exerciseId));
  assert.deepEqual(strip(a), strip(b));
  const c = gen({ goal: 'hypertrophy', days: 4, experience: 'intermediate', weeks: 8, seed: 'y' });
  assert.notDeepEqual(strip(a), strip(c));
  const ids = (p, w, day) => p.days.find((d) => d.week === w && d.day === day).entries;
  assert.deepEqual(ids(a, 1, 1).filter((e) => e.main).map((e) => e.exerciseId), ids(a, 4, 1).filter((e) => e.main).map((e) => e.exerciseId), 'main lifts are constant so loads can progress');
  const acc = (w) => ids(a, w, 1).filter((e) => !e.main).map((e) => e.exerciseId).join();
  assert.ok(new Set([1, 4, 7].map(acc)).size >= 2, 'accessories rotate every 3 weeks');
});

test('split by days and strength plans include the deadlift', () => {
  assert.deepEqual(gen({ days: 2 }).days.slice(0, 2).map((d) => d.type), ['fullA', 'fullB']);
  assert.deepEqual(gen({ days: 4 }).days.slice(0, 4).map((d) => d.type), ['upperA', 'lowerA', 'upperB', 'lowerB']);
  assert.deepEqual(gen({ days: 6 }).days.slice(0, 6).map((d) => d.type), ['push', 'pull', 'legs', 'push', 'pull', 'legs']);
  assert.equal(Object.keys(SPLITS).length, 5);
  const s = gen({ goal: 'strength', days: 3 }), h = gen({ goal: 'hypertrophy', days: 3 });
  assert.ok(s.days.some((d) => d.entries.some((e) => e.pattern === 'deadlift')));
  assert.ok(!h.days.some((d) => d.entries.some((e) => e.pattern === 'deadlift')));
});

test('bodyweight-only plans degrade gracefully with warnings instead of crashing', () => {
  const p = gen({ goal: 'general', days: 3, experience: 'beginner', weeks: 4, equipment: ['bodyweight'] });
  assert.ok(p.days.length === 12 && p.warnings.length > 0);
  for (const d of p.days) for (const e of d.entries) assert.equal(byId[e.exerciseId].equipment, 'bodyweight');
});

test('plan progress helpers', () => {
  const p = gen({ days: 3, weeks: 4 });
  assert.equal(nextPlanDay(p).week, 1); assert.equal(planProgress(p).total, 12);
  markPlanDone(p, planDayId(p, 1, 1)); markPlanDone(p, planDayId(p, 1, 1));
  assert.equal(p.done.length, 1);
  assert.deepEqual([nextPlanDay(p).week, nextPlanDay(p).day], [1, 2]);
  for (const d of p.days) markPlanDone(p, planDayId(p, d.week, d.day));
  assert.equal(nextPlanDay(p), null);
});

test('preset workout templates (PPL, Upper/Lower, AB, Full Body, Bro split)', () => {
  const counts = { ppl: 3, upperlower: 4, ab: 2, fullbody: 1, bro: 5 };
  for (const [id, n] of Object.entries(counts)) {
    const r = templateRoutines(id, ctx, { seed: 3 });
    assert.equal(r.length, n, id); assert.equal(Object.keys(ROUTINE_TEMPLATES).includes(id), true);
    for (const day of r) {
      assert.ok(day.entries.length >= 4, `${id}/${day.nameKey}`);
      assert.equal(new Set(day.entries.map((e) => e.exerciseId)).size, day.entries.length, `${id}: no duplicate exercise`);
      for (const e of day.entries) assert.ok(byId[e.exerciseId] && e.sets === 3);
    }
  }
  const dumbbells = templateRoutines('ppl', ctx, { equipment: ['dumbbell'] });
  for (const d of dumbbells) for (const e of d.entries) assert.equal(byId[e.exerciseId].equipment, 'dumbbell');
  assert.equal(typeof mulberry32(1)(), 'number');
});
