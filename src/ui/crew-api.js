// Talks to the crew database (Supabase REST, no SDK). Every call is a function that needs your secret token.
let configPromise = null;
const config = () => (configPromise ??= fetch('src/data/crew-config.json').then((r) => r.json()));

export const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

export async function rpc(name, args = {}, timeoutMs = 12000) {
  const { url, key } = await config();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(args), signal: ctl.signal });
  } catch (e) {
    throw new Error(e?.name === 'AbortError' ? 'offline' : 'offline');
  } finally { clearTimeout(timer); }
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) throw new Error(body?.message ?? `http_${res.status}`);
  return body;
}

export const publicUrl = async () => (await config()).url;
export const vapidKey = async () => (await config()).vapid;
