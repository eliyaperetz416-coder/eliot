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

## Stage 6 (gamification), all numbers OUR DESIGN
- **Valid workout:** at least 3 done working sets (warm-ups and unfinished sets do not count). Only valid workouts pay rewards, extend the streak and count for quests. Only the first 2 valid workouts of a calendar day are rewarded; a 3rd is valid but pays nothing (its sets, PRs and ratings still count).
- **XP:** 10 per working set (the first 40 sets of a workout), +25 per PR set (weekly or all-time, a "first record" is not a PR), +50 for finishing. Level n to n+1 costs 100 + 25(n-1) XP.
- **Drachmas:** 20 per rewarded workout + 3 per working set (that part capped at 60) + 15 per PR set. Daily quest 15, weekly quest 60, achievements 20-500, streak milestones 7 days = 50, 30 days = 200, 100 days = 500 (each paid once per streak).
- **Quests:** 3 daily + 1 weekly, picked from `src/data/quests.json` with a seed made from the local date (the Monday of the week for the weekly one), so there are no rerolls. They reset at local midnight and Monday 00:00. Progress is derived from valid workouts, so it stays consistent when a workout is edited or deleted. Rewards are claimed with a tap.
- **Streak:** counts workout days. It breaks when 3 full calendar days pass without a valid workout (a distance of 3 days or less between workout days keeps it, `STREAK_MAX_GAP_DAYS = 3`). Day maths uses UTC day numbers of local date keys, so time zones and daylight-saving changes cannot move a day.
- **Restores** (Super up to 30 days for 150 drachmas, Mega up to 60 for 300, Revive any length for 500): usable within 7 days after the break, one per break, from the "streak broken" card. A restore reinstates the lost streak as if there had been no gap; workouts done since the break are added on top. Milestones that were already paid are not paid again.
- **XP Shake** (100 drachmas): doubles the XP of the next rewarded workout; one active at a time; it waits (is not used up) if the next workout is not valid.
- **Shop:** 15 cosmetics (6 backgrounds, 5 frames, 4 effects, 100-1000 drachmas) drawn with canvas code, no external assets. Cosmetics only; they never change a rank. Equipped items appear on the player card, and Golden Dust also falls on the rank-up screen.
- **Achievements:** 27 in `src/data/achievements.json`, each with a small drachma reward, unlocked once (workouts, streaks, PRs, overall tiers Bronze to Greek God, total volume, exercises tried, first custom exercise, first generated plan). The highest overall rank ever reached is remembered, so an achievement is never lost.
- **Not rolled back:** deleting or editing a past workout does not take away XP, drachmas, streak days or achievements it already paid (there is no server to cheat against, and it keeps things predictable).

## Stage 7 (backup, settings, polish)
**OUR DESIGN:**
- **Backup:** one JSON file (`demigod-backup-YYYY-MM-DD.json`) with a schema version, app version, export time and checksum. It holds profile, bodyweight, workouts, saved workouts, folders, plans, custom exercises (with their photos), game state and preferences. It does not hold a workout in progress. The checksum detects a damaged or hand-edited file; it is not protection against forgery.
- **Import:** the file is validated before anything is touched. **Replace** wipes everything on the phone and restores the backup. **Merge** keeps what you have and adds what is missing (matched by id). In a merge the profile and game progress (XP, drachmas, streak) stay as on this phone, except achievements (union) and the best rank reached; if the phone has no workouts yet, the backup's profile and game are taken as they are. The import is one database transaction: everything goes in or nothing changes.
- **Backup reminder:** after 28 days without a backup (or 28 days after the first workout if you never backed up) a card appears on the workout screen. "Later" hides it for 3 days.
- **Reset:** deletes all data on the device and needs a typed confirmation word.
- **Storage:** the app asks the browser for persistent storage. iOS may clear sites that were not opened for seven days when the app is not on the home screen, so a backup is the safety net.

