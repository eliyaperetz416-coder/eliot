import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { setDictionaries, setLanguage, t, detectLanguage } from '../src/core/i18n.mjs';

const load = (l) => JSON.parse(readFileSync(new URL(`../src/data/i18n/${l}.json`, import.meta.url), 'utf8'));
const he = load('he'), en = load('en');
const ph = (v) => [...new Set((typeof v === 'string' ? v : Object.values(v).join(' ')).match(/\{\w+\}/g) ?? [])].sort().join();

test('every key exists in both languages', () => {
  const a = Object.keys(he).sort(), b = Object.keys(en).sort();
  assert.deepEqual(a.filter((k) => !(k in en)), [], 'keys missing in en');
  assert.deepEqual(b.filter((k) => !(k in he)), [], 'keys missing in he');
});

test('placeholders match between languages; plural entries have "other"', () => {
  for (const k of Object.keys(en)) {
    assert.equal(ph(he[k]), ph(en[k]), `placeholder mismatch: ${k}`);
    for (const d of [he, en]) if (typeof d[k] === 'object') assert.ok(d[k].other, `plural "other" missing: ${k}`);
  }
});

test('no empty strings', () => {
  for (const d of [he, en]) for (const [k, v] of Object.entries(d)) {
    for (const s of typeof v === 'string' ? [v] : Object.values(v)) assert.ok(s.trim(), `empty: ${k}`);
  }
});

test('no hard-coded Hebrew in UI source', () => {
  for (const f of readdirSync(new URL('../src/ui/', import.meta.url))) {
    assert.doesNotMatch(readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8'), /[֐-׿]/, `Hebrew literal in src/ui/${f}`);
  }
});

test('t(): params, plurals (en and he), fallback to key', () => {
  setDictionaries({ he, en });
  setLanguage('en');
  assert.equal(t('kit.sets', { n: 1 }), '1 set');
  assert.equal(t('kit.sets', { n: 4 }), '4 sets');
  setLanguage('he');
  assert.equal(t('kit.sets', { n: 1 }), 'סט אחד');
  assert.equal(t('kit.sets', { n: 2 }), 'שני סטים');
  assert.equal(t('kit.sets', { n: 7 }), '7 סטים');
  assert.equal(t('does.not.exist'), 'does.not.exist');
  assert.throws(() => setLanguage('fr'));
});

test('detectLanguage', () => {
  assert.equal(detectLanguage('he-IL'), 'he');
  assert.equal(detectLanguage('en-US'), 'en');
  assert.equal(detectLanguage(), 'en');
});
