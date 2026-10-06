// Playwright smoke test at 390x844, Hebrew + English. Saves screenshots to docs/stage-N/ (STAGE env, default 3).
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const shots = new URL(`../docs/stage-${process.env.STAGE ?? 3}/`, import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ROUTES = ['workout', 'exercises', 'exercise/barbell-bench-press-medium-grip', 'exercise/plank', 'ranks', 'progress', 'card', 'shop', 'profile', 'history', 'kit', 'ranks-preview'];
const errors = [];
let failed = 0;
const check = (name, fn) => fn().then(() => console.log('ok  ', name), (e) => { failed++; console.error('FAIL', name, '-', e.message.split('\n')[0]); });
const L = (lang, he, en) => (lang === 'he' ? he : en);

async function onboard(page, lang, shotPrefix) {
  await page.goto(base);
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('.onboarding');
  await page.waitForTimeout(500);
  if (shotPrefix) await page.screenshot({ path: `${shots}${shotPrefix}-onb1.png` });
  await page.click('.ob-actions .btn-primary');
  await page.waitForSelector('#ob-name');
  if (shotPrefix) {
    await page.click('.ob-actions .btn-primary'); // empty -> validation errors
    await page.waitForSelector('.field-error');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${shotPrefix}-onb2-errors.png` });
  }
  await page.fill('#ob-name', 'Elia');
  await page.click('.seg button >> nth=0');
  await page.fill('#ob-weight', '82,5');
  await page.fill('#ob-age', '30');
  if (shotPrefix) assert.equal(await page.locator('.field-error:visible').count(), 0, 'errors clear while typing');
  if (shotPrefix) await page.screenshot({ path: `${shots}${shotPrefix}-onb2.png` });
  await page.click('.ob-actions .btn-primary');
  await page.waitForSelector('.tour-list');
  await page.waitForTimeout(500);
  if (shotPrefix) await page.screenshot({ path: `${shots}${shotPrefix}-onb3.png` });
  await page.click('.ob-actions .btn-primary');
  await page.waitForSelector('.tabbar');
}

async function addExercise(page, query) {
  await page.waitForSelector('.sheet .pick-row');
  await page.fill('.picker .search-input', query);
  await page.waitForTimeout(350);
  await page.locator('.picker .pick-row').first().click();
  await page.click('.pick-footer .btn');
  await page.waitForTimeout(150);
}
async function logSet(page, cardIndex, weight, reps) {
  const card = page.locator('.ent-card').nth(cardIndex);
  const row = card.locator('.set-row').first();
  await row.locator('.set-input').nth(0).fill(String(weight));
  await row.locator('.set-input').nth(1).fill(String(reps));
  await row.locator('.set-v').click();
  await page.waitForTimeout(150);
}


async function postThree(page) {
  await page.goto(`${base}#/workout`);
  await page.waitForSelector('main .btn-primary');
  await page.click('main .btn-primary');
  await addExercise(page, 'barbell bench press');
  await logSet(page, 0, 100, 5);
  await page.click('.live-actions .btn-secondary');
  await addExercise(page, 'barbell squat');
  await logSet(page, 1, 140, 5);
  await page.click('.live-actions .btn-secondary');
  await addExercise(page, 'barbell deadlift');
  await logSet(page, 2, 180, 5);
  await page.click('.live-head .btn');
  await page.waitForSelector('.sheet .btn-primary');
  await page.click('.sheet .btn-primary');
  await page.waitForSelector('.rankup', { timeout: 5000 });
  await page.click('.rankup button');
  await page.waitForSelector('.stats-grid');
}

for (const lang of ['he', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'he' ? 'he-IL' : 'en-US', hasTouch: true });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${lang}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));

  await check(`${lang}: onboarding (3 steps, validation, age optional, profile persists)`, async () => {
    await page.goto(base);
    await page.waitForSelector('html[data-ready="1"]');
    assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
    assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'he' ? 'rtl' : 'ltr');
    assert.equal(await page.locator('.tabbar').count(), 0, 'no tab bar during onboarding');
    await onboard(page, lang, lang);
    await page.reload();
    await page.waitForSelector('html[data-ready="1"]');
    await page.waitForSelector('.tabbar');
    assert.equal(await page.locator('.onboarding').count(), 0);
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
      const small = await page.evaluate(() => [...document.querySelectorAll('button, a.tab, .btn, input, a.btn')]
        .map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height < 43.5).length);
      assert.equal(small, 0);
    });
    await page.screenshot({ path: `${shots}${lang}-${r.replace(/\//g, '_')}.png`, fullPage: r.includes('preview') });
  }

  await check(`${lang}: exercise library lists 300 and searches`, async () => {
    await page.goto(`${base}#/exercises`);
    await page.waitForSelector('.ex-row');
    assert.equal(await page.locator('.ex-row').count(), 300);
    await page.fill('.search-input', L(lang, 'דדליפט רומני', 'romanian'));
    await page.waitForTimeout(400);
    const n = await page.locator('.ex-row').count();
    assert.ok(n >= 1 && n < 20, `rows after search: ${n}`);
    await page.fill('.search-input', 'zzzzqq');
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.ex-row').count(), 0);
    await page.fill('.search-input', '');
    await page.waitForTimeout(400);
  });

  await check(`${lang}: exercise detail shows map, image toggle, steps`, async () => {
    await page.goto(`${base}#/exercise/barbell-bench-press-medium-grip`);
    await page.waitForSelector('.mmap svg');
    assert.equal(await page.locator('.mmap svg').count(), 2);
    assert.ok(await page.locator('.mm-primary').count() >= 1);
    const before = await page.getAttribute('.ex-photo img', 'src');
    await page.click('.ex-photo');
    assert.notEqual(await page.getAttribute('.ex-photo img', 'src'), before);
  });

  await check(`${lang}: live workout, autosave + restore, post, rank-up, history edit and delete`, async () => {
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.screen h1');
    await page.screenshot({ path: `${shots}${lang}-workout-start.png` });
    await page.click('main .btn-primary');
    await addExercise(page, 'barbell bench press');
    await page.waitForSelector('.ent-card');
    await logSet(page, 0, 100, 5);
    assert.ok(await page.locator('.fb-rating').count() === 1, 'rating preview shown');
    assert.ok(await page.locator('.pr-badge').count() >= 1, 'first record badge shown');
    assert.equal(await page.locator('#rest-root:not([hidden])').count(), 1, 'rest timer running');
    await page.screenshot({ path: `${shots}${lang}-live.png` });

    // kill and reopen: the draft must come back exactly
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('.ent-card');
    assert.equal(await page.locator('.set-input').first().inputValue(), '100');
    assert.equal(await page.locator('.set-v.on').count(), 1);
    assert.equal(await page.locator('#rest-root:not([hidden])').count(), 1, 'rest timer restored from its end timestamp');

    await page.click('.live-actions .btn-secondary');
    await addExercise(page, 'barbell squat');
    await logSet(page, 1, 140, 5);
    await page.click('.live-actions .btn-secondary');
    await addExercise(page, 'barbell deadlift');
    await logSet(page, 2, 180, 5);
    assert.equal(await page.locator('.set-v.on').count(), 3);
    await page.screenshot({ path: `${shots}${lang}-live-3.png` });

    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-primary');
    await page.screenshot({ path: `${shots}${lang}-finish.png` });
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('.rankup', { timeout: 5000 });
    await page.waitForTimeout(1600);
    await page.screenshot({ path: `${shots}${lang}-rankup.png` });
    await page.click('.rankup button');
    await page.waitForSelector('.stats-grid');
    await page.screenshot({ path: `${shots}${lang}-result.png`, fullPage: true });
    await page.click('main .btn-primary');
    await page.waitForSelector('.rank-card');
    assert.equal(await page.locator('.rank-pending').count(), 0);
    assert.equal(await page.locator('.rank-card .lp').count(), 1, 'overall rank with LP bar after 3 ranked exercises');
    await page.screenshot({ path: `${shots}${lang}-workout-ranked.png` });

    // history: open, edit, save (recalculated), delete with confirmation
    await page.goto(`${base}#/history`);
    await page.waitForSelector('.hist-row');
    await page.screenshot({ path: `${shots}${lang}-history.png` });
    await page.click('.hist-row');
    await page.waitForSelector('.hist-set');
    await page.locator('.hist-set .set-input').first().fill('60');
    await page.click('main .btn-primary');
    await page.waitForSelector('.hist-row');
    await page.click('.hist-row');
    await page.waitForSelector('.hist-set');
    assert.equal(await page.locator('.hist-set .set-input').first().inputValue(), '60');
    await page.screenshot({ path: `${shots}${lang}-history-detail.png`, fullPage: true });
    await page.click('main .btn-danger');
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.empty');
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.rank-card');
    assert.equal(await page.locator('.rank-card .lp').count(), 0, 'rank pending again after deleting the only workout');
  });

  await check(`${lang}: discard keeps nothing; empty finish cannot post`, async () => {
    await page.goto(`${base}#/workout`);
    await page.click('main .btn-primary');
    await page.waitForSelector('.sheet .pick-row');
    await page.keyboard.press('Escape');
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet');
    assert.equal(await page.locator('.sheet .btn-primary').count(), 0, 'no post button without a done set');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.live-head', { state: 'detached' });
    await page.waitForSelector('main .btn-primary');
  });

  await check(`${lang}: ranks tab with data (map, groups, table, need sheet, recovery), progress, card, exercise best`, async () => {
    await postThree(page);
    await page.goto(`${base}#/ranks`);
    await page.waitForSelector('.mmap svg');
    assert.equal(await page.locator('.rank-card .lp').count(), 1);
    assert.equal(await page.locator('.mmap svg').count(), 2);
    assert.ok(await page.locator('.mm-glow').count() >= 3, 'ranked muscles glow in their tier colour');
    await page.click('.mm[data-muscle="chest"] polygon');
    assert.match(await page.textContent('.mmap-info'), /Platinum|Diamond|Gold|Silver/);
    await page.waitForSelector('.mmap-panel .row');
    assert.equal(await page.locator('.group-row').count(), 10);
    assert.ok(await page.locator('.ex-rank-row').count() >= 3);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}${lang}-ranks-data.png`, fullPage: true });
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(o.sw <= o.cw, 'no horizontal overflow with data');
    // sort
    const first = await page.locator('.ex-rank-row .row-title').first().textContent();
    await page.locator('.seg').nth(1).locator('button').nth(1).click(); // sort by name
    await page.waitForSelector('.ex-rank-row');
    const names = await page.locator('.ex-rank-row .row-title').allTextContents();
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
    assert.ok(first.length > 0);
    // what do I need
    await page.locator('.ex-rank-row').first().click();
    await page.waitForSelector('.need-card');
    const kg1 = await page.locator('.need-load').first().textContent();
    await page.locator('.stepper .icon-btn').nth(1).click();
    await page.locator('.stepper .icon-btn').nth(1).click();
    await page.locator('.stepper .icon-btn').nth(1).click();
    assert.notEqual(await page.locator('.need-load').first().textContent(), kg1, 'load changes with reps');
    await page.screenshot({ path: `${shots}${lang}-need.png` });
    await page.keyboard.press('Escape');
    // recovery mode
    await page.locator('.seg').first().locator('button').nth(1).click();
    await page.waitForSelector('.recov-bar');
    await page.click('.mm[data-muscle="chest"] polygon');
    assert.match(await page.textContent('.mmap-info'), /%/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}${lang}-recovery.png`, fullPage: true });
    // progress
    await page.goto(`${base}#/progress`);
    await page.waitForSelector('.chart');
    assert.equal(await page.locator('.chart').count(), 3);
    assert.ok(await page.locator('.chart-dot').count() >= 1 && await page.locator('.chart-bar').count() >= 12);
    const o2 = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(o2.sw <= o2.cw);
    await page.screenshot({ path: `${shots}${lang}-progress.png`, fullPage: true });
    // exercise detail shows the best card
    await page.goto(`${base}#/exercise/barbell-bench-press-medium-grip`);
    await page.waitForSelector('.mmap svg');
    await page.getByRole('button', { name: L(lang, 'כמה צריך להרים?', 'What do I need?') }).click();
    await page.waitForSelector('.need-card');
    await page.keyboard.press('Escape');
    // player card
    await page.goto(`${base}#/card`);
    await page.waitForSelector('.card-preview canvas');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}${lang}-card.png`, fullPage: true });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: L(lang, 'שמירה כתמונה', 'Save as picture') }).click()]);
    assert.match(dl.suggestedFilename(), /^demigod-.*\.png$/);
    const px = await page.evaluate(() => { const c = document.querySelector('.card-preview canvas'); const d = c.getContext('2d').getImageData(540, 600, 1, 1).data; return [c.width, c.height, d[3]]; });
    assert.deepEqual([px[0], px[1]], [1080, 1350]); assert.equal(px[2], 255);
  });

  await check(`${lang}: sheet + toast + language toggle + tab bar`, async () => {
    await page.goto(`${base}#/kit`);
    await page.waitForSelector('.screen');
    await page.getByRole('button', { name: L(lang, 'פתיחת חלונית', 'Open sheet') }).click();
    await page.waitForSelector('.sheet');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.sheet').count(), 0);
    await page.goto(`${base}#/workout`);
    await page.click('.tab[href="#/ranks"]');
    await page.waitForSelector('.tab[aria-current="page"][href="#/ranks"]', { timeout: 3000 });
    await page.goto(`${base}#/profile`);
    await page.getByRole('button', { name: L(lang, 'English', 'עברית') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'he' ? 'ltr' : 'rtl');
    await page.getByRole('button', { name: L(lang, 'עברית', 'English') }).click();
  });

  await check(`${lang}: profile edit saves, bodyweight history grows`, async () => {
    await page.goto(`${base}#/profile`);
    await page.waitForSelector('.profile-head, .screen-head');
    await page.getByRole('button', { name: L(lang, 'עריכת פרופיל', 'Edit profile') }).click();
    await page.waitForSelector('.sheet #pe-weight');
    await page.fill('#pe-weight', '84');
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('.toast');
    await page.waitForSelector('.list .row .num');
    await page.screenshot({ path: `${shots}${lang}-profile-edited.png`, fullPage: true });
  });

  await check(`${lang}: manifest + service worker + works offline after first load`, async () => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    assert.ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'page not controlled by SW');
    await page.goto(`${base}#/exercise/barbell-bench-press-medium-grip`);
    await page.waitForSelector('.mmap svg', { timeout: 5000 });
    await ctx.setOffline(true);
    await page.goto(`${base}#/workout`);
    await page.reload();
    await page.waitForSelector('.screen h1', { timeout: 5000 });
    await page.click('main .btn-primary');
    await page.waitForSelector('.sheet .pick-row', { timeout: 5000 });
    await ctx.setOffline(false);
  });
  await ctx.close();
}

await check('no console errors', async () => assert.deepEqual(errors, []));
await browser.close();
server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('UI smoke: all passed');
