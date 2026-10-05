import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateSettings, SETTINGS_VERSION, DEFAULT_SETTINGS } from '../src/core/settings.mjs';

test('migrates unversioned and garbage input to current schema', () => {
  assert.equal(migrateSettings({ lang: 'he' }).schemaVersion, SETTINGS_VERSION);
  assert.equal(migrateSettings({ lang: 'he' }).lang, 'he');
  assert.deepEqual(migrateSettings(null), DEFAULT_SETTINGS);
  assert.deepEqual(migrateSettings('x'), DEFAULT_SETTINGS);
});
