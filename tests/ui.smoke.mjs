// Playwright smoke test at 390x844, Hebrew + English. Saves screenshots to docs/stage-N/ (STAGE env, default 3).
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const shots = new URL(`../docs/stage-${process.env.STAGE ?? 3}/`, import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ROUTES = ['workout', 'exercises', 'exercise/barbell-bench-press-medium-grip', 'exercise/plank', 'ranks', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'profile', 'history', 'kit', 'ranks-preview'];
const errors = [];
let failed = 0;
const ONLY = process.env.ONLY;
const check = (name, fn) => (ONLY && !name.includes(ONLY) && !name.includes('onboarding') ? Promise.resolve() : fn()).then(() => console.log('ok  ', name), (e) => { failed++; console.error('FAIL', name, '-', e.message.split('\n')[0], (e.stack.match(/ui\.smoke\.mjs:\d+/) ?? [''])[0]); });
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

async function startEmpty(page) {
  await page.waitForSelector('main .btn-primary');
  await page.click('main .btn-primary');
  await page.waitForSelector('.sheet .row');
  await page.locator('.sheet .row', { hasText: /Empty workout|אימון ריק/ }).click();
  await page.waitForSelector('.sheet .pick-row');
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
  await startEmpty(page);
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
  await page.waitForSelector('main .stats-grid');
  await page.waitForTimeout(800);
  if (await page.locator('.rankup').count()) await page.click('.rankup button');
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
      const small = await page.evaluate(() => [...document.querySelectorAll('button, a.tab, .btn, input:not([type=file]), a.btn')]
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
    await startEmpty(page);
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
    await page.waitForSelector('main .stats-grid');
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
    await startEmpty(page);
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

  await check(`${lang}: saved workouts: prepare in advance, "which workout today?", templates, duplicate, delete`, async () => {
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.screen h1');
    await page.screenshot({ path: `${shots}${lang}-workout-start-s5.png`, fullPage: true });
    await page.goto(`${base}#/routines`);
    await page.waitForSelector('.screen h1');
    await page.getByRole('button', { name: L(lang, 'אימון חדש', 'New workout'), exact: true }).click();
    await page.waitForSelector('.routine-name');
    await page.fill('.routine-name', L(lang, 'חזה וכתפיים', 'Chest and shoulders'));
    await page.getByRole('button', { name: L(lang, 'הוספת תרגיל', 'Add exercise') }).click();
    await page.waitForSelector('.sheet .pick-row');
    for (const i of [0, 1, 2]) await page.locator('.picker .pick-row').nth(i).click();
    await page.click('.pick-footer .btn');
    await page.waitForSelector('.ent-card');
    assert.equal(await page.locator('.ent-card').count(), 3);
    await page.locator('.ent-card').first().getByRole('button', { name: `${L(lang, 'סטים', 'Sets')} +` }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${lang}-routine-edit.png`, fullPage: true });
    // leave and come back: persisted
    await page.goto(`${base}#/routines`);
    await page.waitForSelector('.routine-row');
    await page.reload();
    await page.waitForSelector('.routine-row');
    assert.equal(await page.locator('.routine-row').count(), 1);
    await page.screenshot({ path: `${shots}${lang}-routines.png`, fullPage: true });
    // templates
    await page.getByRole('button', { name: L(lang, 'מתבנית מוכנה', 'From a template') }).click();
    await page.waitForSelector('.sheet .row');
    await page.locator('.sheet .row').first().click(); // PPL: 3 workouts in a folder
    await page.waitForFunction(() => document.querySelectorAll('.routine-row').length >= 4);
    assert.equal(await page.locator('.routine-row').count(), 4);
    // duplicate through the menu
    await page.locator('.routine-row').first().getByRole('button', { name: L(lang, 'אפשרויות תרגיל', 'Exercise options') }).click();
    await page.waitForSelector('.sheet .row');
    await page.locator('.sheet .row').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.routine-row').length >= 5);
    // start workout -> "which workout today?" -> pick the first saved workout
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('main .btn-primary');
    await page.click('main .btn-primary');
    await page.waitForSelector('.sheet .row');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}${lang}-choose.png` });
    assert.ok(await page.locator('.sheet .row').count() >= 6);
    await page.locator('.sheet .row', { hasText: L(lang, 'חזה וכתפיים', 'Chest and shoulders') }).first().click();
    await page.waitForSelector('.ent-card');
    assert.equal(await page.locator('.ent-card').count(), 3);
    assert.equal(await page.locator('.ent-card').first().locator('.set-row').count(), 4, 'edited set count carried over');
    await page.screenshot({ path: `${shots}${lang}-from-routine.png` });
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.live-head', { state: 'detached' });
    // delete the first routine
    await page.goto(`${base}#/routines`);
    await page.waitForSelector('.routine-row');
    const before = await page.locator('.routine-row').count();
    await page.locator('.routine-row').first().getByRole('button', { name: L(lang, 'אפשרויות תרגיל', 'Exercise options') }).click();
    await page.locator('.sheet .danger-row').click();
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForFunction((n) => document.querySelectorAll('.routine-row').length === n - 1, before);
  });

  await check(`${lang}: generated plan: form, plan view, start a day with targets, find-weight prefill`, async () => {
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/plans`);
    await page.waitForSelector('.screen h1');
    await page.click('main .btn-primary');
    await page.waitForSelector('.seg');
    await page.screenshot({ path: `${shots}${lang}-plan-form.png`, fullPage: true });
    await page.locator('.seg').nth(1).locator('button').nth(1).click(); // 3 days
    await page.click('main .btn-primary');
    await page.waitForSelector('.plan-day');
    assert.equal(await page.locator('.plan-day').count(), 3);
    assert.ok(await page.locator('.week-chips .chip').count() === 6);
    await page.screenshot({ path: `${shots}${lang}-plan.png`, fullPage: true });
    await page.locator('.plan-day .btn').first().click();
    await page.waitForSelector('.ent-card');
    assert.ok(await page.locator('.target-line').count() >= 4);
    assert.ok(await page.locator('.target-line').count() >= 4);
    await page.screenshot({ path: `${shots}${lang}-plan-day-live.png` });
    const card = page.locator('.ent-card').first();
    await card.locator('.set-row').first().locator('.set-input').nth(0).fill('60');
    await card.locator('.set-row').first().locator('.set-input').nth(1).fill('8');
    await card.locator('.set-row').first().locator('.set-v').click();
    await page.waitForTimeout(200);
    const second = await card.locator('.set-row').nth(1).locator('.set-input').first().inputValue();
    if (await card.locator('.target-find').count()) assert.equal(second, '60', 'first working set prefills the rest'); else assert.ok(second !== '', 'suggested weight is prefilled');
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-primary');
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('main .stats-grid');
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.plan-next');
    await page.screenshot({ path: `${shots}${lang}-workout-plan-next.png`, fullPage: true });
    assert.match(await page.textContent('.plan-next'), /2/);
    await page.goto(`${base}#/plans`);
    await page.locator('.plan-card').first().click();
    await page.waitForSelector('.plan-day.done');
  });

  await check(`${lang}: custom exercise with photo: create, ranked like another, persists across reload, edit, delete`, async () => {
    const png = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 200, g: 60, b: 60 } } }).png().toBuffer();
    await page.goto(`${base}#/exercises`);
    await page.waitForSelector('.ex-row');
    await page.click('.add-custom');
    await page.waitForSelector('#cx-name');
    await page.click('main .btn-primary:has-text("' + L(lang, 'שמירה', 'Save') + '")');
    await page.waitForSelector('.field-error');
    await page.fill('#cx-name', 'My Cable Press');
    await page.click('.chip-cycle[data-muscle="chest"]');
    await page.click('.chip-cycle[data-muscle="triceps"]');
    await page.click('.chip-cycle[data-muscle="triceps"]');
    await page.waitForSelector('.mmap svg');
    await page.getByRole('button', { name: L(lang, 'בחירת תרגיל', 'Choose exercise') }).first().click();
    await page.waitForSelector('.sheet .pick-row');
    await page.fill('.picker .search-input', 'barbell bench press');
    await page.waitForTimeout(350);
    await page.locator('.picker .pick-row').first().click();
    await page.setInputFiles('#cx-photo', { name: 'photo.png', mimeType: 'image/png', buffer: png });
    await page.waitForSelector('.custom-photo');
    await page.screenshot({ path: `${shots}${lang}-custom-form.png`, fullPage: true });
    await page.click('main .btn-primary:has-text("' + L(lang, 'שמירה', 'Save') + '")');
    await page.waitForSelector('.ex-photo img');
    assert.ok((await page.textContent('.ex-meta')).includes(L(lang, 'שלי', 'Mine')));
    assert.ok(await page.locator('.mm-primary').count() >= 1);
    // stored photo is scaled down to at most 800 px
    const dims = await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('demigod'); r.onsuccess = () => res(r.result); r.onerror = rej; });
      const blob = await new Promise((res) => { const q = db.transaction('blobs').objectStore('blobs').getAll(); q.onsuccess = () => res(q.result[0]); });
      const bmp = await createImageBitmap(blob); return [bmp.width, bmp.height, blob.type];
    });
    assert.ok(Math.max(dims[0], dims[1]) <= 800 && Math.max(dims[0], dims[1]) >= 700, `stored photo ${dims}`);
    await page.screenshot({ path: `${shots}${lang}-custom-detail.png`, fullPage: true });
    // survives a reload, photo included, and behaves like a library exercise (search, ranking)
    await page.reload();
    await page.waitForSelector('.ex-photo img');
    assert.ok(await page.evaluate(() => { const i = document.querySelector('.ex-photo img'); return i.complete && i.naturalWidth > 0; }), 'photo still shows after reload');
    await page.goto(`${base}#/exercises`);
    await page.waitForSelector('.ex-row');
    await page.fill('.search-input', 'cable press');
    await page.waitForTimeout(350);
    assert.ok((await page.locator('.ex-row', { hasText: 'My Cable Press' }).count()) === 1);
    await page.fill('.search-input', '');
    await page.goto(`${base}#/workout`);
    await startEmpty(page);
    await page.fill('.picker .search-input', 'my cable press');
    await page.waitForTimeout(350);
    await page.locator('.picker .pick-row').first().click();
    await page.click('.pick-footer .btn');
    await page.waitForSelector('.ent-card');
    await logSet(page, 0, 60, 5);
    assert.ok(await page.locator('.fb-rating').count() === 1, 'counts like the bench press, so it gets a rating');
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.live-head', { state: 'detached' });
    // edit and delete
    await page.goto(`${base}#/exercises`);
    await page.fill('.search-input', 'cable press');
    await page.waitForTimeout(350);
    await page.locator('.ex-row', { hasText: 'My Cable Press' }).click();
    await page.getByRole('link', { name: L(lang, 'עריכת תרגיל', 'Edit exercise') }).click();
    await page.waitForSelector('#cx-name');
    await page.fill('#cx-name', 'My Cable Press 2');
    await page.click('main .btn-primary:has-text("' + L(lang, 'שמירה', 'Save') + '")');
    await page.waitForFunction(() => document.querySelector('.ex-title')?.textContent.includes('My Cable Press 2'));
    await page.getByRole('link', { name: L(lang, 'עריכת תרגיל', 'Edit exercise') }).click();
    await page.waitForSelector('#cx-name');
    await page.getByRole('button', { name: L(lang, 'מחיקה', 'Delete') }).click();
    await page.waitForSelector('.sheet .btn-danger');
    await page.click('.sheet .btn-danger');
    await page.waitForSelector('.ex-row');
    await page.fill('.search-input', 'my cable press 2');
    await page.waitForTimeout(350);
    assert.equal(await page.locator('.ex-row', { hasText: 'My Cable Press 2' }).count(), 0);
    await page.fill('.search-input', '');
  });

  await check(`${lang}: game: rewards, level, quests, streak restore, shop (buy, equip, XP Shake), achievements, card cosmetics`, async () => {
    // earlier checks already posted workouts today: free the daily reward limit so this check is self-contained
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('demigod'); r.onsuccess = () => res(r.result); r.onerror = rej; });
      const all = await new Promise((res) => { const q = db.transaction('workouts').objectStore('workouts').getAll(); q.onsuccess = () => res(q.result); });
      await new Promise((res) => { const tx = db.transaction('workouts', 'readwrite'); for (const w of all) { if (w.rewards) w.rewards.rewarded = false; tx.objectStore('workouts').put(w); } tx.oncomplete = res; });
    });
    await page.reload();
    await page.waitForSelector('html[data-ready="1"]');
    await postThree(page); // leaves us on the result screen
    assert.ok(await page.locator('main .rewards').count() === 1, 'rewards card on the result screen');
    assert.ok((await page.textContent('main .rewards')).includes('XP'));
    await page.screenshot({ path: `${shots}${lang}-rewards.png`, fullPage: true });
    // quests and streak on the Workout tab
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.quests');
    assert.equal(await page.locator('.quest').count(), 4, '3 daily quests and 1 weekly');
    assert.ok(await page.locator('.game-strip .game-chip').count() === 3);
    assert.ok(await page.locator('.streak-card').count() === 1);
    const claim = page.locator('.quest .btn-primary');
    if (await claim.count()) { await claim.first().click(); await page.waitForSelector('.toast'); assert.ok(await page.locator('.quest.claimed').count() >= 1); }
    await page.screenshot({ path: `${shots}${lang}-workout-game.png`, fullPage: true });
    // floating +XP on V
    await startEmpty(page);
    await addExercise(page, 'barbell curl');
    const card = page.locator('.ent-card').first();
    await card.locator('.set-row').first().locator('.set-input').nth(0).fill('30');
    await card.locator('.set-row').first().locator('.set-input').nth(1).fill('8');
    await card.locator('.set-row').first().locator('.set-v').click();
    await page.waitForSelector('.xp-float', { timeout: 2000 });
    await page.click('.live-head .btn'); await page.waitForSelector('.sheet .btn-danger'); await page.click('.sheet .btn-danger'); await page.waitForSelector('.sheet .btn-danger'); await page.click('.sheet .btn-danger');
    await page.waitForSelector('.live-head', { state: 'detached' });
    // profile: level bar, achievements
    await page.goto(`${base}#/profile`);
    await page.waitForSelector('.level-bar');
    await page.screenshot({ path: `${shots}${lang}-profile-game.png`, fullPage: true });
    await page.goto(`${base}#/achievements`);
    await page.waitForSelector('.ach-row');
    assert.ok(await page.locator('.ach-row').count() >= 25);
    assert.ok(await page.locator('.ach-row.unlocked').count() >= 1);
    await page.screenshot({ path: `${shots}${lang}-achievements.png`, fullPage: true });
    // shop: buy a background, equip it, buy an XP Shake and activate it
    await page.goto(`${base}#/shop`);
    await page.waitForSelector('.cosmetic');
    assert.equal(await page.locator('.cosmetic').count(), 15);
    const bal0 = Number((await page.textContent('.wallet-n')).replace(/[^0-9]/g, ''));
    assert.ok(bal0 >= 100, `balance ${bal0}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${lang}-shop.png`, fullPage: true });
    await page.locator('.cosmetic').first().locator('.btn').click(); // Storm Clouds, 100
    await page.waitForFunction((b) => Number(document.querySelector('.wallet-n').textContent.replace(/[^0-9]/g, '')) === b - 100, bal0);
    await page.locator('.cosmetic').first().locator('.btn').click(); // equip
    await page.waitForSelector('.cosmetic.equipped');
    await page.locator('.shop-row', { hasText: /XP/ }).locator('.btn').last().click(); // buy XP Shake
    await page.waitForFunction(() => [...document.querySelectorAll('.shop-row')].some((r) => /XP/.test(r.textContent) && r.querySelectorAll('.btn').length === 2));
    await page.locator('.shop-row', { hasText: /XP/ }).locator('.btn').first().click(); // activate
    await page.waitForSelector('.toast');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}${lang}-shop-after.png`, fullPage: true });
    // the next posted workout is doubled by the shake
    await postThree(page);
    assert.ok((await page.textContent('main .rewards')).length > 20);
    assert.ok(await page.locator('main .shake-note').count() === 1, 'XP Shake applied');
    // player card shows level, streak, achievements and the equipped background
    await page.goto(`${base}#/card`);
    await page.waitForSelector('.card-preview canvas');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${lang}-card-game.png`, fullPage: true });
    // streak broken -> restore with an owned Super restore
    await page.evaluate(async () => {
      const db = await new Promise((res, rej) => { const r = indexedDB.open('demigod'); r.onsuccess = () => res(r.result); r.onerror = rej; });
      const g = await new Promise((res) => { const q = db.transaction('game').objectStore('game').get('me'); q.onsuccess = () => res(q.result); });
      const d = new Date(); d.setDate(d.getDate() - 9);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      g.streak = { current: 12, best: 12, lastWorkoutDate: key, milestonesPaid: [7], broken: null };
      g.inventory.super = 1;
      await new Promise((res) => { const tx = db.transaction('game', 'readwrite'); tx.objectStore('game').put(g, 'me'); tx.oncomplete = res; });
    });
    await page.goto(`${base}#/workout`);
    await page.reload();
    await page.waitForSelector('.streak-broken');
    await page.screenshot({ path: `${shots}${lang}-streak-broken.png`, fullPage: true });
    await page.locator('.streak-broken .btn-primary').click();
    await page.waitForSelector('.streak-card');
    assert.match(await page.textContent('.streak-card'), /12/);
    assert.equal(await page.locator('.streak-broken').count(), 0);
  });

  await check(`${lang}: settings, backup export + restore, reminder, numbers page, reset`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/settings`);
    await page.waitForSelector('.screen h1');
    await page.screenshot({ path: `${shots}${lang}-settings.png`, fullPage: true });
    // accent + reduced motion
    await page.getByRole('button', { name: T('תמיד זהב', 'Always gold') }).click();
    await page.getByRole('button', { name: T('פעיל', 'On'), exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduce');
    await page.getByRole('button', { name: T('לפי המכשיר', 'Follow device') }).click();
    await page.getByRole('button', { name: T('לפי הדרגה שלי', 'Follows my rank') }).click();
    // export
    const before = await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; });
    assert.ok(before > 0, 'workouts exist from earlier checks');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.row', { hasText: T('ייצוא גיבוי', 'Export backup') }).click()]);
    assert.match(dl.suggestedFilename(), /^demigod-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await dl.path();
    const { readFileSync, writeFileSync } = await import('node:fs');
    const text = readFileSync(path, 'utf8');
    const parsed = JSON.parse(text);
    assert.equal(parsed.format, 'demigod-backup');
    assert.equal(parsed.data.workouts.length, before);
    await page.waitForSelector('.toast');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('dg.settings')).lastExportAt > 0), 'export time saved');
    // damaged file is refused and nothing changes
    const bad = JSON.parse(text); bad.data.game.xp += 1;
    const badPath = `${path}.bad.json`; writeFileSync(badPath, JSON.stringify(bad));
    await page.locator('[data-testid="import-file"]').setInputFiles(badPath);
    await page.waitForSelector('.toast');
    assert.equal(await page.locator('.sheet').count(), 0);
    assert.equal(await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; }), before);
    // not a backup at all
    const junkPath = `${path}.junk.json`; writeFileSync(junkPath, '{"hello":1}');
    await page.locator('[data-testid="import-file"]').setInputFiles(junkPath);
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.sheet').count(), 0);
    // merge into existing data changes nothing (same ids)
    await page.locator('[data-testid="import-file"]').setInputFiles(path);
    await page.waitForSelector('.sheet');
    await page.screenshot({ path: `${shots}${lang}-import-sheet.png` });
    await page.locator('.sheet .row', { hasText: T('מיזוג', 'Merge') }).click();
    await page.waitForLoadState('load');
    await page.waitForSelector('.tabbar');
    assert.equal(await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; }), before);
    // reminder card: pretend the last backup was 40 days ago
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('dg.settings')); s.lastExportAt = Date.now() - 40 * 86400000; s.reminderSnoozedUntil = null; localStorage.setItem('dg.settings', JSON.stringify(s)); });
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('.backup-reminder');
    await page.screenshot({ path: `${shots}${lang}-backup-reminder.png` });
    await page.locator('.backup-reminder .btn-secondary').click();
    assert.equal(await page.locator('.backup-reminder').count(), 0);
    await page.reload(); await page.waitForSelector('main .btn-primary');
    assert.equal(await page.locator('.backup-reminder').count(), 0, 'snoozed');
    // numbers page
    await page.goto(`${base}#/numbers`);
    await page.waitForSelector('.numbers .card');
    assert.ok((await page.locator('.numbers .card').count()) >= 6);
    assert.match(await page.textContent('.numbers'), lang === 'he' ? /Liftoff|דרגות/ : /Verified about Liftoff/);
    await page.screenshot({ path: `${shots}${lang}-numbers.png`, fullPage: true });
    // reset needs the typed word, then restore from the backup on the first screen
    await page.goto(`${base}#/settings`);
    await page.locator('.row', { hasText: T('איפוס האפליקציה', 'Reset the app') }).click();
    await page.waitForSelector('.sheet input');
    assert.ok(await page.locator('.sheet .btn-danger').isDisabled());
    await page.fill('.sheet input', T('לא', 'nope'));
    assert.ok(await page.locator('.sheet .btn-danger').isDisabled());
    await page.fill('.sheet input', T('איפוס', 'RESET'));
    await page.locator('.sheet .btn-danger').click();
    await page.waitForSelector('.ob-step', { timeout: 8000 });
    assert.equal(await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; }), 0);
    await page.screenshot({ path: `${shots}${lang}-after-reset.png` });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: T('יש לי כבר גיבוי', 'I already have a backup') }).click()]);
    await chooser.setFiles(path);
    await page.waitForSelector('.sheet');
    await page.locator('.sheet .row', { hasText: T('מיזוג', 'Merge') }).click();
    await page.waitForSelector('.tabbar', { timeout: 8000 });
    const after = await page.evaluate(async () => { const { dbAll, dbGet } = await import('./src/ui/db.js'); return { w: (await dbAll('workouts')).length, p: (await dbGet('profile', 'me'))?.name, g: (await dbGet('game', 'me'))?.xp }; });
    assert.equal(after.w, before);
    assert.equal(after.p, parsed.data.profile.name);
    assert.equal(after.g, parsed.data.game.xp);
  });

  await check(`${lang}: accessibility basics (names, labels, language, landmarks)`, async () => {
    for (const r of ['workout', 'exercises', 'ranks', 'shop', 'profile', 'settings', 'numbers', 'history']) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main h1');
      const bad = await page.evaluate(() => {
        const out = [];
        const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.textContent || el.getAttribute('title') || '').trim();
        document.querySelectorAll('button, a[href]').forEach((el) => { if (!name(el) && !el.querySelector('img[alt]:not([alt=""])')) out.push(`unnamed ${el.tagName}.${el.className}`); });
        document.querySelectorAll('input:not([type=hidden]), select, textarea').forEach((el) => { if (!el.getAttribute('aria-label') && !el.id && !el.closest('label') && !el.getAttribute('aria-labelledby')) out.push(`unlabelled input.${el.className}`); });
        document.querySelectorAll('img').forEach((el) => { if (!el.hasAttribute('alt')) out.push('img without alt'); });
        if (!document.documentElement.lang) out.push('no lang');
        if (!document.querySelector('main')) out.push('no main');
        if (document.querySelectorAll('h1').length !== 1) out.push(`h1 count ${document.querySelectorAll('h1').length}`);
        return out;
      });
      assert.deepEqual(bad, [], `route ${r}`);
    }
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
    await page.waitForSelector('.sheet .row', { timeout: 5000 });
    await ctx.setOffline(false);
  });
  await ctx.close();
}

await check('no console errors', async () => assert.deepEqual(errors, []));
await browser.close();
server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('UI smoke: all passed');
