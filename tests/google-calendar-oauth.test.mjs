import assert from 'node:assert/strict';
import test from 'node:test';

import { GOOGLE_OAUTH_SCOPES } from '../src/lib/google-calendar/constants.mjs';
import {
  buildGoogleAuthorizationUrl,
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
  createOAuthStateEnvelope,
  isValidCodeVerifier,
  validateOAuthStateEnvelope,
} from '../src/lib/google-calendar/oauth.mjs';

test('OAuth scopes are exactly the approved identity and CalendarList scopes', () => {
  assert.deepEqual([...GOOGLE_OAUTH_SCOPES], [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  ]);
});

test('OAuth state is random, signed, matched, and expires', () => {
  const secret = 'a sufficiently long session signing secret';
  const now = Date.UTC(2030, 0, 1);
  const first = createOAuthState();
  const second = createOAuthState();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  const envelope = createOAuthStateEnvelope(first, secret, now);
  assert.equal(validateOAuthStateEnvelope(envelope, first, secret, now), true);
  assert.equal(validateOAuthStateEnvelope(envelope, second, secret, now), false);
  assert.equal(validateOAuthStateEnvelope(undefined, first, secret, now), false);
  assert.equal(validateOAuthStateEnvelope(envelope, first, secret, now + 601_000), false);
});

test('PKCE verifier format and S256 challenge follow RFC 7636', () => {
  const first = createCodeVerifier();
  const second = createCodeVerifier();
  assert.equal(isValidCodeVerifier(first), true);
  assert.notEqual(first, second);
  assert.notEqual(createCodeChallenge(first), createCodeChallenge(second));
  assert.equal(
    createCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
  );
});

test('authorization URL uses code flow, offline access, state, S256, and exact scopes', () => {
  const url = buildGoogleAuthorizationUrl({
    clientId: 'client-id',
    redirectUri: 'https://example.com/api/admin/google-calendar/callback',
    scopes: GOOGLE_OAUTH_SCOPES,
    state: 'state-value',
    codeChallenge: 'challenge-value',
    loginHint: 'admin@example.com',
  });
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('state'), 'state-value');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge-value');
  assert.deepEqual(url.searchParams.get('scope').split(' '), [...GOOGLE_OAUTH_SCOPES]);
});
