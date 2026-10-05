# Notes
- Logo: Elia kept the current simple lightning-bolt icon (Stage 1 placeholder). The three candidate logos stay in `assets/logo/` and `/logo-preview.html`. To change the icon later: `node scripts/make-icons.mjs <svg>`.
- Wake Lock / iOS standalone behaviour will be verified on a real iPhone in Stage 3.
- `#/kit` (components) and `#/ranks-preview` (all emblems) are hidden debug routes used by the tests.
- Re-building data: `node scripts/build-exercises.mjs <free-exercise-db clone>` then `node scripts/process-images.mjs <clone>`. Retune ratings by editing `src/data/calibration.json` (R per family, ratio per exercise), then rerun the build; `exercises.json` is generated.
- Outside Stage 2 scope, noticed: exercise list renders all 300 rows at once (content-visibility keeps it smooth; revisit in the Stage 7 performance pass).
- Muscle-map polygons have no separate side delt, so lateral raises highlight both front and rear delts.