## After Stage 7 (feedback round)
**OUR DESIGN:**
- **Finishing a workout:** if sets have weight and reps but were never ticked with the V, the finish sheet offers "Mark N filled sets as done and finish" (a set is usable when it has reps, and a weight too unless it is a bodyweight, hold or cardio exercise). The other option finishes with only the ticked sets. Nothing typed is lost.
- **Renaming exercises:** the name is changed per language, everywhere (lists, workouts, history, search). The original name is kept so it can be restored, and history and ranks do not change.
- **Missing exercises:** "Create it myself" makes a custom exercise right away. "Ask Claude to add it" saves a request (name, video links, notes) on the phone and builds a message to paste into the chat. There is no AI inside the app (no server, no AI APIs): Claude researches the exercise in the chat and adds it to the library in an update. Renames and requests are part of the backup.
- **Shop art:** frames, the lightning effect and the helm were redrawn (gold metal gradients, symmetric laurel, Greek key border, lightning ring, feathered wings).
- **Planned weight in saved workouts (optional):** each exercise in a saved workout can have a weight in kg. When you start the workout every set begins with that weight; left empty it uses the weight from the last time (as before). Change it any time in the saved workout. It is not updated automatically after a workout.
- **No zoom:** pinch and double-tap zoom are switched off (a zoomed-in screen was hard to leave). This also removes zoom as an accessibility aid.
- **Library additions** live in `src/data/extra-exercises.json` (hand-written, no photo yet) together with search aliases, for example the gym word for the adductor machine. First addition from a request: Hollow Body Crunch (bodyweight, abs, unranked). We could not watch the TikTok videos from the request, so the steps are the standard version of the exercise.
- **Which weight you type (OUR DESIGN):** a set always stores the TOTAL weight (bar, sled or machine weight included), so ranks, PRs and volume use one convention. Barbell and EZ bar: the total on the bar. Dumbbells: one dumbbell (per hand). Machines and cables: the number on the stack. Bodyweight moves: only the added weight. For bar and machine exercises you can set an optional per-exercise base weight (for example a 20 kg machine). Then you type only what you add and the app stores base + typed. Example: base 20, you type 10, the set counts as 30 kg. History keeps the totals, so changing the base later never changes past workouts.
- **Training calendar** (Profile): one month at a time, a day is filled when at least one workout was posted on it, a dot marks a day with a personal record, tap a day to open its workouts. Sunday first in Hebrew, Monday first in English. Days use the workout's own local date, so time zones cannot move a day. You cannot go forward past this month or back before your first workout.
- **Planned weight goes up by itself:** when you finish a workout that was started from a saved workout, every exercise that HAS a planned weight is raised to the heaviest working set you did, if that is more than the plan. Warm-ups and unfinished sets are ignored, a lighter day never lowers the plan, and an empty planned weight is left alone (it already follows your last session). The result screen lists what changed. It can be switched off in Settings.

## Crew (friends group): the first feature that uses a server
**OUR DESIGN. This changes an early rule of the project** ("no server, no accounts, no leaderboards"). Elia asked for it, for 4 to 6 friends.
- **What it is:** a group of up to 8 people with a code. A leaderboard (overall rank, level, weekly volume, streak), a feed for chat and short statuses ("going to train"), WhatsApp invite, optional notifications.
- **Where it runs:** a free Supabase project named `demigod` (Europe, Frankfurt), separate from any other project. Source of the database in `supabase/migrations/001_crew.sql`, the notification function in `supabase/functions/notify/`.
- **No accounts.** On the phone the app makes a random secret token. The server keeps only its hash. Every call needs the token. The tables are closed to the public (row level security with no policies); the app can only call the listed functions.
- **What is shared:** nickname, overall rank (tier, division, rating), level, streak, weekly volume, workouts this month and total, and the messages you write. **Never** bodyweight, workouts, sets, exercises or photos. Numbers are sent when you finish a workout and when you open the crew.
- **Trust:** numbers come from each phone, so a friend could fake them. It is a group of friends; there is no anti-cheat.
- **Limits:** 8 people per crew, nicknames unique per crew, messages up to 280 characters, one message per 1.5 seconds, the last 500 messages per crew are kept. Leaving frees your seat and nickname. Anyone with the code can join, so the code goes only to friends.
- **Notifications:** Web Push. On iPhone it works only when the app is added to the home screen (iOS 16.4 or newer) and you allow it. The server sends the sender's nickname and message to the other members. A free-plan Supabase project pauses after a week without activity; the first use afterwards wakes it up.
- **Offline:** everything else in the app works as before without internet. The crew shows a "no connection" message.
- **Not verified from the sandbox:** the sandbox cannot reach Supabase or a push service, so the screens were tested against an in-memory copy of the database rules, and the real database was tested with SQL. Real notifications are untested until a phone with the app on the home screen tries them.

## Simpler home screen (after seeing a friend's app)
**OUR DESIGN:** the Workout tab opens on "Today": the date, one big card with the next workout and one big Start button (the next day of your plan, else the saved workout you used last, else a free workout), a row of this week's days (tap for the calendar), one line with level, coins and streak, then the rest. Quests and streak are folded into one row that opens by itself when there is something to collect or a streak to restore. The big rank card moved to the Ranks tab. "Another workout" opens the "Which workout today?" sheet. We took the idea (one clear next step), not the look of any other app.
