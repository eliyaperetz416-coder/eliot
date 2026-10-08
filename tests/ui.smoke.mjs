// Playwright smoke test at 390x844, Hebrew + English. Saves screenshots to docs/stage-N/ (STAGE env, default 3).
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createFakeCrew } from './fake-crew.mjs';

const shots = new URL(`../docs/stage-${process.env.STAGE ?? 3}/`, import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ROUTES = ['workout', 'exercises', 'exercise/barbell-bench-press-medium-grip', 'exercise/plank', 'ranks', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'requests', 'calendar', 'crew', 'profile', 'history', 'kit', 'ranks-preview'];
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
  await page.waitForSelector('.choose-other');
  await page.click('.choose-other');
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

  await check(`${lang}: exercise library lists 301 and searches (incl. gym slang)`, async () => {
    await page.goto(`${base}#/exercises`);
    await page.waitForSelector('.ex-row');
    assert.equal(await page.locator('.ex-row').count(), 301);
    await page.fill('.search-input', L(lang, 'דדליפט רומני', 'romanian'));
    await page.waitForTimeout(400);
    const n = await page.locator('.ex-row').count();
    assert.ok(n >= 1 && n < 20, `rows after search: ${n}`);
    for (const [q, want] of [['מקרבים', /קירוב|Adductor/], ['הולובאדי', /הולו|Hollow/]]) {
      await page.fill('.search-input', q);
      await page.waitForTimeout(400);
      assert.match(await page.locator('.ex-row').first().textContent(), want, q);
    }
    await page.locator('.ex-row').first().click();
    await page.waitForSelector('.ex-title');
    assert.match(await page.textContent('.steps'), /./);
    await page.goBack();
    await page.waitForSelector('.search-input');
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
    await page.goto(`${base}#/ranks`);
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
    await page.goto(`${base}#/ranks`);
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
    await page.waitForSelector('.choose-other');
    await page.click('.choose-other');
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
    assert.equal(await page.locator('.cosmetic').count(), 22);
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

  await check(`${lang}: finish with unticked sets, rename exercise, missing-exercise request`, async () => {
    const T = (he, en) => L(lang, he, en);
    // numbers typed but the V never tapped: finishing must still work and keep the data
    await page.goto(`${base}#/workout`);
    await startEmpty(page);
    assert.ok(await page.locator('.sheet .missing-btn').isVisible(), 'picker offers "can\'t find it"');
    await addExercise(page, 'barbell bench press');
    const row = page.locator('.ent-card .set-row').first();
    await row.locator('.set-input').nth(0).fill('60');
    await row.locator('.set-input').nth(1).fill('8');
    await page.locator('.live-head .btn').click();
    await page.waitForSelector('.sheet');
    assert.match(await page.textContent('.sheet'), /1/);
    await page.screenshot({ path: `${shots}${lang}-finish-unticked.png` });
    await page.locator('.sheet .btn-primary').click();
    await page.waitForSelector('main .stats-grid', { timeout: 8000 });
    assert.equal(await page.evaluate(() => location.hash), '#/result');
    // rename (current language only), persists, can be reset
    const id = 'barbell-bench-press-medium-grip';
    await page.goto(`${base}#/exercise/${id}`);
    const before = await page.textContent('.ex-title');
    await page.getByRole('button', { name: T('שינוי שם תרגיל', 'Rename exercise') }).click();
    await page.fill('#rename-input', 'My Bench');
    await page.locator('.sheet .btn-primary').click();
    await page.waitForFunction(() => document.querySelector('.ex-title')?.textContent === 'My Bench');
    await page.reload();
    await page.waitForFunction(() => document.querySelector('.ex-title')?.textContent === 'My Bench');
    await page.goto(`${base}#/exercises`);
    await page.fill('.search-input', 'My Bench');
    await page.waitForTimeout(350);
    assert.ok((await page.locator('.ex-row, .row').filter({ hasText: 'My Bench' }).count()) > 0, 'search finds the new name');
    await page.goto(`${base}#/exercise/${id}`);
    await page.getByRole('button', { name: T('שינוי שם תרגיל', 'Rename exercise') }).click();
    await page.locator('.sheet .btn-ghost').click();
    await page.waitForFunction((b) => document.querySelector('.ex-title')?.textContent === b, before);
    // missing exercise request
    await page.goto(`${base}#/exercises`);
    await page.locator('.missing-btn').click();
    await page.waitForSelector('.sheet .row');
    await page.locator('.sheet .row', { hasText: T('לבקש מ-Claude', 'Ask Claude') }).click();
    await page.waitForSelector('#req-name');
    await page.click('main .btn-primary');
    await page.waitForSelector('.field-error');
    await page.fill('#req-name', 'Hammer Strength Chest Press');
    await page.fill('#req-links', 'https://youtu.be/abc123\nnot a link\nhttps://example.com/v2');
    await page.click('main .btn-primary');
    await page.waitForSelector('.req-card');
    assert.equal(await page.getByRole('button', { name: T('שלח בוואטסאפ', 'Send on WhatsApp') }).count(), 1);
    const msg = await page.inputValue('#req-message');
    assert.ok(msg.includes('Hammer Strength Chest Press') && msg.includes('https://youtu.be/abc123') && msg.includes('https://example.com/v2') && !msg.includes('not a link'));
    await page.screenshot({ path: `${shots}${lang}-requests.png`, fullPage: true });
    await page.reload();
    await page.waitForSelector('.req-card');
  });

  await check(`${lang}: saved workout with a planned weight starts with that weight`, async () => {
    await page.goto(`${base}#/workout`);
    const entryId = 'e-weight-test', rid = 'r-weight-test';
    await page.evaluate(async ({ entryId, rid }) => {
      const { dbPut } = await import('./src/ui/db.js');
      await dbPut('routines', { id: rid, schemaVersion: 1, name: 'Weight test', folderId: null, notes: '', createdMs: Date.now(), updatedMs: Date.now(), entries: [{ id: entryId, exerciseId: 'barbell-bench-press-medium-grip', sets: 3, repsMin: 6, repsMax: 8, restSec: 90, weight: null, notes: '' }] });
    }, { entryId, rid });
    await page.reload();
    await page.goto(`${base}#/routine/${rid}`);
    await page.waitForSelector(`#rw-${entryId}`);
    await page.fill(`#rw-${entryId}`, '62.5');
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForSelector(`#rw-${entryId}`);
    assert.equal(await page.inputValue(`#rw-${entryId}`), '62.5');
    await page.screenshot({ path: `${shots}${lang}-routine-weight.png`, fullPage: true });
    await page.locator('main .btn-primary').first().click();
    await page.waitForSelector('.set-row');
    assert.equal(await page.locator('.set-row .set-input').first().inputValue(), '62.5');
    await page.evaluate(async () => { const { dbDelete, dbAll } = await import('./src/ui/db.js'); await dbDelete('draft', 'current'); for (const r of await dbAll('routines')) if (r.id === 'r-weight-test') await dbDelete('routines', r.id); localStorage.removeItem('dg.draft'); });
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('main .btn-primary');
  });

  await check(`${lang}: you type the total weight; plates per side are worked out (bar 20 by default, leg press sled set by you)`, async () => {
    const T = (he, en) => L(lang, he, en);
    await page.goto(`${base}#/exercise/barbell-bench-press-medium-grip`);
    await page.waitForSelector('.weight-tip');
    assert.match(await page.textContent('.weight-tip'), /20/);
    await page.goto(`${base}#/workout`);
    await startEmpty(page);
    await addExercise(page, 'barbell bench press');
    const chip = page.locator('.weight-chip');
    assert.ok((await chip.textContent()).includes('20'), 'standard bar by default');
    const row = page.locator('.ent-card .set-row').first();
    await row.locator('.set-input').nth(0).fill('100');
    await page.waitForFunction(() => /20 \+ 20/.test(document.querySelector('.set-plates')?.textContent ?? ''));
    assert.ok((await page.textContent('.set-plates')).includes('40'), '40 a side');
    await row.locator('.set-input').nth(1).fill('8');
    await row.locator('.set-v').click();
    await page.waitForTimeout(250);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dg.draft')).entries[0].sets[0].weight);
    assert.equal(stored, 100, 'the set stores exactly what you typed');
    // a lighter bar changes the plates, not the weight
    await chip.click();
    await page.waitForSelector('#wb-input');
    await page.screenshot({ path: `${shots}${lang}-weight-sheet.png` });
    await page.fill('#wb-input', '10');
    await page.locator('.sheet .btn-primary').click();
    await page.waitForFunction(() => /45/.test(document.querySelector('.set-plates')?.textContent ?? ''));
    assert.equal(await page.locator('.ent-card .set-row .set-input').first().inputValue(), '100');
    await page.screenshot({ path: `${shots}${lang}-plates.png` });
    await page.locator('.weight-chip').click();
    await page.waitForSelector('#wb-input');
    await page.fill('#wb-input', '');
    await page.locator('.sheet .btn-primary').click();
    await page.waitForFunction(() => /20 \+ 20/.test(document.querySelector('.set-plates')?.textContent ?? ''));
    // dumbbells: per hand, no base field
    await page.evaluate(async () => { const { dbDelete } = await import('./src/ui/db.js'); await dbDelete('draft', 'current'); localStorage.removeItem('dg.draft'); });
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('main .btn-primary');
    await startEmpty(page);
    await addExercise(page, 'dumbbell curl');
    const dchip = page.locator('.weight-chip').first();
    assert.ok((await dchip.textContent()).includes(T('לכל יד', 'per hand')));
    await dchip.click();
    await page.waitForSelector('.sheet');
    assert.equal(await page.locator('#wb-input').count(), 0);
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { const { dbDelete } = await import('./src/ui/db.js'); await dbDelete('draft', 'current'); localStorage.removeItem('dg.draft'); });
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('main .btn-primary');
  });

  await check(`${lang}: planned weight goes up by itself after a heavier workout (and can be switched off)`, async () => {
    const T = (he, en) => L(lang, he, en);
    const rid = 'r-auto-test', eid = 'e-auto-test';
    const readW = () => page.evaluate(async (rid) => { const { dbGet } = await import('./src/ui/db.js'); return (await dbGet('routines', rid)).entries[0].weight; }, rid);
    const lift = async (kg) => {
      await page.goto(`${base}#/routine/${rid}`);
      await page.waitForSelector('.set-row, main .btn-primary');
      await page.locator('main .btn-primary').first().click();
      await page.waitForSelector('.set-row');
      assert.equal(await page.locator('.set-row .set-input').first().inputValue(), String(await readW()), 'starts with the planned weight');
      const row = page.locator('.ent-card .set-row').first();
      await row.locator('.set-input').nth(0).fill(String(kg));
      await row.locator('.set-input').nth(1).fill('5');
      await row.locator('.set-v').click();
      await page.waitForTimeout(200);
      await page.locator('.live-head .btn').click();
      await page.waitForSelector('.sheet .btn-primary');
      await page.locator('.sheet .btn-primary').first().click();
      await page.waitForSelector('main .stats-grid', { timeout: 8000 });
    };
    await page.goto(`${base}#/workout`);
    await page.evaluate(async ({ rid, eid }) => {
      const { dbPut } = await import('./src/ui/db.js');
      await dbPut('routines', { id: rid, schemaVersion: 1, name: 'Auto test', folderId: null, notes: '', createdMs: Date.now(), updatedMs: Date.now(), entries: [{ id: eid, exerciseId: 'barbell-bench-press-medium-grip', sets: 1, repsMin: 5, repsMax: 5, restSec: 90, weight: 40, notes: '' }] });
    }, { rid, eid });
    await page.reload();
    await lift(45);
    assert.ok(await page.locator('.routine-update').count() > 0, 'result shows the update');
    await page.screenshot({ path: `${shots}${lang}-routine-updated.png`, fullPage: true });
    assert.equal(await readW(), 45);
    await lift(42);                                   // lighter day: nothing changes
    assert.equal(await page.locator('.routine-update').count(), 0);
    assert.equal(await readW(), 45);
    await page.evaluate(async () => { const m = await import('./src/ui/storage.js'); await m.updateSettings({ autoRoutineWeight: false }); });
    await lift(50);                                   // switched off: stays 45
    assert.equal(await page.locator('.routine-update').count(), 0);
    assert.equal(await readW(), 45);
    await page.evaluate(async () => { const m = await import('./src/ui/storage.js'); await m.updateSettings({ autoRoutineWeight: true }); const { dbDelete } = await import('./src/ui/db.js'); await dbDelete('routines', 'r-auto-test'); });
    await page.goto(`${base}#/settings`);
    await page.getByRole('button', { name: T('העלאה אוטומטית', 'Raise automatically') }).waitFor();
  });

  await check(`${lang}: training calendar shows today, opens the day, month arrows are limited`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/calendar`);
    await page.waitForSelector('.cal-grid');
    await page.screenshot({ path: `${shots}${lang}-calendar.png`, fullPage: true });
    assert.equal(await page.locator('.cal-head span').count(), 7);
    const on = page.locator('.cal-cell.on');
    assert.ok((await on.count()) >= 1, 'a trained day is filled');
    assert.ok(await page.locator('.cal-cell.today').count() === 1);
    assert.ok(await page.locator('.cal-next').isDisabled(), 'cannot go past the current month');
    assert.ok(await page.locator('.cal-prev').isDisabled(), 'cannot go before the first workout month');
    await on.first().click();
    await page.waitForSelector('.sheet .row');
    await page.locator('.sheet .row').first().click();
    await page.waitForFunction(() => location.hash.startsWith('#/history/'));
    await page.goto(`${base}#/profile`);
    await page.getByText(T('לוח אימונים', 'Training calendar')).first().click();
    await page.waitForSelector('.cal-grid');
  });

  await check(`${lang}: crew (friends): create, join, leaderboard, status + chat, unread dot, errors, leave`, async () => {
    const T = (he, en) => L(lang, he, en);
    const fake = createFakeCrew();
    await fake.install(ctx);
    // a second friend on another phone
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'he' ? 'he-IL' : 'en-US', serviceWorkers: 'block' });
    await fake.install(ctx2);
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => errors.push(`crew friend: ${e.message}`));
    await onboard(p2, lang, `crew2-${lang}`);
    try {
      // me: create the crew
      await page.goto(`${base}#/crew`);
      await page.waitForSelector('#crew-nick');
      await page.screenshot({ path: `${shots}${lang}-crew-start.png`, fullPage: true });
      await page.getByRole('button', { name: T('יצירת קבוצה', 'Create a crew') }).click();
      await page.fill('#crew-name', 'Gym bros'); await page.fill('#crew-nick', 'Elia');
      await page.getByRole('button', { name: T('צור את הקבוצה', 'Create the crew') }).click();
      await page.waitForSelector('.crew-code', { state: 'attached' });
      const code = await page.textContent('.crew-code');
      assert.equal(code.length, 6);
      // a bad code and a taken nickname on the friend's phone
      await p2.goto(`${base}#/crew`); await p2.waitForSelector('#crew-code');
      await p2.fill('#crew-code', 'ZZZZZZ'); await p2.fill('#crew-nick', 'Dan');
      await p2.getByRole('button', { name: T('הצטרף', 'Join'), exact: true }).click();
      await p2.waitForSelector('.field-error:not([hidden])');
      assert.ok((await p2.textContent('.field-error')).includes(T('אין קבוצה', 'No crew')));
      await p2.fill('#crew-code', code.toLowerCase()); await p2.fill('#crew-nick', 'elia');
      await p2.getByRole('button', { name: T('הצטרף', 'Join'), exact: true }).click();
      await p2.waitForFunction(() => /כבר בשימוש|already used/.test(document.querySelector('.field-error')?.textContent ?? ''));
      await p2.fill('#crew-nick', 'Dan');
      await p2.getByRole('button', { name: T('הצטרף', 'Join'), exact: true }).click();
      await p2.waitForSelector('#crew-say'); // chat is the first thing you see
      // the board shows both, I am marked
      await p2.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      await p2.waitForFunction(() => document.querySelectorAll('.crew-row').length === 2);
      // friend posts a status and a chat message
      await p2.getByRole('button', { name: new RegExp(T("צ'אט", 'Chat')) }).click();
      await p2.waitForSelector('#crew-say');
      await p2.getByRole('button', { name: T('הולך להתאמן', 'Going to train') }).click();
      await p2.waitForFunction(() => document.querySelectorAll('.crew-msg').length === 1);
      await p2.fill('#crew-say', 'Legs today, who is in?'); await p2.keyboard.press('Enter');
      await p2.waitForFunction(() => document.querySelectorAll('.crew-msg').length === 2);
      // my phone: unread appears on the workout home and the profile tab, then clears when I open the feed
      await page.evaluate(async () => { const m = await import('./src/ui/crew-state.js'); await m.refreshUnread(); });
      await page.goto(`${base}#/workout`);
      await page.waitForSelector('.crew-unread');
      assert.ok((await page.textContent('.crew-unread')).includes('2'));
      assert.equal(await page.locator('.tab-dot').count(), 1);
      await page.goto(`${base}#/crew`);
      await page.waitForSelector('#crew-say');
      await page.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      await page.waitForSelector('.crew-board');
      assert.equal(await page.locator('.crew-row').count(), 2);
      assert.ok(await page.locator('.crew-row.me').count() === 1);
      await page.getByRole('button', { name: new RegExp(T("צ'אט", 'Chat')) }).click();
      await page.waitForFunction(() => document.querySelectorAll('.crew-msg').length === 2);
      await page.screenshot({ path: `${shots}${lang}-crew-feed.png`, fullPage: true });
      await page.getByRole('button', { name: T('הולך להתאמן', 'Going to train') }).click();
      await page.waitForFunction(() => document.querySelectorAll('.crew-msg.mine.status').length >= 1);
      await page.goto(`${base}#/workout`);
      assert.equal(await page.locator('.tab-dot').count(), 0, 'read: no dot');
      // my numbers are on the board, and nothing private is sent
      await page.goto(`${base}#/crew`);
      await page.waitForSelector('#crew-say');
      await page.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      await page.waitForSelector('.crew-board');
      const sent = fake.calls.filter((c) => c.name === 'update_stats').map((c) => Object.keys(c.args.p_stats));
      assert.ok(sent.length >= 1);
      for (const keys of sent) for (const k of keys) assert.ok(['level', 'streak', 'workouts', 'weekVolume', 'monthWorkouts', 'rating', 'tier', 'division'].includes(k), `unexpected shared field ${k}`);
      await page.locator('.crew-more summary').click();
      await page.waitForSelector('.crew-push h2');
      await page.screenshot({ path: `${shots}${lang}-crew-board.png`, fullPage: true });
      // sorting chips work
      await page.getByRole('button', { name: T('רמה', 'Level'), exact: true }).click();
      await page.waitForSelector('.crew-row');
      // friend profile + plan sharing (off until switched on)
      await page.evaluate(async () => { const { saveSchedule } = await import('./src/ui/store.js'); await saveSchedule({ days: { 0: { kind: 'rest' }, 1: { kind: 'activity', type: 'basketball' }, 2: { kind: 'workout', ref: 'free' } }, done: {} }); });
      await p2.goto(`${base}#/crew`);
      await p2.waitForSelector('#crew-say');
      await p2.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      await p2.locator('.crew-row', { hasText: 'Elia' }).click();
      await p2.waitForSelector('.crew-friend');
      assert.ok((await p2.textContent('.crew-friend')).match(/לא שיתף|not shared/), 'plan is private by default');
      assert.equal(await p2.locator('.crew-plan-row').count(), 0);
      await p2.keyboard.press('Escape');
      await page.reload();
      await page.waitForSelector('#crew-say');
      await page.locator('.crew-more summary').click();
      await page.locator('.crew-share .seg button', { hasText: T('פעיל', 'On') }).click();
      await page.waitForTimeout(400);
      assert.ok(fake.calls.some((c) => c.name === 'update_plan' && c.args.p_plan && c.args.p_plan.days), 'plan sent after switching on');
      const sentPlan = JSON.stringify(fake.calls.filter((c) => c.name === 'update_plan').map((c) => c.args.p_plan));
      assert.ok(!/weight|sets|exercise|bodyweight/i.test(sentPlan), 'no exercises or weights in the shared plan');
      await p2.reload();
      await p2.waitForSelector('#crew-say');
      await p2.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      await p2.locator('.crew-row', { hasText: 'Elia' }).click();
      await p2.waitForSelector('.crew-plan-row');
      assert.equal(await p2.locator('.crew-plan-row').count(), 7);
      assert.ok((await p2.textContent('.crew-friend')).match(/כדורסל|Basketball/));
      await p2.screenshot({ path: `${shots}${lang}-crew-friend.png` });
      await p2.keyboard.press('Escape');
      await page.locator('.crew-share .seg button', { hasText: T('כבוי', 'Off') }).click();
      await page.waitForTimeout(300);
      await page.evaluate(async () => { const { saveSchedule } = await import('./src/ui/store.js'); await saveSchedule({ days: {}, done: {} }); });
      // leaving
      await p2.goto(`${base}#/crew`);
      await p2.locator('.crew-more summary').click();
      await p2.getByRole('button', { name: T('עזוב את הקבוצה', 'Leave the crew') }).click();
      await p2.locator('.sheet .btn-danger').click();
      await p2.waitForSelector('#crew-code');
      await page.reload();
      await page.waitForSelector('#crew-say');
      await page.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      await page.waitForFunction(() => document.querySelectorAll('.crew-row').length === 1);
    } finally {
      await ctx2.close();
      await ctx.unroute(/supabase\.co\/rest\/v1\/rpc\//);
      await page.evaluate(async () => { const { dbPut } = await import('./src/ui/db.js'); await dbPut('kv', null, 'crew'); });
    }
  });

  await check(`${lang}: settings, backup export + restore, reminder, numbers page, reset`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/settings`);
    await page.waitForSelector('.screen h1');
    await page.screenshot({ path: `${shots}${lang}-settings.png`, fullPage: true });
    // accent + reduced motion
    await page.getByRole('button', { name: T('צבע קבוע', 'Fixed colour') }).click();
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

  await check(`${lang}: make-up workout for exercises you did not get to (one-time, nothing saved)`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    const routinesBefore = await page.evaluate(async () => (await (await import('./src/ui/db.js')).dbAll('routines')).length);
    await page.goto(`${base}#/workout`);
    await startEmpty(page);
    await addExercise(page, 'barbell bench press');
    await logSet(page, 0, 60, 8);
    await page.click('.live-actions .btn-secondary');
    await addExercise(page, 'barbell squat');
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-primary');
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('main .stats-grid');
    if (await page.locator('.rankup').count()) await page.click('.rankup button');
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.makeup-card');
    assert.ok((await page.textContent('.makeup-card')).includes(T('סקוואט', 'Squat')));
    await page.screenshot({ path: `${shots}${lang}-makeup.png` });
    await page.locator('.makeup-card .btn-primary').click();
    await page.waitForSelector('.live-head');
    assert.equal(await page.locator('.ent-card').count(), 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dg.draft')).routineId), null);
    // discard the make-up workout; the card is gone and no saved workout was created
    await page.click('.live-head .btn');
    await page.locator('.sheet .btn-danger').click();
    await page.locator('.sheet .btn-danger').last().click();
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.hero');
    assert.equal(await page.locator('.makeup-card').count(), 0);
    assert.equal(await page.evaluate(async () => (await (await import('./src/ui/db.js')).dbAll('routines')).length), routinesBefore);
  });

  await check(`${lang}: my role model: form, link check, Today card, remove`, async () => {
    const T = (he, en) => L(lang, he, en);
    await page.goto(`${base}#/profile`);
    await page.locator('.row', { hasText: T('המודל שלי', 'My role model') }).click();
    await page.waitForSelector('#model-name');
    await page.locator('.screen button.btn-primary').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.field-error')].some((e) => !e.hidden));
    await page.fill('#model-name', 'Harley Alexander');
    await page.fill('#model-note', 'Train like him');
    await page.fill('#model-youtube', 'https://youtube.com/@harleyalexanderr?si=abc');
    await page.fill('#model-tiktok', 'https://example.com/x');
    await page.locator('.screen button.btn-primary').click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('#model-tiktok').isVisible(), 'a bad link keeps you on the form');
    await page.fill('#model-tiktok', 'tiktok.com/@harleyalexander.fit?_r=1');
    await page.fill('#model-tips', 'Sleep 8 hours\nDrink water\nSleep 8 hours');
    // a workout from pasted text: known exercises are saved, unknown ones are listed
    await page.fill('#model-import', 'Name: Push day\n1. Barbell bench press - 4 x 6-8\n2. Holobody curls 3x12');
    await page.locator('.screen .btn-secondary', { hasText: T('יצירת אימון', 'Create workout') }).click();
    await page.waitForSelector('a[href^="#/routine/"]');
    assert.ok((await page.textContent('.screen')).match(/Harley Alexander: Push day|Push day/));
    assert.ok((await page.textContent('.screen')).includes('Holobody curls'));
    const imported = await page.evaluate(async () => (await (await import('./src/ui/db.js')).dbAll('routines')).filter((r) => /Push day/.test(r.name)).map((r) => [r.entries.length, r.entries[0].sets, r.entries[0].repsMin, r.entries[0].repsMax]));
    assert.deepEqual(imported, [[1, 4, 6, 8]]);
    await page.locator('.screen .chips-wrap .chip-select', { hasText: /^4$/ }).click();
    await page.screenshot({ path: `${shots}${lang}-model-form.png`, fullPage: true });
    await page.locator('.screen button.btn-primary').click();
    await page.waitForSelector('.model-card');
    assert.ok((await page.textContent('.model-card')).includes('Harley Alexander'));
    assert.equal(await page.locator('.model-link').first().getAttribute('href'), 'https://youtube.com/@harleyalexanderr');
    assert.equal(await page.locator('.model-link').count(), 2);
    assert.match(await page.textContent('.model-tip'), /Sleep 8 hours|Drink water/);
    assert.match(await page.textContent('.model-goal'), /\/ 4/);
    await page.screenshot({ path: `${shots}${lang}-model-card.png` });
    // the result screen quotes your model after a workout
    await page.goto(`${base}#/workout`);
    await startEmpty(page);
    await addExercise(page, 'barbell bench press');
    await logSet(page, 0, 60, 8);
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-primary');
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('main .stats-grid');
    assert.ok((await page.textContent('.model-quote')).includes('Harley Alexander'));
    if (await page.locator('.rankup').count()) await page.click('.rankup button');
    await page.goto(`${base}#/model`);
    await page.locator('.screen .btn-danger').click();
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.hero');
    assert.equal(await page.locator('.model-card').count(), 0);
    await page.evaluate(async () => { const db = await import('./src/ui/db.js'); for (const r of await db.dbAll('routines')) if (/Push day/.test(r.name)) await db.dbDelete('routines', r.id); });
    await page.reload();
  });

  await check(`${lang}: plan my week: several items a day (basketball + a saved workout), rest, done marks`, async () => {
    const T = (he, en) => L(lang, he, en);
    const openToday = async () => {
      await page.goto(`${base}#/schedule`);
      await page.waitForSelector('.sched-row.today');
      await page.locator('.sched-row.today').click();
      await page.waitForSelector('.sheet .chip-select');
    };
    await page.evaluate(async () => { const { dbPut } = await import('./src/ui/db.js'); await dbPut('routines', { id: 'r-sched', schemaVersion: 1, name: 'Sched Day A', folderId: null, notes: '', createdMs: 1, updatedMs: 1, entries: [{ id: 'e-s', exerciseId: 'barbell-bench-press-medium-grip', sets: 3, repsMin: 6, repsMax: 8, restSec: 90, weight: null, notes: '' }] }); });
    await page.reload();
    await openToday();
    await page.screenshot({ path: `${shots}${lang}-schedule-sheet.png` });
    // two items on the same day: basketball, then a saved workout
    await page.locator('.sheet .chip-select', { hasText: T('כדורסל', 'Basketball') }).click();
    await page.waitForSelector('.sheet .sched-item');
    await page.locator('.sheet .row', { hasText: 'Sched Day A' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .sched-item').length === 2);
    await page.locator('.sheet .btn-primary').last().click(); // Done
    await page.waitForFunction(() => /(כדורסל|Basketball).*\+.*Sched Day A/.test(document.querySelector('.sched-row.today')?.textContent ?? ''));
    await page.screenshot({ path: `${shots}${lang}-schedule.png`, fullPage: true });
    // Today: the saved workout leads the big card, basketball has its own card with a done button
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.sched-card');
    assert.ok((await page.textContent('.hero')).includes('Sched Day A'));
    assert.ok((await page.textContent('.hero-kicker')).match(/מתוכנן להיום|Planned for today/));
    assert.ok((await page.textContent('.sched-card')).match(/כדורסל|Basketball/));
    await page.locator('.sched-card .btn').click();
    await page.waitForFunction(() => document.querySelector('.week-day.today.on'));
    await page.screenshot({ path: `${shots}${lang}-schedule-home.png` });
    // rest replaces everything and has no done button
    await openToday();
    await page.locator('.sheet .row', { hasText: T('יום החלמה', 'Recovery day') }).click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .sched-item').length === 1);
    await page.locator('.sheet .btn-primary').last().click();
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.sched-card');
    assert.equal(await page.locator('.sched-card .btn').count(), 0);
    assert.ok(!(await page.textContent('.hero-kicker')).match(/מתוכנן להיום|Planned for today/), 'a rest day does not schedule a workout');
    // limit: four items, then the add options are replaced by a note
    await openToday();
    for (let i = 0; i < 4; i++) await page.locator('.sheet .chip-select').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .sched-item').length === 4);
    assert.equal(await page.locator('.sheet .chip-select').count(), 0);
    // clear the day
    await page.locator('.sheet .btn-ghost').click();
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('.hero');
    assert.equal(await page.locator('.sched-card').count(), 0);
    await page.evaluate(async () => { const { dbDelete } = await import('./src/ui/db.js'); await dbDelete('routines', 'r-sched'); });
    await page.reload();
  });

  await check(`${lang}: shop: app colour, title on the profile, rest sound preview, drachma boost`, async () => {
    const T = (he, en) => L(lang, he, en);
    await page.evaluate(async () => { const { store, saveGame } = await import('./src/ui/store.js'); await saveGame({ ...store.game, drachmas: 3000 }); });
    await page.goto(`${base}#/shop`);
    await page.waitForSelector('.shop-row');
    const rowOf = (name) => page.locator('.shop-row', { hasText: name });
    // theme: buy Crimson, equip, the accent changes
    await rowOf(T('ארגמן', 'Crimson')).locator('.btn').click();
    await page.waitForFunction(() => document.querySelector('.shop-row .btn[class*="btn-primary"]'));
    await rowOf(T('ארגמן', 'Crimson')).locator('.btn').click();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim().startsWith('255 77 94'));
    await page.screenshot({ path: `${shots}${lang}-shop-themes.png`, fullPage: true });
    // title: buy and equip, then it shows on the profile
    await rowOf(T('צייד חזרות', 'Rep Hunter')).locator('.btn').click();
    await page.waitForTimeout(250);
    await rowOf(T('צייד חזרות', 'Rep Hunter')).locator('.btn').click();
    await page.waitForTimeout(250);
    // sound: preview works without errors, buy and equip
    await rowOf(T('פעמון', 'Bell')).locator('.icon-btn').click();
    await rowOf(T('פעמון', 'Bell')).locator('.btn').last().click();
    await page.waitForTimeout(250);
    await rowOf(T('פעמון', 'Bell')).locator('.btn').last().click();
    await page.waitForTimeout(250);
    // drachma boost: buy and activate
    await rowOf(T('דחיפת דרכמות', 'Drachma Boost')).locator('.btn').last().click();
    await page.waitForFunction((n) => [...document.querySelectorAll('.shop-row')].some((r) => r.textContent.includes(n) && r.querySelectorAll('.btn').length === 2), T('דחיפת דרכמות', 'Drachma Boost'));
    await rowOf(T('דחיפת דרכמות', 'Drachma Boost')).locator('.btn').first().click();
    await page.waitForFunction(() => /(פעיל לאימון הבא|Active for the next workout)/.test(document.body.textContent));
    const inv = await page.evaluate(async () => (await import('./src/ui/store.js')).store.game.inventory);
    assert.equal(inv.equipped.theme, 'th_crimson'); assert.equal(inv.equipped.title, 'ti_rep'); assert.equal(inv.equipped.sound, 'sd_bell'); assert.equal(inv.boostActive, true);
    await page.goto(`${base}#/profile`);
    await page.waitForSelector('.profile-title');
    assert.ok((await page.textContent('.profile-title')).includes(T('צייד חזרות', 'Rep Hunter')));
    // back to the default colour for the other checks
    await page.evaluate(async () => { const { store, saveGame } = await import('./src/ui/store.js'); const g = structuredClone(store.game); g.inventory.equipped.theme = null; g.inventory.boostActive = false; await saveGame(g); });
  });

  await check(`${lang}: every sub-screen has a back link`, async () => {
    const subs = ['exercise/plank', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'requests', 'calendar', 'crew', 'history', 'history/nope', 'routine/nope', 'plan/nope', 'exercise/nope', 'ranks-preview', 'model', 'schedule'];
    for (const r of subs) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main');
      assert.ok(await page.locator('main .back-link').count() >= 1, `no back link on #/${r}`);
    }
    for (const r of ['workout', 'exercises', 'ranks', 'profile']) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main');
      assert.equal(await page.locator('main > .back-link').count(), 0, `unexpected back link on tab root #/${r}`);
    }
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
    await page.click('.choose-other');
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
