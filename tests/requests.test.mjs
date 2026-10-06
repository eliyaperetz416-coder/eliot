import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRequest, parseLinks, requestsMessage } from '../src/core/requests.mjs';
import { filledOpenSets, completeFilled } from '../src/core/live.mjs';
import { newWorkout, addEntry } from '../src/core/workout.mjs';

test('links: only http(s) urls, any separator, max 10', () => {
  assert.deepEqual(parseLinks('https://youtu.be/a\njavascript:alert(1)\n  http://x.com/y  ftp://z'), ['https://youtu.be/a', 'http://x.com/y']);
  assert.equal(parseLinks(Array.from({ length: 15 }, (_, i) => `https://a.com/${i}`).join('\n')).length, 10);
  assert.deepEqual(parseLinks(null), []);
});

test('request needs a name, trims and limits fields', () => {
  assert.equal(buildRequest({ name: '  ' }, { id: 'a', now: 1 }).ok, false);
  const r = buildRequest({ name: ' Hack Squat ', linksText: 'https://v.com/1', notes: ' hi ' }, { id: 'a', now: 5 });
  assert.ok(r.ok);
  assert.deepEqual(r.value, { id: 'a', createdMs: 5, name: 'Hack Squat', links: ['https://v.com/1'], notes: 'hi' });
});

test('message lists every request in both languages', () => {
  const list = [{ id: '1', name: 'A', links: ['https://x.com/1', 'https://x.com/2'], notes: 'n' }, { id: '2', name: 'B', links: [], notes: '' }];
  const en = requestsMessage(list, 'en'), he = requestsMessage(list, 'he');
  assert.match(en, /1\. Name: A/); assert.match(en, /Videos: https:\/\/x\.com\/1 , https:\/\/x\.com\/2/); assert.match(en, /2\. Name: B/);
  assert.match(he, /1\. שם: A/); assert.match(he, /סרטונים/);
  assert.doesNotMatch(en.split('2. Name: B')[1], /Videos/);
});

const byId = { bp: { id: 'bp', type: 'weight', muscleGroup: 'chest', ranked: false }, pu: { id: 'pu', type: 'bodyweight', ranked: false }, pl: { id: 'pl', type: 'time', ranked: false } };
function draft() {
  const w = newWorkout({ now: 1000 });
  for (const ex of Object.values(byId)) addEntry(w, ex);
  return w;
}

test('filled-but-unticked sets are found by exercise type', () => {
  const w = draft();
  const [bp, pu, pl] = w.entries;
  bp.sets[0].reps = 8; bp.sets[0].weight = 60;       // ok
  bp.sets[1].reps = 8;                               // weight missing: not usable
  pu.sets[0].reps = 10;                              // bodyweight needs no weight
  pl.sets[0].reps = 30;                              // timed hold: seconds only
  bp.sets[2].reps = 5; bp.sets[2].weight = 50; bp.sets[2].done = true; // already done
  const found = filledOpenSets(w, byId);
  assert.deepEqual(found.map((f) => `${f.entryId === bp.id ? 'bp' : f.entryId === pu.id ? 'pu' : 'pl'}${f.idx}`).sort(), ['bp0', 'pl0', 'pu0']);
});

test('completeFilled ticks them so the workout can be posted', () => {
  const w = draft();
  w.entries[0].sets[0].reps = 8; w.entries[0].sets[0].weight = 60;
  const n = completeFilled({ workout: w, now: 2000, bodyweightKg: 80, sex: 'm', workouts: [], byId });
  assert.equal(n, 1);
  assert.equal(w.entries[0].sets[0].done, true);
  assert.equal(w.entries[0].sets[0].bwAtSet, 80);
  assert.equal(filledOpenSets(w, byId).length, 0);
});
