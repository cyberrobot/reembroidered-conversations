import assert from 'node:assert/strict';
import test from 'node:test';

import { completeGoogleOAuth } from '../src/lib/google-calendar/flow.mjs';
import { discoverPrimaryCalendar } from '../src/lib/google-calendar/google-api.mjs';

const input = {
  code: 'code',
  codeVerifier: 'verifier',
  adminEmail: 'admin@example.com',
  state: 'oauth-state',
};

function successfulDependencies(overrides = {}) {
  return {
    exchangeCode: async () => ({
      accessToken: 'temporary-access-token',
      idToken: 'signed-id-token',
      refreshToken: 'refresh-token',
      grantedScopes: ['openid', 'email'],
    }),
    verifyIdentity: async () => ({
      sub: 'google-subject',
      email: 'admin@example.com',
      email_verified: true,
    }),
    discoverCalendar: async () => ({
      id: 'primary@example.com',
      summary: 'Primary calendar',
      timeZone: 'Europe/London',
    }),
    encryptToken: () => 'v1.nonce.tag.ciphertext',
    persistConnection: async () => {},
    ...overrides,
  };
}

test('successful callback orchestration persists only a complete encrypted connection', async () => {
  let persisted;
  const identity = await completeGoogleOAuth(
    input,
    successfulDependencies({ persistConnection: async (value) => { persisted = value; } }),
  );
  assert.deepEqual(identity, { subject: 'google-subject', email: 'admin@example.com' });
  assert.equal(persisted.refreshTokenEncrypted, 'v1.nonce.tag.ciphertext');
  assert.equal(JSON.stringify(persisted).includes('refresh-token'), false);
  assert.equal(persisted.calendarId, 'primary@example.com');
});

for (const [name, overrides, expectedCode] of [
  ['missing refresh token', { exchangeCode: async () => ({ accessToken: 'a', idToken: 'i', refreshToken: null, grantedScopes: [] }) }, 'missing_refresh_token'],
  ['wrong account', { verifyIdentity: async () => ({ sub: 's', email: 'other@example.com', email_verified: true }) }, 'unauthorized_account'],
  ['token exchange failure', { exchangeCode: async () => { throw new Error('raw provider detail'); } }, 'connection_failed'],
  ['CalendarList failure', { discoverCalendar: async () => { throw new Error('raw calendar detail'); } }, 'connection_failed'],
  ['database failure', { persistConnection: async () => { throw new Error('raw database detail'); } }, 'connection_failed'],
]) {
  test(`${name} produces no partial persistence and a sanitized result code`, async () => {
    let persistenceCalls = 0;
    const dependencies = successfulDependencies({
      ...overrides,
      ...(overrides.persistConnection ? {} : { persistConnection: async () => { persistenceCalls += 1; } }),
    });
    await assert.rejects(
      () => completeGoogleOAuth(input, dependencies),
      (error) => error.code === expectedCode && !error.message.includes('raw'),
    );
    assert.equal(persistenceCalls, 0);
  });
}

test('CalendarList discovery follows pagination and selects only primary metadata', async () => {
  const requests = [];
  const pages = [
    { items: [{ id: 'secondary', summary: 'Secondary' }], nextPageToken: 'page-2' },
    { items: [{ id: 'primary', summary: 'Primary', timeZone: 'Europe/London', primary: true }] },
  ];
  const calendar = await discoverPrimaryCalendar('access-token', async (url, options) => {
    requests.push({ url: url.toString(), options });
    return { ok: true, json: async () => pages.shift() };
  });
  assert.deepEqual(calendar, { id: 'primary', summary: 'Primary', timeZone: 'Europe/London' });
  assert.equal(requests.length, 2);
  assert.equal(new URL(requests[1].url).searchParams.get('pageToken'), 'page-2');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer access-token');
});

test('CalendarList discovery fails rather than selecting a secondary calendar', async () => {
  await assert.rejects(() => discoverPrimaryCalendar('token', async () => ({
    ok: true,
    json: async () => ({ items: [{ id: 'secondary', summary: 'Secondary' }] }),
  })));
});

test('a failed authorization leaves an existing connection unchanged', async () => {
  const existingConnection = {
    id: 'primary',
    googleSubject: 'existing-subject',
    refreshTokenEncrypted: 'v1.existing.tag.ciphertext',
  };
  await assert.rejects(() => completeGoogleOAuth(
    input,
    successfulDependencies({
      discoverCalendar: async () => { throw new Error('temporary outage'); },
      persistConnection: async (replacement) => Object.assign(existingConnection, replacement),
    }),
  ));
  assert.deepEqual(existingConnection, {
    id: 'primary',
    googleSubject: 'existing-subject',
    refreshTokenEncrypted: 'v1.existing.tag.ciphertext',
  });
});
