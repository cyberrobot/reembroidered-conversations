import assert from 'node:assert/strict';
import test from 'node:test';

import { addCalendarDays, getCalendarDateInTimeZone } from '../src/lib/booking-date.mjs';
import { dynamic } from '../src/app/api/availability/route.ts';
import { createAvailabilityHandler } from '../src/lib/availability/availability-handler.ts';

const today = getCalendarDateInTimeZone(new Date(), 'Europe/London');
const tomorrow = addCalendarDays(today, 1);

function request(from = tomorrow, to = tomorrow) {
  return new Request(`http://localhost/api/availability?from=${from}&to=${to}`);
}

test('valid requests return only customer-safe grouped available slots without caching', async () => {
  const handler = createAvailabilityHandler(async ({ fromDate, toDate, now }) => {
    assert.equal(fromDate, tomorrow);
    assert.equal(toDate, tomorrow);
    assert.ok(now instanceof Date);
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
  const response = await createAvailabilityHandler(async () => [])(request());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { timezone: 'Europe/London', days: [] });
});

test('malformed, reversed, past, and excessive ranges return one stable 400 error', async () => {
  const excessive = addCalendarDays(today, 57);
  const scenarios = [
    request('not-a-date', tomorrow),
    request('2026-02-30', tomorrow),
    request(addCalendarDays(tomorrow, 1), tomorrow),
    request(addCalendarDays(today, -1), tomorrow),
    request(tomorrow, excessive),
  ];
  for (const invalidRequest of scenarios) {
    let called = false;
    const response = await createAvailabilityHandler(async () => { called = true; return []; })(invalidRequest);
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
      const response = await createAvailabilityHandler(async () => { throw error; })(request());
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
