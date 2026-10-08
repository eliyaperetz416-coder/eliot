import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLink, cleanModel, cleanTips, tipOfDay } from '../src/core/model.mjs';

test('links: only the right site, https, no tracking parameters', () => {
  assert.equal(cleanLink('youtube', 'https://youtube.com/@harleyalexanderr?si=abc'), 'https://youtube.com/@harleyalexanderr');
  assert.equal(cleanLink('instagram', 'instagram.com/someone?igsh=1'), 'https://instagram.com/someone');
  assert.equal(cleanLink('tiktok', 'https://www.tiktok.com/@someone.fit?_r=1&_t=x'), 'https://www.tiktok.com/@someone.fit');
  assert.equal(cleanLink('youtube', 'https://evil.example/youtube.com'), null);
  assert.equal(cleanLink('instagram', 'https://instagram.com.evil.example/x'), null);
  assert.equal(cleanLink('tiktok', ''), '');
  assert.equal(cleanLink('youtube', 'javascript:alert(1)'), null);
});

test('model: name required, bad links reported, text trimmed', () => {
  assert.deepEqual(cleanModel({ name: ' ' }).errors, { name: 'required' });
  assert.deepEqual(cleanModel({ name: 'A', links: { youtube: 'https://vimeo.com/x' } }).errors, { youtube: 'link' });
  const r = cleanModel({ name: '  Harley  ', note: 'x'.repeat(300), links: { youtube: 'youtube.com/@h', instagram: '' } }, 5);
  assert.equal(r.ok, true);
  assert.equal(r.model.name, 'Harley');
  assert.equal(r.model.note.length, 140);
  assert.deepEqual(r.model.links, { youtube: 'https://youtube.com/@h' });
  assert.equal(r.model.updatedMs, 5);
});

test('tips: one per line, trimmed, unique, limited; they rotate by day', () => {
  assert.deepEqual(cleanTips('  Drink water \n\nDrink water\nSleep   8 hours\r\n'), ['Drink water', 'Sleep 8 hours']);
  assert.equal(cleanTips(Array.from({ length: 50 }, (_, i) => `tip ${i}`)).length, 20);
  assert.equal(cleanTips('x'.repeat(300))[0].length, 140);
  assert.deepEqual(cleanTips(null), []);
  assert.equal(tipOfDay(['a', 'b', 'c'], 0), 'a');
  assert.equal(tipOfDay(['a', 'b', 'c'], 4), 'b');
  assert.equal(tipOfDay(['a', 'b', 'c'], -1), 'c');
  assert.equal(tipOfDay([], 5), null);
});

test('model: tips and weekly goal are kept and limited', () => {
  const r = cleanModel({ name: 'H', tips: 'a\nb', weeklyGoal: 12 });
  assert.deepEqual(r.model.tips, ['a', 'b']);
  assert.equal(r.model.weeklyGoal, 7);
  assert.equal(cleanModel({ name: 'H', weeklyGoal: -3 }).model.weeklyGoal, 0);
  assert.equal(cleanModel({ name: 'H', weeklyGoal: 'x' }).model.weeklyGoal, 0);
  assert.equal(cleanModel({ name: 'H', weeklyGoal: 4.4 }).model.weeklyGoal, 4);
});
