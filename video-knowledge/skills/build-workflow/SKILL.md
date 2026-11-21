---
name: build-workflow
description: Use at the start of any non-trivial build with Claude Code (new product, feature, app), or when results are poor, long tasks drift, or the user asks how to work with agents. Covers product validation before building, asking clarifying questions and mapping edge cases, plan-first execution, verification loops and a verify skill, when (not) to use multiple agents, project memory (CLAUDE.md/MEMORY.md), the recommended plugins and tools, and a Claude video-editing pipeline. Triggers - "start a project", "build me an app", "agents", "Claude keeps making mistakes", "long task", איך לעבוד עם קלוד, סוכנים, פרויקט חדש. Use it proactively at the start of any multi-step build, even if the user just says "build me X".
---

# Build workflow (working method with Claude Code)

Distilled from ~15 videos. Main idea: **results come from process and connected tools, not from a magic prompt.**

## 1. Before building a product
1. **Validate the idea**: who it's for and why they'd use it.
2. **Define the real pain**: without a real problem, a beautiful product won't help.
3. **Set a timeline** for V1.
4. **Scope V1**: the smallest shippable thing; everything else is "later".

## 2. The "4 lines" that close Claude's holes
Without them, Claude builds immediately with zero questions. A real example: a promo sender that messaged non-consenting customers. Add to every substantial request:
1. **Ask me all clarifying questions before you start.**
2. **Map the edge cases** (bad input, duplicates, empty data, failures) and how each is handled.
3. **Security: define who is allowed to do and see what** (permissions, data masking).
4. **Define what "done" looks like and how you'll prove it works.**
(In the example this produced 22 questions and 8–24 edge cases instead of 0. The original build had also left the admin UI open with no password.) **Put these 4 lines in `CLAUDE.md` once** so they apply to every conversation.

## 3. Plan first, then execute (the "Superpowers" method)
Brainstorm/ask until the spec is clear → write a plan file (`docs/plans/*.md`) → user approves → execute with sub-agents → **agents review each other** (one writes, one checks against the spec, one checks quality) → only then report.

## 4. Verification loops (how Anthropic's Claude Code team works)
- **Run the real app, not just tests.** Create a `verify` skill in `.claude/skills/verify/` that starts the app/simulator and clicks through it like a user; use it before every commit.
- **Changes never modify the checks that judge them** (review rules are read from the base branch).
- **Flaky tests**: never skip, sleep or retry until green. Find the root cause, or delete the test and write down why.
- **3 failed attempts in a row → stop and call a human.**
- The human's job shifts from reading every diff to **defining "done" and reviewing the evidence**. That's what lets you run many sessions in parallel.

## 5. Long-task checklist
The task states what "done" looks like · no "think hard" filler lines · design requests list the styles to avoid · attach charts and screenshots instead of retyping them · CLAUDE.md says when to stop and when to keep going, and to **stop before anything destructive** · permission prompts stay on for destructive commands · read the "needs from you" part of the report first.

Quick-capture trick (desktop app): double-tap **Option** (Mac) to open a Claude overlay on any screen, drag to select a region, and ask about the screenshot (charts, data, text). This is faster than describing what you see.

## 6. Agents: keep it lean
- For big tasks, talk to **one lead agent** that delegates to a few specialists (e.g. plan → build → QA) and **checks every step before moving on**. `oh-my-claudecode`'s `/team` does this inside Claude Code.
- Avoid agent sprawl: hundreds of pre-made role agents or 100-agent "tournaments" mostly burn tokens without better results.

## 7. Prompting
- Name the tools and libraries explicitly ("build this with GSAP", "use Supabase").
- Say what to avoid, not only what to do.
- State what "done" looks like (see section 2).

## 8. Memory and environment
- `CLAUDE.md` = standing instructions; `MEMORY.md` = learned facts and corrections. **Every correction goes into a lessons file** so each run improves.
- "Cowork OS" layout: one home folder with a global `CLAUDE.md` (who you are, what you work on, team, tone) → **one subfolder per project**, each with its own `CLAUDE.md` (stacks on top of the global one) and `MEMORY.md`. New project = new folder + "set this up as a new project; ask me questions, then write its CLAUDE.md and MEMORY.md." Keep these files short and let them grow.
- Model choice: save the most capable (most expensive) model for multi-step, interdependent tasks; use a lighter model for simple work so you hit usage limits less.
- Connect the tools: what's connected matters more than the prompt (e.g. with Blender/Unreal MCPs a game gets real 3D models instead of code-drawn shapes).
- Recommended Claude Code plugins for app work: **Supabase** (real DB, migrations, security advisors), **Vercel** (deploy), **oh-my-claudecode** (`/team`, 19 specialist agents), **Chrome DevTools MCP** (real browser: console, network, screenshots, performance). Add **Playwright** for UI verification.
- Enforce rules the model might forget: `permissions.deny` in `.claude/settings.json` for simple blocks (e.g. `Read(./.env*)`), or a **`PreToolUse` hook** when Bash commands must be blocked too.

## 9. Tools worth connecting
| Tool | Why |
|---|---|
| **Playwright** / **Chrome DevTools MCP** | Claude sees and tests what it built: console, network, screenshots, performance |
| **Supabase** plugin | Real DB, migrations, security advisors |
| **Vercel** plugin | Deploy from the terminal |
| **Firecrawl** | Scrape sites into clean data (research, competitor analysis) |
| **PostHog** | Product analytics: funnels, where users get stuck, A/B tests |
| **Composio** | One hub for app integrations (Gmail, Slack, Notion), if no built-in connector exists |
| **Expo skills** (`claude plugin install expo@claude-plugins-official`) | Official skills for iOS/Android apps, including store submission |

Mature open-source replacements for paid SaaS, if cost matters: AppFlowy (Notion), Cal.com (Calendly), Chatwoot (Intercom), Cap (Loom), OpenProject (Asana).

## 10. Video editing with Claude (pipeline)
1. Transcribe locally with Whisper (Hebrew works) with word timestamps.
2. Claude fixes the transcript and splits captions **by meaning**, not word count.
3. Edit plan: what's on screen for each sentence, timed to the word.
4. Render scenes as HTML pages to video (HyperFrames).
5. Claude screenshots frames, finds what looks bad, fixes it, and exports for the platform.
6. **Lessons file**: every correction is saved, so each video is better than the last (this works for any repeated task).

## 11. Useful prompts
- "Find all of the implicit state machines in my app" (hidden state bugs).
- "Is there a security hole in these changes? Anything about permissions I missed?" (after every change).
- "Open the app in the browser, use it like a user, screenshot it, and fix what's broken."
