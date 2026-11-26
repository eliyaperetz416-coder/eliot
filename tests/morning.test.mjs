import test from 'node:test';
import assert from 'node:assert/strict';
import { morningMessages, minuteOf, MORNING_DEFAULT } from '../src/core/morning.mjs';

const t = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
const textOf = (list) => list.map((e) => e.name ?? e.kind).join(' + ');

test('morning: one message per weekday from the week plan (0 = Sunday)', () => {
  const days = { 1: [{ id: 'a', kind: 'workout', name: 'Legs' }], 3: [{ id: 'b', kind: 'rest' }], 5: [{ id: 'c', kind: 'rest' }, { id: 'd', kind: 'activity', name: 'Basketball' }] };
  const m = morningMessages(days, { textOf, t });
  assert.equal(m.length, 7);
  assert.equal(m[1].title, 'morning.train.title:{"what":"Legs"}');
  assert.equal(m[1].body, 'morning.train.body');
  assert.equal(m[3].title, 'morning.rest.title', 'a rest day says rest');
  assert.equal(m[5].title, 'morning.train.title:{"what":"Basketball"}', 'rest next to an activity: the activity counts');
  assert.equal(m[0].title, 'morning.none.title', 'nothing planned: a nudge to plan');
  assert.ok(m.every((x) => x.title.length <= 120 && x.body.length <= 160));
});

test('morning: text is cut to what a notification shows', () => {
  const days = { 2: [{ id: 'a', kind: 'workout', name: 'x'.repeat(300) }] };
  const m = morningMessages(days, { textOf, t: (k, v) => (v ? `Today: ${v.what}` : k) });
  assert.ok(m[2].title.length <= 120);
});

test('morning time: "HH:MM" to minutes, anything odd falls back to 08:00', () => {
  assert.equal(MORNING_DEFAULT, '08:00');
  assert.equal(minuteOf('07:30'), 450);
  assert.equal(minuteOf('8:05'), 485);
  assert.equal(minuteOf('25:00'), 480);
  assert.equal(minuteOf(''), 480);
  assert.equal(minuteOf(undefined), 480);
});
