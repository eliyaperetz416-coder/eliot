import test from 'node:test';
import assert from 'node:assert/strict';
import {
  epley, effectiveLoad, ratingForSet, tierFor, aggregate, loadForRating, oneRMForRating, isUnreliable,
  muscleRating, overallRating, nextDivisionFloor, nextTierFloor, DIVISIONS,
} from '../src/core/ranks.mjs';

const EX = {
  bench: { R: 225, muscleGroup: 'chest' },
  squat: { R: 290, muscleGroup: 'quads' },
  dead: { R: 330, muscleGroup: 'back' },
  ohp: { R: 140, muscleGroup: 'shoulders' },
  pullup: { R: 260, bwFactor: 1, muscleGroup: 'back' },
  dips: { R: 200, bwFactor: 0.95, muscleGroup: 'chest' },
  assisted: { R: 260, bwFactor: 1, muscleGroup: 'back' },
};
const rate = (ex, weight, reps, bw = 80, sex = 'm') => ratingForSet(EX[ex], { weight, reps }, bw, sex);
const label = (r) => { const t = tierFor(r); return t.tier === 'greekgod' ? `greekgod ${r}` : `${t.tier} ${t.division} ${t.lp}`; };

test('5.4 vectors: rating and tier/division/LP', () => {
  const V = [
    ['bench', 100, 5, 80, 'm', 563, 'platinum II 15'],
    ['bench', 60, 8, 80, 'm', 415, 'gold V 75'],
    ['bench', 140, 3, 80, 'm', 686, 'diamond I 30'],
    ['bench', 200, 1, 80, 'm', 847, 'titan III 35'],
    ['bench', 260, 1, 80, 'm', 1022, 'greekgod 1022'],
    ['squat', 140, 5, 80, 'm', 597, 'platinum I 85'],
    ['dead', 180, 5, 80, 'm', 652, 'diamond III 60'],
    ['ohp', 50, 5, 80, 'm', 482, 'gold I 10'],
    ['pullup', 0, 10, 80, 'm', 476, 'gold II 80'],
    ['pullup', 20, 5, 80, 'm', 508, 'platinum V 40'],
    ['dips', 0, 12, 80, 'm', 573, 'platinum II 65'],
    ['bench', 40, 8, 60, 'f', 520, 'platinum IV 0'],
    ['squat', 80, 5, 60, 'f', 671, 'diamond II 55'],
    ['bench', 100, 5, 100, 'm', 492, 'gold I 60'],
  ];
  for (const [ex, w, r, bw, sex, rating, lab] of V) {
    const got = rate(ex, w, r, bw, sex);
    assert.equal(got, rating, `${ex} ${w}x${r} bw${bw}${sex}: rating ${got} != ${rating}`);
    assert.equal(label(got), lab, `${ex} ${w}x${r}: label`);
  }
});

test('tier mapping vectors', () => {
  const V = {
    1: 'wood V 0', 40: 'wood V 97', 41: 'wood IV', 199: 'wood I', 200: 'bronze V', 219: 'bronze V', 220: 'bronze IV',
    299: 'bronze I', 300: 'silver V', 919: 'olympian V', 920: 'olympian IV', 980: 'olympian I', 999: 'olympian I',
    1000: 'greekgod', 1234: 'greekgod',
  };
  for (const [r, want] of Object.entries(V)) {
    const t = tierFor(+r);
    const got = `${t.tier}${t.division ? ' ' + t.division : ''}${want.split(' ').length === 3 ? ' ' + t.lp : ''}`;
    assert.equal(got, want, `rating ${r}`);
  }
});

test('aggregate vector', () => assert.equal(aggregate([563, 597, 476, 300]), 511));

test('bench 1RM an 80 kg male needs for each floor', () => {
  const floors = { 200: 27.4, 300: 48.3, 400: 72.3, 500: 98.8, 600: 127.5, 700: 158.3, 800: 190.8, 900: 225.0, 1000: 260.8 };
  for (const [f, kg] of Object.entries(floors)) {
    assert.ok(Math.abs(oneRMForRating(EX.bench, +f, 80, 'm') - kg) < 0.06, `floor ${f}`);
  }
});

test('Greek God is uncapped and has no division or LP', () => {
  const t = tierFor(5000);
  assert.equal(t.tier, 'greekgod'); assert.equal(t.division, null); assert.equal(t.lp, null);
  assert.ok(rate('bench', 1000, 1) > 2500);
});

