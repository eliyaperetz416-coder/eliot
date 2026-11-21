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

test('pinch zoom stays on (accessibility) while double-tap zoom is off', async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /name="viewport"/);
  assert.doesNotMatch(html, /user-scalable=no/);
  assert.doesNotMatch(html, /maximum-scale=1\b/);
  const css = readFileSync(new URL('../src/styles/base.css', import.meta.url), 'utf8');
  assert.match(css, /touch-action: manipulation/);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /gesturestart/);
});

test('a shared link has a description and a preview image (Open Graph)', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="description" content="[^"]{20,}">/);
  for (const p of ['og:title', 'og:description', 'og:image', 'og:url']) assert.match(html, new RegExp(`property="${p}" content="[^"]+"`), p);
  const img = html.match(/property="og:image" content="https:\/\/[^/]+\/([^"]+)"/)[1];
  assert.ok(existsSync(new URL(`../${img}`, import.meta.url)), img);
});

test('index.html preloads every start-up module (run npm run stamp after changing imports)', async () => {
  const { readFileSync } = await import('node:fs');
  const { preloadBlock } = await import('../scripts/preload.mjs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const block = html.match(/<!--PRELOAD_START-->[\s\S]*?<!--PRELOAD_END-->/)?.[0];
  assert.ok(block, 'preload markers missing');
  assert.equal(block, preloadBlock(), 'modulepreload list is stale: run npm run stamp');
});
