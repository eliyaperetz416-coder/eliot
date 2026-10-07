// Sends a push notification to the other members of a crew when someone posts a chat message or a status.
// Called only by the database (a trigger on public.messages) with a secret header. Deployed with JWT verification off
// because the secret header is the check. VAPID keys are created on first call and kept in public.app_config (not reachable by the app).
import webpush from "npm:web-push@3.6.7";

const BASE = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (path: string, init: RequestInit = {}) => fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: { ...H, ...((init.headers as Record<string, string>) ?? {}) } });
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

async function cfg(key: string): Promise<string | null> {
  const r = await rest(`app_config?key=eq.${key}&select=value`);
  const j = await r.json();
  return Array.isArray(j) && j[0] ? j[0].value : null;
}
const b64u = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

async function vapid(): Promise<{ pub: string; priv: string }> {
  let pub = await cfg("vapid_public");
  let priv = await cfg("vapid_private");
  if (pub && priv) return { pub, priv };
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = new Uint8Array(65);
  raw[0] = 4; raw.set(fromB64u(jwk.x!), 1); raw.set(fromB64u(jwk.y!), 33);
  pub = b64u(raw); priv = jwk.d!;
  await rest("app_config", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify([{ key: "vapid_public", value: pub }, { key: "vapid_private", value: priv }]) });
  return { pub, priv };
}

Deno.serve(async (req) => {
  const secret = await cfg("notify_secret");
  if (!secret || req.headers.get("x-notify-secret") !== secret) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const keys = await vapid();
  if (body.init) return json({ ok: true, public: keys.pub });

  const mr = await (await rest(`messages?id=eq.${Number(body.message_id)}&select=id,group_id,member_id,nickname,kind,body`)).json();
  const msg = mr?.[0];
  if (!msg || msg.kind === "system") return json({ ok: true, sent: 0 });
  const gr = await (await rest(`groups?id=eq.${msg.group_id}&select=name`)).json();
  const members = await (await rest(`members?group_id=eq.${msg.group_id}&active=eq.true&id=neq.${msg.member_id}&select=id`)).json();
  if (!Array.isArray(members) || !members.length) return json({ ok: true, sent: 0 });
  const ids = members.map((m: { id: string }) => m.id).join(",");
  const subs = await (await rest(`push_subs?member_id=in.(${ids})&enabled=eq.true&select=member_id,sub`)).json();

  webpush.setVapidDetails("https://eliot-three.vercel.app", keys.pub, keys.priv);
  const payload = JSON.stringify({ title: gr?.[0]?.name ?? "Demigod", body: `${msg.nickname}: ${msg.body}`.slice(0, 180), tag: `crew-${msg.group_id}`, url: "#/crew" });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s: { member_id: string; sub: webpush.PushSubscription }) => {
    try { await webpush.sendNotification(s.sub, payload, { TTL: 3600 }); sent++; }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await rest(`push_subs?member_id=eq.${s.member_id}`, { method: "PATCH", body: JSON.stringify({ enabled: false }) });
    }
  }));
  return json({ ok: true, sent });
});
