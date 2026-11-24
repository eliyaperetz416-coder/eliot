// Sends the "rest is over" Web Push. Called only by the database (app_private.fire_rest_alarms, every 5 s via pg_cron)
// with the same secret header as the notify function. Deployed with JWT verification off because the secret header is the check.
// VAPID keys are the ones the notify function created in public.app_config (not reachable by the app).
import webpush from "npm:web-push@3.6.7";

const BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function cfg(key: string): Promise<string | null> {
  const r = await fetch(`${BASE}/rest/v1/app_config?key=eq.${key}&select=value`, { headers: H });
  const j = await r.json();
  return Array.isArray(j) && j[0] ? j[0].value : null;
}

type Alarm = { sub: webpush.PushSubscription; title: string; body: string };

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

Deno.serve(async (req) => {
  const secret = await cfg("notify_secret");
  if (!secret || !(await sameSecret(req.headers.get("x-notify-secret"), secret))) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const alarms: Alarm[] = Array.isArray(body.alarms) ? body.alarms : [];
  if (!alarms.length) return json({ ok: true, sent: 0 });
  const [pub, priv] = await Promise.all([cfg("vapid_public"), cfg("vapid_private")]);
  if (!pub || !priv) return json({ error: "no_vapid" }, 500);
  webpush.setVapidDetails("https://eliot-three.vercel.app", pub, priv);
  let sent = 0;
  await Promise.all(alarms.map(async (a) => {
    try {
      const payload = JSON.stringify({ title: String(a.title).slice(0, 80), body: String(a.body).slice(0, 160), tag: "rest", url: "#/workout" });
      await webpush.sendNotification(a.sub, payload, { TTL: 60 });
      sent++;
    } catch (e) {
      // 404/410: the subscription is gone (app removed, permission revoked): forget it so it is never tried again
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await fetch(`${BASE}/rest/v1/user_push?sub->>endpoint=eq.${encodeURIComponent(a.sub.endpoint)}`, { method: "DELETE", headers: H }).catch(() => {});
      }
    }
  }));
  return json({ ok: true, sent });
});
