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

test('Android, signed in, nothing on the phone: the questions start with "about you" (name, curve, weight, age on one screen)', () => {
  assert.equal(nextStep(S({ signedIn: true })), 'about');
});

test('the questions come in order; an unanswered age counts as skipped once the screen was sent', () => {
  assert.equal(nextStep(S({ signedIn: true, profile: { name: 'A' } })), 'about');
  assert.equal(nextStep(S({ signedIn: true, profile: { name: 'A', sex: 'm', weight: 80 } })), 'about');
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

test('an iPad in Safari says "Macintosh": a touch screen tells it apart from a Mac (M-8)', () => {
  const ipadUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  assert.equal(platformOf({ ua: ipadUa, standalone: false, touchPoints: 5 }), 'ios-safari');
  assert.equal(platformOf({ ua: ipadUa, standalone: true, touchPoints: 5 }), 'ios-app');
  assert.equal(platformOf({ ua: ipadUa, standalone: false, touchPoints: 0 }), 'other', 'a real Mac');
});
