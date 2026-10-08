import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanBase, totalFromTyped, typedFromTotal, weightMode, supportsBase, platesPerSide, plateBase } from '../src/core/load.mjs';

test('typed plates + base = total, and back', () => {
  assert.equal(totalFromTyped(10, 20), 30);
  assert.equal(typedFromTotal(30, 20), 10);
  assert.equal(totalFromTyped(2.5, 20), 22.5);
  assert.equal(typedFromTotal(22.5, 20), 2.5);
  assert.equal(totalFromTyped(0, 20), 20);
  assert.equal(totalFromTyped(null, 20), null);
  assert.equal(typedFromTotal(null, 20), null);
  assert.equal(typedFromTotal(15, 20), 0, 'never negative');
  assert.equal(totalFromTyped(7, 0), 7, 'no base = what you type');
});

test('base weight is cleaned', () => {
  assert.equal(cleanBase('20'), 20); assert.equal(cleanBase('17,5'), 17.5);
  assert.equal(cleanBase(''), 0); assert.equal(cleanBase('abc'), 0); assert.equal(cleanBase(-5), 0); assert.equal(cleanBase(9999), 500);
});

test('weight mode by exercise kind', () => {
  assert.equal(weightMode({ type: 'weight', equipment: 'barbell' }), 'bar');
  assert.equal(weightMode({ type: 'weight', equipment: 'ez-bar' }), 'bar');
  assert.equal(weightMode({ type: 'weight', equipment: 'dumbbell' }), 'perhand');
  assert.equal(weightMode({ type: 'weight', equipment: 'machine', perHand: true }), 'perhand');
  assert.equal(weightMode({ type: 'weight', equipment: 'machine' }), 'machine');
  assert.equal(weightMode({ type: 'weight', equipment: 'cable' }), 'machine');
  assert.equal(weightMode({ type: 'bodyweight', equipment: 'bodyweight' }), 'added');
  assert.equal(weightMode({ type: 'time' }), null);
  assert.equal(weightMode({ type: 'cardio' }), null);
  assert.equal(supportsBase({ type: 'weight', equipment: 'barbell' }), true);
  assert.equal(supportsBase({ type: 'weight', equipment: 'dumbbell' }), false);
  assert.equal(supportsBase({ type: 'bodyweight' }), false);
});

test('plates per side: leg press 145 on a 75 kg sled = 35 a side = 20 + 15', () => {
  assert.deepEqual(platesPerSide(145, 75), { perSide: 35, plates: [20, 15], left: 0 });
  assert.deepEqual(platesPerSide(100, 20), { perSide: 40, plates: [20, 20], left: 0 }, 'fewest plates, the more even set');
  assert.deepEqual(platesPerSide(120, 20), { perSide: 50, plates: [25, 25], left: 0 });
  assert.deepEqual(platesPerSide(62.5, 20), { perSide: 21.25, plates: [20, 1.25], left: 0 });
  assert.deepEqual(platesPerSide(20, 20), { perSide: 0, plates: [], left: 0 }, 'just the bar');
  assert.deepEqual(platesPerSide(21, 20), { perSide: 0.5, plates: [], left: 0.5 }, 'cannot make it exactly');
  assert.equal(platesPerSide(15, 20), null, 'below the bar');
  assert.equal(platesPerSide(50, null), null, 'no base: no plates (stack machine)');
});

test('plate base: your saved base, else a standard bar, else none', () => {
  assert.equal(plateBase({ type: 'weight', equipment: 'barbell' }), 20);
  assert.equal(plateBase({ type: 'weight', equipment: 'ez-bar' }), 10);
  assert.equal(plateBase({ type: 'weight', equipment: 'barbell' }, 15), 15);
  assert.equal(plateBase({ type: 'weight', equipment: 'machine' }), null);
  assert.equal(plateBase({ type: 'weight', equipment: 'machine' }, 75), 75);
  assert.equal(plateBase({ type: 'weight', equipment: 'dumbbell' }, 10), null);
});
