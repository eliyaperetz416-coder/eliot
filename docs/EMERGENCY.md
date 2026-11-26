# When something goes wrong

Short on purpose. In any case: open a session with Claude and write "open docs/EMERGENCY.md and help me with case X".
No password or key is written here; this page can stay in the public repository. (Hebrew: EMERGENCY.he.md.)

## 1. A broken version of the site went out
1. vercel.com → project **eliot** → **Deployments**.
2. The previous Production deployment (the one that worked) → ⋯ → **Instant Rollback**. The site is back in seconds.
3. Phones that already took the broken version get the old one on the next open (the "new version ready" message).
4. If the app is stuck on people's phones and never reaches that message: `sw.js` has a rescue switch, `RESCUE`. Set it to
   `true` for one release only (it takes over at once without asking), then back to `false`. Only together with Claude.

## 2. Someone's data was deleted or broken
- The server keeps the last 3 versions of each person's data plus one for each of the last 7 days
  (`app_private.user_data_history`).
- A deleted account is kept for 24 hours in `app_private.deleted_accounts`, with its email.
- A nightly backup of the whole database: private repo `eliot-backup` → **Actions** → **Daily backup** → a run →
  **Artifacts** (30 days).
- Ask Claude: "restore user X's data to the version before Y". Always a dry run first.

## 3. It looks like someone broke in
1. Close the door: change the Google and GitHub passwords; GitHub → Settings → **Sessions**: revoke any unknown device;
   remove anything foreign in **Tokens**, **SSH keys**, **Applications**.
2. Change the server keys (with Claude): `notify_secret` (the secret that lets pushes be sent); the database password
   (Supabase → Connect → Reset database password, then update the secret `SUPABASE_DB_URL` in `eliot-backup`); if
   needed the push keys (VAPID: after that every phone has to turn notifications on again).
3. Find out what happened: the security log `app_private.audit_log` (30 days: account deletions, crews created, joined and
   left, suspicious saves, each with time, IP and browser type). Supabase's own logs are kept for 24 hours only: look
   quickly. Vercel → Deployments: did a version you did not merge go out?
4. Check the data: restore from the backup of the night before (section 2).

## 4. Notifications do not arrive
- The morning report comes every day at about 07:30 (Israel). If it did not come, something on the server is not running.
- A failed push is sent again automatically (at most twice, within 3 minutes). If that fails too it is written to the
  security log as `push_failed` and counted in the morning report under "failures".
- Ask Claude to check the server's scheduled jobs (`demigod-*`) and the logs of the `rest-push` function.

## 5. The nightly backup failed
GitHub sends an email. Almost always the database password changed: update the secret `SUPABASE_DB_URL` in `eliot-backup`,
then **Actions** → **Daily backup** → **Run workflow** to check.
