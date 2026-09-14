import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { addCalendarDays, getCalendarDateInTimeZone } from '../src/lib/booking-date.mjs';
import { dynamic } from '../src/app/api/availability/route.ts';
import { createAvailabilityHandler } from '../src/lib/availability/availability-handler.ts';
import { PROVIDER_AVAILABILITY_CONFIG } from '../src/lib/availability/provider-config.mjs';

const testNow = new Date('2026-09-14T12:00:00.000Z');
const today = getCalendarDateInTimeZone(testNow, 'Europe/London');
const tomorrow = addCalendarDays(today, 1);

function createHandler(service, config = PROVIDER_AVAILABILITY_CONFIG) {
  return createAvailabilityHandler(service, config, () => testNow);
}

function request(from = tomorrow, to = tomorrow) {
  return new Request(`http://localhost/api/availability?from=${from}&to=${to}`);
}

test('omitted range is derived entirely from the server-owned provider horizon', async () => {
  const testConfig = {
    ...PROVIDER_AVAILABILITY_CONFIG,
    maximumBookingHorizonDays: 3,
  };
  let received;
  const response = await createHandler(async (input) => {
    received = input;
    return [];
  }, testConfig)(new Request('http://localhost/api/availability'));

  assert.equal(response.status, 200);
  assert.equal(received.fromDate, today);
  assert.equal(received.toDate, addCalendarDays(today, 3));
  assert.equal(received.config, testConfig);
});

test('partially omitted ranges use server defaults while preserving explicit bounds', async () => {
  const calls = [];
  const handler = createHandler(async (input) => { calls.push(input); return []; });
  assert.equal((await handler(new Request(`http://localhost/api/availability?from=${tomorrow}`))).status, 200);
  assert.equal((await handler(new Request(`http://localhost/api/availability?to=${tomorrow}`))).status, 200);
  assert.equal(calls[0].fromDate, tomorrow);
  assert.equal(calls[0].toDate, addCalendarDays(today, PROVIDER_AVAILABILITY_CONFIG.maximumBookingHorizonDays));
  assert.equal(calls[1].fromDate, today);
  assert.equal(calls[1].toDate, tomorrow);
});

test('booking UI requests server-default availability without encoding a horizon', async () => {
  const source = await readFile(new URL('../src/components/BookingSection.tsx', import.meta.url), 'utf8');
  assert.match(source, /fetch\(['"]\/api\/availability['"]/);
  assert.doesNotMatch(source, /maximumBookingHorizonDays/);
  assert.doesNotMatch(source, /addCalendarDays\(initialAvailabilityDate/);
  assert.doesNotMatch(source, /api\/availability\?from=/);
});

test('valid requests return only customer-safe grouped available slots without caching', async () => {
  const handler = createHandler(async ({ fromDate, toDate, now }) => {
    assert.equal(fromDate, tomorrow);
    assert.equal(toDate, tomorrow);
    assert.equal(now, testNow);
    return [{ date: tomorrow, startAt: `${tomorrow}T10:00:00.000Z`, endAt: `${tomorrow}T10:55:00.000Z` }];
  });
  const response = await handler(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(dynamic, 'force-dynamic');
  const body = await response.json();
  assert.deepEqual(body, {
    timezone: 'Europe/London',
    days: [{ date: tomorrow, slots: [{ startAt: `${tomorrow}T10:00:00.000Z`, endAt: `${tomorrow}T10:55:00.000Z` }] }],
  });
  const serialized = JSON.stringify(body);
  for (const privateField of ['busy', 'booking', 'status', 'customer', 'calendarId', 'occupancy']) {
    assert.equal(serialized.includes(privateField), false);
  }
});

test('valid empty availability is a successful empty result', async () => {
  const response = await createHandler(async () => [])(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { timezone: 'Europe/London', days: [] });
});

test('malformed, reversed, past, and excessive ranges return one stable 400 error', async () => {
  const shortHorizonConfig = { ...PROVIDER_AVAILABILITY_CONFIG, maximumBookingHorizonDays: 2 };
  const excessive = addCalendarDays(today, 3);
  const scenarios = [
    request('not-a-date', tomorrow),
    request('2026-02-30', tomorrow),
    request(addCalendarDays(tomorrow, 1), tomorrow),
    request(addCalendarDays(today, -1), tomorrow),
    request(tomorrow, excessive),
  ];
  for (const invalidRequest of scenarios) {
    let called = false;
    const response = await createHandler(
      async () => { called = true; return []; },
      shortHorizonConfig,
    )(invalidRequest);
    assert.equal(response.status, 400);
    assert.equal(called, false);
    assert.deepEqual(await response.json(), {
      error: { code: 'invalid_date_range', message: 'Choose a valid availability date range.' },
    });
  }
});

test('dependency and reauthorization failures map to the same stable safe 503 response', async () => {
  for (const error of [new Error('database secret detail'), Object.assign(new Error('oauth detail'), { code: 'reauthorization_required' })]) {
    const originalError = console.error;
    console.error = () => {};
    try {
      const response = await createHandler(async () => { throw error; })(request());
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await response.json(), {
        error: { code: 'availability_unavailable', message: 'Availability is temporarily unavailable.' },
      });
    } finally {
      console.error = originalError;
    }
  }
});
