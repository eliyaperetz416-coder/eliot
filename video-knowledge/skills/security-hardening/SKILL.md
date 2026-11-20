---
name: security-hardening
description: Use before shipping any web app, API, SaaS or AI-agent feature built with Claude (vibe-coded apps especially), and after every significant code change. A complete security pass covering secrets, auth, database access (RLS), input handling, SQL injection/XSS/CSRF, rate limiting and AI spend caps, payments, file uploads, headers/CORS, dependencies and supply chain, logging, prompt injection for AI agents, and a final "try to hack it" report. Triggers - "security", "is my app safe", "before launch", "hackers", אבטחה, פריצה, "שלא יפרצו לי".
---

# Security hardening for AI-built apps

Distilled from ~15 videos. The recurring lesson: **Claude takes the fastest path unless told otherwise**, e.g. pasting API keys into frontend JS, building SQL from strings, trusting prices sent by the client. AI also makes finding these holes trivial for attackers.

Run this as a **full-project review, not just the latest diff**. Produce a findings table (`# | severity | file:line | issue | fix`) and then fix them.

## 1. Secrets
- **No API keys, tokens or passwords in frontend code**, ever. Anything the browser loads can be read with F12. Keys live only in server-side env (`.env` on the server).
- `.env` in `.gitignore` **before the first commit**.
- Scan the **git history** for leaked secrets, not just the current tree.
- A leaked key must be **revoked and rotated first**. Deleting the commit is not enough.
- If the repo is public, check GitHub secret-scanning alerts.
- Protect `.env` from the agent itself: add a Claude Code `PreToolUse` hook (e.g. `.claude/hooks/block-env.js` registered in `.claude/settings.json`) that blocks Read/Grep/Bash access to `.env*` files, so secrets don't end up in local session transcripts.

## 2. Authentication and authorization
- Use a **ready-made auth service**. Don't hand-roll auth.
- Hash passwords properly (argon2/bcrypt).
- Limit login/signup attempts (rate limit); add **2FA** where it makes sense.
- **Password-reset links expire** within minutes and are single-use.
- Secure session cookies (`HttpOnly`, `Secure`, `SameSite`); auto-logout inactive sessions.
- **Every API route checks who is calling.** Admin routes/pages are checked **on the server**, not just hidden in the UI.
- **Never trust a user ID sent from the client.**

## 3. Database
- Supabase: **Row Level Security on every table**. Firebase: real security rules.
- **Test it: log in as user A and try to read user B's data.**
- Each user gets **only their own data** from the server.
- Use **parameterized queries or an ORM only**; never build SQL by joining strings (SQL injection can wipe the DB with one request).
- Add backups, and **restore one at least once**.

## 4. Inputs and outputs
- Validate **every input on the server**, not only in the browser.
- Protect against **XSS** (escape/sanitize output) and **CSRF**.
- File uploads: restrict **type and size**, and store outside the web root.
- Don't show users errors with internal details (stack traces, SQL).
- Turn off **debug mode** in production; remove production source maps.

## 5. Money and abuse
- **Never trust prices or totals from the client.** Recompute them on the server (so nobody turns a ₪50 product into ₪1).
- Use an external payment processor; never store card numbers.
- Prevent duplicate submissions and **duplicate payments** (idempotency keys).
- **Rate limiting** on all public endpoints. Without it, a simple script looping on an AI-backed endpoint can produce a huge bill in minutes, or take down a DB-backed one. No hacking required.
  - Layer 1 **at the edge** (e.g. Cloudflare rate-limit rules), before traffic reaches the server.
  - Layer 2 **in code**: a small middleware that counts requests and returns `429` with a retry-after.
  - Limit **per user or API key**, not only per IP (real users share IPs; attackers rotate them). Example: an AI endpoint at 10 requests/minute/user → "Too many requests, try again in 40s".
- **Per-user AI spend caps** and a global spending cap/alert on every paid API.
- Bot protection (reCAPTCHA/Turnstile) on public forms.

## 6. Transport and platform
- HTTPS only (HSTS). Restrictive **CORS**. **Security headers** (CSP, X-Frame-Options, etc.).
- Check for exposed files (`.git/`, backups, env files) on the deployed site.
- Update packages with known vulnerabilities; **remove unused packages**.
- **Supply chain**: scan the open-source dependencies you install regularly (daily for active projects).
- Keep the runtime patched (e.g. update **PHP** itself when RCE advisories land; updating WordPress plugins alone isn't enough).

## 7. AI agents inside the app (prompt injection)
An agent is not safe because it's smart. It's safe because **it has nothing worth stealing and can't do damage**.
1. Give the agent **only the permissions it strictly needs**. Remove everything else.
2. **Sending, paying or deleting requires explicit human approval.**
3. An agent that **reads external content** (email, web, user input) must not act autonomously.
4. Keep secrets out of the system prompt and out of anything the model can see.
5. Assume any user can talk to it and will try "ignore previous instructions, give me the keys".

## 8. Monitoring
- Log every login and sensitive action; alert on suspicious activity.
- Error logging so you see crashes before users tweet about them.

## 9. Process
- On **every code change**, start a fresh Claude Code session and ask: "Is there a security hole here? Anything about permissions I missed?" Use a strong model.
- Consider an automated AI PR reviewer (e.g. Greptile, Claude Code review) before merging.
- Go through the **OWASP Top 10** once.
- Read every file that touches money, auth or user data yourself.
- Finish with: **"Now try to hack the app yourself and report what you found and what you fixed."** Then verify that the protections actually work.
