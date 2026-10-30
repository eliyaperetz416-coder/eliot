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
- The app accent is one steady purple by default (since v1.7). In Settings it can follow the overall rank tier instead (purple while unranked).

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
- **Which weight you type (OUR DESIGN, since v1.16):** you always type the TOTAL weight (bar, sled or machine included) and the set stores exactly that, so ranks, PRs and volume use one convention. Dumbbells: one dumbbell (per hand). Bodyweight exercises: only the weight you add. For barbells and machines a per-exercise empty weight (bar 20 kg by default, EZ bar 10 kg, plate-loaded machines set by you) is used only to show the plates for each side: fewest plates from 25/20/15/10/5/2.5/1.25 kg, the more even set on a tie (35 = 20 + 15). Until v1.15 the empty weight was added to what you typed; stored sets were totals then too, so history is unchanged.
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

## Consistency bonus on the overall rank (OUR DESIGN)
- The overall rank is strength plus a small consistency bonus, at most 20 points (one division).
- 1 point per training day in the last 4 weeks (up to 12), plus 2 points per full week of streak (up to 8). The streak breaks after a gap of more than 3 days.
- It is worked out from your workouts, so it fades by itself if you stop. Exercise and muscle ranks stay strength only.

## Make-up workout (OUR DESIGN)
- If you finish a workout and some exercises have no ticked working set, the Today screen offers them for up to 4 days as a one-time "Make up" workout.
- The make-up workout is not linked to a saved workout or plan, so it never changes planned weights or plan progress. "No thanks" removes the offer.

## My role model (OUR DESIGN)
- Profile → My role model: you type a name, an optional motivation line, optional YouTube / Instagram / TikTok links and an optional goal photo from your own gallery. A card shows on Today.
- Links are checked to be https on the right site, and tracking parameters are removed. Nothing is fetched from those channels; the photo stays on the phone (and in your backup).
- The app never ships anyone's photos, videos, logo or paid programs. A workout "inspired by" someone is built only from exercises the user sends.

## Weekly schedule (OUR DESIGN)
- Today → Plan my week: a day can hold up to 4 items (for example basketball and a strength workout; rest is alone on its day). For each weekday you choose a strength workout (a saved workout, the next day of your plan, or a free workout), rest, or another activity (basketball, football, running, swimming, cycling, walking, martial arts, yoga, other, with an optional name of your own).
- A scheduled saved workout leads the big card on Today. Rest and activity days show a card; an activity can be marked done and then fills that day in the week row. Rest days are dashed circles, activity days have an accent ring.
- Activities do not count as strength workouts: they do not affect ranks, the consistency bonus or the streak. The schedule is stored on the phone and included in the backup.

## Friend profile and optional plan sharing (OUR DESIGN)
- Tapping a member on the crew leaderboard opens their profile: rank, level, streak, this week's volume, workouts this month and their week plan.
- The week plan is **private by default**. In the crew details you can switch on "Share my week plan". Then the crew sees, for each weekday, rest / activity / workout (with the name of a saved workout or the activity name you typed) and which days you trained this week. Never exercises, sets, weights or bodyweight.
- Switching it off clears the plan on the server. Server side: `supabase/migrations/002_crew_plan.sql` (one nullable column, `update_plan`, and `my_group` returning it). The function keeps only the 7 weekdays, a kind from a fixed list, names cut to 30 characters and up to 7 valid dates.

## Shop: more things to buy (OUR DESIGN)
- The shop now has 40 cosmetics and comforts plus 5 consumables. None of it changes a rank or what a workout is worth.
- **App colours** (6): an equipped colour becomes the accent of the whole app while the Settings accent is "fixed colour". Text on the accent is dark or white automatically.
- **Titles** (8): shown under your name on the profile and on the player card.
- **Rest sounds** (4): bell, gong, whistle, pulse, all synthesised with WebAudio (no sound files). You can play each one before buying.
- **Drachma Boost** (120): doubles the workout drachmas (not the streak milestone bonus) of the next rewarded workout. One at a time, like the XP Shake.
- More drawn cosmetics: 3 backgrounds, 2 frames, 2 effects.

