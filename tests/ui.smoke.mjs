// Playwright smoke test at 390x844, Hebrew + English. Saves screenshots to docs/stage-N/ (STAGE env, default 3).
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createFakeCrew } from './fake-crew.mjs';
import { installFakeSupabase } from './fake-supabase.mjs';

const shots = new URL(`../docs/stage-${process.env.STAGE ?? 3}/`, import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ROUTES = ['wods', 'wod/fran', 'weakest', 'workout', 'workouts', 'exercises', 'exercise/barbell-bench-press-medium-grip', 'exercise/plank', 'ranks', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'privacy', 'requests', 'calendar', 'crew', 'profile', 'history', 'kit', 'ranks-preview'];
const errors = [];
let failed = 0;
const ONLY = process.env.ONLY;
const check = (name, fn) => (ONLY && !name.includes(ONLY) && !name.includes('onboarding') ? Promise.resolve() : fn()).then(() => console.log('ok  ', name), (e) => { failed++; console.error('FAIL', name, '-', e.message.split('\n')[0], (e.stack.match(/ui\.smoke\.mjs:\d+/) ?? [''])[0]); });
const L = (lang, he, en) => (lang === 'he' ? he : en);

async function onboard(page, lang, shotPrefix) {
  const shot = (n) => (shotPrefix ? page.screenshot({ path: `${shots}${shotPrefix}-onb-${n}.png` }) : null);
  const head = (he, en) => page.waitForSelector(`.ob-title:text-is("${L(lang, he, en)}")`);
  await page.goto(base);
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('#google');
  await page.waitForTimeout(300);
  await shot('1-signin');
  assert.ok(await page.locator('#google').isDisabled(), 'Google waits for the consent box');
  await page.check('#consent');
  await page.click('#google'); // the fake Auth server sends us back signed in
  await page.waitForSelector('#ob-name');
  assert.equal(await page.inputValue('#ob-name'), 'Test', 'first name from the Google account');
  // "about you": name, curve, weight and age on one screen
  for (const sel of ['#ob-name', '.seg', '#ob-weight', '#ob-age']) assert.equal(await page.locator(sel).count(), 1, `${sel} on the about screen`);
  await page.fill('#ob-name', '');
  await page.click('.ob-actions .btn-primary'); // empty -> validation errors, nothing moves on
  await page.waitForSelector('.field-error:visible');
  assert.equal(await page.locator('#ob-name').count(), 1);
  await page.fill('#ob-name', 'Elia');
  await page.click('.seg button >> nth=0');
  assert.equal(await page.getAttribute('.seg button >> nth=0', 'aria-pressed'), 'true', 'the chosen curve is marked');
  await page.fill('#ob-weight', '82,5');
  await page.fill('#ob-age', '30');
  assert.equal(await page.locator('.field-error:visible').count(), 0, 'errors clear while typing');
  await shot('2-about');
  await page.click('.ob-actions .btn-primary');
  await page.waitForSelector('.ob-goal');
  await shot('5-goal');
  await page.click('.seg button >> nth=3');
  assert.equal(await page.getAttribute('.seg button >> nth=3', 'aria-pressed'), 'true', 'the chosen goal is marked');
  assert.equal(await page.locator('.seg button[aria-pressed="true"]').count(), 1);
  assert.equal(await page.textContent('.ob-goal'), '4');
  await page.click('.ob-actions .btn-primary');
  await head('מתקינים את Demigod', 'Install Demigod');
  await shot('6-install');
  await page.click('.ob-actions .btn-ghost');
  await head('להתריע כשהמנוחה נגמרת?', 'Alert you when the rest is over?');
  await shot('7-notify');
  await page.click('.ob-actions .btn-ghost');
  await page.waitForSelector('.tour-list');
  await page.waitForTimeout(400);
  await shot('8-tour');
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
  const reqFake = createFakeCrew(); // the exercise-request inbox never reaches the real server in tests
  const account = await installFakeSupabase(ctx);
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/(submit_exercise_request|my_exercise_requests)/, reqFake.handle);
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`${lang}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${lang}: ${e.message}`));

  await check(`${lang}: onboarding (sign-in with consent, "about you" on one screen, profile persists and uploads)`, async () => {
    await page.goto(base);
    await page.waitForSelector('html[data-ready="1"]');
    assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
    assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'he' ? 'rtl' : 'ltr');
    assert.equal(await page.locator('.tabbar').count(), 0, 'no tab bar during onboarding');
    await onboard(page, lang, lang);
    assert.equal(await page.evaluate(async () => (await import('./src/ui/storage.js')).getSettings().weeklyGoal), 4, 'the goal from the first run');
    await page.waitForTimeout(3600); // the debounced first upload
    assert.ok(account.uploads.length >= 1, 'the profile was uploaded');
    assert.equal(account.uploads[0].consent_version, '2026-12');
    assert.equal(account.uploads.at(-1).data.profile.name, 'Elia');
    await page.reload();
    await page.waitForSelector('html[data-ready="1"]');
    await page.waitForSelector('.tabbar');
    assert.equal(await page.locator('.onboarding').count(), 0);
  });

  await check(`${lang}: Today (crest, week, next workout row, bell, quests, still under reduced motion)`, async () => {
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.today-crest .emblem svg');
    assert.equal(await page.locator('.today-week .day').count(), 7);
    assert.equal(await page.locator('.today-week .day.today').count(), 1);
    assert.equal(await page.locator('.today-next').count(), 0, 'nothing planned yet: no next-workout row');
    assert.equal(await page.locator('.today-bell .bell-dot').count(), 0, 'nothing new: no dot on the bell');
    assert.ok(await page.locator('.today-start.choose-other').count() === 1, 'start opens the chooser while nothing is planned');
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .bell-list');
    await page.keyboard.press('Escape');
    await page.click('.today-quests');
    await page.waitForSelector('.sheet .quests');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${lang}-today-dark.png` });
    await page.evaluate(async () => { const s = await import('./src/ui/storage.js'); await s.updateSettings({ theme: 'marble' }); });
    await page.reload(); await page.waitForSelector('.today-crest');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'marble');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${lang}-today-marble.png` });
    await page.evaluate(async () => { const s = await import('./src/ui/storage.js'); await s.updateSettings({ theme: 'dark', reducedMotion: true }); });
    await page.reload(); await page.waitForSelector('.today-crest');
    await page.waitForTimeout(300);
    const moving = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => `${a.animationName ?? a.transitionProperty} on ${a.effect?.target?.className?.baseVal ?? a.effect?.target?.className}`));
    assert.equal(moving.join(', '), '', `nothing moves with reduced motion: ${moving.join(', ')}`);
    await page.evaluate(async () => { const s = await import('./src/ui/storage.js'); await s.updateSettings({ reducedMotion: false }); });
    await page.reload(); await page.waitForSelector('.today-crest');
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

  await check(`${lang}: exercise library lists 320 and searches (incl. gym slang)`, async () => {
    await page.goto(`${base}#/exercises`);
    await page.waitForSelector('.ex-row');
    assert.equal(await page.locator('.ex-row').count(), 320);
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
    assert.equal(await page.locator('.group-row').count(), 11);
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
    // the Workouts screen: four small tiles, a "+" with three choices, the hint only while there is nothing saved
    assert.equal(await page.locator('.wk-tiles a').count(), 4);
    const rows0 = await page.locator('.routine-row').count();
    assert.equal(await page.locator('.wk-hint').count(), rows0 ? 0 : 1, 'hint only with no saved workouts');
    await page.click('.wk-add');
    await page.waitForSelector('.sheet .row');
    assert.equal(await page.locator('.sheet .row').count(), 3, 'new / from a template / new folder');
    await page.locator('.sheet .row', { hasText: L(lang, 'אימון חדש', 'New workout') }).click();
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
    assert.equal(await page.locator('.wk-hint').count(), 0, 'no hint once something is saved');
    await page.screenshot({ path: `${shots}${lang}-routines.png`, fullPage: true });
    // templates
    await page.click('.wk-add');
    await page.locator('.sheet .row', { hasText: L(lang, 'מתבנית מוכנה', 'From a template') }).click();
    await page.waitForSelector('.sheet .row');
    await page.locator('.sheet .row').first().click(); // PPL: 3 workouts in a folder
    await page.waitForFunction(() => document.querySelectorAll('.routine-row').length >= 4);
    assert.equal(await page.locator('.routine-row').count(), 4);
    const tall = await page.evaluate(() => [...document.querySelectorAll('.routine-row')].map((r) => r.getBoundingClientRect().height).filter((x) => x > 72));
    assert.deepEqual(tall, [], 'each saved workout is one line');
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
    await page.waitForSelector('.today-next.plan-next');
    await page.screenshot({ path: `${shots}${lang}-workout-plan-next.png`, fullPage: true });
    assert.match(await page.textContent('.today-next.plan-next'), /2/);
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
    await page.waitForSelector('.today-quests');
    assert.ok(await page.locator('.today-top .today-ring').count() === 1 && await page.locator('.today-top .today-stat').count() === 2, 'level, streak and drachmas on top');
    await page.click('.today-quests');
    await page.waitForSelector('.sheet .quests');
    assert.equal(await page.locator('.quest').count(), 4, '3 daily quests and 1 weekly');
    assert.ok(await page.locator('.streak-card').count() === 1);
    const claim = page.locator('.quest .btn-primary');
    if (await claim.count()) { await claim.first().click(); await page.waitForSelector('.toast'); assert.ok(await page.locator('.quest.claimed').count() >= 1); }
    await page.screenshot({ path: `${shots}${lang}-workout-game.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
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
    await page.locator('.cosmetic').first().locator('.btn').first().click(); // equip
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
    await page.waitForSelector('.today-quests .quest-dot');
    await page.click('.today-quests');
    await page.waitForSelector('.sheet .streak-broken');
    await page.screenshot({ path: `${shots}${lang}-streak-broken.png`, fullPage: true });
    await page.locator('.streak-broken .btn-primary').click();
    await page.waitForSelector('.streak-card');
    assert.match(await page.textContent('.streak-card'), /12/);
    assert.equal(await page.locator('.streak-broken').count(), 0);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
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
    await page.waitForSelector('.req-status.req-new'); // sent to the inbox
    assert.equal(reqFake.reqInbox.length, 1);
    assert.deepEqual(reqFake.reqInbox[0].links, ['https://youtu.be/abc123', 'https://example.com/v2']);
    reqFake.reqInbox[0].status = 'added'; // Claude added it: the app shows that the next time the screen opens
    await page.goto(`${base}#/exercises`); await page.goto(`${base}#/requests`);
    await page.waitForSelector('.req-status.req-added');
    assert.equal(await page.getByRole('button', { name: T('שלח בוואטסאפ', 'Send on WhatsApp') }).count(), 1);
    const msg = await page.inputValue('#req-message');
    assert.ok(msg.includes('Hammer Strength Chest Press') && msg.includes('https://youtu.be/abc123') && msg.includes('https://example.com/v2') && !msg.includes('not a link'));
    await page.screenshot({ path: `${shots}${lang}-requests.png`, fullPage: true });
    await page.reload();
    await page.waitForSelector('.req-card');
  });

  await check(`${lang}: benchmark workouts (WODs): list, info, timer survives a reload, score, personal best, history, rank bonus`, async () => {
    const T = (he, en) => L(lang, he, en);
    await page.goto(`${base}#/wods`);
    await page.waitForSelector('.wod-card');
    assert.equal(await page.locator('.wod-card').count(), 29);
    await page.locator('.wod-card', { hasText: 'Fran' }).getByRole('button', { name: T('מידע', 'Info') }).click();
    await page.waitForSelector('.sheet .wod-info');
    const info = await page.textContent('.sheet .wod-info');
    assert.ok(info.includes('21-15-9') && /43 \/ 29/.test(info), 'scheme and loads for men / women');
    await page.screenshot({ path: `${shots}${lang}-wod-info.png` });
    await page.keyboard.press('Escape');
    await page.goto(`${base}#/wod/cindy`);
    await page.waitForSelector('.wod-clock');
    assert.equal(await page.textContent('.wod-clock'), '20:00');
    await page.getByRole('button', { name: T('התחל טיימר', 'Start the timer') }).click();
    await page.waitForFunction(() => /^19:/.test(document.querySelector('.wod-clock')?.textContent ?? ''), null, { timeout: 8000 });
    await page.getByRole('button', { name: T('הוספת סבב', 'Add a round') }).click();
    await page.getByRole('button', { name: T('הוספת סבב', 'Add a round') }).click();
    await page.reload(); // the clock lives on timestamps: a reload (or a locked phone) keeps it
    await page.waitForFunction(() => /^19:/.test(document.querySelector('.wod-clock')?.textContent ?? ''));
    await page.getByRole('button', { name: T('סיום', 'Finish'), exact: true }).click();
    await page.waitForSelector('#wod-rounds');
    assert.equal(await page.inputValue('#wod-rounds'), '2', 'rounds counted on the clock screen');
    await page.fill('#wod-rounds', '');
    await page.getByRole('button', { name: T('שמירת התוצאה', 'Save the score') }).click();
    await page.waitForSelector('.sheet .field-error:not([hidden])'); // an empty score is refused
    await page.fill('#wod-rounds', '17'); await page.fill('#wod-reps', '12');
    await page.getByRole('button', { name: T('שמירת התוצאה', 'Save the score') }).click();
    await page.waitForSelector('.wod-result');
    assert.ok((await page.textContent('.wod-result')).includes(T('שיא אישי', 'Personal best')));
    await page.locator('.wod-result .btn').click(); // done: back to the list
    await page.waitForFunction(() => location.hash === '#/wods' && !document.querySelector('.sheet'));
    assert.match(await page.locator('.wod-card', { hasText: 'Cindy' }).textContent(), /17/);
    await page.goto(`${base}#/history`);
    await page.waitForSelector('.hist-row');
    assert.match(await page.locator('.hist-row').first().textContent(), /Cindy/);
    await page.locator('.hist-row').first().click();
    await page.waitForSelector('.wod-clock-card');
    await page.goto(`${base}#/ranks`);
    await page.waitForSelector('.bonus-card');
    assert.match(await page.locator('.bonus-row', { hasText: T('WOD', 'Benchmark') }).textContent(), /\+10\/40/);
    // clean up so later checks see the same history as before
    await page.goto(`${base}#/history`); await page.locator('.hist-row').first().click();
    await page.getByRole('button', { name: T('מחיקת התוצאה', 'Delete the score') }).click();
    await page.locator('.sheet').last().getByRole('button', { name: T('מחיקת התוצאה', 'Delete the score') }).click();
    await page.waitForFunction(() => location.hash === '#/history');
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
    // both dumbbells together: type 28, it says 14 in each hand, and 14 is what is stored
    await page.locator('.sheet .seg button', { hasText: T('שתיהן יחד', 'Both together') }).click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    const drow = page.locator('.ent-card .set-row').first();
    await drow.locator('.set-input').nth(0).fill('28');
    await page.waitForFunction(() => /14/.test(document.querySelector('.set-plates')?.textContent ?? ''));
    await drow.locator('.set-input').nth(1).fill('10');
    await drow.locator('.set-v').click();
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dg.draft')).entries[0].sets[0].weight), 14, 'stored per hand');
    assert.equal(await drow.locator('.set-input').nth(0).inputValue(), '28', 'shown as typed');
    await page.screenshot({ path: `${shots}${lang}-dumbbells-both.png` });
    await page.evaluate(async () => { const { updateSettings } = await import('./src/ui/storage.js'); await updateSettings({ dumbbellTotal: false }); });
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
    await installFakeSupabase(ctx2);
    const p2 = await ctx2.newPage();
    p2.on('pageerror', (e) => errors.push(`crew friend: ${e.message}`));
    await onboard(p2, lang, `crew2-${lang}`);
    try {
      // me: create the crew
      await page.goto(`${base}#/crew`);
      await page.waitForSelector('#crew-nick');
      await page.screenshot({ path: `${shots}${lang}-crew-start.png`, fullPage: true });
      // only the owner can open a crew: without the owner key there is no "create" tab, and the server refuses too
      assert.equal(await page.getByRole('button', { name: T('יצירת קבוצה', 'Create a crew') }).count(), 0, 'no create tab for everyone else');
      const refused = await page.evaluate(async () => { try { await (await import('./src/ui/crew-api.js')).rpc('create_group', { p_name: 'x', p_nick: 'y', p_token: 'a'.repeat(40), p_owner_key: 'nope' }); return 'allowed'; } catch (e) { return e.message; } });
      assert.equal(refused, 'not_owner');
      for (let i = errors.length - 1; i >= 0; i--) if (errors[i].includes('status of 400')) errors.splice(i, 1); // that refusal is expected
      await page.evaluate(async (k) => (await import('./src/ui/db.js')).dbPut('kv', k, 'ownerKey'), fake.OWNER_KEY);
      await page.reload(); await page.waitForSelector('#crew-nick');
      await page.getByRole('button', { name: T('יצירת קבוצה', 'Create a crew') }).click();
      await page.fill('#crew-name', 'Gym bros'); await page.fill('#crew-nick', 'Elia');
      await page.getByRole('button', { name: T('צור את הקבוצה', 'Create the crew') }).click();
      await page.waitForSelector('.crew-gear');
      await page.locator('.crew-gear').click();
      await page.waitForSelector('.sheet .crew-code');
      const code = await page.textContent('.sheet .crew-code');
      assert.ok(await page.locator('.sheet .crew-push').count() === 1, 'notifications are in the group settings');
      await page.screenshot({ path: `${shots}${lang}-crew-settings.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.sheet'));
      assert.equal(await page.locator('main .crew-code').count(), 0, 'the code is not in the way of the chat');
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
      await page.waitForSelector('.today-bell .bell-dot');
      await page.click('.today-bell');
      await page.waitForSelector('.sheet .crew-unread');
      assert.ok((await page.textContent('.sheet .crew-unread')).includes('2'));
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.tab-dot').count(), 1);
      assert.equal(await page.locator('.tab[href="#/crew"] .tab-dot').count(), 1, 'the unread dot sits on the crew tab');
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
      for (const keys of sent) for (const k of keys) assert.ok(['level', 'streak', 'workouts', 'weekVolume', 'monthWorkouts', 'rating', 'tier', 'division', 'recent'].includes(k), `unexpected shared field ${k}`);
      await page.locator('.crew-gear').click();
      await page.waitForSelector('.sheet .crew-push h2');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.sheet'));
      await page.screenshot({ path: `${shots}${lang}-crew-board.png`, fullPage: true });
      // sorting chips work
      await page.getByRole('button', { name: T('רמה', 'Level'), exact: true }).click();
      await page.waitForSelector('.crew-row');
      // friend profile + plan sharing (off until switched on)
      await page.evaluate(async () => {
        const { saveSchedule, saveRoutine } = await import('./src/ui/store.js');
        await saveRoutine({ id: 'r-share', schemaVersion: 1, name: 'Upper A', folderId: null, notes: '', createdMs: 1, updatedMs: 1, entries: [
          { id: 'e1', exerciseId: 'barbell-bench-press-medium-grip', sets: 4, repsMin: 6, repsMax: 8, restSec: 90, weight: 100, notes: '' },
          { id: 'e2', exerciseId: 'plank', sets: 3, repsMin: 30, repsMax: 30, restSec: 60, weight: null, notes: '' },
          { id: 'e3', exerciseId: 'my-own-custom-exercise', sets: 3, repsMin: 8, repsMax: 8, restSec: 60, weight: 55, notes: '' }] });
        await saveSchedule({ days: { 0: [{ id: 'd0', kind: 'rest' }], 1: [{ id: 'd1', kind: 'activity', type: 'basketball' }, { id: 'd1b', kind: 'workout', ref: 'r-share' }], 2: [{ id: 'd2', kind: 'workout', ref: 'free' }] }, done: {} });
      });
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
      await page.locator('.crew-gear').click();
      await page.locator('.sheet .crew-share .seg button', { hasText: T('פעיל', 'On') }).click();
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
      // open their strength workout, see exercises and reps (no weights), add a copy to my workouts
      const sentDetail = JSON.stringify(fake.calls.filter((c) => c.name === 'update_plan').map((c) => c.args.p_plan));
      assert.ok(!/"w"|weight|my-own-custom|100|55/.test(sentDetail), 'no weights and no custom exercises are sent');
      await p2.locator('.crew-workout', { hasText: 'Upper A' }).click();
      await p2.waitForSelector('.crew-peek-row');
      assert.equal(await p2.locator('.crew-peek-row').count(), 2, 'the custom exercise is not shared');
      assert.ok((await p2.textContent('.crew-peek')).includes('4×6-8'));
      await p2.screenshot({ path: `${shots}${lang}-crew-peek.png` });
      await p2.locator('.crew-peek .btn-primary').click();
      await p2.waitForSelector('.crew-peek a.btn-primary');
      const copied = await p2.evaluate(async () => (await (await import('./src/ui/db.js')).dbAll('routines')).filter((r) => /Upper A/.test(r.name)).map((r) => ({ name: r.name, entries: r.entries.map((e) => [e.exerciseId, e.sets, e.repsMin, e.repsMax, e.weight]) })));
      assert.equal(copied.length, 1);
      assert.match(copied[0].name, /Upper A · Elia/);
      assert.deepEqual(copied[0].entries, [['barbell-bench-press-medium-grip', 4, 6, 8, null], ['plank', 3, 30, 30, null]]);
      await p2.evaluate(async () => { const db = await import('./src/ui/db.js'); for (const r of await db.dbAll('routines')) if (/Upper A/.test(r.name)) await db.dbDelete('routines', r.id); });
      await p2.keyboard.press('Escape');
      await page.locator('.sheet .crew-share .seg button', { hasText: T('כבוי', 'Off') }).click();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await page.evaluate(async () => { const { saveSchedule, deleteRoutine } = await import('./src/ui/store.js'); await saveSchedule({ days: {}, done: {} }); await deleteRoutine('r-share'); });
      // leader: chip, tools only for the leader, rename, new code, remove a member, hand over and back
      const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'he' ? 'he-IL' : 'en-US', serviceWorkers: 'block' });
      await installFakeSupabase(ctx3);
      try {
        await fake.install(ctx3);
        const p3 = await ctx3.newPage();
        p3.on('pageerror', (e) => errors.push(`crew third: ${e.message}`));
        await onboard(p3, lang, `crew3-${lang}`);
        const board = async (pg) => { await pg.reload(); await pg.waitForSelector('#crew-say, .crew-suspended'); await pg.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click(); await pg.waitForSelector('.crew-row'); };
        const rowOf = (pg, nick) => pg.locator(`.crew-row[data-nick="${nick}"]`);
        const confirmGo = async (pg) => { await pg.waitForFunction(() => document.querySelectorAll('.sheet').length >= 1); await pg.locator('.sheet').last().locator('.btn-primary, .btn-danger').first().click(); };
        await p3.goto(`${base}#/crew`); await p3.waitForSelector('#crew-code');
        await p3.fill('#crew-code', code); await p3.fill('#crew-nick', 'Eve');
        await p3.getByRole('button', { name: T('הצטרף', 'Join'), exact: true }).click();
        await p3.waitForSelector('#crew-say');
        await board(page);
        assert.equal(await rowOf(page, 'Elia').locator('.chip-leader').count(), 1, 'the creator is the leader');
        assert.equal(await page.locator('.crew-row .chip-leader').count(), 1, 'only one leader');
        await board(p2);
        await rowOf(p2, 'Elia').click(); await p2.waitForSelector('.crew-friend');
        assert.equal(await p2.locator('.crew-leader-tools').count(), 0, 'members have no leader tools');
        await p2.keyboard.press('Escape');
        await p2.locator('.crew-gear').click(); await p2.waitForSelector('.sheet .crew-code');
        assert.equal(await p2.locator('.sheet .crew-leader-box').count(), 0);
        await p2.keyboard.press('Escape');
        // rename and a new code
        await page.locator('.crew-gear').click(); await page.waitForSelector('#crew-rename');
        await page.screenshot({ path: `${shots}${lang}-crew-leader.png` });
        await page.fill('#crew-rename', 'Gym bros 2');
        await page.locator('.crew-leader-box .btn-secondary').click();
        await page.waitForFunction(() => document.querySelector('main h1')?.textContent === 'Gym bros 2');
        const codeBefore = await page.textContent('.sheet .crew-code');
        await page.locator('.crew-leader-box .btn-ghost').click();
        await confirmGo(page);
        await page.waitForFunction((c) => document.querySelector('.sheet .crew-code') && document.querySelector('.sheet .crew-code').textContent !== c, codeBefore);
        await page.keyboard.press('Escape');
        await board(p2);
        assert.equal(await p2.textContent('main h1'), 'Gym bros 2', 'members see the new name');
        // remove Eve
        await board(page);
        await rowOf(page, 'Eve').click(); await page.waitForSelector('.crew-leader-tools');
        await page.locator('.crew-leader-tools .btn-danger').click();
        await confirmGo(page);
        await page.waitForFunction(() => ![...document.querySelectorAll('.crew-row')].some((r) => r.textContent.includes('Eve')));
        await p3.reload();
        await p3.waitForSelector('#crew-code');
        // suspend Dan from the chat, lift it, adjust his rating, give drachmas
        const leaderTool = async (nick, toolIndex, chip) => {
          await board(page);
          await rowOf(page, nick).click(); await page.waitForSelector('.crew-leader-tools');
          await page.locator('.crew-leader-tools .btn-secondary').nth(toolIndex).click();
          await page.waitForSelector('.sheet .chip-select');
          await page.locator('.sheet .chip-select', { hasText: chip }).last().click();
          await page.waitForFunction(() => !document.querySelector('.crew-leader-tools'));
        };
        const adjustTool = async (nick, pick, quiet = false) => {
          await board(page); await rowOf(page, nick).click(); await page.waitForSelector('.crew-leader-tools');
          await page.locator('.crew-leader-tools .btn-secondary').nth(1).click();
          await page.waitForSelector('.crew-adjust .rank-preview');
          if (quiet) await page.locator('.sheet .announce-toggle').click();
          await pick();
          await page.getByRole('button', { name: T('החל', 'Apply'), exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('.crew-leader-tools'));
        };
        const chipOf = (txt) => page.locator('.crew-adjust .chip-select', { hasText: txt }).first();
        await leaderTool('Dan', 0, /^1 (שעות|hours)$/);
        // the ban covers the whole app, not only the chat
        await p2.reload(); await p2.waitForSelector('.app-lock');
        assert.ok((await p2.textContent('.app-lock')).length > 20);
        assert.equal(await p2.locator('.app-lock').evaluate((el) => document.getElementById('app').inert), true, 'the app behind the lock is inert');
        await p2.screenshot({ path: `${shots}${lang}-crew-suspended.png` });
        await p2.reload(); await p2.waitForSelector('.app-lock'); // still locked after a reload (kept on the phone)
        assert.equal(await p2.locator('.app-lock').count(), 1);
        await board(page);
        assert.equal(await rowOf(page, 'Dan').locator('.chip-warn').count(), 1, 'the board marks the suspension');
        await leaderTool('Dan', 0, T('ביטול השעיה', 'Lift the suspension'));
        await p2.getByRole('button', { name: T('בדוק שוב', 'Check again') }).click();
        await p2.waitForSelector('.app-lock', { state: 'detached' });
        await p2.reload(); await p2.waitForSelector('#crew-say');
        await adjustTool('Dan', async () => { await chipOf(/^-100$/).click(); });
        await board(page);
        assert.ok((await rowOf(page, 'Dan').locator('.chip-warn').textContent()).includes('100'), 'the adjustment shows on the board');
        // the member sees it too: his own Progress rating includes the leader's adjustment, with a note
        await p2.reload();
        for (let i = 0; i < 40 && (await p2.evaluate(async () => (await import('./src/ui/store.js')).store.adjust)) !== -100; i++) await p2.waitForTimeout(250);
        const shown = await p2.evaluate(async () => { const m = await import('./src/ui/store.js'); m.store.overall = { pending: false, rating: 500, strength: 500, bonus: 0, remaining: 0 }; return m.shownOverall(); });
        assert.deepEqual([shown.rating, shown.rawRating, shown.adjust], [400, 500, -100]);
        await p2.goto(`${base}#/ranks`); await p2.waitForSelector('.rank-card');
        await p2.goto(`${base}#/crew`); await p2.waitForSelector('#crew-say, .crew-board, .crew-tabs');
        await adjustTool('Dan', async () => { await page.getByRole('button', { name: T('איפוס', 'Reset'), exact: true }).click(); });
        const dracBefore = await p2.evaluate(async () => (await import('./src/ui/store.js')).store.game.drachmas);
        // a quiet punishment is not announced in the chat
        const sysBodies = () => [...fake.groups.values()].flatMap((g) => g.messages).filter((m) => m.kind === 'system').map((m) => m.body);
        await adjustTool('Dan', async () => { await chipOf(/^-50$/).click(); }, true);
        assert.ok(!sysBodies().includes('adjust:-50'), 'a quiet action is not announced');
        await adjustTool('Dan', async () => { await page.getByRole('button', { name: T('איפוס', 'Reset'), exact: true }).click(); });
        // the gift: first the progress review, then the amount (no limit, any number)
        await board(page); await rowOf(page, 'Dan').click(); await page.waitForSelector('.crew-leader-tools');
        await page.locator('.crew-leader-tools .btn-secondary').nth(2).click();
        await page.waitForSelector('.sheet .crew-review #crew-gift-amount');
        assert.ok(await page.locator('.crew-review .chart-card').count() >= 1, 'the review shows the progress charts');
        await page.screenshot({ path: `${shots}${lang}-crew-review.png` });
        await page.fill('#crew-gift-amount', '12345');
        await page.fill('#crew-gift-bonus', '40');
        await page.getByRole('button', { name: T('תן את הפרס', 'Give the prize') }).click();
        await page.waitForFunction(() => !document.querySelector('.crew-leader-tools'));
        assert.ok(sysBodies().includes('gift:12345') && sysBodies().includes('adjust:40'), 'drachmas and a rating prize are both announced');
        await board(page);
        assert.ok((await rowOf(page, 'Dan').locator('.chip-warn').textContent()).includes('+40'), 'the prize shows on the board');
        await adjustTool('Dan', async () => { await page.getByRole('button', { name: T('איפוס', 'Reset'), exact: true }).click(); });
        await p2.reload(); await p2.waitForSelector('#crew-say');
        await p2.waitForFunction(async (b) => (await import('./src/ui/store.js')).store.game.drachmas === b + 12345, dracBefore);
        await p2.getByRole('button', { name: new RegExp(T("צ'אט", 'Chat')) }).click();
        const chatText = await p2.textContent('#crew-feed');
        assert.ok(/הושעה|suspended/i.test(chatText) && /דרכמות|drachmas/i.test(chatText), 'everything is announced in the chat');
        // hand over to Dan: he gets the tools and Elia loses them
        await rowOf(page, 'Dan').click(); await page.waitForSelector('.crew-leader-tools');
        await page.locator('.crew-leader-tools .btn-secondary').nth(3).click();
        await confirmGo(page);
        await board(page);
        assert.equal(await rowOf(page, 'Dan').locator('.chip-leader').count(), 1);
        await rowOf(page, 'Dan').click(); await page.waitForSelector('.crew-friend');
        assert.equal(await page.locator('.crew-leader-tools').count(), 0, 'the old leader has no tools');
        await page.keyboard.press('Escape');
        // and back to Elia
        await board(p2);
        await rowOf(p2, 'Elia').click(); await p2.waitForSelector('.crew-leader-tools');
        await p2.locator('.crew-leader-tools .btn-secondary').nth(3).click();
        await confirmGo(p2);
        await board(page);
        assert.equal(await rowOf(page, 'Elia').locator('.chip-leader').count(), 1);
        await page.reload(); await page.waitForSelector('#crew-say'); await page.getByRole('button', { name: T('לידרבורד', 'Leaderboard') }).click();
      } finally { await ctx3.close(); }
      // leaving
      await p2.goto(`${base}#/crew`);
      await p2.locator('.crew-gear').click();
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

  await check(`${lang}: Habit Coach link: connect, code, sync, never in the backup, disconnect`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    const ctx = page.context();
    const fake = createFakeCrew();
    await fake.install(ctx);
    try {
      await page.goto(`${base}#/settings`);
      await page.waitForSelector('.screen h1');
      await page.getByRole('button', { name: T('חיבור ל-Habit Coach', 'Connect to Habit Coach') }).click();
      await page.waitForSelector('[data-testid="link-code"]');
      const code = await page.locator('[data-testid="link-code"]').inputValue();
      assert.match(code, /^DG1-[0-9a-f]{64}$/);
      const token = code.slice(4);
      const snap = fake.links.get(token)?.snapshot;
      assert.ok(snap && snap.v === 1 && snap.counts.total > 0, 'first summary uploaded');
      for (const word of ['bodyweight', 'notes', 'entries', token]) assert.equal(JSON.stringify(snap).includes(word), false, `not shared: ${word}`);
      await page.screenshot({ path: `${shots}${lang}-link-code.png` });
      await page.locator('.sheet .btn-ghost').click();
      // the token stays out of the backup file
      const data = await page.evaluate(async () => JSON.stringify(await (await import('./src/ui/backup.js')).collectData()));
      assert.equal(data.includes(token), false, 'token not in the backup');
      // update now
      const before = fake.calls.filter((c) => c.name === 'link_put').length;
      await page.locator('.row', { hasText: T('עדכון עכשיו', 'Update now') }).click();
      await page.waitForTimeout(300);
      assert.ok(fake.calls.filter((c) => c.name === 'link_put').length > before, 'sync now sends');
      await page.screenshot({ path: `${shots}${lang}-link-settings.png`, fullPage: true });
      // survives a reload
      await page.reload(); await page.waitForSelector('.screen h1');
      assert.equal(await page.locator('.row', { hasText: T('ניתוק', 'Disconnect') }).count(), 1);
      // disconnect empties the server copy
      await page.locator('.row', { hasText: T('ניתוק', 'Disconnect') }).click();
      await page.locator('.sheet .btn-danger').click();
      await page.getByRole('button', { name: T('חיבור ל-Habit Coach', 'Connect to Habit Coach') }).waitFor();
      assert.equal(fake.links.get(token).active, false);
      assert.deepEqual(fake.links.get(token).snapshot, {});
      assert.equal(await page.evaluate(async () => (await import('./src/ui/db.js')).dbGet('kv', 'link')), null);
    } finally {
      await ctx.unroute(/supabase\.co\/rest\/v1\/rpc\//);
    }
  });

  await check(`${lang}: settings: account, rest alert switches, download my data, numbers page, delete account (then sign back in)`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/settings`);
    await page.waitForSelector('.screen h1');
    await page.waitForSelector(`.row:has-text("tester@example.com")`);
    await page.screenshot({ path: `${shots}${lang}-settings.png`, fullPage: true });
    assert.ok(!/גיבוי|backup/i.test(await page.textContent('main')), 'no backups anywhere in settings');
    // colour theme (dark / marble) + reduced motion
    await page.getByRole('button', { name: T('שיש', 'Marble'), exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'marble');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(234, 228, 217)');
    await page.screenshot({ path: `${shots}${lang}-settings-marble.png`, fullPage: true });
    await page.getByRole('button', { name: T('כהה', 'Dark'), exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor), 'rgb(10, 10, 11)');
    await page.getByRole('button', { name: T('פעיל', 'On'), exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.motion), 'reduce');
    await page.getByRole('button', { name: T('לפי המכשיר', 'Follow device') }).click();
    // rest alert: sound off, then back on
    await page.locator('.seg[aria-label="' + T('צליל', 'Sound') + '"] button', { hasText: T('לא', 'No') }).click();
    assert.equal(await page.evaluate(async () => (await import('./src/ui/storage.js')).getSettings().restSound), false);
    await page.locator('.seg[aria-label="' + T('צליל', 'Sound') + '"] button', { hasText: T('כן', 'Yes') }).click();
    // download my data: a file with everything
    const before = await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; });
    assert.ok(before > 0, 'workouts exist from earlier checks');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.row', { hasText: T('הורד את כל הנתונים שלי', 'Download all my data') }).click()]);
    const { readFileSync } = await import('node:fs');
    const parsed = JSON.parse(readFileSync(await dl.path(), 'utf8'));
    assert.equal(parsed.data.workouts.length, before);
    // numbers page
    await page.goto(`${base}#/numbers`);
    await page.waitForSelector('.numbers .card');
    assert.ok((await page.locator('.numbers .card').count()) >= 6);
    assert.match(await page.textContent('.numbers'), lang === 'he' ? /Liftoff|דרגות/ : /Verified about Liftoff/);
    await page.screenshot({ path: `${shots}${lang}-numbers.png`, fullPage: true });
    // the account holds the latest data before it is deleted (kept here to sign back in for the next checks)
    await page.evaluate(async () => (await import('./src/ui/sync.js')).syncNow());
    const saved = account.remote;
    assert.equal(saved.data.workouts.length, before);
    // delete account: needs the typed word, calls the server, wipes the phone, back to sign-in
    await page.goto(`${base}#/settings`);
    await page.locator('.row', { hasText: T('מחיקת החשבון וכל הנתונים', 'Delete account and all data') }).click();
    await page.waitForSelector('.sheet input');
    assert.ok(await page.locator('.sheet .btn-danger').isDisabled());
    await page.fill('.sheet input', T('מחיקה', 'DELETE'));
    await page.screenshot({ path: `${shots}${lang}-delete-account.png` });
    await page.locator('.sheet .btn-danger').click();
    await page.waitForSelector('#google', { timeout: 8000 });
    assert.equal(account.deletes, 1, 'the server deleted the account');
    assert.equal(await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; }), 0);
    // sign back in: the (fake) account still has the data, so the next checks keep their workouts
    account.remote = saved; account.deletes = 0;
    await page.check('#consent'); await page.click('#google');
    await page.waitForSelector('.tabbar', { timeout: 10000 });
    assert.equal(await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; }), before);
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
    await page.waitForSelector('.today-bell .bell-dot');
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .makeup-card');
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
    await page.waitForSelector('.today-start');
    assert.equal(await page.locator('.today-bell .bell-dot').count(), 0, 'the make-up workout is gone from the bell');
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
    await page.waitForFunction(() => location.hash === '#/workout'); // the Today card is gone (redesign: Today keeps only the essentials)
    await page.waitForSelector('.today-start');
    assert.equal(await page.locator('.model-card').count(), 0);
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
    // 60 kg x 8 = 480 kg: the weight of a horse
    assert.ok((await page.textContent('.compare-card')).includes(T('סוס', 'horse')));
    await page.screenshot({ path: `${shots}${lang}-result-compare.png` });
    if (await page.locator('.rankup').count()) await page.click('.rankup button');
    await page.goto(`${base}#/model`);
    await page.locator('.screen .btn-danger').click();
    await page.waitForFunction(() => location.hash === '#/profile'); // removing goes to Profile by itself (after the save): wait, or it would jump there later
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.today-start').catch(async (e) => { console.log('DEBUG (role model): hash', await page.evaluate(() => location.hash), '| app:', (await page.evaluate(() => document.getElementById('app').innerText)).replace(/\s+/g, ' ').slice(0, 300), '| overlays:', await page.evaluate(() => document.getElementById('overlay-root').innerText.slice(0, 200)), '| draft:', await page.evaluate(() => !!localStorage.getItem('dg.draft'))); throw e; });
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
    await page.waitForSelector('.today-next');
    assert.ok((await page.textContent('.today-next')).includes('Sched Day A'), 'planned today: the next-workout row');
    assert.ok((await page.textContent('.today-next-when')).match(/מתוכנן להיום|Planned for today/));
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .sched-card');
    assert.ok((await page.textContent('.sched-card')).match(/כדורסל|Basketball/));
    await page.locator('.sched-card .btn').click();
    await page.waitForFunction(() => document.querySelector('.today-week .day.today.done'));
    await page.screenshot({ path: `${shots}${lang}-schedule-home.png` });
    // a benchmark workout (WOD) in the plan: chosen from the list, shown on today's card with a start button
    await openToday();
    await page.locator('.sheet .sched-wods summary').click();
    await page.locator('.sheet .sched-wods .list .row', { hasText: /^\s*Fran/ }).click();
    await page.waitForFunction(() => /Fran/.test(document.querySelector('.sheet .sched-items')?.textContent ?? ''));
    await page.locator('.sheet .btn-primary').last().click();
    await page.waitForFunction(() => /Fran/.test(document.querySelector('.sched-row.today')?.textContent ?? ''));
    await page.goto(`${base}#/workout`);
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .sched-card');
    assert.ok((await page.textContent('.sched-card')).includes('Fran'));
    await page.locator('.sched-card .btn', { hasText: T('התחל', 'Start') }).click();
    await page.waitForFunction(() => location.hash === '#/wod/fran');
    // rest replaces everything and has no done button
    await openToday();
    await page.locator('.sheet .row', { hasText: T('יום החלמה', 'Recovery day') }).click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .sched-item').length === 1);
    await page.locator('.sheet .btn-primary').last().click();
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.today-bell');
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .sched-card');
    assert.equal(await page.locator('.sched-card .btn').count(), 0);
    await page.keyboard.press('Escape');
    assert.ok(!((await page.locator('.today-next-when').textContent().catch(() => '')) ?? '').match(/מתוכנן להיום|Planned for today/), 'a rest day does not schedule a workout');
    // limit: four items, then the add options are replaced by a note
    await openToday();
    for (let i = 0; i < 4; i++) await page.locator('.sheet .chip-select').first().click();
    await page.waitForFunction(() => document.querySelectorAll('.sheet .sched-item').length === 4);
    assert.equal(await page.locator('.sheet .chip-select').count(), 0);
    // clear the day
    await page.locator('.sheet .btn-ghost').click();
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('.today-bell');
    assert.equal(await page.locator('.today-bell .bell-dot').count(), 0, 'a cleared day leaves nothing behind the bell');
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
    await rowOf(T('ארגמן', 'Crimson')).locator('.btn').first().click();
    await page.waitForFunction(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-rgb').trim().startsWith('255 77 94'));
    await page.screenshot({ path: `${shots}${lang}-shop-themes.png`, fullPage: true });
    // title: buy and equip, then it shows on the profile
    await rowOf(T('צייד חזרות', 'Rep Hunter')).locator('.btn').click();
    await page.waitForTimeout(250);
    await rowOf(T('צייד חזרות', 'Rep Hunter')).locator('.btn').first().click();
    await page.waitForTimeout(250);
    // sound: preview works without errors, buy and equip
    await rowOf(T('פעמון', 'Bell')).locator('.icon-btn').click();
    await rowOf(T('פעמון', 'Bell')).locator('.btn').last().click();
    await page.waitForTimeout(250);
    await rowOf(T('פעמון', 'Bell')).locator('.btn').first().click();
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
    await page.goto(`${base}#/shop`); await page.waitForSelector('.shop-row');
    // returns: two a month, the third is refused (counted on this phone when you are not in a crew)
    const giveBack = async (name) => { await rowOf(name).getByRole('button', { name: T('החזרה', 'Return') }).click(); await page.waitForSelector('.sheet'); };
    for (const name of [T('צייד חזרות', 'Rep Hunter'), T('פעמון', 'Bell')]) {
      await giveBack(name);
      await page.locator('.sheet .btn-primary').click();
      await page.waitForFunction(() => !document.querySelector('.sheet'));
      await page.waitForTimeout(200);
    }
    await giveBack(T('ארגמן', 'Crimson'));
    assert.equal(await page.locator('.sheet .btn-primary').count(), 0, 'no third return this month');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // back to the default colour for the other checks
    await page.evaluate(async () => { const { store, saveGame } = await import('./src/ui/store.js'); const g = structuredClone(store.game); g.inventory.equipped.theme = null; g.inventory.boostActive = false; await saveGame(g); });
  });

  await check(`${lang}: next workout is the nearest planned one (not the last one you added)`, async () => {
    const T = (he, en) => L(lang, he, en);
    await page.evaluate(async () => {
      const db = await import('./src/ui/db.js');
      const mk = (id, name, t0) => ({ id, schemaVersion: 1, name, folderId: null, notes: '', createdMs: t0, updatedMs: t0, entries: [{ id: `e-${id}`, exerciseId: 'barbell-bench-press-medium-grip', sets: 3, repsMin: 6, repsMax: 8, restSec: 90, weight: null, notes: '' }] });
      await db.dbPut('routines', mk('r-upper', 'Upper UU', 1));
      await db.dbPut('routines', mk('r-full', 'Full body FF', 2)); // added last: the old rule would show this one
      const tomorrow = (new Date().getDay() + 1) % 7;
      await db.dbPut('kv', { days: { [tomorrow]: [{ id: 'u1', kind: 'workout', ref: 'r-upper' }] }, done: {} }, 'schedule');
    });
    await page.goto(`${base}#/workout`); await page.reload();
    await page.waitForSelector('.today-next');
    assert.ok((await page.textContent('.today-next')).includes('Upper UU'), 'the planned one, not the last added');
    assert.ok(!(await page.textContent('.today-next')).includes('Full body FF'));
    assert.ok((await page.textContent('.today-next-when')).match(/למחר|tomorrow/i));
    await page.screenshot({ path: `${shots}${lang}-next-planned.png` });
    await page.evaluate(async () => { const db = await import('./src/ui/db.js'); await db.dbDelete('routines', 'r-upper'); await db.dbDelete('routines', 'r-full'); await db.dbPut('kv', { days: {}, done: {} }, 'schedule'); });
    await page.reload();
  });

  await check(`${lang}: rank path: strip on Progress, full ladder with you marked`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/ranks`);
    await page.waitForSelector('.ladder-strip');
    assert.equal(await page.locator('.ladder-dot').count(), 10);
    assert.equal(await page.locator('.ladder-dot.current').count(), 1);
    await page.screenshot({ path: `${shots}${lang}-ladder-strip.png` });
    await page.locator('.ladder-strip').click();
    await page.waitForSelector('.ladder-row');
    assert.equal(await page.locator('.ladder-row').count(), 10);
    assert.equal(await page.locator('.ladder-row.current').count(), 1);
    assert.ok(await page.locator('.ladder-row.done').count() >= 1, 'tiers below you are done');
    assert.ok(await page.locator('.ladder-row.locked').count() >= 1, 'tiers above you are locked');
    assert.ok((await page.textContent('.ladder-summary')).match(/\d/), 'points left are shown');
    await page.screenshot({ path: `${shots}${lang}-ladder.png`, fullPage: true });
    // the button at the bottom opens the weakest-groups screen (it used to just go back to Progress)
    await page.getByRole('link', { name: T('איפה אני הכי חלש ומה צריך', 'Where I am weakest and what I need') }).click();
    await page.waitForSelector('.weak-card');
    assert.equal(await page.locator('.weak-card').count(), 10);
    assert.equal(await page.locator('.weak-card.weakest').count(), 1);
    assert.ok(await page.locator('.weak-tip').count() >= 1, 'bonus tips');
    assert.ok((await page.textContent('.weak-card.weakest')).length > 10);
    await page.screenshot({ path: `${shots}${lang}-weakest.png`, fullPage: true });
    await page.locator('.weak-card').first().click(); await page.waitForSelector('.sheet');
    await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.sheet'));
  });

  await check(`${lang}: every sub-screen has a back link`, async () => {
    const subs = ['wods', 'wod/fran', 'wod/nope', 'ladder', 'exercises', 'exercise/plank', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'privacy', 'requests', 'calendar', 'history', 'history/nope', 'routine/nope', 'plan/nope', 'exercise/nope', 'ranks-preview', 'model', 'schedule', 'ladder'];
    for (const r of subs) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main');
      assert.ok(await page.locator('main .back-link').count() >= 1, `no back link on #/${r}`);
    }
    for (const r of ['workout', 'workouts', 'ranks', 'crew', 'profile']) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main');
      assert.equal(await page.locator('main > .back-link').count(), 0, `unexpected back link on tab root #/${r}`);
    }
  });

  await check(`${lang}: ranks-preview crest (wreath, rim, division diamonds, crown, unique ids)`, async () => {
    await page.goto(`${base}#/ranks-preview`);
    await page.waitForSelector('main .emblem svg');
    const r = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('main .emblem').forEach((em) => {
        const svg = em.querySelector('svg');
        const tier = [...em.classList].find((c) => c.startsWith('emblem-')).slice(7);
        const div = Number(em.dataset.division);
        out.push({ tier, div, leaves: svg.querySelectorAll('ellipse.leaf').length, rim: svg.querySelectorAll('path.rim').length, dia: svg.querySelectorAll('.dia').length, crown: svg.querySelectorAll('.crown').length });
      });
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
      return { out, dupes: ids.filter((x, i) => ids.indexOf(x) !== i) };
    });
    assert.ok(r.out.length >= 41, `emblems ${r.out.length}`);
    for (const e of r.out) {
      assert.equal(e.leaves, 36, `${e.tier} leaves`);
      assert.equal(e.rim, 1, `${e.tier} rim`);
      if (e.tier === 'greekgod') { assert.equal(e.crown, 1, 'crown'); assert.equal(e.dia, 0, 'gg diamonds'); }
      else assert.equal(e.dia, 5 - e.div, `${e.tier} ${e.div} diamonds`);
    }
    assert.deepEqual(r.dupes, [], 'unique ids');
    await page.screenshot({ path: `${shots}${lang}-ranks-preview.png`, fullPage: true });
  });

  await check(`${lang}: accessibility basics (names, labels, language, landmarks)`, async () => {
    for (const r of ['workout', 'workouts', 'exercises', 'ranks', 'shop', 'profile', 'settings', 'numbers', 'history']) {
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
    // the floating glass bar: five icon tabs, each named for screen readers
    assert.equal(await page.locator('.tabbar a.tab').count(), 5, 'five tabs');
    assert.equal(await page.locator('.tabbar a.tab:not([aria-label])').count(), 0, 'every tab has an aria-label');
    await page.click('.tab[href="#/ranks"]');
    await page.waitForSelector('.tab[aria-current="page"][href="#/ranks"]', { timeout: 3000 });
    await page.goto(`${base}#/crew`);
    await page.waitForSelector('.tab[aria-current="page"][href="#/crew"]', { timeout: 3000 });
    await page.goto(`${base}#/history`);
    await page.waitForSelector('.tab[aria-current="page"][href="#/workouts"]', { timeout: 3000 });
    // nothing hides under the bar: the end of each long screen scrolls clear of it
    for (const r of ['workouts', 'ranks']) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main');
      await page.waitForTimeout(200);
      await page.evaluate(() => scrollTo(0, 1e6));
      await page.waitForTimeout(150);
      const { end, top } = await page.evaluate(() => ({ end: document.querySelector('main').lastElementChild.getBoundingClientRect().bottom, top: document.querySelector('.tabbar').getBoundingClientRect().top }));
      assert.ok(end <= top, `#/${r}: last block ends at ${end}, bar starts at ${top}`);
    }
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

  await check(`${lang}: Zip the mascot lives only on Profile, above the tab bar, and his bubble stays on screen`, async () => {
    await page.goto(`${base}#/profile`);
    await page.waitForSelector('.zip-host:not([hidden])');
    const host = await page.locator('.zip-host').boundingBox();
    const nav = await page.locator('#nav-root > *').first().boundingBox();
    assert.ok(host.y + host.height <= nav.y + 1, 'Zip stands above the tab bar');
    assert.ok(host.x >= 0 && host.x + host.width <= 390, 'inside the screen');
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.zip-host')).direction), lang === 'he' ? 'rtl' : 'ltr');
    await page.mouse.click(host.x + host.width / 2, host.y + host.height / 2);
    await page.waitForSelector('.zip-bubble:not([hidden])');
    const b = await page.locator('.zip-bubble').boundingBox();
    assert.ok(b.x >= 0 && b.x + b.width <= 390 && b.y >= 0, 'the bubble stays on screen');
    await page.screenshot({ path: `${shots}${lang}-zip.png` });
    await page.goto(`${base}#/workout`);
    await page.waitForFunction(() => document.querySelector('.zip-host')?.hidden === true);
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

const phone = (over = {}) => browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL', serviceWorkers: 'block', ...over });
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
/** A phone that already has data from before accounts: profile, 2 workouts, a crew spot. */
async function seedOldPhone(page) {
  await page.goto(base); await page.waitForSelector('html[data-ready="1"]');
  await page.evaluate(async () => {
    const { dbPut } = await import('./src/ui/db.js');
    const { bodyweightEntry } = await import('./src/core/profile.mjs');
    await dbPut('profile', { id: 'me', name: 'Old', sex: 'm', age: 40, lang: 'he', createdAt: new Date().toISOString(), schemaVersion: 1 }, 'me');
    await dbPut('bodyweight', bodyweightEntry(90));
    for (const id of ['old-1', 'old-2']) await dbPut('workouts', { id, startedMs: Date.now() - 86400000, finishedMs: Date.now() - 86000000, entries: [], stats: { workingSets: 0 } });
    await dbPut('kv', { token: 't'.repeat(64), code: 'ABCDEFGH', name: 'Crew', nickname: 'Old', memberId: 'm1', lastSeenId: 0 }, 'crew');
  });
  await page.reload(); await page.waitForSelector('#google');
}

await check('accounts: iPhone in Safari sees the install screen before sign-in', async () => {
  const c = await phone({ userAgent: IPHONE_UA }); await installFakeSupabase(c);
  const p = await c.newPage(); await p.goto(base); await p.waitForSelector('.onboarding .tour-list');
  assert.equal(await p.locator('#google').count(), 0);
  await p.screenshot({ path: `${shots}he-onb-0-ios-install.png` });
  await p.click('.ob-actions .btn-ghost'); await p.waitForSelector('#google');
  await c.close();
});

await check('accounts: an old phone moves its data (and crew spot) to the account, then opens the app', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`old phone: ${e.message}`));
  await seedOldPhone(p);
  await p.check('#consent'); await p.click('#google');
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  assert.ok(acct.uploads.length >= 1);
  const up = acct.uploads[0];
  assert.deepEqual(up.data.workouts.map((w) => w.id).sort(), ['old-1', 'old-2']);
  assert.equal(up.data.crew.code, 'ABCDEFGH');
  assert.equal(up.consent_version, '2026-12');
  await c.close();
});

await check('accounts: when the upload fails, nothing is lost and the app still opens', async () => {
  const c = await phone(); await installFakeSupabase(c, { failUploads: true });
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`failing upload: ${e.message}`));
  await seedOldPhone(p);
  await p.check('#consent'); await p.click('#google');
  await p.waitForSelector('.ob-actions .btn-ghost', { timeout: 10000 }); // retry / continue for now
  await p.screenshot({ path: `${shots}he-onb-migrate-failed.png` });
  await p.click('.ob-actions .btn-ghost');
  await p.waitForSelector('.tabbar');
  await p.goto(`${base}#/history`); await p.waitForSelector('.screen');
  assert.equal(await p.evaluate(async () => (await (await import('./src/ui/db.js')).dbAll('workouts')).length), 2);
  await c.close();
});

