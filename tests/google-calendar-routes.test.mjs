import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mock, test } from 'node:test';

import { NextRequest } from 'next/server.js';

import {
  decryptRefreshToken,
  encryptRefreshToken,
  encryptedRefreshTokenContainsOAuthState,
} from '../src/lib/google-calendar/token-encryption.mjs';
import {
  createCodeVerifier,
  createOAuthStateEnvelope,
} from '../src/lib/google-calendar/oauth.mjs';

const connectionModule = new URL(
  '../src/lib/google-calendar/connection.ts',
  import.meta.url,
).href;
const configModule = new URL('../src/lib/google-calendar/config.ts', import.meta.url).href;
const sessionModule = new URL('../src/lib/admin/session.ts', import.meta.url).href;
const encryptionModule = new URL(
  '../src/lib/google-calendar/token-encryption.ts',
  import.meta.url,
).href;

let consumedStates = new Set();
let pendingStates = new Set();
let replayChecks = 0;
let persistedConnection = null;
let persistenceError = null;
let eventOrder = [];

await mock.module(connectionModule, {
  namedExports: {
    isGoogleOAuthStateConsumed: async (state) => {
      replayChecks += 1;
      eventOrder.push('replay-checked');
      return consumedStates.has(state);
    },
    saveGoogleCalendarConnection: async (connection) => {
      eventOrder.push('persistence-started');
      if (persistenceError) throw persistenceError;
      persistedConnection = connection;
      for (const state of pendingStates) {
        if (encryptedRefreshTokenContainsOAuthState(
          connection.refreshTokenEncrypted,
          process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
          state,
        )) consumedStates.add(state);
      }
      eventOrder.push('persistence-complete');
      return connection;
    },
  },
});

await mock.module(configModule, {
  namedExports: {
    getAdminSessionSecret: () => process.env.ADMIN_SESSION_SECRET,
    getGoogleOAuthConfig: () => ({
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri: `${process.env.APP_URL}/api/admin/google-calendar/callback`,
      scopes: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
        'https://www.googleapis.com/auth/calendar.freebusy',
      ],
      adminEmail: process.env.GOOGLE_ADMIN_EMAIL,
    }),
  },
});

await mock.module(sessionModule, {
  namedExports: {
    ADMIN_SESSION_COOKIE: 'rec_admin_session',
    adminSessionCookieOptions: () => ({
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    }),
    issueAdminSession: () => {
      eventOrder.push('session-created');
      return 'signed-route-test-session';
    },
  },
});

await mock.module(encryptionModule, {
  namedExports: {
    encryptRefreshToken: (token, state) => {
      pendingStates.add(state);
      return encryptRefreshToken(
        token,
        process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
        state,
      );
    },
  },
});

process.env.APP_URL = 'https://example.test';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'route-test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'route-test-client-secret';
process.env.GOOGLE_ADMIN_EMAIL = 'admin@example.com';
process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
process.env.ADMIN_SESSION_SECRET = 'route-test-session-secret-that-is-at-least-32-bytes';

const { GET: connectRoute } = await import(
  '../src/app/api/admin/google-calendar/connect/route.ts'
);
const { GET: callbackRoute } = await import(
  '../src/app/api/admin/google-calendar/callback/route.ts'
);

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = publicKey.export({ format: 'jwk' });

function createIdentityToken(email = 'admin@example.com', overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'route-test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: process.env.GOOGLE_OAUTH_CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: 'route-test-google-subject',
    email,
    email_verified: true,
    ...overrides,
  })).toString('base64url');
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey);
  return `${header}.${payload}.${signature.toString('base64url')}`;
}

function resetRouteState() {
  consumedStates = new Set();
  pendingStates = new Set();
  replayChecks = 0;
  persistedConnection = null;
  persistenceError = null;
  eventOrder = [];
  process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
}

function transactionFrom(response) {
  const authorizationUrl = new URL(response.headers.get('location'));
  const stateCookie = response.cookies.get('rec_google_oauth_state');
  const pkceCookie = response.cookies.get('rec_google_oauth_pkce');
  return {
    authorizationUrl,
    state: authorizationUrl.searchParams.get('state'),
    stateCookie: stateCookie?.value,
    pkceCookie: pkceCookie?.value,
    cookieHeader: `rec_google_oauth_state=${stateCookie?.value}; rec_google_oauth_pkce=${pkceCookie?.value}`,
  };
}