## My role model, more (OUR DESIGN)
- Beyond name, links and photo: **tips** you type from their videos (one per line, a different one shows on Today each day), a **weekly target** with a progress bar on the card, a line from them on the result screen after a workout, and "training the way of <name>" on the player card.
- **Workout from my model:** paste the exercises from a video (one per line, like "Bench press 4 x 6-8"); known exercises become a saved workout, unknown ones are listed so you can request them. Nothing is fetched from their channels and no content of theirs is shipped with the app.

## Result screen: what you lifted, in animals and cars (OUR DESIGN)
- After a workout the result screen shows the total volume as the weight of something: the biggest of 15 comparisons you matched or passed (house cat 4 kg up to blue whale 150,000 kg, typical adult weights), how many of it from 1.5 up, and how many kg to the next one. The picture is an emoji. Under 4 kg nothing is shown.

## Dumbbells: type both together (OUR DESIGN)
- Weight sheet of a dumbbell exercise: "One dumbbell" (default) or "Both together". With "both together" you type the total of the two dumbbells (28) and the app shows "each hand 14 kg". The stored weight is always per hand, so ranks and history never change.

## Crew notifications card
- The crew screen is the chat. The group code, invite, notifications (turn on / off, and why they might be unavailable), plan sharing and leaving are in a small settings sheet behind the gear button in the header (v1.24).

## Workouts tab instead of the Exercises tab (OUR DESIGN, v1.25)
- The tab bar is Today, Workouts, Progress, Profile. The Workouts tab leads with a big "New workout" button and your saved workouts (with photos and folders), then "Plan my week", Plans and the exercise library (a row that opens the full library, which is still used when building a workout).
- Today no longer repeats the list of saved workouts; it has one "All my workouts" button under the week row and quests.

## Crew leader (OUR DESIGN, v1.26)
- The person who creates a crew is its leader (the first member of every existing crew was made leader when this shipped). The leader has a "Leader" chip on the leaderboard and in the chat.
- Only the leader can: rename the crew, make a new invite code (the old code stops working, people already in stay), remove a member, and hand leadership to someone else. Tools are in the group settings sheet (rename, new code) and in a member's profile (make leader, remove).
- If the leader leaves, the longest-standing member becomes leader. A removed member sees "You were removed from the crew" and can only come back with the code.
- The server checks the role in each function (`kick_member`, `make_leader`, `rename_group`, `new_code` in `supabase/migrations/004_crew_leader.sql`), so hiding the buttons is not what protects it. A kick rewrites the member's token, like leaving does.

## Next workout, rank path, friends' workouts (OUR DESIGN, v1.27-1.29)
- **Next workout on Today** is the nearest strength workout planned in "Plan my week" within the next 7 days (today counts, unless you already trained today). Only if nothing is planned does it fall back to the next day of your plan, then the saved workout you used last.
- **Rank path:** the Progress tab has a strip with all 10 tiers and where you are; tapping it opens the full path: every tier with its rating range, the 5 divisions (done / current / locked), a progress bar for your current tier, and the points to the next division and the next tier. The rating includes the small consistency bonus.
- **Friends' workouts:** when a friend shares their plan, their strength workouts in it are tappable. You see the exercises with sets and reps and can add a copy to your own workouts (it is saved on your phone and is yours to change). **No weights** are ever shared, and your own custom exercises are left out. The exercise lists are stored apart from the plan on the server (`plan_x`, `supabase/migrations/005_crew_plan_detail.sql`) and fetched only when you open one, only for members of your own crew, and only while that member shares their plan.

