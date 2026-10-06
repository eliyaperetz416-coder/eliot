import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const r = (p) => new URL(`../${p}`, import.meta.url);
const manifest = JSON.parse(readFileSync(r('manifest.webmanifest'), 'utf8'));

test('manifest is valid and icons exist', () => {
  for (const k of ['name', 'short_name', 'start_url', 'display', 'background_color', 'theme_color']) assert.ok(manifest[k], k);
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'));
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'maskable'));
  for (const i of manifest.icons) assert.ok(existsSync(r(i.src)), i.src);
  assert.ok(existsSync(r('assets/icons/apple-touch-icon.png')));
});

test('index.html has iOS PWA meta tags', () => {
  const html = readFileSync(r('index.html'), 'utf8');
  for (const s of ['apple-mobile-web-app-capable', 'apple-touch-icon', 'viewport-fit=cover', 'rel="manifest"']) assert.ok(html.includes(s), s);
});

test('sw.js precache is stamped and every file exists', () => {
  const sw = readFileSync(r('sw.js'), 'utf8');
  assert.doesNotMatch(sw, /const BUILD = 'dev'/, 'run npm run stamp');
  const list = JSON.parse(sw.match(/const PRECACHE = (\[[\s\S]*?\]);/)[1]);
  assert.ok(list.includes('index.html') && list.includes('offline.html'));
  for (const f of list) assert.ok(existsSync(r(f)), f);
});

test('pinch and double-tap zoom are switched off (a zoomed-in screen is hard to leave on a phone)', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /name="viewport"[^>]*user-scalable=no/);
  assert.match(html, /maximum-scale=1/);
  const css = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
  assert.match(css, /touch-action: manipulation/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /gesturestart/);
});