test('division boundaries are monotonic and cover all 5 divisions per tier', () => {
  let prev = -1;
  for (let r = 1; r <= 999; r++) {
    const t = tierFor(r);
    const idx = DIVISIONS.indexOf(t.division);
    const key = [t.floor, idx, t.lp];
    assert.ok(t.lp >= 0 && t.lp <= 100, `lp ${r}`);
    assert.ok(idx >= 0, `div ${r}`);
    const order = t.floor * 1000 + idx * 100 + t.lp;
    assert.ok(order >= prev, `monotonic at ${r} ${key}`);
    prev = order;
  }
});

test('unranked / invalid input', () => {
  assert.equal(tierFor(0).unranked, true);
  assert.equal(rate('bench', 0, 5), 0);
  assert.equal(rate('bench', 100, 0), 0);
  assert.equal(ratingForSet({ R: 100, ranked: false }, { weight: 50, reps: 5 }, 80, 'm'), 0);
  assert.equal(ratingForSet(EX.bench, { weight: 50, reps: 5 }, 0, 'm'), 0);
  assert.ok(rate('bench', 1, 1) >= 1, 'tiny positive load is at least 1');
});

test('reps above 30 are capped and flagged unreliable', () => {
  assert.equal(epley(50, 45), epley(50, 30));
  assert.equal(rate('bench', 50, 45), rate('bench', 50, 30));
  assert.ok(isUnreliable(31) && !isUnreliable(30));
});

test('assisted (negative) weight lowers effective load, floored at 0', () => {
  assert.equal(effectiveLoad(EX.assisted, -30, 80), 50);
  assert.equal(effectiveLoad(EX.assisted, -100, 80), 0);
  assert.ok(rate('assisted', -30, 8) < rate('assisted', 0, 8));
  assert.equal(rate('assisted', -100, 8), 0);
});

test('bodyweight extremes 35-250 kg give sane finite ratings', () => {
  for (const bw of [35, 50, 80, 120, 250]) {
    const r = rate('bench', 60, 8, bw);
    assert.ok(Number.isFinite(r) && r >= 1, `bw ${bw}`);
  }
  assert.ok(rate('bench', 60, 8, 50) > rate('bench', 60, 8, 100), 'lighter lifter gets more credit for the same load');
  assert.ok(rate('pullup', 0, 10, 35) > 0 && rate('pullup', 0, 10, 250) > 0);
});

test('loadForRating inverts ratingForSet', () => {
  for (const [ex, rating, reps, bw, sex] of [['bench', 600, 5, 80, 'm'], ['squat', 450, 8, 70, 'f'], ['pullup', 700, 5, 85, 'm']]) {
    const w = loadForRating(EX[ex], rating, bw, sex, reps);
    const back = ratingForSet(EX[ex], { weight: w, reps }, bw, sex);
    assert.ok(Math.abs(back - rating) <= 1, `${ex}: ${back} vs ${rating}`);
  }
  // bodyweight alone already beats the target => non-positive added load
  assert.ok(loadForRating(EX.pullup, 300, 80, 'm', 5) < 0);
});

test('next division / tier floors', () => {
  assert.equal(nextDivisionFloor(563), 580);
  assert.equal(nextTierFloor(563), 600);
  assert.equal(nextDivisionFloor(190), 200);
  assert.equal(nextDivisionFloor(1022), null);
  assert.equal(nextDivisionFloor(0), 1);
});

test('muscleRating and overallRating', () => {
  const ex = { a: { muscleGroup: 'chest', ranked: true }, b: { muscleGroup: 'chest' }, c: { muscleGroup: 'back' }, d: { muscleGroup: 'quads' }, e: { muscleGroup: 'other', ranked: false }, f: { muscleGroup: 'abs' } };
  const bests = { a: 563, b: 476, c: 597, d: 300, e: 800 };
  assert.equal(muscleRating('chest', bests, ex), aggregate([563, 476]));
  assert.equal(muscleRating('back', bests, ex), 597);
  assert.equal(muscleRating('abs', bests, ex), 0);
  const o = overallRating(bests, ex);
  assert.equal(o.pending, false);
  assert.equal(o.rating, aggregate([aggregate([563, 476]), 597, 300]));
  const p = overallRating({ a: 500, c: 400 }, ex);
  assert.equal(p.pending, true); assert.equal(p.remaining, 1);
  assert.equal(overallRating({ e: 900, a: 400, c: 400 }, ex).pending, true, 'unranked exercises do not count');
});