await check('accounts: a new phone signs in and gets the account data', async () => {
  const remote = { updatedAt: Date.now() - 1000, data: { profile: { id: 'me', name: 'Cloud', sex: 'f', age: null, lang: 'he', createdAt: new Date().toISOString(), schemaVersion: 1 }, bodyweight: [{ dateKeyTime: '2026-11-01T00000000000001', dateKey: '2026-11-01', at: new Date().toISOString(), ms: 1, kg: 60 }], workouts: [{ id: 'cloud-1', startedMs: Date.now() - 5e6, finishedMs: Date.now() - 4e6, entries: [], stats: { workingSets: 0 } }], routines: [], folders: [], plans: [], custom: [], blobs: {}, game: null, settings: { weeklyGoal: 5 }, renames: {}, requests: [], bases: {}, model: null, schedule: null, crew: null } };
  const c = await phone(); await installFakeSupabase(c, { remote });
  const p = await c.newPage(); await p.goto(base); await p.waitForSelector('#google');
  await p.check('#consent'); await p.click('#google');
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  const got = await p.evaluate(async () => { const { dbGet, dbAll } = await import('./src/ui/db.js'); return { name: (await dbGet('profile', 'me'))?.name, w: (await dbAll('workouts')).length }; });
  assert.deepEqual(got, { name: 'Cloud', w: 1 });
  await c.close();
});

