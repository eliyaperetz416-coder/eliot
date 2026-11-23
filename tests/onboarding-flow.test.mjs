import test from 'node:test';
import assert from 'node:assert/strict';
import { nextStep, platformOf } from '../src/core/onboarding-flow.mjs';

const base = { platform: 'android', installed: false, installSkipped: false, signedIn: false, localData: false, migrated: false, profile: {}, ageSkipped: false, goalSet: false, pushAsked: false, toured: false };
const S = (over) => ({ ...base, ...over });
const full = { name: 'A', sex: 'm', weight: 80, age: 30 };

test('iPhone in Safari: install first, then sign-in once skipped', () => {
  assert.equal(nextStep(S({ platform: 'ios-safari' })), 'install-first');
  assert.equal(nextStep(S({ platform: 'ios-safari', installSkipped: true })), 'signin');
});

test('Android, signed in, nothing on the phone: the questions start with the name', () => {
  assert.equal(nextStep(S({ signedIn: true })), 'name');
});

test('the questions come in order, age can be skipped', () => {
  assert.equal(nextStep(S({ signedIn: true, profile: { name: 'A' } })), 'curve');
  assert.equal(nextStep(S({ signedIn: true, profile: { name: 'A', sex: 'm' } })), 'weight');
  assert.equal(nextStep(S({ signedIn: true, profile: { name: 'A', sex: 'm', weight: 80 } })), 'age');
  assert.equal(nextStep(S({ signedIn: true, profile: { name: 'A', sex: 'm', weight: 80 }, ageSkipped: true })), 'goal');
  assert.equal(nextStep(S({ signedIn: true, profile: full, goalSet: true })), 'install');
  assert.equal(nextStep(S({ signedIn: true, profile: full, goalSet: true, installSkipped: true })), 'notify');
  assert.equal(nextStep(S({ signedIn: true, profile: full, goalSet: true, installed: true, pushAsked: true })), 'tour');
  assert.equal(nextStep(S({ signedIn: true, profile: full, goalSet: true, installed: true, pushAsked: true, toured: true })), 'done');
});

test('local data moves first; a full profile after moving goes straight in', () => {
  assert.equal(nextStep(S({ signedIn: true, localData: true })), 'migrate');
  assert.equal(nextStep(S({ signedIn: true, localData: true, migrated: true, profile: full })), 'done');
});

test('an installed iPhone app never sees an install step', () => {
  for (const st of [S({ platform: 'ios-app' }), S({ platform: 'ios-app', signedIn: true, profile: full, goalSet: true })]) {
    assert.notEqual(nextStep(st), 'install-first');
    assert.notEqual(nextStep(st), 'install');
  }
  assert.equal(nextStep(S({ platform: 'ios-app', signedIn: true, profile: full, goalSet: true })), 'notify');
});

test('platform detection', () => {
  assert.equal(platformOf({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari', standalone: false }), 'ios-safari');
  assert.equal(platformOf({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', standalone: true }), 'ios-app');
  assert.equal(platformOf({ ua: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) Chrome/120', standalone: false }), 'android');
  assert.equal(platformOf({ ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120', standalone: false }), 'other');
});

test('iPhone in Safari with data already on it: sign in and move the data first, offer install after', () => {
  assert.equal(nextStep(S({ platform: 'ios-safari', localData: true })), 'signin');
  assert.equal(nextStep(S({ platform: 'ios-safari', localData: true, signedIn: true })), 'migrate');
  assert.equal(nextStep(S({ platform: 'ios-safari', localData: true, signedIn: true, migrated: true, profile: full })), 'install-first');
  assert.equal(nextStep(S({ platform: 'ios-safari', localData: true, signedIn: true, migrated: true, profile: full, installSkipped: true })), 'done');
});
