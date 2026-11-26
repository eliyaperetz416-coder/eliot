// Sends the app's own Web Push: "rest is over", the morning reminder and the owner's morning report. Called only by the
// database (app_private.send_push / retry_push, migration 022) with the same secret header as the notify function.
// Deployed with JWT verification off because the secret header is the check.
// VAPID keys are the ones the notify function created in public.app_config (not reachable by the app).
// Even with the secret, it only sends to the four real push services, only with the app's own tags and screens,
// and a push service that is busy (429 / 5xx) gets one more try a second later.
import webpush from "npm:web-push@3.6.7";

const BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

const ENDPOINT = /^https:\/\/(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)\//;
const TAGS = new Set(["rest", "morning", "report"]);
const URLS = new Set(["#/workout", "#/"]);

async function cfg(key: string): Promise<string | null> {
  const r = await fetch(`${BASE}/rest/v1/app_config?key=eq.${key}&select=value`, { headers: H });
  const j = await r.json();
  return Array.isArray(j) && j[0] ? j[0].value : null;
}

type Alarm = { sub: webpush.PushSubscription; title: string; body: string; tag?: string; url?: string };

/** Compares two secrets in time that does not depend on where they differ (both are hashed first, so length leaks nothing either). */
async function sameSecret(given: string | null, expected: string): Promise<boolean> {
  if (!given) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map((x) => crypto.subtle.digest("SHA-256", enc.encode(x))));
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const busy = (code?: number) => code === 429 || (code !== undefined && code >= 500);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  const secret = await cfg("notify_secret");
  if (!secret || !(await sameSecret(req.headers.get("x-notify-secret"), secret))) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const all: Alarm[] = Array.isArray(body.alarms) ? body.alarms : [];
  const alarms = all.filter((a) => typeof a?.sub?.endpoint === "string" && ENDPOINT.test(a.sub.endpoint)).slice(0, 500);
  if (!alarms.length) return json({ ok: true, sent: 0, skipped: all.length });
  const [pub, priv] = await Promise.all([cfg("vapid_public"), cfg("vapid_private")]);
  if (!pub || !priv) return json({ error: "no_vapid" }, 500);
  webpush.setVapidDetails("https://eliot-three.vercel.app", pub, priv);
  let sent = 0, busyFails = 0;
  await Promise.all(alarms.map(async (a) => {
    const tag = TAGS.has(String(a.tag)) ? String(a.tag) : "rest";
    const url = URLS.has(String(a.url)) ? String(a.url) : "#/workout";
    const payload = JSON.stringify({ title: String(a.title).slice(0, 80), body: String(a.body).slice(0, 160), tag, url });
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await webpush.sendNotification(a.sub, payload, { TTL: tag === "rest" ? 60 : 3600 });
        sent++;
        return;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // 404/410: the subscription is gone (app removed, permission revoked): forget it so it is never tried again
        if (code === 404 || code === 410) {
          await fetch(`${BASE}/rest/v1/user_push?sub->>endpoint=eq.${encodeURIComponent(a.sub.endpoint)}`, { method: "DELETE", headers: H }).catch(() => {});
          return;
        }
        if (busy(code) && attempt === 0) { await wait(1000); continue; }
        if (busy(code)) busyFails++;
        return;
      }
    }
  }));
  // nothing went out and the push services were busy: answer 502 so the database sends the batch once more
  if (sent === 0 && busyFails > 0) return json({ ok: false, sent, busy: busyFails }, 502);
  return json({ ok: true, sent, skipped: all.length - alarms.length });
});
