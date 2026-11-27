import test from 'node:test';
import assert from 'node:assert/strict';
import { bottomDrift } from '../src/core/viewport.mjs';

test('normal: the visible screen and the page frame agree, nothing moves', () => {
  assert.equal(bottomDrift({ offsetTop: 0, height: 844 }, 844), 0);
  assert.equal(bottomDrift(null, 844), 0, 'no visualViewport (old browser): nothing moves');
});

test('iPhone bug (Elia 27.11): the page frame lags above the screen, the bar is pulled back down by the gap', () => {
  assert.equal(bottomDrift({ offsetTop: 480, height: 844 }, 844), 480);
  assert.equal(bottomDrift({ offsetTop: 0, height: 900 }, 844), 56);
});

test('keyboard open (the visible screen is shorter): the bar stays where iOS puts it, it does not climb over the keyboard', () => {
  assert.equal(bottomDrift({ offsetTop: 0, height: 500 }, 844), 0);
  assert.equal(bottomDrift({ offsetTop: 120, height: 500 }, 844), 0);
});

test('sub-pixel noise and pinch-zoom do not move the bar', () => {
  assert.equal(bottomDrift({ offsetTop: 0.6, height: 844 }, 844), 0);
  assert.equal(bottomDrift({ offsetTop: 300, height: 600, scale: 1.4 }, 844), 0);
});
