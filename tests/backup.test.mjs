import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBackup, validateBackup, mergeData, checksum, exportDue, daysSince, summarize, BACKUP_VERSION } from '../src/core/backup.mjs';
import { buildNumbers } from '../scripts/build-numbers.mjs';

const DAY = 86400000;
const w = (id, ms = 1e12) => ({ id, startedMs: ms, stats: { workingSets: 3 } });
const data = (over = {}) => ({ profile: { name: 'A' }, bodyweight: [{ dateKeyTime: 'k1', kg: 80 }], workouts: [w('a'), w('b')], routines: [{ id: 'r1' }], folders: [], plans: [], custom: [], blobs: {}, game: { xp: 5, achievements: { unlocked: { x: '2026-01-01' } }, maxRankIndex: 7 }, settings: { lang: 'he' }, ...over });
const file = (d = data()) => JSON.stringify(buildBackup({ data: d, appVersion: '1.0.0', now: 5 }));

test('round trip passes validation and keeps the data', () => {
  const r = validateBackup(file());
  assert.ok(r.ok);
  assert.equal(r.backup.schemaVersion, BACKUP_VERSION);
  assert.deepEqual(r.backup.data.workouts.map((x) => x.id), ['a', 'b']);
});

test('rejects garbage, wrong format, newer versions, edited files and bad shapes', () => {
  assert.equal(validateBackup('{not json').error, 'json');
  assert.equal(validateBackup('{"a":1}').error, 'format');
  assert.equal(validateBackup('[]').error, 'format');
  const b = JSON.parse(file());
  assert.equal(validateBackup(JSON.stringify({ ...b, schemaVersion: 99 })).error, 'newer');
  const edited = JSON.parse(file()); edited.data.game.xp = 999999;
  assert.equal(validateBackup(JSON.stringify(edited)).error, 'checksum');
  const bad = buildBackup({ data: data({ workouts: [{ id: 5 }] }), appVersion: 'x', now: 1 });
  assert.equal(validateBackup(JSON.stringify(bad)).error, 'shape');
  const bad2 = buildBackup({ data: data({ plans: 'no' }), appVersion: 'x', now: 1 });
  assert.equal(validateBackup(JSON.stringify(bad2)).error, 'shape');
});

test('checksum changes with content', () => {
  assert.notEqual(checksum('a'), checksum('b'));
  assert.equal(checksum('abc'), checksum('abc'));
});

test('summary counts', () => {
  assert.deepEqual(summarize(data()), { workouts: 2, sets: 6, routines: 1, plans: 0, custom: 0, bodyweight: 1 });
});

test('merge adds missing items by id and keeps this phone\'s profile and game', () => {
  const cur = data({ workouts: [w('a'), w('c')], profile: { name: 'Mine' }, game: { xp: 50, achievements: { unlocked: { y: 'd' } }, maxRankIndex: 3 } });
  const m = mergeData(cur, data());
  assert.deepEqual(m.workouts.map((x) => x.id).sort(), ['a', 'b', 'c']);
  assert.equal(m.profile.name, 'Mine');
  assert.equal(m.game.xp, 50);
  assert.deepEqual(Object.keys(m.game.achievements.unlocked).sort(), ['x', 'y']);
  assert.equal(m.game.maxRankIndex, 7);
  assert.equal(m.routines.length, 1);
});

test('merge into an empty phone takes the backup profile and game', () => {
  const m = mergeData({ profile: null, workouts: [], game: null }, data());
  assert.equal(m.profile.name, 'A');
  assert.equal(m.game.xp, 5);
  assert.equal(m.workouts.length, 2);
});

test('merge twice changes nothing', () => {
  const once = mergeData(data({ workouts: [w('z')] }), data());
  const twice = mergeData(once, data());
  assert.deepEqual(twice.workouts, once.workouts);
});

test('export reminder: 28 days, snooze, nothing to save', () => {
  const now = 100 * DAY;
  const ws = [w('a', now - 40 * DAY)];
  assert.equal(exportDue({ lastExportAt: null, workouts: [], now }), false);
  assert.equal(exportDue({ lastExportAt: null, workouts: ws, now }), true);
  assert.equal(exportDue({ lastExportAt: null, workouts: [w('a', now - 10 * DAY)], now }), false);
  assert.equal(exportDue({ lastExportAt: now - 27 * DAY, workouts: ws, now }), false);
  assert.equal(exportDue({ lastExportAt: now - 28 * DAY, workouts: ws, now }), true);
  assert.equal(exportDue({ lastExportAt: now - 30 * DAY, workouts: ws, snoozedUntil: now + DAY, now }), false);
  assert.equal(daysSince(now - 3 * DAY - 5, now), 3);
  assert.equal(daysSince(null, now), null);
});

test('numbers.json is in sync with the ASSUMPTIONS docs and both languages have the same sections', () => {
  const built = buildNumbers();
  const file = JSON.parse(readFileSync(new URL('../src/data/numbers.json', import.meta.url), 'utf8'));
  assert.deepEqual(file, built, 'run: node scripts/build-numbers.mjs');
  assert.equal(built.en.length, built.he.length);
  built.en.forEach((s, i) => assert.equal(s.blocks.length > 0, built.he[i].blocks.length > 0));
});

test('renames and requests travel in the backup and merge without losing yours', () => {
  const d = data({ renames: { x: { he: 'א' } }, requests: [{ id: 'q1', name: 'n', links: [] }] });
  const r = validateBackup(file(d));
  assert.ok(r.ok);
  assert.deepEqual(r.backup.data.renames, { x: { he: 'א' } });
  const m = mergeData(data({ renames: { x: { he: 'mine' }, y: { en: 'Y' } }, requests: [{ id: 'q2', name: 'm', links: [] }] }), d);
  assert.equal(m.renames.x.he, 'mine');
  assert.equal(m.renames.y.en, 'Y');
  assert.deepEqual(m.requests.map((x) => x.id).sort(), ['q1', 'q2']);
  assert.equal(validateBackup(file(data({ requests: [{ name: 'no id' }] }))).error, 'shape');
  assert.equal(validateBackup(file(data({ renames: [] }))).error, 'shape');
  // an old backup without these fields still loads
  assert.deepEqual(validateBackup(file()).backup.data.requests, []);
});

test('role model travels in the backup; on merge the one on this phone wins', async () => {
  const { mergeData } = await import('../src/core/backup.mjs');
  const mine = { name: 'Mine', links: {} }, theirs = { name: 'Theirs', links: {} };
  assert.equal(mergeData({ model: mine }, { model: theirs }).model.name, 'Mine');
  assert.equal(mergeData({ model: null }, { model: theirs }).model.name, 'Theirs');
  const b = buildBackup({ data: { model: theirs }, appVersion: 't', now: 1 });
  assert.equal(validateBackup(JSON.stringify(b)).ok, true);
  const bad = buildBackup({ data: { model: [1] }, appVersion: 't', now: 1 });
  assert.equal(validateBackup(JSON.stringify(bad)).error, 'shape');
});
