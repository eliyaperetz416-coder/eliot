---
name: anti-ai-design
description: Use whenever building or redesigning a website, landing page or app UI, so the result does not look "AI-generated / vibe-coded". Covers giving the model a design direction, the banned AI-look patterns, concrete UI rules (spacing, contrast, type, buttons), offering multiple design directions, motion done right (GSAP, Lenis, React Bits, UX/animation principles), and verifying the result in a real browser. Triggers - "design", "landing page", "website", "make it look premium", "it looks like AI", "animation", "smooth scroll", עיצוב, דף נחיתה, אתר, אנימציה, "נראה כמו AI". Use it proactively for any UI work, even when the user only says "build me a site" and never mentions design quality.
---

# Anti-AI design

Distilled from ~25 short videos on why Claude-built sites look generic and how to fix it.
Core insight: **without direction the model picks the safest option, and the safest option is the most boring one.** Your job is to remove "safe" as an option.

## 1. Before writing any UI: get a direction

Never start from a blank prompt. Collect (ask the user if missing):

- **References**: screenshots or URLs of sites they like. Attach images, don't describe them.
- **Brand**: colours, fonts, logo, tone of voice.
- **Real assets**: real photos of the product, the place and the people. Real photos are the single biggest "doesn't look like AI" signal (e.g. a café site showing the actual roaster, not stock gradients).
- **What to avoid**: explicitly list the styles to leave out (see section 3).
- **Name the direction** in specific words, not adjectives like "modern" or "clean". E.g. "Quiet atelier editorial: asymmetrical fashion storytelling, generous whitespace, precise type, restrained orange accents."

If the project has no design system, create a `DESIGN.md` first: colour tokens, type scale, spacing scale, radius, shadow, motion. Sites like the "awesome DESIGN.md" collections (Stripe, Linear, Apple, Notion, Vercel, Spotify styles) are good starting points. Then build from `DESIGN.md`, not from vibes.

## 2. Offer directions, don't guess one

Ask for **5 genuinely different design directions plus an on-page toggle to switch between them** (e.g. "Design 3/5"). The user picks one and you delete the rest. This beats iterating on one generic design.

## 3. Banned "vibe-coded" patterns (audit for these)

Treat each as a defect unless the brand explicitly calls for it:

1. Purple-to-blue gradients / `#7B2FF7`-style AI purple
2. Gradient hero text
3. Emojis in headings
4. Inter (or one default sans) everywhere, with no typographic voice
5. Cards with a coloured left border
6. Glassmorphism cards by default
7. Low-contrast dark mode
8. Three icon boxes in a row ("Lightning fast / Secure by design / AI-powered")
9. A pill badge above the headline
10. Lucide icons everywhere, mixed stroke weights
11. Untouched shadcn defaults
12. Every section fading in on scroll
13. Cursor-following glow/beam
14. Buttons that only fade on hover
15. Inconsistent spacing
16. Em dashes everywhere in the copy
17. Generic buzzword copy ("Elevate your business with seamless solutions", "Revolutionize your workflow")
18. Serif-italic accent words as a crutch
19. Space Grotesk + Instrument Serif combo
20. Grain texture overlay
21. Identical feature-card grids, fake dashboards, invented statistics, fake reviews
22. "01 / 06"-style section counters and "scroll" cues
23. The cream-and-brass "artisan" palette every craft/café brand defaults to

After building, run an explicit **"AI-look audit"**: list every element that matches the above and fix it.

## 4. Concrete UI rules (apps and sites)

- **One font family**, 2–3 weights max.
- **One accent colour**, reserved for the most important button on each screen.
- **Spacing in multiples of 8.**
- **Tap targets at least 44pt**; buttons within thumb reach on mobile.
- **Text contrast at least 4.5:1.**
- **One icon set**, same stroke weight.
- **One subtle shadow style**, used consistently.
- **Empty states** have a short explanation plus a button for the first action.
- **Button labels say what they do** ("Send order", not "OK"/"Submit").
- **Short, purposeful animations** that show what just happened.
- **One large, clear heading per screen**; align everything to **one grid**; let elements breathe.
- **Same corner radius** across the whole product.
- Replace any default purple gradient with the **brand colours**.
- Emojis only when they add meaning.
- **Error messages in plain language, with the next step.**
- Dark mode uses colours **chosen for dark mode**, not inverted light colours.
- Test every screen on a **real phone, used with one hand**.
- Real copy: no lorem ipsum, no placeholder text, no "Vite + React" tab title.

## 5. Useful design skills and tools (install when available)

| Tool | Use |
|---|---|
| `impeccable` skill | Designer knowledge (type, colour, spacing, motion, anti-patterns). Run `/impeccable init` once per project, then prefix design prompts. Commands like `/polish`, `/distill`, `/clarify`. |
| Taste skill | Picks a style, uses real photos, opens the site and checks it. |
| Emil Kowalski design skill / **Apple Design** skill | Motion and interaction craft; Apple-style restraint, typography, interruptible animation; also critiques ("CTA hard to notice", "too many elements compete"). |
| **UI UX Pro Max** skill | Design intelligence and styles database. |
| Vercel **Web Design Guidelines** | "review my UI" returns issues with file:line (missing alt, missing labels). |
| **21st.dev** MCP | Generate component variations and pick one. |
| Figma MCP | Design-to-code from real designs. |
| Image to Code | Start from a design image. |

Tip: design skills work well as a **retrofit**. Open an existing site/app and ask Claude to improve it with the skill, rather than only using them on new projects.

## 6. Motion: premium, not decorative

**Core stack**: name it explicitly in the prompt, otherwise Claude hand-rolls weak CSS:
| Need | Library |
|---|---|
| Timeline and scroll animation | **GSAP** + ScrollTrigger |
| Smooth scroll | **Lenis** (`npm i lenis`, wrap the app) |
| Copy-paste animated components and backgrounds | **React Bits** |
| Component variations | **21st.dev** |
Pick one or two more only if needed (Motion, Magic UI, Smooth UI…); they overlap. **prompt-motion.com** is a useful library of ready motion-graphics prompts.

**Principles** (UX + classic animation): anticipation (a small wind-up), follow-through, easing (slow in/out), move in arcs, snappy timing, exaggerated feedback for important moments (e.g. a wrong-password shake), Fitts's law (big, close targets), Hick's law (fewer choices), Miller's law (chunk information, e.g. card numbers in groups of 4), Doherty threshold (respond in under 400ms), Jakob's law (familiar patterns), and **the more often something is used, the less it should animate**.

**Rules**: respect `prefers-reduced-motion`; animate `transform`/`opacity` only; animation explains a state change, it doesn't decorate everything; scroll through the whole page in a browser and look for stuck ("dead") scroll and jank.

## 7. Verify visually: never ship blind

Open the site in a real browser (Playwright / Chrome DevTools MCP / `playwright-cli open localhost:3000`) and **screenshot it at 1440px, 768px and 390px**. Check the hierarchy, overflow, contrast and the AI-look list. Fix, then re-screenshot. Repeat until clean.

## Quick prompt template

> Build [X] for [business/audience]. Use the attached references and `DESIGN.md`. Avoid: AI-purple gradients, gradient text, emoji headings, 3-icon feature rows, badges above headlines, generic buzzwords, fake stats/reviews. Use real photos from `/assets`. Give me 5 distinct directions with a switcher. Then open it in the browser at 1440/768/390, screenshot it, run an AI-look audit and fix everything you find.
