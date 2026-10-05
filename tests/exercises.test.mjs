import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { RANK_GROUPS, ratingForSet } from '../src/core/ranks.mjs';
import { GROUP_OF_MUSCLE, exerciseHighlight } from '../src/core/muscles.mjs';

const r = (p) => new URL(`../${p}`, import.meta.url);
const json = (p) => JSON.parse(readFileSync(r(p), 'utf8'));
const { exercises } = json('src/data/exercises.json');
const cal = json('src/data/calibration.json');
const muscles = json('src/data/muscles.json');
const polygonIds = new Set([...muscles.anterior, ...muscles.posterior].map((m) => m.id));
const EQUIP = ['barbell', 'dumbbell', 'machine', 'cable', 'ez-bar', 'bodyweight', 'other'];
const TYPES = ['weight', 'bodyweight', 'time', 'cardio'];

test('library size and group balance', () => {
  assert.ok(exercises.length >= 290 && exercises.length <= 310, `size ${exercises.length}`);
  const target = { chest: 35, back: 45, shoulders: 38, biceps: 26, triceps: 26, quads: 32, hamstrings: 22, glutes: 24, calves: 12, abs: 26, other: 14 };
  const count = {};
  for (const e of exercises) count[e.muscleGroup] = (count[e.muscleGroup] ?? 0) + 1;
  for (const [g, n] of Object.entries(target)) {
    // free-exercise-db has few glute/hamstring-specific moves; accept 55%..145% of target
    assert.ok(count[g] >= n * 0.55 && count[g] <= n * 1.45, `${g}: ${count[g]} vs target ${n}`);
  }
});

test('every exercise matches the schema', () => {
  const ids = new Set();
  for (const e of exercises) {
    assert.match(e.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(e.id), `duplicate ${e.id}`); ids.add(e.id);
    assert.ok(e.nameEn && e.nameHe, `names ${e.id}`);
    assert.match(e.nameHe, /[א-ת]/, `Hebrew name has Hebrew letters: ${e.id}`);
    assert.ok(EQUIP.includes(e.equipment), `equipment ${e.id}`);
    assert.ok([...RANK_GROUPS, 'other'].includes(e.muscleGroup), `group ${e.id}`);
    assert.ok(TYPES.includes(e.type), `type ${e.id}`);
    assert.ok(e.primaryMuscles.length >= 1, `primary muscles ${e.id}`);
    for (const m of [...e.primaryMuscles, ...e.secondaryMuscles]) assert.ok(polygonIds.has(m), `${e.id}: polygon ${m}`);
    assert.ok(e.instructionsEn.length >= 1 && e.instructionsHe.length >= 2, `instructions ${e.id}`);
    for (const s of e.instructionsHe) assert.match(s, /[א-ת]/, `Hebrew step ${e.id}`);
    for (const k of ['image', 'image2']) {
      assert.ok(existsSync(r(e[k])), `${k} missing: ${e[k]}`);
      assert.ok(statSync(r(e[k])).size < 60_000, `${k} too big ${e.id}`);
    }
    if (e.ranked) {
      assert.ok(e.R > 0 && e.family && cal.families[e.family], `ranked needs R/family: ${e.id}`);
      assert.ok(RANK_GROUPS.includes(e.muscleGroup), `ranked exercise needs a ranking group: ${e.id}`);
      assert.equal(e.R, Math.round(cal.families[e.family].R * cal.ratios[e.id] * 10) / 10, `R matches calibration ${e.id}`);
      assert.equal(e.type === 'weight' || e.type === 'bodyweight', true);
    } else assert.equal(e.R, undefined);
  }
});

test('every polygon id used exists, and every polygon drawn has a name key', () => {
  const he = json('src/data/i18n/he.json'), en = json('src/data/i18n/en.json');
  for (const m of [...muscles.anterior, ...muscles.posterior]) {
    if (['head', 'knees', 'left-soleus', 'right-soleus'].includes(m.id)) continue;
    assert.ok(he[`muscle.${m.id}`] && en[`muscle.${m.id}`], `name for ${m.id}`);
    assert.ok(m.id in GROUP_OF_MUSCLE, `group mapping for ${m.id}`);
  }
  for (const g of [...RANK_GROUPS, 'other']) assert.ok(he[`group.${g}`] && en[`group.${g}`]);
  for (const q of EQUIP) assert.ok(he[`equipment.${q}`] && en[`equipment.${q}`]);
});

test('calibration: every family has names and positive R, every ratio belongs to an exercise', () => {
  for (const [id, f] of Object.entries(cal.families)) assert.ok(f.R > 0 && f.nameEn && f.nameHe, id);
  const ids = new Set(exercises.map((e) => e.id));
  for (const id of Object.keys(cal.ratios)) assert.ok(ids.has(id), `ratio for unknown exercise ${id}`);
});

test('muscle highlight: calves also paint the soleus polygons; no overlap between roles', () => {
  const calf = exercises.find((e) => e.id === 'standing-calf-raises');
  const h = exerciseHighlight(calf);
  assert.ok(h.primary.has('calves') && h.primary.has('left-soleus') && h.primary.has('right-soleus'));
  for (const e of exercises) { const x = exerciseHighlight(e); for (const m of x.primary) assert.ok(!x.secondary.has(m)); }
});

test('sanity: 15 main lifts land in sensible tiers for an 80 kg male', () => {
  const by = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const rate = (id, w, reps) => ratingForSet(by[id], { weight: w, reps }, 80, 'm');
  const lifts = {
    'barbell-bench-press-medium-grip': [[45, 8], [85, 6], [130, 4]], 'barbell-squat': [[60, 8], [110, 6], [170, 4]],
    'barbell-deadlift': [[80, 5], [140, 5], [210, 3]], 'standing-military-press': [[30, 8], [55, 6], [85, 3]],
    'bent-over-barbell-row': [[45, 8], [80, 8], [115, 5]], 'barbell-curl': [[25, 8], [40, 8], [60, 5]],
    'triceps-pushdown': [[25, 10], [45, 10], [70, 8]], 'wide-grip-lat-pulldown': [[45, 10], [70, 10], [95, 8]],
    'leg-press': [[120, 10], [220, 10], [350, 8]], 'romanian-deadlift': [[50, 8], [100, 8], [150, 6]],
    'barbell-hip-thrust': [[60, 10], [120, 8], [200, 6]], 'standing-calf-raises': [[50, 12], [90, 12], [140, 10]],
    'cable-crunch': [[30, 12], [50, 12], [75, 10]], 'dumbbell-bench-press': [[18, 8], [34, 8], [48, 6]], 'leg-extensions': [[35, 10], [60, 10], [90, 10]],
  };
  for (const [id, [b, i, a]] of Object.entries(lifts)) {
    const [rb, ri, ra] = [rate(id, ...b), rate(id, ...i), rate(id, ...a)];
    assert.ok(rb < 400, `${id} beginner ${rb} should be below Gold`);
    assert.ok(ri >= 400 && ri < 600, `${id} intermediate ${ri} should be Gold-Platinum`);
    assert.ok(ra >= 600 && ra < 800, `${id} advanced ${ra} should be Diamond-Champion`);
  }
});
