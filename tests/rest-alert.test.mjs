import test from 'node:test';
import assert from 'node:assert/strict';
import { restAlertPlan, REST_VIBRATE } from '../src/core/timer.mjs';
import { DEFAULT_SETTINGS } from '../src/core/settings.mjs';

test('rest alert follows the three switches; the flash is always on', () => {
  assert.deepEqual(restAlertPlan({ restSound: false, restVibrate: true, restPush: true }), { flash: true, sound: false, vibrate: [200, 100, 200, 100, 400], push: true });
  assert.deepEqual(restAlertPlan({ restSound: true, restVibrate: false, restPush: false }), { flash: true, sound: true, vibrate: null, push: false });
  assert.deepEqual(REST_VIBRATE, [200, 100, 200, 100, 400]);
});

test('defaults switch everything on', () => {
  assert.equal(DEFAULT_SETTINGS.restSound, true);
  assert.equal(DEFAULT_SETTINGS.restVibrate, true);
  assert.equal(DEFAULT_SETTINGS.restPush, true);
  assert.deepEqual(restAlertPlan(DEFAULT_SETTINGS), { flash: true, sound: true, vibrate: REST_VIBRATE, push: true });
});