function callbackRequest(transaction, query = {}, cookieHeader = transaction.cookieHeader) {
  const url = new URL('/api/admin/google-calendar/callback', process.env.APP_URL);
  for (const [key, value] of Object.entries({ state: transaction.state, code: 'authorization-code', ...query })) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return new NextRequest(url, { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
}

function installGoogleFetch(scenario = {}) {
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input.toString());
    calls.push({ url, init });
    if (url.toString() === 'https://oauth2.googleapis.com/token') {
      if (scenario.tokenFailure) return new Response('sensitive token failure', { status: 500 });
      return Response.json({
        access_token: 'temporary-access-token',
        refresh_token: scenario.missingRefreshToken ? undefined : 'route-test-refresh-token',
        id_token: scenario.invalidIdentityToken
          ? 'invalid.identity.token'
          : createIdentityToken(scenario.email, scenario.identityOverrides),
        scope: 'openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.freebusy',
      });
    }
    if (url.toString() === 'https://www.googleapis.com/oauth2/v3/certs') {
      return Response.json({
        keys: [{ ...publicJwk, kid: 'route-test-key', alg: 'RS256' }],
      });
    }
    if (url.origin === 'https://www.googleapis.com' && url.pathname.endsWith('/calendarList')) {
      if (scenario.calendarFailure) return new Response('sensitive calendar failure', { status: 503 });
      if (scenario.noPrimary) return Response.json({ items: [{ id: 'secondary', summary: 'Secondary' }] });
      if (!url.searchParams.has('pageToken')) {
        return Response.json({
          items: [{ id: 'secondary', summary: 'Secondary' }],
          nextPageToken: 'second-page',
        });
      }
      return Response.json({
        items: [{
          id: 'primary@example.com',
          summary: 'Primary calendar',
          timeZone: 'Europe/London',
          primary: true,
          description: 'must not be persisted',
        }],
      });
    }
    throw new Error(`Unexpected HTTP request: ${url}`);
  };
  return calls;
}

function assertTemporaryCookiesCleared(response) {
  assert.equal(response.cookies.get('rec_google_oauth_state')?.value, '');
  assert.equal(response.cookies.get('rec_google_oauth_pkce')?.value, '');
  const headers = response.headers.getSetCookie().join('\n');
  assert.match(headers, /rec_google_oauth_state=;.*Max-Age=0/i);
  assert.match(headers, /rec_google_oauth_pkce=;.*Max-Age=0/i);
}

function assertSanitizedFailure(response, approvedCode) {
  const location = new URL(response.headers.get('location'));
  assert.equal(location.origin, process.env.APP_URL);
  assert.equal(location.pathname, '/admin/google-calendar/result');
  assert.equal(location.searchParams.get('error'), approvedCode);
  assert.equal(response.cookies.has('rec_admin_session'), false);
  assert.equal(location.toString().includes('sensitive'), false);
  assertTemporaryCookiesCleared(response);
}