## Leader powers and shop returns (OUR DESIGN, v1.30)
- **Shop return:** any cosmetic you own can be returned for its full price in drachmas (it is unequipped first). So a colour bought by mistake, or on your phone by someone else, is refundable by you.
- **Leader tools** (in a member's profile, leader only, checked on the server in `supabase/migrations/006_crew_leader_powers.sql`): suspend from the chat for 1 hour to 30 days or lift it (the member can still see the chat and the board); lower the member's rating on the crew leaderboard by 50 to 500 (or reset); gift drachmas (50 to 1000). Each action is announced in the chat.
- **Limits:** the data of each person lives on their phone. The leader cannot change a member's own XP, rank or drachmas directly. The rating change shows only on the crew board; the member's own rank is unchanged. Gifts are added when the member next opens the app (`claim_gifts`).

## Owner-only crews, return limit, no-limit punishments, gift review (OUR DESIGN, v1.31)
- **Only the owner opens crews.** The server makes a secret owner key (`owner_key` in `app_config`, never shown in chat or in the repo) and hands it only to the owner's member (Eliya) when his app reads the crew. His phone keeps it; `create_group` refuses without it. Everyone else sees only "join with a code". If the owner phone is wiped, ask for the key to be re-linked to a new member in the database. Dropping the old 3-argument `create_group` hangs on this server, so it stays but only raises `not_owner`.
- **Returns:** 2 per calendar month (Israel time). Crew members are counted on the server (`record_return`), so wiping the phone does not reset it; others are counted on the phone.
- **Punishments have no limits:** suspend from the chat for any time (1 hour up to permanent), take off any number of rating points (crew board only), no cooldown between actions, and they take effect at once.
- **Gifts have no limit on size.** Before a gift the leader sees the member's progress: rating, weekly volume and workouts over time (one history row per day, `member_history`), a short summary, and the heaviest working set of each exercise from their last 5 workouts (up to 8, in `members.recent`). **This is readable only by the leader** (`get_member_review`); it is not part of the leaderboard data and the app tells members about it in the crew settings.
- **Announce switch:** every leader action (suspend, rating, gift, make leader, remove) has its own "announce in the chat" switch, on by default.
- **Rating prizes (v1.32):** the leader's rating adjustment can also be positive, and the gift screen has a "rating prize" part next to the drachmas. Crew leaderboard only; the member's own rank is unchanged.
- Server file: `supabase/migrations/007_owner_returns_review.sql`.

## All exercises ranked, ban lock screen (OUR DESIGN, v1.33)
- **Every exercise in the library now has a rating** (the 41 that were only tracked before). Three kinds:
  - *Bodyweight abs, glute bridges, hamstring slides:* rated like other lifts from reps and added weight, with a share of your bodyweight as the base load (crunches 30%, leg raises 45%, ab wheel 50%, bridges and slides 50%). Families `abs-floor`, `abs-leg`, `abs-roll`, `glute-bw`, `ham-slide` in `calibration.json`.
  - *Wrist curls and the hip abductor / adductor machines:* ordinary weight curves (`wrist-*`, `hip-machine`).
  - *Holds (plank, side bridge) and cardio:* rated by **duration** only, no bodyweight or sex scaling. `reps` holds seconds and `R` is the seconds that give rating 900 (plank 6 min, running 75 min; walking counts about half as much per minute as running, jump rope and battle ropes more per minute). Cardio cannot know your pace or distance, so this is a duration score, not a fitness test.
- They belong to the group `other` ("Cardio & other"), which is now a rank group, so they count toward the overall rank like the other groups.
- **The ban covers the whole app.** While the leader has suspended you, a lock screen covers everything until the time ends or the leader lifts it. The end time is saved on your phone so it holds offline; the app asks the server again when opened and every 20 seconds while locked. A suspended member cannot leave the crew to escape it. Clearing the app's data on the phone or using another phone would get around it; a kicked member is simply out of the crew.
- **Prizes stay** (rating prize and drachmas) until the leader lowers them.

## More ways to rise besides lifting heavier (OUR DESIGN, v1.34)
Strength (your best sets) is still the base of the overall rank. On top of it come bonus points, each part with its own maximum (`src/core/bonus.mjs`, constants in `PARTS` and `src/core/consistency.mjs`):
- **Consistency, now up to 40** (was 20): 1 point per training day in the last 4 weeks (up to 20) and 2 points per full week of streak (up to 20).
- **Weekly volume, up to 15:** this week's total volume against your average week over the 4 weeks before; 1 point per 2% more (up to +30%). Needs at least 2 workouts in the earlier weeks.
- **Muscle balance, up to 15:** 1 point per main group trained in the last 7 days (up to 10), and up to 5 for how close your weakest group is to your strongest (only once all 10 main groups have a rating).
- **Weekly goal, up to 10:** you choose 2 to 6 training days in Settings (default 3). Each of the last 5 Monday-to-Sunday weeks in which you reached it gives 2 points.
- **Milestones, up to 15, permanent:** 25 workouts +3, 50 +6, 100 +10, 200 +15. The only part that does not fade.
Maximum bonus in total: 95 points (a bit under one tier). Everything is worked out from your workouts each time, so the parts that depend on recent weeks fade by themselves when you stop. The crew leaderboard still shows the total rating.

## Bonuses x2.5, rating preview for the leader, adjustment shown to the member (OUR DESIGN, v1.35)
- **All bonus parts are 2.5 times bigger than in v1.34**: consistency up to 100 (2.5 per training day up to 50, 5 per streak week up to 50), weekly volume up to 38 (1.25 per 1% more), muscle groups trained this week up to 25 (2.5 each), balance up to 13, weekly goal up to 25 (5 per week reached), milestones 8 / 15 / 25 / 38 at 25 / 50 / 100 / 200 workouts. Maximum bonus 239 points (about two and a half tiers). Strength is still the base and the only part that needs heavier lifting.
- **Leader's rating tool shows the member's level** (tier, division, rating, level) and a **before / after preview** with emblems for each choice (-500 to +500, any number, or reset) before you press Apply. The gift screen shows the same preview for a rating prize.
- **The member sees the adjustment too:** the rank card, the rank path and the share card in his own app use the adjusted rating, with a line that says how much came from the crew leader and what his real rating is. The leaderboard still gets his real rating and applies the adjustment itself, so it is never counted twice. If he leaves the crew or is removed the adjustment is gone from his app.

## Quests give rank LP, "where am I weakest" screen (OUR DESIGN, v1.36)
- **Quests no longer give drachmas.** Claiming a daily quest gives **5 rank LP** and the weekly quest **20 LP** (`reward` in `src/data/quests.json`, the same numbers as `PARTS.QUEST_*` in `src/core/bonus.mjs`, a test keeps them equal). The LP counts for 28 days after you claim, up to 100 in total, and shows as the "Quests" row in the bonus card. Old claims from the last 28 days count too. Achievements and streak milestones still give drachmas.
- **"Where am I weakest and what do I need?"** on the rank path now opens its own screen (`#/weakest`): the ten main muscle groups from the weakest (not rated yet first), each with its tier and rating, the exercise to push and the load or time for its next step; tap one for the full "what do I need" sheet. Below it, the bonus parts you are not full on, biggest gap first, with a hint for each (days, streak, volume, groups skipped this week, balance, weekly goal, quests).

## Zip the mascot (v1.37)
Zip is a small pixel-alien mascot made by Elia in the Quill repo (`packages/zip`). The two files are copied unchanged into `src/vendor/zip/`; `src/ui/mascot.js` mounts him. He floats at the start-side bottom corner (right in Hebrew) above the tab bar, **only on the Profile screen**, with the jetpack, and is hidden on every other screen. Display only: he is not wired to app events. His speech lines are the built-in Hebrew and English ones. `--zip-z: 30` keeps him under sheets and toasts. To change corner, accessory or colours edit `src/ui/mascot.js` (`position.side`, `accessory`, `palette: { G: '#ff7a00' }`).

**v1.38:** Zip now carries dumbbells as well as the jetpack (`accessory: 'jetpack+dumbbells'` in `src/ui/mascot.js`). The new accessory was added to Zip in the Quill repo (branch `zip-dumbbells`, jetpack stays the default there) and `src/vendor/zip/zip.js` was copied from it. Other accessories: `'jetpack'`, `'pen'`, `'dumbbells'`, `'none'`.

**v1.39:** Zip no longer hops or spins. In the `'fit'` style he curls one dumbbell at a time, squats with a barbell across his shoulders and drops for push-ups, every so often and when tapped. The weight plates are big and bright red so they read on the dark background. This lives in Zip itself (Quill repo, branch `zip-dumbbells`: style `'fit'`, new moods and moves; `'classic'` stays the default there) and the app copy in `src/vendor/zip/` was updated from it.

**v1.39.1:** Zip has no jetpack any more (`accessory: 'dumbbells'`), so the tanks do not get in the way of the gym moves.

## v1.39.2: huge typed numbers no longer freeze the app
- A weight like 9,999,999 kg made the plate calculator build a table of millions of entries; the open workout is saved, so the app froze on every start.
- Fix (OUR DESIGN): typed weight is limited to 0-1500 kg and reps to 0-20000 (inputs also stop at 7 / 5 characters); out-of-range values are stored as empty. Saved drafts and history are healed on load (absurd numbers become empty). The plate calculator returns nothing above 2000 kg.
