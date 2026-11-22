import test from 'node:test';
import assert from 'node:assert/strict';
import { verifierFrom, challengeS256, sessionFrom, needsRefresh, REFRESH_SKEW_S } from '../src/core/pkce.mjs';

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