test('connect route emits the exact secure authorization request without persistence', async () => {
  resetRouteState();
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const response = await connectRoute();
  if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousNodeEnv;
  const transaction = transactionFrom(response);
  assert.equal(response.status, 307);
  assert.equal(transaction.authorizationUrl.origin, 'https://accounts.google.com');
  assert.equal(transaction.authorizationUrl.searchParams.get('response_type'), 'code');
  assert.equal(transaction.authorizationUrl.searchParams.get('access_type'), 'offline');
  assert.equal(transaction.authorizationUrl.searchParams.get('prompt'), 'consent');
  assert.equal(transaction.authorizationUrl.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(transaction.state);
  assert.ok(transaction.authorizationUrl.searchParams.get('code_challenge'));
  assert.deepEqual(transaction.authorizationUrl.searchParams.get('scope').split(' '), [
    'openid',
    'email',
    'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.freebusy',
  ]);
  const setCookies = response.headers.getSetCookie().join('\n');
  assert.match(setCookies, /rec_google_oauth_state=.*HttpOnly/i);
  assert.match(setCookies, /rec_google_oauth_pkce=.*HttpOnly/i);
  assert.match(setCookies, /Max-Age=600/i);
  assert.match(setCookies, /Secure/i);
  assert.equal(replayChecks, 0);
  assert.equal(persistedConnection, null);

  const developmentResponse = await connectRoute();
  assert.doesNotMatch(developmentResponse.headers.getSetCookie().join('\n'), /; Secure/i);
});

test('callback route completes the real orchestration and rejects replay before exchange', async () => {
  resetRouteState();
  const transaction = transactionFrom(await connectRoute());
  const calls = installGoogleFetch();
  const response = await callbackRoute(callbackRequest(transaction));
  assert.equal(new URL(response.headers.get('location')).search, '?status=connected');
  assert.equal(calls.filter(({ url }) => url.toString() === 'https://oauth2.googleapis.com/token').length, 1);
  const tokenBody = calls.find(({ url }) => url.toString() === 'https://oauth2.googleapis.com/token').init.body;
  assert.equal(tokenBody.get('code_verifier'), transaction.pkceCookie);
  assert.equal(replayChecks, 1);
  assert.equal(eventOrder.indexOf('replay-checked') < eventOrder.indexOf('persistence-started'), true);
  assert.equal(persistedConnection.googleSubject, 'route-test-google-subject');
  assert.equal(persistedConnection.googleEmail, 'admin@example.com');
  assert.equal(persistedConnection.calendarId, 'primary@example.com');
  assert.equal(persistedConnection.calendarSummary, 'Primary calendar');
  assert.equal(persistedConnection.calendarTimeZone, 'Europe/London');
  assert.deepEqual(persistedConnection.grantedScopes, [
    'openid', 'email', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
    'https://www.googleapis.com/auth/calendar.freebusy',
  ]);
  assert.equal(JSON.stringify(persistedConnection).includes('route-test-refresh-token'), false);
  assert.equal(
    decryptRefreshToken(
      persistedConnection.refreshTokenEncrypted,
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
    ),
    'route-test-refresh-token',
  );
  assert.ok(response.cookies.get('rec_admin_session')?.value);
  assert.deepEqual(eventOrder.slice(-2), ['persistence-complete', 'session-created']);
  assertTemporaryCookiesCleared(response);

  const replay = await callbackRoute(callbackRequest(transaction));
  assertSanitizedFailure(replay, 'authorization_expired');
  assert.equal(calls.filter(({ url }) => url.toString() === 'https://oauth2.googleapis.com/token').length, 1);
});

test('callback route rejects invalid transaction inputs before token exchange', async () => {
  for (const scenario of ['missing-state', 'mismatched-state', 'expired-state', 'missing-pkce', 'invalid-pkce']) {
    resetRouteState();
    const transaction = transactionFrom(await connectRoute());
    const calls = installGoogleFetch();
    let request;
    if (scenario === 'missing-state') request = callbackRequest(transaction, { state: null });
    if (scenario === 'mismatched-state') request = callbackRequest(transaction, { state: 'different-state' });
    if (scenario === 'expired-state') {
      const expired = createOAuthStateEnvelope(transaction.state, process.env.ADMIN_SESSION_SECRET, Date.now() - 700_000);
      request = callbackRequest(transaction, {}, `rec_google_oauth_state=${expired}; rec_google_oauth_pkce=${transaction.pkceCookie}`);
    }
    if (scenario === 'missing-pkce') request = callbackRequest(transaction, {}, `rec_google_oauth_state=${transaction.stateCookie}`);
    if (scenario === 'invalid-pkce') request = callbackRequest(transaction, {}, `rec_google_oauth_state=${transaction.stateCookie}; rec_google_oauth_pkce=short`);
    const response = await callbackRoute(request);
    assertSanitizedFailure(response, 'authorization_expired');
    assert.equal(calls.length, 0, scenario);
    assert.equal(persistedConnection, null, scenario);
    if (scenario === 'missing-pkce' || scenario === 'invalid-pkce') assert.equal(replayChecks, 1);
    assert.equal(consumedStates.size, 0, scenario);
  }
});

test('callback route sanitizes every specified provider, identity, calendar, crypto, and database failure', async () => {
  const scenarios = [
    ['access denied', { query: { error: 'access_denied', code: null } }, 'authorization_cancelled'],
    ['missing code', { query: { code: null } }, 'connection_failed'],
    ['token exchange', { google: { tokenFailure: true } }, 'connection_failed'],
    ['invalid identity', { google: { invalidIdentityToken: true } }, 'connection_failed'],
    ['unauthorized account', { google: { email: 'other@example.com' } }, 'unauthorized_account'],
    ['missing refresh token', { google: { missingRefreshToken: true } }, 'missing_refresh_token'],
    ['CalendarList', { google: { calendarFailure: true } }, 'connection_failed'],
    ['missing primary calendar', { google: { noPrimary: true } }, 'connection_failed'],
    ['encryption', { invalidEncryptionKey: true }, 'connection_failed'],
    ['database', { databaseFailure: true }, 'connection_failed'],
  ];
  for (const [name, setup, expectedCode] of scenarios) {
    resetRouteState();
    const existing = { id: 'primary', googleSubject: 'existing', refreshTokenEncrypted: 'existing-ciphertext' };
    persistedConnection = existing;
    if (setup.invalidEncryptionKey) process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'invalid';
    if (setup.databaseFailure) persistenceError = new Error('sensitive database failure');
    const transaction = transactionFrom(await connectRoute());
    const calls = installGoogleFetch(setup.google);
    const response = await callbackRoute(callbackRequest(transaction, setup.query));
    assertSanitizedFailure(response, expectedCode);
    assert.equal(persistedConnection, existing, name);
    assert.equal(replayChecks, 1, name);
    assert.equal(consumedStates.size, 0, name);
    if (name === 'access denied' || name === 'missing code') assert.equal(calls.length, 0, name);
  }
});
