import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CalendarAvailabilityError,
  getBusyPeriods,
  GOOGLE_FREEBUSY_SCOPE,
} from '../src/lib/calendar/busy-periods.mjs';
import {
  GoogleApiError,
  queryGoogleFreeBusy,
  refreshGoogleAccessToken,
} from '../src/lib/google-calendar/google-api.mjs';
import {
  GOOGLE_FREEBUSY_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
} from '../src/lib/google-calendar/constants.mjs';

const from = new Date('2030-01-01T09:00:00Z');
const to = new Date('2030-01-01T18:00:00Z');

function credentials(overrides = {}) {
  return {
    calendarId: 'primary@example.com',
    grantedScopes: [GOOGLE_FREEBUSY_SCOPE],
    refreshToken: 'stored-refresh-token',
    ...overrides,
  };
}

function serviceDependencies(overrides = {}) {
  return {
    getCredentials: async () => credentials(),
    getOAuthConfig: async () => ({ clientId: 'client-id', clientSecret: 'client-secret' }),
    refreshAccessToken: async () => ({ accessToken: 'temporary-access-token' }),
    queryFreeBusy: async () => [],
    ...overrides,
  };
}

function rejectsWithCode(code) {
  return (error) => error instanceof CalendarAvailabilityError && error.code === code;
}

test('invalid ranges fail before loading credentials or calling Google', async () => {
  const invalidRanges = [
    [new Date('invalid'), to],
    [from, new Date('invalid')],
    [from, new Date(from)],
    [to, from],
    ['2030-01-01T09:00:00Z', to],
  ];
  for (const [invalidFrom, invalidTo] of invalidRanges) {
    let calls = 0;
    await assert.rejects(
      () => getBusyPeriods(invalidFrom, invalidTo, serviceDependencies({
        getCredentials: async () => { calls += 1; return credentials(); },
      })),
      rejectsWithCode('invalid_range'),
    );
    assert.equal(calls, 0);
  }
});

test('service uses persisted credentials and maps the complete flow without exposing them', async () => {
  const calls = [];
  const expected = [{ startAt: '2030-01-01T10:00:00.000Z', endAt: '2030-01-01T11:00:00.000Z' }];
  const result = await getBusyPeriods(from, to, serviceDependencies({
    refreshAccessToken: async (input) => {
      calls.push(['refresh', input]);
      return { accessToken: 'temporary-access-token' };
    },
    queryFreeBusy: async (input) => {
      calls.push(['freebusy', input]);
      return expected;
    },
  }));
  assert.deepEqual(result, expected);
  assert.deepEqual(calls[0], ['refresh', {
    refreshToken: 'stored-refresh-token', clientId: 'client-id', clientSecret: 'client-secret',
  }]);
  assert.deepEqual(calls[1], ['freebusy', {
    accessToken: 'temporary-access-token', calendarId: 'primary@example.com', from, to,
  }]);
  assert.deepEqual(Object.keys(result[0]), ['startAt', 'endAt']);
});

test('missing connection and missing scope fail explicitly before Google calls', async () => {
  let googleCalls = 0;
  const callGoogle = async () => { googleCalls += 1; return { accessToken: 'token' }; };
  await assert.rejects(
    () => getBusyPeriods(from, to, serviceDependencies({ getCredentials: async () => null, refreshAccessToken: callGoogle })),
    rejectsWithCode('not_connected'),
  );
  await assert.rejects(
    () => getBusyPeriods(from, to, serviceDependencies({
      getCredentials: async () => credentials({ grantedScopes: ['openid', 'email'] }),
      refreshAccessToken: callGoogle,
    })),
    rejectsWithCode('reauthorization_required'),
  );
  assert.equal(googleCalls, 0);
});

test('service normalizes credential, authentication, provider, and malformed response failures', async () => {
  const scenarios = [
    ['credential load', { getCredentials: async () => { throw new Error('database detail'); } }, 'provider_unavailable'],
    ['revoked token', { refreshAccessToken: async () => { throw new GoogleApiError('authorization'); } }, 'reauthorization_required'],
    ['token outage', { refreshAccessToken: async () => { throw new GoogleApiError('unavailable'); } }, 'provider_unavailable'],
    ['FreeBusy auth', { queryFreeBusy: async () => { throw new GoogleApiError('authorization'); } }, 'reauthorization_required'],
    ['FreeBusy outage', { queryFreeBusy: async () => { throw new GoogleApiError('unavailable'); } }, 'provider_unavailable'],
    ['malformed response', { queryFreeBusy: async () => { throw new GoogleApiError('invalid_response'); } }, 'invalid_provider_response'],
  ];
  for (const [name, overrides, code] of scenarios) {
    await assert.rejects(
      () => getBusyPeriods(from, to, serviceDependencies(overrides)),
      (error) => rejectsWithCode(code)(error) && !error.message.includes('detail'),
      name,
    );
  }
});

test('refresh-token exchange uses the configured endpoint and form-encoded no-store request', async () => {
  let request;
  const result = await refreshGoogleAccessToken(credentials({
    clientId: 'client-id', clientSecret: 'client-secret',
  }), async (url, options) => {
    request = { url, options };
    return Response.json({ access_token: 'temporary-access-token', expires_in: 3600 });
  });
  assert.deepEqual(result, { accessToken: 'temporary-access-token' });
  assert.equal(request.url, GOOGLE_TOKEN_ENDPOINT);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(request.options.cache, 'no-store');
  assert.deepEqual(Object.fromEntries(request.options.body), {
    client_id: 'client-id',
    client_secret: 'client-secret',
    refresh_token: 'stored-refresh-token',
    grant_type: 'refresh_token',
  });
});

