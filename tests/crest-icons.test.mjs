import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ICONS, GLYPH_OF } from '../src/ui/crest-icons.js';

const TIERS = ['wood', 'bronze', 'silver', 'gold', 'platinum', 'diamond', 'champion', 'titan', 'olympian', 'greekgod'];

test('every tier has its own symbol (Elia 26.11: no more one bolt for everyone)', () => {
  assert.deepEqual(Object.keys(GLYPH_OF).sort(), [...TIERS].sort());
  assert.equal(new Set(Object.values(GLYPH_OF)).size, TIERS.length, 'no two tiers share a symbol');
  assert.equal(GLYPH_OF.wood, 'target');
  assert.equal(GLYPH_OF.greekgod, 'temple-bolts');
  assert.deepEqual(
    [GLYPH_OF.bronze, GLYPH_OF.silver, GLYPH_OF.gold, GLYPH_OF.platinum, GLYPH_OF.diamond, GLYPH_OF.champion, GLYPH_OF.titan, GLYPH_OF.olympian],
    ['delapouite/spartan-helmet', 'lorc/winged-sword', 'lorc/laurel-crown', 'lorc/eagle-emblem', 'lorc/winged-shield', 'lorc/crown', 'lorc/crowned-skull', 'lorc/hydra'],
  );
});

test('the library shapes are plain path data on a 512 grid, and each one the crest uses is there', () => {
  for (const name of [...Object.values(GLYPH_OF).filter((g) => g.includes('/')), 'delapouite/greek-temple']) {
    assert.ok(Array.isArray(ICONS[name]) && ICONS[name].length > 0, name);
    for (const d of ICONS[name]) assert.match(d, /^[MmLlHhVvCcSsQqTtAaZz0-9 .,eE-]+$/, name);
  }
});

test('the icons are credited (CC BY 3.0) in Settings in both languages and in docs/LICENSES.md', () => {
  for (const lang of ['he', 'en']) {
    const body = JSON.parse(readFileSync(`src/data/i18n/${lang}.json`, 'utf8'))['set.credits.body'];
    for (const w of ['game-icons.net', 'Lorc', 'Delapouite', 'CC BY 3.0']) assert.ok(body.includes(w), `${lang}: ${w}`);
  }
  const lic = readFileSync('docs/LICENSES.md', 'utf8');
  for (const w of ['game-icons.net', 'Lorc', 'Delapouite', 'CC BY 3.0', 'hydra']) assert.ok(lic.includes(w), `LICENSES.md: ${w}`);
});
