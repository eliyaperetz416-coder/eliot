# Assumptions: verified vs. our own design

## Verified about Liftoff (official site / FAQ)
9 tiers and their floors (Wood 1 ... Olympian 900), rating scale 1-1000, Epley 1RM, rating depends on bodyweight and sex,
ranks awarded when a workout is posted, streak breaks after a 3-day gap, restore kinds Super / Mega / Revive, XP Shake,
seasons and leaderboards exist (server features, not built here), about 600 exercises with about 400 ranked.

## Our own design (labelled `OUR DESIGN` / `OUR CALIBRATION` in code)
**Visual identity (Stage 1):** name Demigod, currency Drachma, logo, colours, type, tab structure.

**Rank engine (Stage 2), all in `src/core/ranks.mjs` -> `CALIBRATION`:**
- 10 tiers: the 9 above plus Greek God from rating 1000 (open-ended, no divisions, no LP). Each tier below Greek God is split into 5 divisions V -> I.
  Wood (1-199) has divisions 39.8 points wide, Bronze to Olympian 20 points. LP is 0-100 inside a division.
- Bodyweight scaling `(80 / bw)^0.85`, sex factor female 0.62, curve exponent 1.4, `rating = round(900 * (scaled / R)^(1/1.4))`.
- Muscle rating and overall rating use `round(sum r^2 / sum r)`; overall appears after 3 ranked exercises.
- Ratings never decrease; each set keeps the bodyweight at the time it was logged.

**Exercise curves (Stage 2):** nobody publishes Liftoff's per-exercise numbers. We use anchors and families:
- `src/data/calibration.json` holds one `R` per family (the 1RM an 80 kg male needs for rating 900) and a `ratio` per exercise. `R = family R x ratio`.
- The seed anchors from the brief are used as given. Everything else is a rough estimate by ratio (dumbbell about 0.4 of the barbell lift per hand, cable and machine variants lean generous, isolation lifts much lower).
- Sanity check on an 80 kg male (tested in `tests/exercises.test.mjs`): beginner lifts land below Gold (mostly Silver), intermediate Gold-Platinum, advanced Diamond. Bodyweight pull-ups and dips rate a little generously (this follows from the brief's own test vectors).
- Cardio, timed holds, bodyweight-only abs and forearm / hip-machine exercises are tracked but not ranked.
- The free-exercise-db dataset has few glute- and hamstring-specific gym moves, so those two groups are below the brief's targets (15 and 19 instead of 24 and 22). Hip-dominant lunges and step-ups were assigned to Glutes to help balance.

**Hebrew:** all names and instructions were written by us (condensed, not literal translations). Items we are unsure about are listed in `docs/hebrew-review.md`.

**Muscle map:** exercise mode colours main muscles red, helpers orange. Rank and recovery modes are planned for Stage 4.
