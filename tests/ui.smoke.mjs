// Playwright smoke test at 390x844, Hebrew + English. Saves screenshots to docs/stage-1/.
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const shots = new URL('../docs/stage-1/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ROUTES = ['workout', 'exercises', 'ranks', 'shop', 'profile', 'kit'];
const errors = [];
let failed = 0;
const check = (name, fn) => fn().then(() => console.log('ok  ', name), (e) => { failed++; console.error('FAIL', name, '-', e.message); });

for (const lang of ['he', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'he' ? 'he-IL' : 'en-US', hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${lang}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));
  await page.goto(base);
  await page.waitForSelector('html[data-ready="1"]');

  await check(`${lang}: html lang/dir`, async () => {
    assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
    assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'he' ? 'rtl' : 'ltr');
  });

  for (const r of ROUTES) {
    await page.goto(`${base}#/${r}`);
    await page.waitForSelector('.screen');
    await page.waitForTimeout(450);
    await check(`${lang}: ${r} no horizontal overflow`, async () => {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      assert.ok(o.sw <= o.cw, `scrollWidth ${o.sw} > ${o.cw}`);
    });
    await check(`${lang}: ${r} touch targets >= 44px`, async () => {
      const small = await page.evaluate(() => [...document.querySelectorAll('button, a.tab, .btn, input')]
        .map((el) => el.getBoundingClientRect()).filter((b) => b.width && (b.height < 43.5 || (b.width < 43.5 && !b.width))).length);
      assert.equal(small, 0);
    });
    await page.screenshot({ path: `${shots}${lang}-${r}.png` });
  }

  await check(`${lang}: tab bar navigates`, async () => {
    await page.goto(`${base}#/workout`);
    await page.click('.tab[href="#/ranks"]');
    await page.waitForSelector('.tab[aria-current="page"][href="#/ranks"]', { timeout: 3000 });
  });

  await check(`${lang}: sheet + toast`, async () => {
    await page.goto(`${base}#/kit`);
    await page.waitForSelector('.screen');
    await page.getByRole('button', { name: lang === 'he' ? 'פתיחת חלונית' : 'Open sheet' }).click();
    await page.waitForSelector('.sheet');
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${shots}${lang}-sheet.png` });
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sheet').count(), 0);
  });

  await check(`${lang}: language toggle switches dir`, async () => {
    await page.goto(`${base}#/profile`);
    const other = lang === 'he' ? 'English' : 'עברית';
    await page.getByRole('button', { name: other }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'he' ? 'ltr' : 'rtl');
  });

  await check(`${lang}: manifest + service worker`, async () => {
    const mf = await page.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()));
    assert.equal(mf.display, 'standalone');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page not controlled by SW');
  });

  await check(`${lang}: works offline after first load`, async () => {
    await ctx.setOffline(true);
    await page.goto(`${base}#/shop`);
    await page.waitForSelector('.screen h1', { timeout: 5000 });
    await page.reload();
    await page.waitForSelector('.screen h1', { timeout: 5000 });
    assert.ok((await page.textContent('.screen h1')).length > 0);
    await ctx.setOffline(false);
  });
  await ctx.close();
}

await check('no console errors', async () => assert.deepEqual(errors, []));
await browser.close();
server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('UI smoke: all passed');
