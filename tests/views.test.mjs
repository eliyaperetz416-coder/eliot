import test from 'node:test';
import assert from 'node:assert/strict';
import { exerciseRankTable, muscleBestExercises, nextTargets } from '../src/core/views.mjs';
import { bestsFrom, ratingsOf } from '../src/core/post.mjs';
import { aggregate, muscleRating, muscleRatings, overallRating, ratingForSet, tierFor, RANK_GROUPS } from '../src/core/ranks.mjs';
import { byId, session, DAY } from './helpers.mjs';

const T0 = 1_750_000_000_000;
// a realistic month: chest x2, back x2, quads, shoulders, calves
let ws = session([['bench', 100, 5], ['bench', 60, 8], ['squat', 140, 5], ['dead', 180, 5]], [], T0);
ws = session([['bench', 110, 5], ['ohp', 50, 5], ['row', 80, 8], ['calf', 90, 12]], ws, T0 + 3 * DAY);
const bests = bestsFrom(ws), ratings = ratingsOf(bests);

test('aggregation across real fixtures: muscle and overall ratings follow round(sum r^2 / sum r)', () => {
  const chest = [ratings['barbell-bench-press-medium-grip']];
  assert.equal(muscleRating('chest', ratings, byId), aggregate(chest));
  const back = [ratings['barbell-deadlift'], ratings['bent-over-barbell-row']];
  assert.equal(muscleRating('back', ratings, byId), aggregate(back));
  const groups = muscleRatings(ratings, byId);
  assert.ok(groups.chest > 0 && groups.back > 0 && groups.quads > 0 && groups.shoulders > 0 && groups.calves > 0);
  assert.equal(groups.biceps, 0);
  const o = overallRating(ratings, byId);
  assert.equal(o.pending, false);
  assert.equal(o.rating, aggregate(Object.values(groups).filter((r) => r > 0)));
  assert.equal(bests['barbell-bench-press-medium-grip'].rating, ratingForSet(byId['barbell-bench-press-medium-grip'], { weight: 110, reps: 5 }, 80, 'm'));
});

test('exercise table sorts by rating, name, 1RM and recency', () => {
  const by = (s) => exerciseRankTable(bests, byId, s).map((r) => r.id);
  const r = by('rating');
  for (let i = 1; i < r.length; i++) assert.ok(bests[r[i - 1]].rating >= bests[r[i]].rating);
  const n = exerciseRankTable(bests, byId, 'name').map((x) => x.ex.nameEn);
  assert.deepEqual(n, [...n].sort((a, b) => a.localeCompare(b)));
  const o = exerciseRankTable(bests, byId, 'oneRM');
  for (let i = 1; i < o.length; i++) assert.ok(o[i - 1].oneRM >= o[i].oneRM);
  assert.equal(by('recent').length, Object.keys(bests).length);
  assert.equal(exerciseRankTable({ nope: { rating: 1 } }, byId).length, 0, 'unknown ids are skipped');
});

test('best exercises of a muscle group', () => {
  const top = muscleBestExercises('back', bests, byId, 3);
  assert.deepEqual(top.map((x) => x.id), ['barbell-deadlift', 'bent-over-barbell-row'].sort((a, b) => bests[b].rating - bests[a].rating));
  assert.deepEqual(muscleBestExercises('biceps', bests, byId), []);
});

test('nextTargets: the loads really reach the next division and tier', () => {
  const ex = byId['barbell-bench-press-medium-grip'];
  const rating = 563; // Platinum II
  const nt = nextTargets(ex, rating, 80, 'm', 5);
  assert.equal(nt.current.tier, 'platinum');
  assert.equal(nt.division.rating, 580); assert.equal(`${nt.division.tier} ${nt.division.division}`, 'platinum I');
  assert.equal(nt.tier.rating, 600); assert.equal(nt.tier.tier, 'diamond'); assert.equal(nt.tier.division, 'V');
  for (const x of [nt.division, nt.tier]) {
    assert.ok(ratingForSet(ex, { weight: x.load, reps: 5 }, 80, 'm') >= x.rating, `${x.load} kg x5 reaches ${x.rating}`);
    assert.ok(ratingForSet(ex, { weight: x.load - 1, reps: 5 }, 80, 'm') < x.rating + 3, 'and is close to the minimum');
  }
  assert.ok(nt.tier.load > nt.division.load);
  const more = nextTargets(ex, rating, 80, 'm', 10);
  assert.ok(more.tier.load < nt.tier.load, 'more reps need less weight');
});

test('nextTargets edge cases: division I, Greek God, no rating, bodyweight moves, female curve', () => {
  const ex = byId['barbell-bench-press-medium-grip'];
  const atI = nextTargets(ex, 590, 80, 'm', 5);
  assert.equal(atI.division, null, 'division I: next step is the next tier only');
  assert.equal(atI.tier.rating, 600);
  const gg = nextTargets(ex, 1022, 80, 'm', 5);
  assert.deepEqual([gg.division, gg.tier], [null, null]);
  const none = nextTargets(ex, 0, 80, 'm', 5);
  assert.equal(none.tier.tier, 'wood'); assert.equal(none.tier.rating, 1);
  const pull = byId['pullups'];
  const p = nextTargets(pull, 300, 80, 'm', 5);
  assert.equal(p.division.bodyweightEnough, true, 'bodyweight alone already beats a low target');
  assert.equal(p.division.load, 0);
  const hard = nextTargets(pull, 800, 80, 'm', 5);
  assert.ok(hard.tier.load > 0 && !hard.tier.bodyweightEnough);
  const f = nextTargets(ex, 500, 60, 'f', 5), m = nextTargets(ex, 500, 60, 'm', 5);
  assert.ok(f.tier.load < m.tier.load, 'the women curve needs less weight for the same rating');
  assert.equal(tierFor(f.tier.rating).tier, f.tier.tier);
});
