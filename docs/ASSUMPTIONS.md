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

## Stage 3 (workouts)
**OUR DESIGN:**
- Onboarding asks for name, "which strength curve to use" (two options), bodyweight (required, 25-350 kg) and **age (optional)**. Age is stored on the profile and is **not used anywhere** in the calculations (Elia's request: collect it, ignore it).
- Set types: normal, warm-up, drop, failure. Warm-ups never count toward ratings, PRs, volume or (later) XP. Drop and failure count like normal sets. A superset is only a grouping of neighbouring exercises.
- Ratings and PR flags are recomputed from the stored sets in time order every time (live preview, posting, editing, deleting), so history is always consistent. Each set keeps the bodyweight of the day; each workout keeps the curve (sex) it was posted with.
- PR logic (our reading of "vs last week"): the metric is the estimated 1RM (Epley) for lifts, reps for unranked bodyweight moves (half of bodyweight plus added weight is the base load), seconds for holds and cardio. *First record* = first ever set of that exercise. *Weekly PR* = beats the best of the previous 7 days (needs at least one set in that window). *All-time PR* = beats the best ever. Ties are not PRs. Earlier sets of the same workout count as history.
- Rest defaults: compound 120 s, isolation 75 s, unranked 60 s; +/-15 s. The timer stores an end timestamp, so it is correct after the phone was locked. It beeps (WebAudio, unlocked by tapping V) and flashes when it ends; with reduced motion the flash becomes a static "rest is over" banner.
- Overall rank appears after 3 ranked exercises (not 3 muscle groups).
- Time-hold exercises store seconds and cardio stores minutes (kept as seconds) in the `reps` field.
- The app accent colour follows the overall rank tier (gold while unranked).

**Not verified yet (needs a real iPhone):** Wake Lock in the installed home-screen app, audio after the screen was locked, vibration (iOS does not support it).

## Stage 4 (ranks, map, card, progress)
**OUR DESIGN:**
- **"What do I need?"**: uses the inverse of the rating formula for your current bodyweight and curve. Loads are rounded up to 0.5 kg. For a division I rating the next step is the next tier. For bodyweight moves the load is the weight added on top of bodyweight ("bodyweight is enough" when the target is already below it). Estimates only.
- **Rank map**: each muscle takes the colour of its muscle-group rating and glows in it. Forearms, neck, adductors and abductors are not ranked and stay dim.
- **Recovery map (rough guide, not medical advice):** freshness = hours since the last working set / recovery hours. Large groups (back, chest, quads, hamstrings, glutes) 72 h, medium (shoulders, biceps, triceps, abs) 48 h, small (calves, forearms) 36 h; neck and adductors / abductors count as medium. A set counts fully for the main muscles and half for helper muscles; a muscle that was only a helper recovers in half the time. A session with 10 or more effective sets on a muscle needs 1.25x the time. The most demanding session of the last 14 days decides; older sessions are ignored. Warm-ups never fatigue.
- **Charts:** estimated 1RM per workout (best set, Epley), weekly volume per local week (Monday start, last 12 weeks), bodyweight. In Hebrew, time runs right to left and the value axis sits on the right.
- **Player card:** level, streak, achievements and cosmetic slots are placeholders (a dash and empty dashed circles) until Stage 6.

## Stage 5 (train your way)
**OUR DESIGN, general guidance only (not medical or scientific claims):**
- **Saved workouts ("My workouts").** Prepared in advance (name, exercises, sets, rep range, rest, notes, folders, templates). Pressing "Start workout" asks **"Which workout today?"**: next day of the plan, your saved workouts, repeat last, or an empty workout. Starting from a saved workout prefills weights and reps from the last time you did each exercise.
- **Plan generator** (no AI, deterministic for a seed). Split by days: 2 = Full body A/B, 3 = Full body A/B/C, 4 = Upper/Lower x2, 5 = Push/Pull/Legs + Upper/Lower, 6 = Push/Pull/Legs x2. Compounds first, no duplicate pattern or exercise in a session, only exercises that fit the chosen equipment (if a pattern has none, another pattern of the same muscle group is tried, otherwise the day is shorter and the plan shows a note).
- **Reps and sets.** Strength: main lifts 3-6 reps (4 sets by default), accessories 6-10. Hypertrophy: compounds 6-12, isolation 10-15 (3 sets). General fitness: 8-12 (3 sets). Sets per exercise stay between 2 and 5.
- **Weekly sets per muscle group.** Major groups (chest, back, shoulders, quads, hamstrings): beginner 8-10, intermediate 10-16, advanced 14-20. Minor groups (biceps, triceps, glutes, calves, abs) get half of that range (beginner 4-5, intermediate 5-8, advanced 7-10). The generator raises sets, adds an exercise, lowers sets or drops an exercise until each trained group is inside its range. A session length (45/60/75 min) caps a day at 5/6/8 exercises; advanced lifters on 2 days may exceed that cap because the volume target wins.
- **Variety.** The main lifts of a day stay the same all plan (so loads can progress); accessories rotate every 3 weeks (seeded). **Last week = deload**: sets are cut to about 60%.
- **Automatic progression (double progression).** If all planned working sets reach the top of the rep range at the same weight, the next session suggests the smallest sensible jump (barbell and EZ bar +2.5 kg, dumbbell +2 kg per hand, machine and cable +5 kg) and goes back to the bottom of the range. If the bottom of the range was missed two sessions in a row, it suggests about 7.5% less (rounded down to a load step). Otherwise it holds the weight and aims one rep higher. Deload weeks use about 90% of the suggested weight.
- **Starting loads.** With history: estimated 1RM x a goal percentage (strength 80%, hypertrophy 70%, general fitness 60%), rounded to the load step. With no data: "find your working weight"; the first working set you log fills the weight of the remaining sets.
- **Custom exercises** behave like library exercises (search, history, PRs, muscle map). They are unranked unless you pick "count like [exercise]" (weight or bodyweight types only), which borrows that curve, family and ranking group. Photos stay on the phone, scaled to at most 800 px. An exercise that is already used in a workout, saved workout or plan cannot be deleted.
