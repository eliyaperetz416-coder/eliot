import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { THEMES, contrast, inkFor } from '../src/core/themes.mjs';
import { migrateSettings, DEFAULT_SETTINGS, SETTINGS_VERSION } from '../src/core/settings.mjs';

const shopHexes = JSON.parse(readFileSync(new URL('../src/data/shop.json', import.meta.url), 'utf8')).cosmetics.filter((c) => c.kind === 'theme').map((c) => c.hex);

for (const [name, p] of Object.entries(THEMES)) {
  test(`${name}: every text colour reads on the background and on cards (WCAG AA 4.5)`, () => {
    for (const fg of ['text', 'textDim', 'textMute']) {
      for (const bg of ['bg', 'surface1', 'surface2']) {
        const r = contrast(p[fg], p[bg]);
        assert.ok(r >= 4.5, `${name} ${fg} on ${bg}: ${r.toFixed(2)}`);
      }
    }
  });
  test(`${name}: button text reads on the accent`, () => {
    assert.ok(contrast(inkFor(p.accent), p.accent) >= 4.5);
  });
}

test('the default accents are gold (dark) and bronze (marble); no purple left', () => {
  assert.equal(THEMES.dark.accent.toLowerCase(), '#c9a24a');
  assert.equal(THEMES.marble.accent.toLowerCase(), '#8a5a2b');
  const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8') + readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.equal(/7c5cff|124 92 255/i.test(css), false);
});

test('every shop colour keeps its button text readable', () => {
  for (const hex of shopHexes) assert.ok(contrast(inkFor(hex), hex) >= 4.5, hex);
});

test('settings v3: the colour-by-rank choice becomes the dark theme', () => {
  assert.equal(SETTINGS_VERSION, 3);
  assert.equal(DEFAULT_SETTINGS.theme, 'dark');
  const s = migrateSettings({ schemaVersion: 2, accentMode: 'rank', weeklyGoal: 4 });
  assert.equal(s.theme, 'dark');
  assert.equal(s.schemaVersion, 3);
  assert.equal('accentMode' in s, false);
  assert.equal(s.weeklyGoal, 4);
});
