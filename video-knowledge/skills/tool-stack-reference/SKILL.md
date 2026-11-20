---
name: tool-stack-reference
description: Reference of tools, MCP servers, Claude skills and open-source alternatives mentioned across ~100 short videos about building with Claude. Use when choosing what to connect to Claude for a task (research, scraping, browser control, analytics, app integrations, mobile apps, voice, reverse engineering) or when the user wants a free/open-source replacement for a paid SaaS. Triggers - "which tool", "MCP", "connect Claude to", "free alternative", "open source", כלים, חלופה חינמית, קוד פתוח, MCP.
---

# Tool stack reference

Principle from the videos: **what's connected to Claude matters more than the prompt.**
Verify names, versions and licences before installing; star counts are as cited in the videos.

## Give Claude senses and hands
| Tool | Role |
|---|---|
| **Perplexity** | In-depth research with sources |
| **Firecrawl** | "Eyes": scrape any site into clean Markdown/JSON |
| **Playwright** / `playwright-cli` | "Hands": control a browser, fill forms, test, screenshot |
| **Chrome DevTools MCP** | Console, network, performance, screenshots of a real Chrome |
| **PostHog** | Product analytics: funnels, heatmaps, A/B tests, where users get stuck |
| **Composio** | One connector hub for Gmail, Slack, Notion etc. with managed auth |
| **Apify** | Scrapers (e.g. TikTok trends), lead finding |
| **Supabase** plugin | Postgres DB, migrations, RLS, security advisors |
| **Vercel** plugin | Deploy to production |
| **Figma MCP** | Design ↔ code |
| **21st.dev MCP** | UI component variations |

## Specialised capabilities
- **REA, Reverse Engineer Anything** (`npx rea-agents setup`): investigates an existing app or binary and reports OBSERVED / INFERRED / UNKNOWN, then a blueprint, to learn how a feature works and build your own version (don't copy code or assets).
- **Expo skills** (`claude plugin install expo@claude-plugins-official`): ~20+ official skills to build iOS/Android apps with Expo, including design-system, data-fetching, EAS build/update, and **app-store submission**. Works from Windows.
- **VoiceMode** (`github.com/mbailey/voicemode`): talk to Claude Code by voice (Whisper STT + Kokoro TTS). The local engine doesn't support Hebrew speech.
- **Claude Security** (Enterprise beta) or a fresh strong-model session for security scans; **Greptile** for AI PR review.
- **Claude for Finance** agents: market researcher, financial-model builder, earnings analyser (with data connectors).
- Agent teams: **agency-agents** (hundreds of role agents + an orchestrator, `./install.sh --tool claude-code`), **oh-my-claudecode** (`/team`), **OpenMausBot**-style bot teams with their own computer and memory, **Hermes Desktop** (agent org charts).
- Skills: **Chief of Staff** (splits a big task across agents), **Anatomy** (explains via an interactive page instead of text), **Marketing Psychology** (buying-psychology methods for ads and offers), **Arena** (agent tournament), **Council** (multi-perspective verdict), **prompt-master**, **teach** (personal curriculum), **last30days** (recent research), **Superpowers** (plan-first dev methodology).

## Open-source alternatives to paid tools
| Paid | Open-source alternative |
|---|---|
| Higgsfield (gen media) | Open-Generative-AI (600+ models, local) |
| ElevenLabs | VoiceStudio (local voice cloning) |
| Semrush | OpenSEO |
| Notion | AppFlowy |
| Wispr Flow | OpenWhispr (offline dictation) |
| Asana | OpenProject |
| Calendly | Cal.diy (cal.com) |
| Intercom | Chatwoot |
| Loom | Cap |
Not always a full replacement, but they often cover the core use and can run privately.

## Website/AI builders worth knowing
Manus (agentic site/slide builder), Base44 (app builder), Beautiful.ai (presentations), Theatre.js (animation timelines).

Related skills: `anti-ai-design`, `motion-and-ui-libraries`, `security-hardening`, `claude-workflow`.
