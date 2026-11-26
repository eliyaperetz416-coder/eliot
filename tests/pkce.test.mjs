import test from 'node:test';
import assert from 'node:assert/strict';
import { verifierFrom, challengeS256, sessionFrom, needsRefresh, REFRESH_SKEW_S, signedInWithin, REAUTH_S } from '../src/core/pkce.mjs';

test('verifier is 43 base64url characters for 32 bytes', () => {
  assert.match(verifierFrom(new Uint8Array(32).fill(1)), /^[A-Za-z0-9_-]{43}$/);
});

test('S256 challenge matches the RFC 7636 example', async () => {
  assert.equal(await challengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('session from a token response', () => {
  const s = sessionFrom({ access_token: 'a', refresh_token: 'r', expires_in: 3600, user: { id: 'u', email: 'e', user_metadata: { full_name: 'N' } } }, 1000);
  assert.deepEqual(s, { accessToken: 'a', refreshToken: 'r', expiresAt: 3601000, user: { id: 'u', email: 'e', name: 'N' } });
});

test('refresh when the token expires within the skew', () => {
  assert.equal(REFRESH_SKEW_S, 60);
  assert.equal(needsRefresh({ expiresAt: 100_000 }, 50_000), true);
  assert.equal(needsRefresh({ expiresAt: 1_000_000 }, 0), false);
});

// a JWT with this payload (header and signature do not matter to the phone)
const jwt = (payload) => `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;

test('signedInWithin: the last Google sign-in (amr) must be recent for account deletion', () => {
  assert.equal(REAUTH_S, 900);
  const now = 2_000_000_000_000;
  const at = (agoS) => jwt({ amr: [{ method: 'oauth', timestamp: now / 1000 - agoS }] });
  assert.equal(signedInWithin(at(60), now), true);
  assert.equal(signedInWithin(at(899), now), true);
  assert.equal(signedInWithin(at(901), now), false);
  assert.equal(signedInWithin(jwt({ amr: [{ method: 'oauth', timestamp: now / 1000 - 5000 }, { method: 'otp', timestamp: now / 1000 - 30 }] }), now), true, 'the newest method counts');
  assert.equal(signedInWithin(jwt({}), now), false, 'no amr: not recent');
  assert.equal(signedInWithin('fake-access', now), false, 'not a JWT');
  assert.equal(signedInWithin(undefined, now), false);
  assert.equal(signedInWithin(jwt({ amr: [{ method: 'oauth', timestamp: now / 1000 - 1000 }] }), now, 2000), true, 'a wider window');
});
