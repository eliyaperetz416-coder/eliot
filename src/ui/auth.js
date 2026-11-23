// Google sign-in with Supabase Auth over plain fetch (PKCE flow, no SDK) — OUR DESIGN, spec section 4.1.
// The session is kept in IndexedDB (kv 'session'). Offline, the stored session is used as it is: the app keeps working locally.
import { dbGet, dbPut, dbDelete } from './db.js';
import { config } from './crew-api.js';
import { verifierFrom, challengeS256, sessionFrom, needsRefresh } from '../core/pkce.mjs';

const subs = new Set();
let current = null;
let loaded = false;

export const onAuth = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => { for (const fn of subs) fn(current); };

async function save(session) {
  current = session;
  if (session) await dbPut('kv', session, 'session'); else await dbDelete('kv', 'session');
  emit();
}

/** fetch() that gives up after ms (a hung request on a bad gym network must never block sync or sign-in forever). */
function timedFetch(url, init = {}, ms = 15000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...init, signal: ctl.signal }).finally(() => clearTimeout(timer));
}

async function authPost(path, body) {
  const { url, key } = await config();
  return timedFetch(`${url}/auth/v1/${path}`, { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

/** Leaves the app for Google; the Auth server sends the user back here with ?code=. */
export async function startGoogleSignIn() {
  const verifier = verifierFrom(crypto.getRandomValues(new Uint8Array(32)));
  await dbPut('kv', verifier, 'pkce');
  const { url } = await config();
  const back = location.origin + location.pathname;
  const q = new URLSearchParams({ provider: 'google', redirect_to: back, code_challenge: await challengeS256(verifier), code_challenge_method: 's256' });
  location.href = `${url}/auth/v1/authorize?${q}`;
}

/** Call once at start. 'none' = not coming back from sign-in, 'ok' = signed in, 'error' = it did not finish. */
export async function completeSignIn() {
  const q = new URLSearchParams(location.search);
  const hashQ = new URLSearchParams(location.hash.includes('error=') ? location.hash.replace(/^#/, '') : '');
  const code = q.get('code');
  const failed = q.get('error') || hashQ.get('error');
  if (!code && !failed) return 'none';
  history.replaceState(null, '', location.pathname + (failed && hashQ.get('error') ? '' : location.hash));
  if (failed) return 'error';
  const verifier = await dbGet('kv', 'pkce').catch(() => null);
  if (!verifier) return 'error';
  try {
    const r = await authPost('token?grant_type=pkce', { auth_code: code, code_verifier: verifier });
    if (!r.ok) return 'error';
    await save(sessionFrom(await r.json(), Date.now()));
    await dbDelete('kv', 'pkce');
    return 'ok';
  } catch { return 'error'; }
}

/** The current session, refreshed when it is about to expire. null when signed out (local data is never touched). */
export async function getSession() {
  if (!loaded) { current = (await dbGet('kv', 'session').catch(() => null)) ?? null; loaded = true; }
  if (!current || !needsRefresh(current, Date.now())) return current;
  try {
    const r = await authPost('token?grant_type=refresh_token', { refresh_token: current.refreshToken });
    if (r.status === 400 || r.status === 401) { await save(null); return null; }
    if (r.ok) await save(sessionFrom(await r.json(), Date.now()));
  } catch { /* offline: keep using the stored session */ }
  return current;
}

/** fetch() to the Supabase REST API as the signed-in user. */
export async function authFetch(path, init = {}, ms = 15000) {
  const { url, key } = await config();
  const s = await getSession();
  if (!s) throw new Error('signed-out');
  return timedFetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${s.accessToken}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } }, ms);
}

export async function signOut() {
  const s = await getSession().catch(() => null);
  if (s) {
    try { const { url, key } = await config(); await timedFetch(`${url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${s.accessToken}` } }); } catch { /* offline */ } // this phone only
  }
  await save(null);
}
