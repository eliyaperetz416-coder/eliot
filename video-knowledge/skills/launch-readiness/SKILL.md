---
name: launch-readiness
description: Use before a website or web app goes live, or when the user says it "still looks vibe-coded" or is slow, broken on mobile, invisible on Google, or might crash under load. Covers technical SEO and Open Graph, performance (Core Web Vitals, Lighthouse), mobile UX, polish/finishing features, load testing and scalability, maintainable architecture, and hidden state-machine bugs. Triggers - "launch", "go live", "SEO", "slow", "mobile", "crash", "production ready", לעלות לאוויר, השקה, קידום בגוגל, איטי, מובייל, עומס.
---

# Launch readiness

Distilled from ~20 videos. Run the sections relevant to the project, report a checklist with ✓ and ✗, then fix the ✗ items.

## 1. Pre-launch master checklist
Security (→ `security-hardening`) · accessibility + legal (→ `israeli-legal-compliance`) · privacy policy · real claims only · mobile view · load speed · SEO + share image · broken links · no exposed API keys.

## 2. Technical SEO + sharing
- Unique `<title>` and meta description per page; **one clear H1 per page**; canonical tags.
- **Open Graph + Twitter meta with a preview image**, so a link shared on WhatsApp shows an image and title instead of a grey link. Prompt: "Embed Meta SEO tags and Open Graph tags, including preview images."
- `sitemap.xml`, `robots.txt`, **`llms.txt`**, favicon, custom 404.
- Internal links, breadcrumbs, structured data (JSON-LD), **LocalBusiness schema** for local businesses; Google Business Profile.
- Proper alt text; custom domain; the browser tab must not say "Vite"/"React"; no placeholder content.
- Workflow tools: Search Console (what already works) → Keyword Planner → Google Trends → AnswerThePublic → Ubersuggest (easy wins) → Screaming Frog (broken things) → PageSpeed Insights → Rich Results Test → Yoast (WordPress).

## 3. Performance
- Compress images and convert them to modern formats (WebP/AVIF); lazy-load below the fold.
- Cache static files; CDN for assets close to users; compress responses (gzip/brotli).
- Reduce JS bundles, remove unused code and scripts; optimise fonts (subset, `font-display`).
- Core Web Vitals: improve **LCP**, fix layout shifts (**CLS**, "nothing jumps while loading"), reduce interaction delays (**INP**).
- **Run Lighthouse, fix the issues, and show before/after numbers.** Test on a throttled slow connection.
- App speed patterns (20 rules):
  - **Perceived speed**: skeleton screens while loading · **optimistic UI** (update before the server answers) · **stream AI responses** word by word · debounce search until typing stops.
  - **Front end**: lazy-load images · **virtualize long lists** (render only what's visible) · WebP images · **code-split by page** · load third-party scripts after the page.
  - **Network**: CDN close to users · compress responses · **one request instead of many** (no request waterfalls/N+1 from the client) · run independent requests in parallel.
  - **Back end**: indexes for common queries · **select only the needed columns** · Redis for hot data · **move heavy jobs to a background queue** · place the server close to the DB.
  - **Measure** on real users (RUM) and test on a slow phone with a weak network.

## 4. Mobile
No horizontal scroll or text overflow; tap targets ≥ 44pt; buttons within thumb reach; simple forms with the right input types; clickable `tel:` and `mailto:`; no popups covering the screen; test portrait and landscape at several widths; mobile menu; every page mobile-optimised.

## 5. Polish (things AI-built sites usually miss)
Favicon · page titles · broken links/buttons · footer links · copyright year · success **and** error states on forms · loading states · empty states · confirmation modals for destructive actions · password visibility toggle · skip-to-content link · sticky header · back-to-top · search · expandable FAQ · dark-mode toggle (if fitting) · cookie banner · print stylesheet · UTM tracking · floating contact/WhatsApp button · last-updated dates · clickable logo · remove unused navigation.

## 6. Load and resilience
A real example: a Claude-built chat app **crashed at ~150 concurrent users** (OOM on a 2 vCPU/4 GB server), long lists took 7.5s, and messages took 10s under load. "The server matters, but most problems happen because nobody told Claude exactly what to check."

Prompt to check load resilience:
> Check my system for user load: go over every API endpoint and socket event; find N+1 queries, loads that grow with the user's data, heavy work on the main thread (e.g. password hashing), missing rate limiting and job queues, DB and connection-pool defaults, and what happens when 100 users connect at once right after a deploy. For each finding, write where it is, why it will break the server and what the fix is, ordered by severity. **Fix only after I approve; after fixing, re-run the same test and show before and after.**

Then simulate gradually increasing concurrent users and report where it breaks. Typical fixes: parallelise independent queries (`Promise.all`), batch instead of per-item queries, paginate, move heavy work to queues.

Also: API timeouts and failed-request handling, retries with backoff, uptime monitoring, error logging, **test backup restoration**.

## 7. Code health (so it can be maintained)
- Ask for **modular, component-based architecture**: small functions, clear comments, no 3,000-line single files. Prompt: "You must write the code in a separate modular architecture, component based, don't shove everything into one file, split into small functions, with clear comments so it can be maintained in the future."
- Run the prompt **"find all of the implicit state machines in my app"**. Status fields, dates and flags spread across files create bugs that only appear in **combinations** (a cancelled customer who still has access, a failed payment that opens a new trial). Make each state machine explicit in one place.

## 8. Verify
Open the deployed site in a real browser (Playwright / Chrome DevTools MCP), check the console and network for errors/404s, screenshot it at 1440/768/390, and re-run Lighthouse.
