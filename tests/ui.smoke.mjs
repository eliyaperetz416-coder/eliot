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
const ROUTES = ['ladder', 'wods', 'wod/fran', 'weakest', 'workout', 'workouts', 'exercises', 'exercise/barbell-bench-press-medium-grip', 'exercise/plank', 'ranks', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'privacy', 'requests', 'calendar', 'crew', 'profile', 'history', 'kit', 'ranks-preview'];
const errors = [];
let failed = 0;
const ONLY = process.env.ONLY;
// A check that never settles (an await without a timeout, e.g. page.evaluate or locator.count() while the page sits in a
// navigation that never commits) used to stop the whole run silently. Now it fails after CHECK_LIMIT_MS and says what each
// open page was doing. The longest check (crew) takes about 80 s here.
const CHECK_LIMIT_MS = Number(process.env.CHECK_LIMIT_MS) || 240000;
const pending = new Map(); // request -> start ms, per page (for the stuck-check report)
const watch = (pg) => {
  pg.on('request', (r) => pending.set(r, Date.now()));
  for (const ev of ['requestfinished', 'requestfailed']) pg.on(ev, (r) => pending.delete(r));
  return pg;
};
async function stuckReport() {
  const lines = [];
  for (const ctx of browser.contexts()) for (const pg of ctx.pages()) {
    const open = [...pending].filter(([r]) => { try { return r.frame().page() === pg; } catch { return false; } }).map(([r, t0]) => `${r.method()} ${r.url().replace(base, '/')} (${Math.round((Date.now() - t0) / 1000)} s)`);
    let state = 'no answer in 3 s';
    try {
      const cdp = await ctx.newCDPSession(pg);
      const ev = cdp.send('Runtime.evaluate', { expression: 'JSON.stringify({ hash: location.hash, ready: document.documentElement.dataset.ready, state: document.readyState, sheets: document.querySelectorAll(".sheet, .rankup").length, sw: !!navigator.serviceWorker?.controller })', returnByValue: true });
      state = await Promise.race([ev.then((r) => r.result.value), new Promise((res) => setTimeout(() => res(state), 3000))]);
      await cdp.send('Profiler.enable'); await cdp.send('Profiler.start');
      await new Promise((res) => setTimeout(res, 2000));
      const prof = await Promise.race([cdp.send('Profiler.stop'), new Promise((res) => setTimeout(() => res(null), 3000))]);
      if (prof) {
        const byId = new Map(prof.profile.nodes.map((n) => [n.id, n.callFrame])), self = new Map();
        prof.profile.samples.forEach((id, i) => { const f = byId.get(id); const k = `${f.functionName || '(anon)'} ${f.url.replace(base, '/')}:${f.lineNumber + 1}`; self.set(k, (self.get(k) ?? 0) + (prof.profile.timeDeltas[i] ?? 0)); });
        state += ` | cpu 2 s: ${[...self].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${Math.round(v / 1000)} ms ${k}`).join('; ')}`;
      }
      cdp.detach().catch(() => {});
    } catch (e) { state += ` (${e.message.split('\n')[0]})`; }
    lines.push(`${pg.url().replace(base, '/')} ${state}${open.length ? ` | open requests: ${open.slice(0, 6).join(', ')}` : ''}`);
  }
  return lines.join('\n     ');
}
const withLimit = (name, p) => {
  let timer;
  const limit = new Promise((_, rej) => { timer = setTimeout(async () => rej(new Error(`no result after ${CHECK_LIMIT_MS / 1000} s (stuck)\n     ${await stuckReport()}`)), CHECK_LIMIT_MS); });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
};
const check = (name, fn) => (ONLY && !name.includes(ONLY) && !name.includes('onboarding') ? Promise.resolve() : withLimit(name, fn())).then(() => console.log('ok  ', name), (e) => { failed++; console.error('FAIL', name, '-', (/\(stuck\)/.test(e.message) ? e.message : e.message.split('\n')[0]), (e.stack.match(/ui\.smoke\.mjs:\d+/) ?? [''])[0]); });
const L = (lang, he, en) => (lang === 'he' ? he : en);

async function onboard(page, lang, shotPrefix) {
  const shot = (n) => (shotPrefix ? page.screenshot({ path: `${shots}${shotPrefix}-onb-${n}.png` }) : null);
  const head = (he, en) => page.waitForSelector(`.ob-title:text-is("${L(lang, he, en)}")`);
  await page.goto(base);
  await page.waitForSelector('html[data-ready="1"]');
  await page.waitForSelector('#google');
  // On a fresh phone the service worker takes control and the page reloads once (main.js, controllerchange). A screenshot
  // caught in that reload hangs headless Chromium (about 1 run in 3 before this wait), so let it happen first.
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.waitForSelector('html[data-ready="1"] #google');
  await shot('1-signin');
  assert.equal(await page.locator('.ob-step .emblem svg').count(), 1, 'the crest on the sign-in screen');
  assert.equal(await page.locator('.ob-word').textContent(), 'DEMIGOD');
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
async function logSet(page, cardIndex, weight, reps, rowIndex = 0) {
  const card = page.locator('.ent-card').nth(cardIndex);
  if (!(await card.locator('.set-row').count())) { await card.locator('.ent-row').click(); await card.locator('.set-row').first().waitFor(); } // focus mode: only one exercise is open
  const row = card.locator('.set-row').nth(rowIndex);
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
  // the rank-up opens 350 ms after the result screen (post-ui.js). On a busy machine that can be later than a fixed wait,
  // and a rank-up left open makes the app inert under the next checks.
  if (await page.waitForSelector('.rankup', { timeout: 2000 }).then(() => true, () => false)) await page.click('.rankup button');
  await page.waitForTimeout(300);
}

for (const lang of ['he', 'en']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: lang === 'he' ? 'he-IL' : 'en-US', hasTouch: true });
  const reqFake = createFakeCrew(); // the exercise-request inbox never reaches the real server in tests
  const account = await installFakeSupabase(ctx);
  await ctx.route(/supabase\.co\/rest\/v1\/rpc\/(submit_exercise_request|my_exercise_requests)/, reqFake.handle);
  const page = watch(await ctx.newPage());
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
    assert.ok(await page.locator('.today-start.choose-other').count() === 1, 'start opens the chooser while nothing is planned');
    // what is new (Elia 27.11): a card behind the bell for everyone, with a dot until its details were seen once
    assert.equal(await page.locator('.today-bell .bell-dot').count(), 1, 'the update notice puts a dot on the bell');
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .bell-list .news-card.card-accent');
    await page.click('.sheet .news-card .btn');
    await page.waitForSelector('.sheet .news-list');
    assert.equal(await page.locator('.sheet .news-list li').count(), 8);
    await page.screenshot({ path: `${shots}${lang}-whats-new.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await page.locator('.today-bell .bell-dot').count(), 0, 'seen: no dot');
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .bell-list .news-card:not(.card-accent)');
    await page.keyboard.press('Escape');
    await page.click('.today-quests');
    await page.waitForSelector('.sheet .quests');
    await page.evaluate(() => { location.hash = '#/shop'; }); // a link inside a sheet (the streak card's "go to the shop") changes the screen
    await page.waitForFunction(() => !document.querySelector('.sheet'), null, { timeout: 3000 }); // ...and the sheet goes with the old screen
    await page.goto(`${base}#/workout`);
    await page.waitForSelector('.today-quests');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}${lang}-today-dark.png` });
    // no rubber-band bounce, and the background reaches past both edges (no plain strip under a bounce)
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY), 'none');
    const bg = await page.evaluate(() => { const cs = getComputedStyle(document.body, '::before'); return { top: parseFloat(cs.top), h: parseFloat(cs.height), vh: innerHeight }; });
    assert.ok(bg.top < 0 && bg.top + bg.h > bg.vh, `background ${JSON.stringify(bg)}`);
    // the floating bar sits inside the screen (never pushed past the bottom edge, where iOS does not draw)
    assert.ok(await page.evaluate(() => { const b = document.querySelector('.tabbar').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }), 'the whole bar is on screen');
    // a notched iPhone: Today still fits the screen without scrolling
    await page.evaluate(() => document.documentElement.style.setProperty('--safe-t', '47px'));
    await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.scrollingElement.scrollHeight <= innerHeight + 1), 'Today does not scroll with a notch');
    await page.evaluate(() => document.documentElement.style.removeProperty('--safe-t'));
    // iOS "increase contrast" switched on while the app is open takes effect at once
    await page.emulateMedia({ contrast: 'more' });
    await page.waitForFunction(() => { const cs = getComputedStyle(document.documentElement); return cs.getPropertyValue('--text-dim').trim() === cs.getPropertyValue('--text').trim(); }, null, { timeout: 3000 });
    await page.emulateMedia({ contrast: null });
    await page.waitForFunction(() => { const cs = getComputedStyle(document.documentElement); return cs.getPropertyValue('--text-dim').trim() !== cs.getPropertyValue('--text').trim(); }, null, { timeout: 3000 });
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

  // Both themes everywhere (redesign): the same sweep in marble, plus readable text (WCAG AA) in each theme.
  const readability = (scope = 'main *, .tabbar *, .sheet *') => page.evaluate((scope) => {
    const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const over = (top, under) => [0, 1, 2].map((i) => top[i] * top[3] + under[i] * (1 - top[3]));
    const bgOf = (el) => { // the first solid background up the tree; null when an image or gradient is in the way (not judged)
      const layers = [];
      for (let x = el; x; x = x.parentElement) {
        const cs = getComputedStyle(x);
        if (x.classList.contains('rankup')) { layers.push([4, 5, 10, 1]); break; } // its gradient ends in near-black (components.css)
        if (cs.backgroundImage !== 'none') return null;
        const c = parse(cs.backgroundColor);
        if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
      }
      let base = parse(getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)})`)) ?? [0, 0, 0, 1];
      for (const l of layers.reverse()) base = [...over(l, base), 1];
      return base;
    };
    const bad = [];
    for (const el of document.querySelectorAll(scope)) {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.closest('[aria-hidden="true"], [disabled], .sr-only, svg') || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      let op = 1; for (let x = el; x; x = x.parentElement) op *= Number(getComputedStyle(x).opacity);
      const bg = bgOf(el); const fg = parse(cs.color);
      if (!bg || !fg) continue;
      const shown = over([fg[0], fg[1], fg[2], fg[3] * op], bg);
      const [a, b] = [lum(shown), lum(bg)].sort((m, n) => n - m);
      const ratio = (a + 0.05) / (b + 0.05);
      const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) bad.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 24)}" ${ratio.toFixed(2)}`);
    }
    // buttons that are only an outline or a light fill must still show where they are (an edge or a fill against what is behind)
    for (const el of document.querySelectorAll('.btn-secondary, .icon-btn, .sheet-grab')) {
      if (!el.getClientRects().length || el.closest('[aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el); const behind = bgOf(el.parentElement); if (!behind) continue;
      if (el.matches('.icon-btn') && !(parse(cs.backgroundColor)?.[3] > 0)) continue; // a bare icon (no circle) shows itself
      const edge = parse(cs.borderTopColor), fill = parse(cs.backgroundColor);
      const seen = [edge && parseFloat(cs.borderTopWidth) > 0 ? edge : null, fill].filter((c) => c && c[3] > 0).map((c) => { const m = over(c, behind); const [a, b] = [lum(m), lum(behind)].sort((x, y) => y - x); return (a + 0.05) / (b + 0.05); });
      if (cs.backgroundImage === 'none' && Math.max(0, ...seen) < 1.15) bad.push(`${el.className} edge ${Math.max(0, ...seen).toFixed(2)}`);
    }
    return bad;
  }, scope);
  for (const theme of ['marble', 'dark']) {
    await check(`${lang}: ${theme}: every route fits, has 44 px targets and readable text`, async () => {
      await page.evaluate(async (th) => { const s = await import('./src/ui/storage.js'); await s.updateSettings({ theme: th }); }, theme);
      const issues = [];
      for (const r of ROUTES) {
        await page.goto(`${base}#/${r}`); await page.reload();
        await page.waitForSelector('.screen');
        await page.waitForTimeout(500);
        const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, theme: document.documentElement.dataset.theme }));
        if (o.theme !== theme) issues.push(`#/${r}: theme ${o.theme}`);
        if (o.sw > o.cw) issues.push(`#/${r}: overflow ${o.sw}`);
        const small = await page.evaluate(() => [...document.querySelectorAll('button, a.tab, .btn, input:not([type=file]), a.btn')].map((el) => el.getBoundingClientRect()).filter((b) => b.width && b.height < 43.5).length);
        if (small) issues.push(`#/${r}: ${small} small targets`);
        for (const x of await readability()) issues.push(`#/${r}: ${x}`);
        if (theme === 'marble') await page.screenshot({ path: `${shots}${lang}-marble-${r.replace(/\//g, '_')}.png` });
      }
      // the rank-up overlay draws its own dark backdrop: its text must read in both themes
      await page.evaluate(async () => (await import('./src/ui/post-ui.js')).openRankUp({ change: { kind: 'tier', from: { tier: 'silver', division: 'I' }, to: { tier: 'gold', division: 'V' } }, before: 399, after: 401 }));
      await page.waitForSelector('.rankup');
      await page.waitForTimeout(1800);
      for (const x of await readability('.rankup *')) issues.push(`rank-up: ${x}`);
      await page.click('.rankup button');
      await page.evaluate(async () => { const s = await import('./src/ui/storage.js'); await s.updateSettings({ theme: 'dark' }); });
      const kinds = [...new Set(issues.map((x) => x.replace(/"[^"]*"/, '').replace(/^#\/\S+ /, '')))]; // one line per kind of problem
      assert.equal(issues.length, 0, `${issues.length} issues, ${kinds.length} kinds: ${kinds.slice(0, 40).join(' | ')} — e.g. ${issues.slice(0, 3).join(' | ')}`);
    });
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
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('dg.draft')).entries.flatMap((e) => e.sets).filter((x) => x.done).length), 3);
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
    assert.match(await page.textContent('.result-delta'), /\d/, 'the rating change, big, on top');
    await page.screenshot({ path: `${shots}${lang}-result.png`, fullPage: true });
    await page.click('main .btn-primary');
    await page.goto(`${base}#/ranks`);
    await page.waitForSelector('.pyramid');
    assert.equal(await page.locator('.pyramid li[aria-current="step"]').count(), 1, 'ranked after 3 ranked exercises: you are on a step');
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
    await page.waitForSelector('.pyramid');
    assert.equal(await page.locator('.pyramid li[aria-current="step"]').count(), 0, 'rank pending again after deleting the only workout');
  });

  await check(`${lang}: live focus mode: a finished exercise folds to one row, the next opens, a record keeps a small trophy`, async () => {
    await page.goto(`${base}#/workout`);
    await startEmpty(page);
    await addExercise(page, 'barbell bench press');
    await page.click('.live-actions .btn-secondary');
    await addExercise(page, 'barbell squat');
    await page.waitForSelector('.live-bar');
    assert.equal(await page.locator('.col-prev, .set-prev').count(), 0, 'no "previous" column: the last numbers are the placeholders');
    const sets = await page.evaluate(() => JSON.parse(localStorage.getItem('dg.draft')).entries[0].sets.length);
    for (let i = 0; i < sets; i++) await logSet(page, 0, 150, 5, i);
    assert.ok(await page.locator('.ent-card').first().locator('.set-fb.flash').count() >= 1, 'the last set shows its feedback too, before the exercise folds');
    await page.waitForSelector('.ent-card.entry.done .ent-row');
    assert.equal(await page.locator('.ent-card.entry.done .set-row').count(), 0, 'the finished exercise is one row');
    // a superset keeps its mark when folded: link the two, open a third exercise
    await page.click('.live-actions .btn-secondary');
    await addExercise(page, 'barbell deadlift');
    await page.evaluate(async () => { const { store, touchDraft } = await import('./src/ui/store.js'); const W = await import('./src/core/workout.mjs'); W.linkSuperset(store.draft, store.draft.entries[0].id); await touchDraft(); window.dispatchEvent(new HashChangeEvent('hashchange')); });
    await page.waitForTimeout(300);
    await page.locator('.ent-card').nth(2).locator('.ent-row').click();
    await page.waitForFunction(() => document.querySelectorAll('.ent-card.entry:not(.open).ss').length === 2);
    assert.equal(await page.locator('.ent-card.entry:not(.open) .ss-label').count(), 1, 'one superset label over the folded pair');
    await page.locator('.ent-card').nth(1).locator('.ent-row').click(); // back to the squat
    await page.waitForFunction(() => document.querySelectorAll('.ent-card').length === 3 && document.querySelectorAll('.ent-card')[1].querySelector('.set-row'));
    assert.ok(await page.locator('.ent-card').nth(1).locator('.set-row').count() >= 1, 'the next exercise opens');
    if (await page.locator('.ent-card.entry.done .ent-row').count()) await page.locator('.ent-card.entry.done .ent-row').click(); // tap it to look again (in a superset it opens with its partner)
    await page.waitForSelector('.ent-card.entry.done .set-row');
    await page.waitForTimeout(1400); // the feedback line shows for a moment, then only the record mark stays
    assert.equal(await page.locator('.set-fb.flash').count(), 0);
    assert.ok(await page.locator('.ent-card').first().locator('.pr-mark').count() >= 1, 'a record set keeps a small trophy');
    await page.screenshot({ path: `${shots}${lang}-live-focus.png` });
    await page.click('.live-head .btn-finish');
    await page.waitForSelector('.sheet .btn-danger'); await page.click('.sheet .btn-danger');
    await page.waitForSelector('.sheet .btn-danger'); await page.click('.sheet .btn-danger');
    await page.waitForSelector('.live-head', { state: 'detached' });
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
    // three tabs: rank (pyramid + exercises), body (map + groups), numbers (tiles + chart); share goes to the card
    await page.waitForSelector('.pyramid');
    assert.equal(await page.locator('.prog-tabs button').count(), 3);
    assert.equal(await page.locator('.pyramid li').count(), 10);
    assert.equal(await page.locator('.pyramid li[aria-current="step"]').count(), 1);
    assert.equal(await page.locator('.prog-share').getAttribute('href'), '#/card');
    const shown = await page.locator('.ex-rank-row').count();
    assert.ok(shown >= 3 && shown <= 5, `rows ${shown}`);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}${lang}-ranks-data.png`, fullPage: true });
    // sort (a sheet with four orders)
    const first = await page.locator('.ex-rank-row .row-title').first().textContent();
    await page.click('.prog-sort');
    await page.waitForSelector('.sheet .row');
    assert.equal(await page.locator('.sheet .row').count(), 4);
    await page.locator('.sheet .row').nth(1).click(); // by name
    await page.waitForFunction(() => !document.querySelector('.sheet'));
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
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // body
    await page.locator('.prog-tabs button').nth(1).click();
    await page.waitForSelector('.mmap svg');
    assert.equal(await page.locator('.mmap svg').count(), 2);
    assert.ok(await page.locator('.mm-glow').count() >= 3, 'ranked muscles glow in their tier colour');
    await page.click('.mm[data-muscle="chest"] polygon');
    assert.match(await page.textContent('.mmap-info'), /Platinum|Diamond|Gold|Silver/);
    await page.waitForSelector('.mmap-panel .row');
    assert.equal(await page.locator('.group-row').count(), 11);
    await page.screenshot({ path: `${shots}${lang}-ranks-body.png`, fullPage: true });
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
    assert.ok(o.sw <= o.cw, 'no horizontal overflow with data');
    // recovery mode
    await page.locator('.prog-body .seg button').nth(1).click();
    await page.waitForSelector('.recov-bar');
    await page.click('.mm[data-muscle="chest"] polygon');
    assert.match(await page.textContent('.mmap-info'), /%/);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${shots}${lang}-recovery.png`, fullPage: true });
    // numbers
    await page.locator('.prog-tabs button').nth(2).click();
    await page.waitForSelector('main .stats-grid');
    await page.screenshot({ path: `${shots}${lang}-ranks-numbers.png`, fullPage: true });
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
    assert.ok(await page.locator('.ent-card').count() >= 4, 'the plan day brings its exercises');
    assert.equal(await page.locator('.target-line').count(), 1, 'focus mode: the open exercise shows its target');
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('dg.draft')).entries.filter((e) => e.target).length >= 4), 'every exercise carries its target');
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
    await page.waitForSelector('.profile-ring');
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
    await page.goto(`${base}#/ladder`);
    await page.waitForSelector('.bonus-card');
    assert.match(await page.locator('.bonus-row', { hasText: T('WOD', 'Benchmark') }).textContent(), /\+10\/40/);
    // clean up so later checks see the same history as before
    await page.goto(`${base}#/history`); await page.locator('.hist-row').first().click();
    await page.getByRole('button', { name: T('מחיקת התוצאה', 'Delete the score') }).click();
    await page.locator('.sheet').last().getByRole('button', { name: T('מחיקת התוצאה', 'Delete the score') }).click();
    await page.waitForFunction(() => location.hash === '#/history');
  });

  await check(`${lang}: WOD time cap (the clock stops, reps are scored) and a progress chart per workout`, async () => {
    const T = (he, en) => L(lang, he, en);
    await page.goto(`${base}#/wod/murph`);
    await page.waitForSelector('.wod-cap');
    await page.locator('.wod-cap .chip', { hasText: '20' }).click();
    assert.match(await page.textContent('.wod-sub'), /20/);
    assert.equal(await page.locator('.wod-cap .chip[aria-pressed="true"]').count(), 1);
    await page.getByRole('button', { name: T('התחל טיימר', 'Start the timer') }).click();
    await page.waitForFunction(() => /^0:0/.test(document.querySelector('.wod-clock')?.textContent ?? '') && /20/.test(document.querySelector('.wod-sub')?.textContent ?? ''), null, { timeout: 8000 });
    // jump past the cap (the clock lives on timestamps): it stops by itself and asks for the reps
    await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('dg.wodRun')); r.startedMs = Date.now() - 20 * 60000 - 2000; localStorage.setItem('dg.wodRun', JSON.stringify(r)); });
    await page.reload();
    await page.waitForSelector('#wod-capreps');
    await page.fill('#wod-capreps', '250');
    await page.getByRole('button', { name: T('שמירת התוצאה', 'Save the score') }).click();
    await page.waitForSelector('.wod-result');
    assert.match(await page.textContent('.wod-result .wod-clock'), /20.*250|250.*20/);
    await page.locator('.wod-result .btn').click();
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // two Fran times -> a chart and a list with the best marked
    await page.evaluate(async () => {
      const W = await import('./src/core/wods.mjs'); const { store, saveWodResult } = await import('./src/ui/store.js'); const { data } = await import('./src/ui/data.js');
      const wod = data().wods.wods.find((w) => w.id === 'fran');
      for (const [id, sec, days] of [['t-fran-1', 420, 7], ['t-fran-2', 365, 1]]) {
        const end = Date.now() - days * 86400000;
        await saveWodResult(W.buildWodWorkout({ id, wod, division: 'rx', score: { type: 'time', seconds: sec }, startedMs: end - sec * 1000, endedMs: end, workouts: store.workouts }));
      }
    });
    await page.goto(`${base}#/wod/fran`);
    await page.waitForSelector('.wod-progress svg.chart');
    assert.equal(await page.locator('.wod-progress .list .row').count(), 2);
    assert.match(await page.locator('.wod-progress .list .row').first().textContent(), /6:05/);
    await page.waitForFunction(() => !document.querySelector('.sheet-exit'));
    await page.screenshot({ path: `${shots}${lang}-wod-progress.png`, fullPage: true });
    // clean up: the three results of this check
    await page.evaluate(async () => {
      const { store, deleteWodResult } = await import('./src/ui/store.js');
      for (const w of store.workouts.filter((x) => x.wod && ['murph', 'fran'].includes(x.wod.id))) await deleteWodResult(w.id);
    });
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
    // the chat refreshes every few seconds and redraws the strip: a tap that lands mid-redraw is tried again
    const closeAll = async (pg) => { for (let i = 0; i < 4 && await pg.locator('.sheet').count(); i++) { await pg.keyboard.press('Escape'); await pg.waitForTimeout(350); } };
    const openBoard = async (pg) => { for (let i = 0; i < 3; i++) { await pg.click('.crew-top3'); if (await pg.waitForSelector('.sheet .crew-board', { timeout: 3000 }).catch(() => null)) return; } throw new Error('the board sheet did not open'); };
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
      // anyone can open a crew (migration 016): the "create" tab is there for everyone, no owner key needed
      assert.equal(await page.getByRole('button', { name: T('יצירת קבוצה', 'Create a crew') }).count(), 1, 'create for everyone');
      assert.equal(await page.evaluate(async () => (await (await import('./src/ui/db.js')).dbGet('kv', 'ownerKey')) ?? null), null, 'no owner key on this phone');
      await page.getByRole('button', { name: T('יצירת קבוצה', 'Create a crew') }).click();
      await page.fill('#crew-name', 'Gym bros'); await page.fill('#crew-nick', 'Elia');
      await page.getByRole('button', { name: T('צור את הקבוצה', 'Create the crew') }).click();
      await page.waitForSelector('.crew-gear');
      await closeAll(page); await page.locator('.crew-gear').click();
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
      await p2.waitForSelector('.crew-top3');
      assert.ok((await p2.textContent('.crew-head-sub')).match(/2/), 'the member count under the name');
      // the board shows both, I am marked
      await openBoard(p2);
      await p2.waitForFunction(() => document.querySelectorAll('.crew-row').length === 2);
      // friend posts a status and a chat message
      await p2.keyboard.press('Escape');
      await p2.waitForSelector('#crew-say');
      await p2.click('.crew-status-btn'); await p2.getByRole('button', { name: T('הולך להתאמן', 'Going to train') }).click();
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
      await openBoard(page);
      await page.waitForSelector('.crew-board');
      assert.equal(await page.locator('.crew-row').count(), 2);
      assert.ok(await page.locator('.crew-row.me').count() === 1);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelectorAll('.crew-msg').length === 2);
      await page.screenshot({ path: `${shots}${lang}-crew-feed.png`, fullPage: true });
      await page.click('.crew-status-btn'); await page.getByRole('button', { name: T('הולך להתאמן', 'Going to train') }).click();
      await page.waitForFunction(() => document.querySelectorAll('.crew-msg.mine.status').length >= 1);
      await page.goto(`${base}#/workout`);
      assert.equal(await page.locator('.tab-dot').count(), 0, 'read: no dot');
      // my numbers are on the board, and nothing private is sent
      await page.goto(`${base}#/crew`);
      await page.waitForSelector('#crew-say');
      await openBoard(page);
      await page.waitForSelector('.sheet .crew-board');
      assert.equal(await page.locator('.sheet .crew-podium .crew-pod').count(), 2, 'the podium holds the top three (two of us here)');
      const sent = fake.calls.filter((c) => c.name === 'update_stats').map((c) => Object.keys(c.args.p_stats));
      assert.ok(sent.length >= 1);
      for (const keys of sent) for (const k of keys) assert.ok(['level', 'streak', 'workouts', 'weekVolume', 'monthWorkouts', 'rating', 'tier', 'division', 'recent'].includes(k), `unexpected shared field ${k}`);
      await page.screenshot({ path: `${shots}${lang}-crew-board.png` });
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.sheet'));
      await closeAll(page); await page.locator('.crew-gear').click();
      await page.waitForSelector('.sheet .crew-push h2');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.sheet'));
      await openBoard(page);
      await page.waitForSelector('.sheet .crew-board');
      // sorting chips work
      await page.locator('.sheet .crew-board-sheet .seg button').filter({ hasText: new RegExp(`^${T('רמה', 'Level')}$`) }).click();
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
      await openBoard(p2);
      await p2.locator('.crew-row', { hasText: 'Elia' }).click();
      await p2.waitForSelector('.crew-friend');
      assert.ok((await p2.textContent('.crew-friend')).match(/לא שיתף|not shared/), 'plan is private by default');
      assert.equal(await p2.locator('.crew-plan-row').count(), 0);
      await p2.keyboard.press('Escape');
      await page.reload();
      await page.waitForSelector('#crew-say');
      await closeAll(page); await page.locator('.crew-gear').click();
      await page.locator('.sheet .crew-share .seg button', { hasText: T('פעיל', 'On') }).click();
      await page.waitForTimeout(400);
      assert.ok(fake.calls.some((c) => c.name === 'update_plan' && c.args.p_plan && c.args.p_plan.days), 'plan sent after switching on');
      const sentPlan = JSON.stringify(fake.calls.filter((c) => c.name === 'update_plan').map((c) => c.args.p_plan));
      assert.ok(!/weight|sets|exercise|bodyweight/i.test(sentPlan), 'no exercises or weights in the shared plan');
      await p2.reload();
      await p2.waitForSelector('#crew-say');
      await openBoard(p2);
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
        const board = async (pg) => { await pg.reload(); await pg.waitForSelector('#crew-say, .crew-suspended'); await openBoard(pg); await pg.waitForSelector('.crew-row'); };
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
        await closeAll(p2); await p2.locator('.crew-gear').click(); await p2.waitForSelector('.sheet .crew-code');
        assert.equal(await p2.locator('.sheet .crew-leader-box').count(), 0);
        await p2.keyboard.press('Escape');
        // rename and a new code
        await closeAll(page); await page.locator('.crew-gear').click(); await page.waitForSelector('#crew-rename');
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
        // the leader keeps only "hand over" and "remove": no rating change, no prize, no suspension (migration 016)
        await board(page);
        await rowOf(page, 'Dan').click(); await page.waitForSelector('.crew-leader-tools');
        assert.equal(await page.locator('.crew-leader-tools button').count(), 2, 'hand over + remove only');
        await page.keyboard.press('Escape'); await page.waitForTimeout(350);
        assert.equal(await page.evaluate(async () => { try { await (await import('./src/ui/crew-api.js')).rpc('set_adjust', { p_token: 'x'.repeat(64), p_member_id: '00000000-0000-0000-0000-000000000000', p_value: -10, p_announce: true }); return 'allowed'; } catch (e) { return e.message; } }), 'removed', 'the server refuses it too');
        for (let i = errors.length - 1; i >= 0; i--) if (errors[i].includes('status of 400')) errors.splice(i, 1); // that refusal is expected
        // hand over to Dan: he gets the tools and Elia loses them
        await board(page);
        await rowOf(page, 'Dan').click(); await page.waitForSelector('.crew-leader-tools');
        await page.locator('.crew-leader-tools .btn-secondary').first().click();
        await confirmGo(page);
        await board(page);
        assert.equal(await rowOf(page, 'Dan').locator('.chip-leader').count(), 1);
        await rowOf(page, 'Dan').click(); await page.waitForSelector('.crew-friend');
        assert.equal(await page.locator('.crew-leader-tools').count(), 0, 'the old leader has no tools');
        await page.keyboard.press('Escape');
        // and back to Elia
        await board(p2);
        await rowOf(p2, 'Elia').click(); await p2.waitForSelector('.crew-leader-tools');
        await p2.locator('.crew-leader-tools .btn-secondary').first().click();
        await confirmGo(p2);
        await board(page);
        assert.equal(await rowOf(page, 'Elia').locator('.chip-leader').count(), 1);
        await page.reload(); await page.waitForSelector('#crew-say'); await openBoard(page);
      } finally { await ctx3.close(); }
      // leaving
      await p2.goto(`${base}#/crew`);
      await closeAll(p2); await p2.locator('.crew-gear').click();
      await p2.getByRole('button', { name: T('עזוב את הקבוצה', 'Leave the crew') }).click();
      await p2.locator('.sheet .btn-danger').click();
      await p2.waitForSelector('#crew-code');
      await page.reload();
      await page.waitForSelector('#crew-say');
      await openBoard(page);
      await page.waitForFunction(() => document.querySelectorAll('.crew-row').length === 1);
      await closeAll(page);
    } finally {
      await ctx2.close();
      await ctx.unroute(/supabase\.co\/rest\/v1\/rpc\//);
      await page.evaluate(async () => { const { dbPut } = await import('./src/ui/db.js'); await dbPut('kv', null, 'crew'); });
    }
  });

  await check(`${lang}: Habit Coach is gone: an old link is closed on the server once and forgotten; nothing about it on screen`, async () => {
    const ctx = page.context();
    const fake = createFakeCrew();
    await fake.install(ctx);
    try {
      await page.evaluate(async () => (await import('./src/ui/db.js')).dbPut('kv', { token: 'k'.repeat(64), connectedMs: 1, lastSyncMs: 1 }, 'link'));
      await page.goto(`${base}#/settings`); await page.reload(); await page.waitForSelector('.screen h1');
      await page.waitForFunction(async () => !(await (await import('./src/ui/db.js')).dbGet('kv', 'link')), null, { timeout: 5000 });
      assert.ok(fake.calls.some((c) => c.name === 'link_revoke' && c.args.p_token === 'k'.repeat(64)), 'the summary is emptied on the server');
      assert.equal(await page.getByText(/Habit Coach/).count(), 0, 'no Habit Coach anywhere in Settings');
      const n = fake.calls.filter((c) => c.name === 'link_revoke').length;
      await page.reload(); await page.waitForSelector('.screen h1'); await page.waitForTimeout(500);
      assert.equal(fake.calls.filter((c) => c.name === 'link_revoke').length, n, 'only once');
    } finally { await ctx.unroute(/supabase\.co\/rest\/v1\/rpc\//); }
  });

  await check(`${lang}: settings: account, rest alert switches, download my data, numbers page, delete account (then sign back in)`, async () => {
    {
      const T = (he, en) => L(lang, he, en);
      await page.goto(`${base}#/settings`); await page.waitForSelector('.screen h1');
      assert.ok(await page.locator('main .row .row-sub').count() <= 2, 'only the account e-mail and "delete" keep a second line');
      assert.equal(await page.getByText('free-exercise-db').count(), 0, 'the credits are not spread on the page');
      await page.locator('.row', { hasText: T('קרדיטים ורישיונות', 'Credits and licences') }).click();
      await page.waitForSelector('.sheet');
      assert.ok((await page.textContent('.sheet')).includes('free-exercise-db'));
      await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('.sheet'));
    }
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
    // delete account: the last Google sign-in is an hour old, so it first asks to sign in again (and deletes nothing)
    await page.evaluate(async () => {
      const { dbGet, dbPut } = await import('./src/ui/db.js');
      const s = await dbGet('kv', 'session');
      const old = Math.floor(Date.now() / 1000) - 3600;
      s.accessToken = `e30.${btoa(JSON.stringify({ amr: [{ method: 'oauth', timestamp: old }] })).replace(/=+$/, '')}.sig`;
      await dbPut('kv', s, 'session');
    });
    await page.goto(`${base}#/settings`);
    await page.reload();
    await page.locator('.row', { hasText: T('מחיקת החשבון וכל הנתונים', 'Delete account and all data') }).click();
    await page.waitForSelector('.sheet input');
    assert.ok(await page.locator('.sheet .btn-danger').isDisabled());
    await page.fill('.sheet input', T('מחיקה', 'DELETE'));
    await page.locator('.sheet .btn-danger').click();
    await page.waitForSelector('.sheet .reauth-go', { timeout: 5000 });
    assert.equal(account.deletes, 0, 'nothing deleted before signing in again');
    await page.screenshot({ path: `${shots}${lang}-delete-reauth.png` });
    // sign in again: back in Settings with the delete sheet open; the typed word and the server finish it
    await page.locator('.sheet .reauth-go').click();
    await page.waitForSelector('.sheet input', { timeout: 10000 });
    assert.match(page.url(), /#\/settings/);
    await page.fill('.sheet input', T('מחיקה', 'DELETE'));
    await page.screenshot({ path: `${shots}${lang}-delete-account.png` });
    await page.locator('.sheet .btn-danger').click();
    await page.waitForSelector('#google', { timeout: 8000 });
    assert.equal(account.deletes, 1, 'the server deleted the account');
    assert.equal(await page.evaluate(async () => { const { dbAll } = await import('./src/ui/db.js'); return (await dbAll('workouts')).length; }), 0);
    // sign back in: the (fake) account still has the data, so the next checks keep their workouts
    account.remote = saved; account.deletes = 0;
    await page.check('#consent'); await page.click('#google');
    await throughCatchUp(page);
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

  await check(`${lang}: no role model any more (#/model opens Today); the result still compares the weight with something familiar`, async () => {
    const T = (he, en) => L(lang, he, en);
    // a role model saved by the old app (with a photo) is cleared from the phone and never travels to the account again
    await page.evaluate(async () => { const db = await import('./src/ui/db.js'); await db.dbPut('blobs', new Blob(['x'], { type: 'image/png' }), 'model-old'); await db.dbPut('kv', { name: 'Old hero', photoBlobId: 'model-old' }, 'model'); });
    await page.goto(`${base}#/workout`); await page.reload(); await page.waitForSelector('.today-start');
    await page.waitForFunction(async () => { const db = await import('./src/ui/db.js'); return !(await db.dbGet('kv', 'model')) && !(await db.dbGet('blobs', 'model-old')); }, null, { timeout: 5000 });
    assert.equal(await page.evaluate(async () => { const d = await (await import('./src/ui/backup.js')).collectData(); return 'model' in d || Object.keys(d.blobs).some((k) => k.startsWith('model')); }), false, 'no model in what is synced');
    await page.goto(`${base}#/model`);
    await page.waitForSelector('.today-start');
    assert.equal(await page.locator('.model-card, .model-quote').count(), 0);
    await startEmpty(page);
    await addExercise(page, 'barbell bench press');
    await logSet(page, 0, 60, 8);
    await page.click('.live-head .btn');
    await page.waitForSelector('.sheet .btn-primary');
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('main .stats-grid');
    assert.equal(await page.locator('.model-quote').count(), 0);
    // 60 kg x 8 = 480 kg: the weight of a horse
    assert.ok((await page.textContent('.compare-card')).includes(T('סוס', 'horse')));
    await page.screenshot({ path: `${shots}${lang}-result-compare.png` });
    if (await page.locator('.rankup').count()) await page.click('.rankup button');
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
    // the bell may still carry the "what is new" dot (unseen when the Today check was skipped, e.g. with ONLY): only the
    // plan is asked about here, so the dot is allowed exactly when the news card is still unseen
    await page.click('.today-bell');
    await page.waitForSelector('.sheet .bell-list');
    assert.equal(await page.locator('.sheet .sched-card').count(), 0, 'a cleared day leaves nothing behind the bell');
    const newsUnseen = await page.locator('.sheet .news-card.card-accent').count();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    assert.equal(await page.locator('.today-bell .bell-dot').count(), newsUnseen, 'no dot for a cleared day');
    await page.evaluate(async () => { const { dbDelete } = await import('./src/ui/db.js'); await dbDelete('routines', 'r-sched'); });
    await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  });

  await check(`${lang}: shop: app colour, title on the profile, rest sound preview, drachma boost`, async () => {
    const T = (he, en) => L(lang, he, en);
    // the wallet is set in the running app: wait until it has started (a store written during boot is read over by initStore)
    await page.waitForSelector('html[data-ready="1"]');
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
    await page.goto(`${base}#/workout`); await page.waitForSelector('.today-start');
    assert.ok(!/221, 186, 102|176, 138, 60/.test(await page.evaluate(() => getComputedStyle(document.querySelector('.today-start')).backgroundImage)), 'the start button follows the bought colour, no gold edges');
    await page.goto(`${base}#/shop`); await page.waitForSelector('.shop-row');
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
    await page.reload(); await page.waitForSelector('html[data-ready="1"]');
  });

  await check(`${lang}: rank path: pyramid on Progress, full ladder with you marked`, async () => {
    const T = (he, en) => L(lang, he, en);
    if (ONLY) await postThree(page);
    await page.goto(`${base}#/ranks`);
    await page.waitForSelector('.pyramid');
    // five exercises, then "+N more" opens the rest in place
    assert.ok(await page.locator('.ex-rank-row').count() <= 5);
    if (await page.locator('.more-rows').count()) { await page.click('.more-rows'); await page.waitForFunction(() => document.querySelectorAll('.ex-rank-row').length > 5); assert.equal(await page.locator('.more-rows').count(), 0); }
    await page.screenshot({ path: `${shots}${lang}-ladder-strip.png` });
    await page.locator('.pyramid li[aria-current="step"] a').click();
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
    const subs = ['wods', 'wod/fran', 'wod/nope', 'ladder', 'exercises', 'exercise/plank', 'progress', 'card', 'routines', 'plans', 'plan/new', 'custom/new', 'achievements', 'shop', 'settings', 'numbers', 'privacy', 'requests', 'calendar', 'history', 'history/nope', 'routine/nope', 'plan/nope', 'exercise/nope', 'ranks-preview', 'schedule', 'ladder'];
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

  await check(`${lang}: ranks-preview crest (a symbol per tier, wreath metal by tier, solid shield, glow, division diamonds, crown, unique ids)`, async () => {
    await page.goto(`${base}#/ranks-preview`);
    await page.waitForSelector('main .emblem svg');
    const r = await page.evaluate(() => {
      const out = [];
      document.querySelectorAll('main .emblem').forEach((em) => {
        const svg = em.querySelector('svg');
        const tier = [...em.classList].find((c) => c.startsWith('emblem-')).slice(7);
        const div = Number(em.dataset.division);
        out.push({ tier, div, wreath: em.dataset.wreath, leaves: svg.querySelectorAll('path.leaf').length, rim: svg.querySelectorAll('path.rim').length, glow: svg.querySelectorAll('.glyph-glow').length, glyph: em.dataset.glyph, glyphShapes: svg.querySelectorAll('.glyph *').length,
          dia: svg.querySelectorAll('.dia').length, crown: svg.querySelectorAll('.crown').length, thinWhite: [...svg.querySelectorAll('[stroke="#FFFFFF"], [stroke="#fff"]')].length });
      });
      const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
      return { out, dupes: ids.filter((x, i) => ids.indexOf(x) !== i) };
    });
    assert.ok(r.out.length >= 41, `emblems ${r.out.length}`);
    const glyphOf = { wood: 'target', bronze: 'delapouite/spartan-helmet', silver: 'lorc/winged-sword', gold: 'lorc/laurel-crown', platinum: 'lorc/eagle-emblem', diamond: 'lorc/winged-shield', champion: 'lorc/crown', titan: 'lorc/crowned-skull', olympian: 'lorc/hydra', greekgod: 'temple-bolts' };
    const metal = { unranked: 'iron', wood: 'bronze', bronze: 'bronze', silver: 'silver', gold: 'gold', platinum: 'gold', diamond: 'gold', champion: 'gold', titan: 'gold', olympian: 'gold', greekgod: 'divine' };
    for (const e of r.out) {
      assert.equal(e.leaves, 50, `${e.tier} leaves (12 pairs and a tip on each branch)`);
      assert.equal(e.rim, 1, `${e.tier} solid shield`);
      assert.equal(e.glow, 1, `${e.tier} the symbol glows`);
      assert.ok(e.glyphShapes > 0, `${e.tier} a symbol is drawn`);
      assert.equal(e.glyph, e.tier === 'unranked' ? 'bolt' : glyphOf[e.tier], `${e.tier} symbol`);
      assert.equal(e.thinWhite, 0, `${e.tier} no thin white line on the shield`);
      assert.equal(e.wreath, metal[e.tier], `${e.tier} wreath metal`);
      if (e.tier === 'greekgod') { assert.equal(e.crown, 1, 'crown'); assert.equal(e.dia, 0, 'gg diamonds'); }
      else assert.equal(e.dia, 5 - e.div, `${e.tier} ${e.div} diamonds`);
    }
    assert.deepEqual(r.dupes, [], 'unique ids');
    await page.screenshot({ path: `${shots}${lang}-ranks-preview.png`, fullPage: true });
  });

  await check(`${lang}: inner screens: one big thing on top, no explanation line under a label when the section has items`, async () => {
    const bad = [];
    for (const r of ['shop', 'achievements', 'calendar', 'history', 'wods', 'plans', 'schedule', 'exercises']) {
      await page.goto(`${base}#/${r}`);
      await page.waitForSelector('main h1');
      await page.waitForTimeout(250);
      bad.push(...await page.evaluate((r) => [...document.querySelectorAll('main .section-label + p.row-sub')]
        .filter((p) => p.nextElementSibling && !p.nextElementSibling.matches('.section-label'))
        .map((p) => `${r}: ${p.textContent.slice(0, 50)}`), r));
      if (['shop', 'achievements', 'calendar'].includes(r) && await page.locator('main .screen-hero').count() !== 1) bad.push(`${r}: no big number on top`);
    }
    assert.equal(bad.join(' | '), '', `inner screens: ${bad.join(' | ')}`);
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
    await page.goto(`${base}#/settings`);
    await page.getByRole('button', { name: L(lang, 'English', 'עברית') }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dir), lang === 'he' ? 'ltr' : 'rtl');
    await page.getByRole('button', { name: L(lang, 'עברית', 'English') }).click();
  });

  await check(`${lang}: profile edit saves, bodyweight history grows`, async () => {
    await page.goto(`${base}#/profile`);
    await page.waitForSelector('.profile-head');
    // three tiles (achievements, shop, calendar); no role model and no Zip
    assert.equal(await page.locator('.profile-tiles a').count(), 3);
    assert.equal(await page.getByText(L(lang, 'המודל שלי', 'My role model')).count(), 0);
    assert.equal(await page.locator('.zip-host, .zip').count(), 0, 'Zip is gone');
    await page.screenshot({ path: `${shots}${lang}-profile.png`, fullPage: true });
    await page.getByRole('button', { name: L(lang, 'עריכת פרופיל', 'Edit profile') }).click();
    await page.waitForSelector('.sheet #pe-weight');
    await page.fill('#pe-weight', '84');
    await page.click('.sheet .btn-primary');
    await page.waitForSelector('.toast');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
    // the body-weight history lives in the edit sheet
    await page.getByRole('button', { name: L(lang, 'עריכת פרופיל', 'Edit profile') }).click();
    await page.waitForSelector('.sheet .bw-hist .row .num');
    assert.ok(await page.locator('.sheet .bw-hist .row').count() >= 2, 'bodyweight history grows');
    await page.screenshot({ path: `${shots}${lang}-profile-edited.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('.sheet'));
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
/** After signing in on a phone that already had (or pulled) data: answer "not now" to notifications and close what is new,
 * the only catch-up questions such a phone gets (Elia 27.11), until the app opens. */
async function throughCatchUp(pg) {
  for (let i = 0; i < 4; i++) {
    const el = await pg.waitForSelector('.tabbar, .ob-step[data-step="notify"], .ob-step[data-step="news"]', { timeout: 15000 });
    if (await el.evaluate((n) => n.classList.contains('tabbar'))) return;
    const step = await el.getAttribute('data-step');
    await pg.click(step === 'notify' ? '.ob-step[data-step="notify"] .btn-ghost' : '.ob-step[data-step="news"] .btn-primary');
    await pg.waitForFunction((st) => !document.querySelector(`.ob-step[data-step="${st}"]`), step);
  }
  await pg.waitForSelector('.tabbar', { timeout: 5000 });
}

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

await check('accounts: an old phone moves its data (and crew spot) to the account, is asked only about notifications and shown what is new, then opens the app', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`old phone: ${e.message}`));
  await seedOldPhone(p);
  await p.check('#consent'); await p.click('#google');
  // then only what this phone was never asked: notifications, then what is new (no profile, goal or tour again)
  await p.waitForSelector('.ob-step .ob-actions .btn-ghost', { timeout: 10000 });
  await p.click('.ob-step .ob-actions .btn-ghost'); // notifications: not now
  await p.waitForSelector('.ob-step .news-list');
  assert.equal(await p.locator('.ob-step .news-list li').count(), 8);
  await p.click('.ob-step .ob-actions .btn');
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  assert.equal(await p.locator('.today-bell .bell-dot').count(), 0, 'what is new was seen in the questions: no dot');
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
  await throughCatchUp(p);
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
  await throughCatchUp(p);
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
  await throughCatchUp(p);
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

await check('accounts: an older app never writes over a newer one; data that is not ours never replaces the phone', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage(); p.on('pageerror', (e) => errors.push(`old-app: ${e.message}`));
  await onboard(p, 'he');
  await p.evaluate(async () => (await import('./src/ui/sync.js')).syncNow());
  const n = acct.uploads.length;
  assert.ok(n >= 1 && acct.remote.app_version, 'the app version is stored with the data');
  // a newer app wrote last: this one keeps its change on the phone and says so
  acct.remote.app_version = '99.0.0'; acct.remote.version += 1;
  const st = await p.evaluate(async () => { const s = await import('./src/ui/storage.js'); await s.updateSettings({ weeklyGoal: 6 }); return (await import('./src/ui/sync.js')).syncNow(); });
  assert.equal(st, 'old-app');
  assert.equal(acct.uploads.length, n, 'nothing written');
  // something that is not our data comes down: it is refused, the phone keeps its own
  acct.remote = { data: { workouts: 'broken' }, version: acct.remote.version + 1, app_version: null };
  const st2 = await p.evaluate(async () => { await (await import('./src/ui/db.js')).dbPut('kv', { ...(await (await import('./src/ui/db.js')).dbGet('kv', 'sync')), syncedVersion: 1 }, 'sync'); return (await import('./src/ui/sync.js')).syncNow(); });
  assert.equal(st2, 'rejected');
  assert.equal(await p.evaluate(async () => (await (await import('./src/ui/db.js')).dbGet('profile', 'me'))?.name), 'Elia');
  await c.close();
});

await check('accounts: two refreshes at once use the single-use refresh token once (nobody is signed out)', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage();
  await onboard(p, 'he');
  const ok = await p.evaluate(async () => {
    const db = await import('./src/ui/db.js');
    const s = await db.dbGet('kv', 'session'); await db.dbPut('kv', { ...s, expiresAt: Date.now() - 1000 }, 'session');
    const auth = await import(`./src/ui/auth.js?fresh=${Date.now()}`); // a fresh module reads the stored (expired) session
    const r = await Promise.all([auth.getSession(), auth.getSession(), auth.getSession()]);
    return r.every((x) => x && x.accessToken);
  });
  assert.equal(acct.refreshes, 1, 'one refresh');
  assert.ok(ok, 'still signed in');
  await c.close();
});

await check('accounts: deleting the account leaves the crew first; if that fails nothing is deleted', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const order = [];
  await c.route(/supabase\.co\/rest\/v1\/rpc\/leave_group/, (r) => { order.push('leave'); return r.fulfill({ status: 503, body: '{}' }); });
  const p = await c.newPage();
  await onboard(p, 'he');
  await p.evaluate(async () => { await (await import('./src/ui/db.js')).dbPut('kv', { token: 't'.repeat(64), code: 'ABCDEFGH', name: 'Crew', nickname: 'Me', memberId: 'm1', lastSeenId: 0 }, 'crew'); });
  await p.reload(); await p.waitForSelector('.tabbar');
  const del = async () => {
    await p.goto(`${base}#/settings`);
    await p.locator('.row', { hasText: 'מחיקת החשבון וכל הנתונים' }).click();
    await p.fill('.sheet input', 'מחיקה');
    await p.locator('.sheet .btn-danger').click();
  };
  await del();
  await p.waitForSelector('.toast');
  assert.equal(acct.deletes, 0, 'the account stays while the crew spot could not be removed');
  await c.unroute(/supabase\.co\/rest\/v1\/rpc\/leave_group/);
  await c.route(/supabase\.co\/rest\/v1\/rpc\/leave_group/, (r) => { order.push('leave'); return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }); });
  await c.route(/supabase\.co\/rest\/v1\/rpc\/delete_my_account/, (r) => { order.push('delete'); acct.deletes++; return r.fulfill({ status: 204 }); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  await del();
  await p.waitForSelector('#google', { timeout: 8000 });
  assert.deepEqual(order.slice(-2), ['leave', 'delete']);
  await c.close();
});

await check('accounts: the rest reminder goes to the phone you train on, is withdrawn when the app is on screen at the end, and a rest cut to 0 sends none', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage();
  await onboard(p, 'he');
  await p.evaluate(async () => {
    const fakeSub = { endpoint: 'https://push.example/this-phone', toJSON: () => ({ endpoint: 'https://push.example/this-phone', keys: { p256dh: 'x', auth: 'y' } }) };
    Object.defineProperty(Notification, 'permission', { get: () => 'granted' });
    Object.defineProperty(navigator.serviceWorker, 'ready', { value: Promise.resolve({ pushManager: { getSubscription: async () => fakeSub } }) });
    const { setDraft } = await import('./src/ui/store.js'); setDraft({ id: 'rest-2', name: '', startedMs: Date.now(), entries: [] });
    await (await import('./src/ui/rest-timer.js')).startRestTimer(15, 'x'); // the shortest rest
  });
  await p.waitForTimeout(600);
  assert.ok(acct.pushes.some((x) => x?.sub?.endpoint === 'https://push.example/this-phone'), 'this phone claims the push address');
  const posts = acct.alarms.filter((a) => a.method === 'POST').length;
  assert.ok(posts >= 1);
  await p.waitForTimeout(12000); // 3 s before the end, on screen: withdrawn
  assert.equal(acct.alarms.at(-1).method, 'DELETE', `withdrawn while the app is on screen: ${acct.alarms.map((a) => a.method).join(',')} vis=${await p.evaluate(() => document.visibilityState)}`);
  // a rest cut to (almost) nothing: no reminder in the past, the old one is withdrawn
  await p.evaluate(async () => (await import('./src/ui/rest-timer.js')).startRestTimer(10, 'y'));
  await p.waitForTimeout(400);
  await p.locator('.rest-bar .rest-btn', { hasText: '−15' }).click();
  await p.waitForTimeout(800);
  assert.equal(acct.alarms.at(-1).method, 'DELETE', `cut to 0: ${acct.alarms.map((a) => `${a.method}${a.body ? Math.round((Date.parse(a.body.fire_at) - Date.now()) / 1000) : ''}`).join(',')} left=${await p.evaluate(async () => { const { store } = await import('./src/ui/store.js'); return store.draft?.timer ? store.draft.timer.endAt - Date.now() : 'none'; })}`);
  assert.ok(!acct.alarms.some((a) => a.method === 'POST' && Date.parse(a.body.fire_at) < Date.now() - 1000), 'never a reminder in the past');
  await c.close();
});

await check('accounts: the morning reminder gets the seven messages from the week plan, and the time from Settings', async () => {
  const c = await phone(); const acct = await installFakeSupabase(c);
  const p = await c.newPage();
  await onboard(p, 'he');
  await p.evaluate(async () => {
    const { saveRoutine, saveSchedule } = await import('./src/ui/store.js');
    await saveRoutine({ id: 'r-legs', schemaVersion: 1, name: 'יום רגליים', folderId: null, notes: '', createdMs: 1, updatedMs: 1, entries: [] });
    await saveSchedule({ days: { [new Date().getDay()]: [{ id: 'x1', kind: 'workout', ref: 'r-legs' }] }, done: {} });
  });
  const msgs = () => acct.pushes.filter((b) => Array.isArray(b?.morning_msgs));
  await p.waitForFunction(() => true); await p.waitForTimeout(3000);
  const last = msgs().at(-1);
  assert.ok(last, 'sent to the server');
  assert.equal(last.morning_msgs.length, 7);
  assert.match(last.morning_msgs[new Date().getDay()].title, /יום רגליים/, "today's message names the planned workout");
  assert.equal(last.morning_minute, 480, '08:00 by default');
  assert.ok(last.tz && last.morning_on === true);
  await p.goto(`${base}#/settings`); await p.waitForSelector('#morning-time');
  await p.fill('#morning-time', '07:30'); await p.locator('#morning-time').dispatchEvent('change');
  await p.waitForTimeout(3000);
  assert.equal(msgs().at(-1).morning_minute, 450, 'the new time');
  await c.close();
});

await check('maintenance lock: only "Updating." with the return time and a language switch (no other button, no link), in he / en / other languages; it stays (no reload)', async () => {
  const lockServer = await serve(0, { locked: true });
  const lockBase = `http://localhost:${lockServer.address().port}/`;
  try {
    for (const [locale, title] of [['he-IL', 'מתעדכנים.'], ['en-US', 'Updating.'], ['ru-RU', 'Updating.']]) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale, serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.goto(lockBase);
      await page.waitForSelector('html[data-ready="1"]');
      assert.equal((await page.textContent('main.maint h1')).trim(), title, locale);
      assert.match(await page.textContent('.maint-back'), /\d\d:\d\d/, `${locale}: the time`);
      assert.equal(await page.locator('#app a').count(), 0, `${locale}: no link`);
      assert.equal(await page.locator('#app button').count(), 1, `${locale}: one button only, the language switch`);
      // Elia 27.11: people who read only English (or only Hebrew) can switch; nothing else on the screen does anything
      const other = title === 'מתעדכנים.' ? 'Updating.' : 'מתעדכנים.';
      await page.click('#app .maint-lang');
      assert.equal((await page.textContent('main.maint h1')).trim(), other, `${locale}: switched`);
      assert.equal(await page.evaluate(() => document.documentElement.dir), other === 'Updating.' ? 'ltr' : 'rtl');
      await page.click('#app .maint-lang');
      assert.equal((await page.textContent('main.maint h1')).trim(), title, `${locale}: and back`);
      assert.equal(await page.evaluate(() => document.getElementById('nav-root').childElementCount + document.getElementById('rest-root').childElementCount), 0);
      if (locale !== 'ru-RU') await page.screenshot({ path: `${shots}lock-${locale.slice(0, 2)}.png` });
      if (locale === 'he-IL') {
        const url = page.url();
        await page.waitForTimeout(10000); // boot-guard.js reloads a page that never got ready after 9 s
        assert.equal(page.url(), url);
        assert.equal(await page.locator('main.maint').count(), 1, 'still the lock after 10 s');
      }
      await ctx.close();
    }
  } finally { lockServer.close(); }
});

await check('installed iPhone app with a short screen (iOS reports it shorter by the status bar): the bar drops to the edge and casts no shadow into the strip', async () => {
  const c = await phone({ viewport: { width: 393, height: 793 }, screen: { width: 393, height: 852 } });
  await installFakeSupabase(c);
  const p = await c.newPage();
  await onboard(p, 'he');
  await c.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); }); // opened from the home screen from now on
  await p.reload(); await p.waitForSelector('.tabbar');
  await p.waitForTimeout(300);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.shortvp), '1', 'the short screen is noticed');
  const r = await p.evaluate(() => { const b = document.querySelector('.tabbar').getBoundingClientRect(); return { gap: innerHeight - b.bottom, shadow: getComputedStyle(document.querySelector('.tabbar')).boxShadow }; });
  assert.ok(r.gap <= 8, `the bar sits at the edge (gap ${r.gap})`);
  assert.ok(!/0px 18px 44px/.test(r.shadow), 'no shadow falling into the strip');
  await c.close();
  // a normal screen (or a normal browser tab) keeps the usual gap
  const c2 = await phone(); await installFakeSupabase(c2);
  const p2 = await c2.newPage(); await onboard(p2, 'he'); await p2.waitForTimeout(300);
  assert.equal(await p2.evaluate(() => document.documentElement.dataset.shortvp ?? ''), '');
  await c2.close();
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
