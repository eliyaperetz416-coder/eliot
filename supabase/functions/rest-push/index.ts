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

Deno.serve(async (req) => {
  const secret = await cfg("notify_secret");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return json({ error: "forbidden" }, 403);
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
    } catch { /* an expired subscription: the phone re-subscribes the next time notifications are turned on */ }
  }));
  return json({ ok: true, sent });
});
