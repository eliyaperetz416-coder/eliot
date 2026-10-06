import test from 'node:test';
import assert from 'node:assert/strict';
import { freshnessByMuscle, freshColor, recoveryHoursFor } from '../src/core/recovery.mjs';
import { byId, session, DAY, HOUR } from './helpers.mjs';

const T0 = 1_750_000_000_000;
const IDS = ['chest', 'front-deltoids', 'triceps', 'upper-back', 'quadriceps', 'calves', 'forearm', 'biceps'];
const f = (ws, now, id) => freshnessByMuscle(ws, byId, now, IDS)[id];

test('recovery hours: large 72, medium 48, small 36', () => {
  assert.equal(recoveryHoursFor('chest'), 72); assert.equal(recoveryHoursFor('quadriceps'), 72); assert.equal(recoveryHoursFor('upper-back'), 72);
  assert.equal(recoveryHoursFor('front-deltoids'), 48); assert.equal(recoveryHoursFor('biceps'), 48); assert.equal(recoveryHoursFor('triceps'), 48);
  assert.equal(recoveryHoursFor('calves'), 36); assert.equal(recoveryHoursFor('forearm'), 36);
});

test('freshness = hours since last working set / recovery hours, clamped', () => {
  const ws = session([['bench', 100, 5]], [], T0); // sets done at T0+1..3 s
  const at = (h) => T0 + h * HOUR;
  assert.ok(Math.abs(f(ws, at(36), 'chest').freshness - 0.5) < 0.01);
  assert.ok(Math.abs(f(ws, at(72), 'chest').freshness - 1) < 0.01);
  assert.equal(f(ws, at(200), 'chest').freshness, 1);
  assert.ok(f(ws, at(0), 'chest').freshness < 0.01);
  assert.equal(f(ws, at(-5), 'chest').freshness, 0, 'clock earlier than the workout is clamped to 0, never negative');
  assert.ok(Math.abs(f(ws, at(36), 'chest').hoursLeft - 36) < 0.1);
});

test('secondary muscles recover in half the time (half weight); untouched muscles are fresh', () => {
  const ws = session([['bench', 100, 5]], [], T0);
  const now = T0 + 24 * HOUR;
  const tri = f(ws, now, 'triceps'); // helper in bench: base 48 h x 0.5 = 24 h -> fresh after 24 h
  assert.ok(tri.freshness > 0.99, `triceps ${tri.freshness}`);
  assert.ok(f(ws, now, 'chest').freshness < 0.4);
  assert.equal(f(ws, now, 'calves').freshness, 1); assert.equal(f(ws, now, 'calves').trainedAt, null);
});

test('10 or more effective sets in a session stretch recovery by 1.25x', () => {
  const light = session(Array.from({ length: 4 }, () => ['bench', 100, 5]), [], T0);
  const heavy = session(Array.from({ length: 10 }, () => ['bench', 100, 5]), [], T0);
  const now = T0 + 45 * HOUR;
  assert.ok(Math.abs(f(light, now, 'chest').freshness - 45 / 72) < 0.01);
  assert.ok(Math.abs(f(heavy, now, 'chest').freshness - 45 / 90) < 0.01);
});

test('warm-up sets do not fatigue; the most demanding recent session wins; old sessions fall out', () => {
  const warm = session([['bench', 40, 10, 'warmup']], [], T0);
  assert.equal(f(warm, T0 + HOUR, 'chest').freshness, 1);
  const a = session([['bench', 100, 5]], [], T0);
  const b = session([['bench', 100, 5]], a, T0 + 3 * DAY);
  const now = T0 + 3 * DAY + 24 * HOUR;
  assert.ok(Math.abs(f(b, now, 'chest').freshness - 24 / 72) < 0.01, 'second session governs, not the older one');
  assert.equal(f(a, T0 + 20 * DAY, 'chest').freshness, 1, 'older than 14 days is ignored');
});

test('colour ramp: red -> amber -> green', () => {
  assert.equal(freshColor(0), '#ff3b4e'); assert.equal(freshColor(0.5), '#ffb02e'); assert.equal(freshColor(1), '#3ad682');
  assert.equal(freshColor(-3), '#ff3b4e'); assert.equal(freshColor(9), '#3ad682');
  assert.match(freshColor(0.25), /^#[0-9a-f]{6}$/);
});
