import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile, makeProfile, bodyweightEntry, latestBodyweight } from '../src/core/profile.mjs';

test('name, curve and bodyweight are required; age is optional', () => {
  assert.equal(validateProfile({ name: '', sex: 'm', weight: '80' }).errors.name, 'name');
  assert.equal(validateProfile({ name: 'E', sex: '', weight: '80' }).errors.sex, 'sex');
  assert.equal(validateProfile({ name: 'E', sex: 'm', weight: '' }).errors.weight, 'weight');
  const ok = validateProfile({ name: ' Elia ', sex: 'm', weight: '82,5', age: '' });
  assert.equal(ok.ok, true); assert.deepEqual(ok.value, { name: 'Elia', sex: 'm', weight: 82.5, age: null });
});

test('weight and age ranges; decimal comma accepted', () => {
  for (const w of ['24', '351', 'abc', '-5']) assert.equal(validateProfile({ name: 'E', sex: 'f', weight: w }).errors.weight, 'weight', w);
  for (const w of ['25', '350', '61.3']) assert.equal(validateProfile({ name: 'E', sex: 'f', weight: w }).ok, true, w);
  for (const a of ['9', '101', '30.5', 'x']) assert.equal(validateProfile({ name: 'E', sex: 'f', weight: '60', age: a }).errors.age, 'age', a);
  assert.equal(validateProfile({ name: 'E', sex: 'f', weight: '60', age: '34' }).value.age, 34);
});

test('profile record and bodyweight log', () => {
  const p = makeProfile({ name: 'E', sex: 'f', age: 30, lang: 'he' }, 0);
  assert.deepEqual([p.id, p.sex, p.age, p.lang, p.schemaVersion], ['me', 'f', 30, 'he', 1]);
  const a = bodyweightEntry(80, 1_700_000_000_000), b = bodyweightEntry(81.5, 1_700_000_100_000);
  assert.equal(latestBodyweight([b, a]), 81.5); assert.equal(latestBodyweight([]), null);
  assert.ok(a.dateKeyTime < b.dateKeyTime, 'sortable key');
});