const cloudData = (ids) => ({ profile: { id: 'me', name: 'Cloud', sex: 'f', age: null, lang: 'he', createdAt: new Date().toISOString(), schemaVersion: 1 }, bodyweight: [{ dateKeyTime: '2026-11-01T00000000000001', dateKey: '2026-11-01', at: new Date().toISOString(), ms: 1, kg: 60 }], workouts: ids.map((id, i) => ({ id, startedMs: Date.now() - 5e6 - i, finishedMs: Date.now() - 4e6, entries: [], stats: { workingSets: 0 } })), routines: [], folders: [], plans: [], custom: [], blobs: {}, game: null, settings: {}, renames: {}, requests: [], bases: {}, model: null, schedule: null, crew: null });
const localIds = (p) => p.evaluate(async () => (await (await import('./src/ui/db.js')).dbAll('workouts')).map((w) => w.id).sort());
const syncAndSettle = async (p) => { await p.evaluate(() => { import('./src/ui/sync.js').then((m) => m.syncNow()); }); await p.waitForTimeout(2500); await p.waitForSelector('.tabbar'); };

await check('accounts: two phones — an old phone pulls newer data (never pushes its stale copy); when both changed, nothing is lost', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c, { remote: { data: cloudData(['a-1']), version: 1 } });
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`two phones: ${e.message}`));
  await p.goto(base); await p.waitForSelector('#google'); await p.check('#consent'); await p.click('#google');
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  await p.waitForTimeout(1500); // the start-up sync after the pull
  assert.deepEqual(await localIds(p), ['a-1']);
  const uploads0 = acct.uploads.length;
  // another phone writes; this phone only starts and discards a workout (a change that leaves the data as it was)
  acct.remote = { data: cloudData(['a-1', 'b-1']), version: acct.remote.version + 1 };
  await p.evaluate(async () => { const s = await import('./src/ui/store.js'); s.setDraft({ id: 'tmp', name: '', startedMs: Date.now(), entries: [] }); await s.clearDraft(); });
  await syncAndSettle(p);
  assert.deepEqual(await localIds(p), ['a-1', 'b-1'], 'pulled the newer data');
  assert.equal(acct.uploads.length, uploads0, 'did not push its stale copy');
  // both change: a workout here, another one on the other phone -> merged, both kept everywhere
  await p.evaluate(async () => { const { dbPut } = await import('./src/ui/db.js'); await dbPut('workouts', { id: 'here-1', startedMs: Date.now(), finishedMs: Date.now(), entries: [], stats: { workingSets: 0 } }); });
  acct.remote = { data: cloudData(['a-1', 'b-1', 'b-2']), version: acct.remote.version + 1 };
  await syncAndSettle(p);
  assert.deepEqual(await localIds(p), ['a-1', 'b-1', 'b-2', 'here-1'], 'merged on this phone');
  assert.deepEqual(acct.remote.data.workouts.map((w) => w.id).sort(), ['a-1', 'b-1', 'b-2', 'here-1'], 'merged on the server');
  // a lost session never locks the app: it keeps working and offers to sign in again
  await p.evaluate(async () => { const { dbDelete } = await import('./src/ui/db.js'); await dbDelete('kv', 'session'); });
  await p.reload(); await p.waitForSelector('.tabbar');
  assert.equal(await p.locator('.signin-banner').count(), 1);
  assert.equal(await p.locator('.onboarding').count(), 0);
  await p.screenshot({ path: `${shots}he-signin-banner.png` });
  await c.close();
});

