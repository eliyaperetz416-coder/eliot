# Update-Lock Screen ("מתעדכנים") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1.48.0, in which every phone (owner included) sees only a "מתעדכנים." screen until a later release turns the lock off.

**Architecture:** A pure module `src/core/maintenance.mjs` holds the flag (`LOCKED`), the return date (`BACK_AT`) and two small helpers. `src/main.js` checks the flag before anything else: when locked it loads only the dictionaries, draws `src/ui/maintenance.js` and keeps the service worker eager, so the unlock release takes over by itself. Data, store, crew and Supabase are never touched while locked. `sw.js` activates the lock release at once (after precaching), so open apps on the old version reload into the lock.

**Tech Stack:** Plain ES modules, no bundler; service worker precache stamped by `npm run stamp`; tests: `node --test` plus the Playwright smoke test (`npm run test:ui`).

**Spec:** `docs/superpowers/specs/2026-11-22-redesign-accounts-design.md`, section 3.

## Global Constraints

- Lock is total: no button, no secret code, no URL parameter. Only a new release (`LOCKED = false`) removes it.
- Must work offline: every file the lock screen needs is in the precache (it already is, since stamp-sw precaches all of `src/`).
- Copy (exact): he `מתעדכנים.` / `משהו חדש בדרך. האימונים שלך שמורים.` / `חוזרים בערך ב־{date}`; en `Updating.` / `Something new is on the way. Your workouts are safe.` / `Back around {date}`.
- The date is a date, never a countdown. `BACK_AT = '2026-12-20'` (confirm with Elia before the release).
- Language = the phone's language (`detectLanguage(navigator.language)`), not the saved setting.
- Test bypass only in the test server (`tests/serve.mjs`), never in shipped code.
- Repo rules that stay: no Hebrew literals in `src/ui` (i18n test), he/en key parity, `npm run stamp` before every commit, `prefers-reduced-motion` turns animation off, version in both `package.json` and `src/version.js`.

## Review Focus

1. A phone that has the old version **open** when v1.48.0 ships should land on the lock without the user tapping "reload". → `sw.js` gets `ACTIVATE_NOW`, pinned to `LOCKED` by a test in Task 2.
2. The first open after the update **with no network** should still show the lock, not the offline page. → precache test in Task 2 checks the lock's files and both dictionaries are listed.
3. The **unlock** release must reach locked phones without any tap (there is no button). → `activateWaiting()` unit test in Task 1, used by the lock screen in Task 2.
4. A phone in a language other than he/en (e.g. `ru-RU`) should get the English lock, not a blank screen. → smoke check in Task 2.
5. `boot-guard.js` must not reload the lock page every 9 s. → smoke check waits for `html[data-ready="1"]` and checks the page is still there after 10 s.

---

### Task 1: The flag, the date and the copy

**Files:**
- Create: `src/core/maintenance.mjs`
- Modify: `src/data/i18n/he.json`, `src/data/i18n/en.json` (add 3 keys each)
- Test: `tests/maintenance.test.mjs`

**Interfaces:**
- Produces:
  - `LOCKED: boolean` (true in this release)
  - `BACK_AT: string` (ISO date `YYYY-MM-DD`)
  - `backAtLabel(iso: string, lang: 'he'|'en') -> string`: day and month only, `Intl.DateTimeFormat` with `he-IL` / `en-GB`, `{ day: 'numeric', month: 'long' }`, parsed as a local date (not UTC, so the day never shifts).
  - `activateWaiting(reg: { waiting?: { postMessage(msg): void } } | null) -> boolean`: posts `{ type: 'SKIP_WAITING' }` to `reg.waiting` and returns true; false when nothing is waiting.
  - i18n keys `maint.title`, `maint.body`, `maint.back` (with `{date}`), copy exactly as in Global Constraints.

- [ ] **Step 1: Write the failing tests** in `tests/maintenance.test.mjs`:
  - `backAtLabel('2026-12-20', 'he') === '20 בדצמבר'` and `backAtLabel('2026-12-20', 'en') === '20 December'`
  - `BACK_AT` matches `/^\d{4}-\d{2}-\d{2}$/` and `backAtLabel(BACK_AT, 'en')` does not contain `Invalid`
  - `typeof LOCKED === 'boolean'`
  - `activateWaiting({ waiting: { postMessage: (m) => sent.push(m) } })` returns true and `sent` deep-equals `[{ type: 'SKIP_WAITING' }]`; `activateWaiting({})` and `activateWaiting(null)` return false
  - both dictionaries have `maint.title`, `maint.body`, `maint.back`, and `maint.back` contains `{date}`
