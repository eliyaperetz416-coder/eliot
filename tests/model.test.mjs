import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanLink, cleanModel } from '../src/core/model.mjs';

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