await check('accounts: a new phone whose first account check fails waits and retries, instead of starting as a new person', async () => {
  const c = await phone(); await installFakeSupabase(c, { remote: { data: cloudData(['a-1']) }, failReads: 1 });
  const p = await c.newPage(); await p.goto(base); await p.waitForSelector('#google');
  await p.check('#consent'); await p.click('#google');
  await p.waitForSelector('.ob-title:text-is("לא הצלחנו לבדוק את החשבון. בדוק חיבור ונסה שוב.")', { timeout: 10000 });
  assert.equal(await p.locator('#ob-name').count(), 0, 'no new-person questions');
  await p.click('.onboarding .ob-actions .btn-primary');
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  assert.deepEqual(await localIds(p), ['a-1']);
  await c.close();
});

await check('accounts: coming back from Google with no saved key shows "sign-in did not finish"', async () => {
  const c = await phone(); await installFakeSupabase(c);
  const p = await c.newPage(); await p.goto(`${base}?code=stray`);
  await p.waitForSelector('.onboarding .field-error');
  assert.match(await p.textContent('.onboarding .field-error'), /הכניסה לא הסתיימה/);
  assert.equal(new URL(p.url()).search, '', 'the code is removed from the address');
  await c.close();
});

await check('accounts: the rest reminder is sent to the server, cancelled on skip, and the end flashes the screen', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`rest: ${e.message}`));
  await onboard(p, 'he');
  await p.evaluate(async () => { const { setDraft } = await import('./src/ui/store.js'); setDraft({ id: 'rest-test', name: '', startedMs: Date.now(), entries: [] }); });
  const t0 = Date.now();
  await p.evaluate(async () => (await import('./src/ui/rest-timer.js')).startRestTimer(20, 'לחיצת חזה'));
  await p.waitForTimeout(500);
  const post = acct.alarms.find((a) => a.method === 'POST');
  assert.ok(post, 'reminder posted');
  assert.ok(Math.abs(Date.parse(post.body.fire_at) - (t0 + 20000)) < 2000, 'fires at the end of the rest');
  assert.match(post.body.body, /לחיצת חזה/);
  await p.evaluate(async () => (await import('./src/ui/rest-timer.js')).skipRest());
  await p.waitForTimeout(300);
  assert.ok(acct.alarms.some((a) => a.method === 'DELETE'), 'skip cancels it');
  await p.evaluate(async () => (await import('./src/ui/rest-timer.js')).startRestTimer(20, 'סקוואט'));
  await p.evaluate(async () => { const { store } = await import('./src/ui/store.js'); store.draft.timer.endAt = Date.now() + 300; });
  await p.waitForSelector('.rest-done', { timeout: 3000 });
  assert.match(await p.textContent('.rest-done'), /סקוואט/);
  await p.screenshot({ path: `${shots}he-rest-done.png` });
  await c.close();
});

