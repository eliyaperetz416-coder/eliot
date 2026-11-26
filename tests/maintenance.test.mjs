import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOCKED, BACK_AT, backAtLabel, activateWaiting } from '../src/core/maintenance.mjs';

const dict = (l) => JSON.parse(readFileSync(`src/data/i18n/${l}.json`, 'utf8'));

test('the return time is a clock time (Elia 26.11: back tomorrow at 09:45)', () => {
  assert.equal(BACK_AT, '09:45');
  assert.match(BACK_AT, /^([01]\d|2[0-3]):[0-5]\d$/);
  assert.equal(backAtLabel('22:00'), '22:00');
  assert.equal(backAtLabel('7:5'), '', 'anything else shows no time at all rather than a wrong one');
  assert.equal(typeof LOCKED, 'boolean');
});

test('the lock screen hands over to the next release by itself (there is no button)', () => {
  const sent = [];
  assert.equal(activateWaiting({ waiting: { postMessage: (m) => sent.push(m) } }), true);
  assert.deepEqual(sent, [{ type: 'SKIP_WAITING' }]);
  assert.equal(activateWaiting({}), false);
  assert.equal(activateWaiting(null), false);
});

test('the copy, in both languages', () => {
  assert.equal(dict('he')['maint.title'], 'מתעדכנים.');
  assert.equal(dict('he')['maint.body'], 'משהו חדש בדרך. האימונים שלך שמורים.');
  assert.equal(dict('he')['maint.back'], 'חוזרים מחר בבוקר בערך ב־{time}'); // Elia 26.11: lock overnight, back at 09:45
  assert.equal(dict('en')['maint.title'], 'Updating.');
  assert.equal(dict('en')['maint.body'], 'Something new is on the way. Your workouts are safe.');
  assert.equal(dict('en')['maint.back'], 'Back tomorrow morning around {time}');
});
