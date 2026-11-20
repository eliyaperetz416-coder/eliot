---
name: video-and-content
description: Use when creating short-form video, motion graphics, ads, UGC-style content, social media marketing or launch/distribution plans with Claude. Covers the Claude video-editing pipeline (local Whisper transcription → meaning-based captions → edit plan → HyperFrames HTML-to-video → visual QA → lessons file), style codes for video prompts, motion-graphics prompt libraries, an ad pipeline from competitor research, the connector-based "business on autopilot" setup, and early user acquisition (Product Hunt, Reddit). Triggers - "edit video", "reel", "TikTok", "motion graphics", "ad", "marketing", "launch", סרטון, עריכה, רילס, פרסומת, שיווק.
---

# Video, content and marketing with Claude

Distilled from ~12 videos.

## 1. Video-editing pipeline (Claude edits the video)
1. **Transcribe locally** with Whisper (Hebrew works), with word-level timestamps.
2. Claude reads the transcript, **fixes errors and splits captions by meaning**, not by word count.
3. **Edit plan**: for every sentence, decide what's on screen and time it to the word.
4. **Animate** with **HyperFrames**: each scene is written as a web page (HTML/CSS/JS) and rendered to video.
5. **QA**: Claude screenshots frames, finds what looks bad, fixes it, and exports a file ready for the platform (9:16 for Reels/TikTok).
6. **Lessons file**: every correction the user gives goes into a `LESSONS.md`, so each video is better than the last.

## 2. Style "codes" to put in video prompts
- **Color Grade**: uniform, cinematic colour.
- **Beats and Cuts**: upload video + music; cut on the beat.
- **Before and After**: split screen that highlights the change.
- **Hand Drawn**: the idea animated as if drawn live.
- **Motion Graphics Showreel**: sharp transitions, typography, shapes, fast pace.
Animation style vocabulary: see `motion-and-ui-libraries`.

## 3. Prompt libraries and skills
- **prompt-motion.com**: a library of motion-graphics prompts/skills made with Claude Opus (product UI, charts, diagrams, shapes, particles). Pick one, paste it into Claude, render (e.g. a product promo in ~10 minutes).
- Content skills seen: Paper-Cut (paper craft style), Content (realistic product ads), AI-UGC (person presenting a product), Director (clean product shots).

## 4. Script prompts
Have Claude write the prompt first: role, context (topic, platform, 90/60/30s, audience), task, constraints (**hook in the first 3 seconds**, one idea per video, a CTA), output format.

## 5. Ads from competitor research
Connect **Firecrawl** (web data) → pull competitors' ads (e.g. Meta Ad Library) → analyse the angles → generate 4 concepts → render statics/videos (Higgsfield / image models) with your product and copy.

## 6. "Business on autopilot" connector stack
Research: **Apify** (scrape what's trending in the niche, find leads) → Product: **Base44** (build the app) → Ads: **Higgsfield** (Claude writes the prompt, it renders) → Brand: **HeyGen** (an avatar with your voice) → Distribution: **Blotato** (schedule to 9 networks). Claude orchestrates all five.

## 7. Getting the first 100 users with no budget
- **Product Hunt**: a concentrated launch to people who love new products.
- **Reddit**: thousands of precise communities (teachers, runners, founders), but **be part of the community first**: give value, follow each subreddit's rules, no drive-by promotion.
- Use both, each at the right time. Build in public.

## 8. Compliance reminder
Marketing messages must follow the anti-spam rules (consent, "פרסומת" label, unsubscribe). See `israeli-legal-compliance`. Use only licensed music, images and likenesses.