await check('start-up: a failed first request is retried; if it keeps failing there is a message and a button, not a black page', async () => {
  const c1 = await browser.newContext({ serviceWorkers: 'block' });
  const p1 = await c1.newPage(); let n = 0;
  await p1.route('**/src/data/i18n/he.json', (r) => (n++ === 0 ? r.abort() : r.continue()));
  await p1.goto(base); await p1.waitForSelector('html[data-ready="1"]', { timeout: 15000 });
  assert.ok(n >= 2, 'the request was repeated');
  await c1.close();
  const c2 = await browser.newContext({ serviceWorkers: 'block' });
  const p2 = await c2.newPage();
  await p2.route('**/src/data/i18n/he.json', (r) => r.abort());
  await p2.goto(base); await p2.waitForSelector('#app button.btn-primary', { timeout: 20000 });
  assert.ok((await p2.textContent('#app')).includes('Try again'));
  await c2.close();
});

await check('start-up guard: when the app script cannot load, the page reloads once, then shows a message and a button', async () => {
  const c1 = await browser.newContext({ serviceWorkers: 'block' });
  const p1 = await c1.newPage(); let n = 0;
  await p1.route('**/src/main.js', (r) => (n++ === 0 ? r.abort() : r.continue()));
  await p1.goto(base);
  await p1.waitForSelector('html[data-ready="1"]', { timeout: 25000 });
  assert.ok(n >= 2, 'reloaded and loaded the script again');
  await c1.close();
  const c2 = await browser.newContext({ serviceWorkers: 'block' });
  const p2 = await c2.newPage();
  await p2.route('**/src/main.js', (r) => r.abort());
  await p2.goto(base);
  await p2.waitForSelector('#app button', { timeout: 75000 });
  assert.ok((await p2.textContent('#app')).includes('Try again'));
  await c2.close();
});

await check('no console errors', async () => assert.deepEqual(errors, [], errors.slice(0, 5).join(' || ')));
await browser.close();
server.close();
if (failed) { console.error(`${failed} check(s) failed`); process.exit(1); }
console.log('UI smoke: all passed');
