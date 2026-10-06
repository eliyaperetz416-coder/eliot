# Demigod

Free, installable PWA for gym lifting: every set you log turns into ranks, XP and rewards.
Plain HTML + CSS + JS modules. No framework, no bundler, no server. Works offline after the first load.

## Run locally
```
npm install          # only needed for tests (Playwright)
npm run serve        # http://localhost:8080
npm test             # unit tests (node --test)
npm run test:ui      # Playwright smoke tests, 390x844, he + en, screenshots in docs/stage-N/
npm run stamp        # REQUIRED before every commit that touches app files: refreshes the service-worker cache list
```

## Deploy
Push to `main`. Vercel (free plan, framework "Other", no build command, output = repo root) deploys automatically.

## Layout
`src/core` pure logic (no DOM, unit tested) · `src/data` JSON data and i18n dictionaries · `src/ui` screens and components ·
`src/styles` tokens/base/components · `assets` fonts, icons, logo · `scripts` Node helpers · `tests` · `docs`.

## Languages
`src/data/i18n/he.json` and `en.json`. A test fails if a key exists in only one. No UI strings in code.

## Data pipeline (Stage 2)
`scripts/curation/*.mjs` hold our hand-curated list (ids, Hebrew names and steps, family, ratio). `scripts/build-exercises.mjs` joins it with
free-exercise-db into `src/data/exercises.json`; `scripts/process-images.mjs` makes the WebP images; `scripts/extract-muscles.mjs` extracted the muscle polygons.
Retuning the rank curves: edit `src/data/calibration.json` and rerun the build (see `docs/NOTES.md`).

## Backup, settings and the numbers (Stage 7)
- `#/settings`: language, accent colour, reduce motion, **export / import backup**, storage, credits, reset (typed confirmation).
  `src/core/backup.mjs` (format, checksum, validation, merge rules) is pure and unit tested; `src/ui/backup.js` does the IndexedDB work in one transaction.
- `#/numbers` ("About the numbers") is generated from `docs/ASSUMPTIONS.md` (English) and `docs/ASSUMPTIONS.he.md` (Hebrew):
  `npm run numbers` rewrites `src/data/numbers.json`. A unit test fails when the JSON is out of date, so edit the docs, run the script, commit both.
- Release checklist: `npm test`, `npm run numbers`, `npm run stamp`, `npm run test:ui`, commit, push to `main`.

## Licences
See `docs/LICENSES.md`. Exercise data is public domain, muscle polygons are MIT, fonts are SIL OFL, everything else is original.