- [ ] **Step 2: Run** `node --test tests/maintenance.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `src/core/maintenance.mjs` (header comment: OUR DESIGN, spec section 3) and add the 3 keys to both dictionaries.
- [ ] **Step 4: Run** `npm test`. Expected: all pass, including i18n parity.
- [ ] **Step 5: Commit** `feat: maintenance flag, return date and copy`.

### Task 2: The lock screen, boot path and service worker

**Files:**
- Create: `src/ui/maintenance.js`
- Modify: `src/main.js` (`start()` and a new `bootLocked()`), `src/styles/components.css` (`.maint` block), `sw.js` (install handler), `tests/serve.mjs` (`serve(port, { locked })`), `tests/pwa.test.mjs`, `tests/ui.smoke.mjs`, `index.html` preload block (regenerated by `npm run stamp`)

**Interfaces:**
- Consumes: Task 1 exports; `setDictionaries`, `setLanguage`, `detectLanguage`, `DIR`, `t` from `src/core/i18n.mjs`; `h` from `src/ui/dom.js`.
- Produces:
  - `maintenanceScreen(lang: 'he'|'en') -> HTMLElement`: `<main class="maint" role="status">` with a glowing bolt mark (inline SVG, `aria-hidden`), `<h1>` = `maint.title`, `<p>` = `maint.body`, `<p class="maint-back">` = `maint.back` with `backAtLabel(BACK_AT, lang)`. **No `<button>` and no links.**
  - `keepEager()`: registers `sw.js`, calls `activateWaiting(reg)` now and on every `updatefound` once the new worker is `installed`, reloads once on `controllerchange`, calls `reg.update()` on `visibilitychange` to visible and every 30 minutes.
  - `serve(port, { locked = false } = {})`: when `locked` is false, the response for `/src/core/maintenance.mjs` has `export const LOCKED = true` replaced with `export const LOCKED = false`. `npm run serve` passes `{ locked: true }` (what users get).
  - `sw.js`: `const ACTIVATE_NOW = true;` and the install handler becomes `e.waitUntil(precache().then(() => ACTIVATE_NOW && self.skipWaiting()))`, with `RESCUE` kept as is.

- [ ] **Step 1: Write the failing tests.**
  - `tests/pwa.test.mjs`:
    - "lock release activates at once": `ACTIVATE_NOW` in `sw.js` equals `LOCKED` from `src/core/maintenance.mjs` (read both files as text).
    - "lock works offline": the `PRECACHE` list contains `src/core/maintenance.mjs`, `src/ui/maintenance.js`, `src/data/i18n/he.json` and `src/data/i18n/en.json`.
  - `tests/ui.smoke.mjs`, a new check `maintenance lock`, run on a second server `serve(0, { locked: true })`, for `he-IL`, `en-US` and `ru-RU` locales:
    - waits for `html[data-ready="1"]`
    - `main.maint h1` text is `מתעדכנים.` for he, and `Updating.` for en and ru
    - `.maint-back` contains `20` (the day of `BACK_AT`)
    - `page.locator('button, a').count() === 0` inside `#app`
    - `#nav-root` and `#rest-root` are empty
    - after `page.waitForTimeout(10000)` the URL and `main.maint` are unchanged (boot-guard did not reload)
    - screenshot `lock-he.png` and `lock-en.png`
  - The existing smoke routes keep using `serve(0)` (unlocked), so they still pass.
- [ ] **Step 2: Run** `npm test` and `STAGE=tmp-verify npm run test:ui`. Expected: the new pwa tests and `maintenance lock` FAIL; everything else passes.
- [ ] **Step 3: Implement `src/ui/maintenance.js`** and the `.maint` styles: centred column, dark background, the bolt in a radial glow that pulses (3 s, ease-in-out), and no animation under `[data-motion="reduce"]` or `prefers-reduced-motion`.
- [ ] **Step 4: Implement `bootLocked()` in `src/main.js`:**
  1. fetch both dictionaries and call `setDictionaries`
  2. `lang = detectLanguage(navigator.language)`; then `setLanguage`, `html.lang`, `html.dir = DIR[lang]`, `document.title = t('app.name')`
  3. `#app` gets `maintenanceScreen(lang)`, and `#nav-root` and `#rest-root` are emptied
  4. set `html.dataset.ready = '1'`, then call `keepEager()`

  `start()` calls `bootLocked()` instead of `boot()` when `LOCKED`, inside the same retry loop. Nothing else (data, store, crew, link, lock.js) loads while locked.
- [ ] **Step 5: Implement the `sw.js` change and the `serve.mjs` option.**
- [ ] **Step 6: Run** `npm run stamp`, `npm test` and `STAGE=tmp-verify npm run test:ui`. Expected: all pass. Look at `lock-he.png` and `lock-en.png`: the text is centred, there is no button, and the glow is visible.
- [ ] **Step 7: Clean up** `docs/stage-tmp-verify`, then **commit** `feat: update-lock screen (maintenance mode)`.

### Task 3: Release v1.48.0

**Files:**
- Modify: `package.json` and `src/version.js` (`1.48.0`), `docs/ASSUMPTIONS.md` and `docs/ASSUMPTIONS.he.md` (a v1.48.0 section: why the lock exists, that only a release removes it, the date rule, the test-only bypass, `ACTIVATE_NOW`, and that the unlock release must set both `LOCKED = false` and `ACTIVATE_NOW = false`)

- [ ] **Step 1:** Ask Elia to confirm the date (`BACK_AT`). Change it if he asks, and update the Task 1 test values with it.
- [ ] **Step 2:** Bump the version and write both ASSUMPTIONS sections.
- [ ] **Step 3: Run** `npm run stamp`, `npm test` and `STAGE=tmp-verify npm run test:ui`. Expected: all pass. Then remove the temp stage folder.
- [ ] **Step 4:** Commit `v1.48.0: update-lock screen`, push `claude/mah-kora-ascpov`, and open a PR to `main`. Elia merges it.
- [ ] **Step 5:** After the merge, check that the Vercel production deployment is READY and that `https://eliot-three.vercel.app/` shows the lock in a fresh browser (Playwright, `he-IL`).
