// Pure helpers for signing in with Supabase Auth through the PKCE flow (OUR DESIGN, spec section 4.1). No SDK.

export const REFRESH_SKEW_S = 60;

const b64url = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** A code verifier from random bytes (32 bytes give 43 characters). */
export const verifierFrom = (bytes) => b64url(bytes);

/** The S256 code challenge: base64url(SHA-256(verifier)), no padding. */
export async function challengeS256(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

/** The session kept on the phone, from an Auth token response. */
export function sessionFrom(json, nowMs) {
  const u = json.user ?? {};
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: nowMs + Number(json.expires_in) * 1000,
    user: { id: u.id, email: u.email ?? '', name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? '' },
  };
}

export const needsRefresh = (session, nowMs) => session.expiresAt - nowMs < REFRESH_SKEW_S * 1000;