test('refresh-token exchange rejects revoked, unavailable, malformed, and network responses safely', async () => {
  const input = credentials({ clientId: 'client-id', clientSecret: 'client-secret' });
  const scenarios = [
    [() => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'secret detail' }), { status: 400 }), 'authorization'],
    [() => new Response('outage detail', { status: 503 }), 'unavailable'],
    [() => Response.json({ expires_in: 3600 }), 'invalid_response'],
    [() => new Response('not-json'), 'invalid_response'],
    [() => { throw new Error('network detail'); }, 'unavailable'],
  ];
  for (const [response, category] of scenarios) {
    await assert.rejects(
      () => refreshGoogleAccessToken(input, async () => response()),
      (error) => error instanceof GoogleApiError && error.category === category && !error.message.includes('detail'),
    );
  }
});

test('FreeBusy sends one persisted calendar and maps normalized, sorted periods', async () => {
  let request;
  const result = await queryGoogleFreeBusy({
    accessToken: 'temporary-access-token', calendarId: 'primary@example.com', from, to,
  }, async (url, options) => {
    request = { url, options };
    return Response.json({
      kind: 'calendar#freeBusy',
      calendars: {
        'primary@example.com': {
          busy: [
            { start: '2030-01-01T12:30:00+01:00', end: '2030-01-01T13:15:00+01:00' },
            { start: '2030-01-01T10:00:00Z', end: '2030-01-01T11:00:00Z' },
          ],
        },
      },
    });
  });
  assert.equal(request.url, GOOGLE_FREEBUSY_ENDPOINT);
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.cache, 'no-store');
  assert.equal(request.options.headers.Authorization, 'Bearer temporary-access-token');
  assert.deepEqual(JSON.parse(request.options.body), {
    timeMin: '2030-01-01T09:00:00.000Z',
    timeMax: '2030-01-01T18:00:00.000Z',
    timeZone: 'UTC',
    items: [{ id: 'primary@example.com' }],
  });
  assert.deepEqual(result, [
    { startAt: '2030-01-01T10:00:00.000Z', endAt: '2030-01-01T11:00:00.000Z' },
    { startAt: '2030-01-01T11:30:00.000Z', endAt: '2030-01-01T12:15:00.000Z' },
  ]);
});

test('FreeBusy returns an empty array only for a valid empty calendar result', async () => {
  const result = await queryGoogleFreeBusy({
    accessToken: 'token', calendarId: 'primary@example.com', from, to,
  }, async () => Response.json({ calendars: { 'primary@example.com': { busy: [] } } }));
  assert.deepEqual(result, []);
});

test('FreeBusy treats a calendar-level error as provider failure, never empty availability', async () => {
  await assert.rejects(
    () => queryGoogleFreeBusy({
      accessToken: 'token', calendarId: 'primary@example.com', from, to,
    }, async () => Response.json({
      calendars: {
        'primary@example.com': { errors: [{ reason: 'notFound' }], busy: [] },
      },
    })),
    (error) => error instanceof GoogleApiError && error.category === 'unavailable',
  );
});

test('FreeBusy rejects HTTP authorization, rate limit, outage, and network failures', async () => {
  const input = { accessToken: 'token', calendarId: 'primary@example.com', from, to };
  const scenarios = [
    [() => new Response('', { status: 401 }), 'authorization'],
    [() => new Response('', { status: 403 }), 'authorization'],
    [() => Response.json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { status: 403 }), 'unavailable'],
    [() => new Response('', { status: 429 }), 'unavailable'],
    [() => new Response('', { status: 500 }), 'unavailable'],
    [() => { throw new Error('network detail'); }, 'unavailable'],
  ];
  for (const [response, category] of scenarios) {
    await assert.rejects(
      () => queryGoogleFreeBusy(input, async () => response()),
      (error) => error instanceof GoogleApiError && error.category === category,
    );
  }
});

test('FreeBusy rejects every malformed or partial successful response', async () => {
  const input = { accessToken: 'token', calendarId: 'primary@example.com', from, to };
  const invalidBodies = [
    undefined,
    {},
    { calendars: {} },
    { calendars: { 'primary@example.com': { errors: {}, busy: [] } } },
    { calendars: { 'primary@example.com': {} } },
    { calendars: { 'primary@example.com': { busy: [null] } } },
    { calendars: { 'primary@example.com': { busy: [{}] } } },
    { calendars: { 'primary@example.com': { busy: [{ start: '2030-01-01', end: '2030-01-02' }] } } },
    { calendars: { 'primary@example.com': { busy: [{ start: 'invalid', end: '2030-01-01T11:00:00Z' }] } } },
    { calendars: { 'primary@example.com': { busy: [{ start: '2030-01-01T10:00:00Z', end: 'invalid' }] } } },
    { calendars: { 'primary@example.com': { busy: [{ start: '2030-01-01T10:00:00Z', end: '2030-01-01T10:00:00Z' }] } } },
    { calendars: { 'primary@example.com': { busy: [{ start: '2030-01-01T11:00:00Z', end: '2030-01-01T10:00:00Z' }] } } },
  ];
  for (const body of invalidBodies) {
    await assert.rejects(
      () => queryGoogleFreeBusy(input, async () => body === undefined
        ? new Response('not-json')
        : Response.json(body)),
      (error) => error instanceof GoogleApiError && error.category === 'invalid_response',
    );
  }
});
