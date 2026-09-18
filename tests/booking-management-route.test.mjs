import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCancellationHandler,
  createManagementStateHandler,
  createRescheduleHandler,
} from '../src/lib/booking/booking-management-handler.ts';
import { BookingCancellationError } from '../src/lib/booking/booking-cancellation.mjs';
import { BookingRescheduleError } from '../src/lib/booking/booking-reschedule.mjs';

const request = (path, init = {}) => new Request(`https://example.test${path}`, init);

test('management state responses are no-store and invalid links disclose no booking data', async () => {
  const valid = createManagementStateHandler(async () => ({ kind: 'active', booking: { name: 'Listener' } }));
  const validResponse = await valid(request('/api/bookings/manage/token'), 'token');
  assert.equal(validResponse.status, 200);
  assert.equal(validResponse.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await validResponse.json(), { kind: 'active', booking: { name: 'Listener' } });

  const invalid = createManagementStateHandler(async () => ({ kind: 'invalid', private: 'must-not-leak' }));
  const invalidResponse = await invalid(request('/api/bookings/manage/tampered'), 'tampered');
  assert.equal(invalidResponse.status, 404);
  assert.equal(JSON.stringify(await invalidResponse.json()).includes('private'), false);
});

test('cancellation requires capability authority and same-origin mutation', async () => {
  let calls = 0;
  const handler = createCancellationHandler(
    (capability) => capability === 'valid' ? 'booking-id' : null,
    async (_bookingId, input) => {
      calls += 1;
      assert.deepEqual(input, { expectedRefundEligible: true });
      return { status: 'cancelled' };
    },
  );
  const cancellationRequest = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"expectedRefundEligible":true}' };
  const invalid = await handler(request('/api/bookings/manage/invalid/cancel', cancellationRequest), 'invalid');
  assert.equal(invalid.status, 404);
  assert.equal(calls, 0);
  const crossOrigin = await handler(request('/api/bookings/manage/valid/cancel', {
    ...cancellationRequest, headers: { ...cancellationRequest.headers, Origin: 'https://attacker.example' },
  }), 'valid');
  assert.equal(crossOrigin.status, 403);
  assert.equal(calls, 0);
  const valid = await handler(request('/api/bookings/manage/valid/cancel', {
    ...cancellationRequest, headers: { ...cancellationRequest.headers, Origin: 'https://example.test' },
  }), 'valid');
  assert.equal(valid.status, 200);
  assert.equal(valid.headers.get('cache-control'), 'no-store');
  assert.equal(calls, 1);
});

test('same-origin mutation accepts the browser-facing host when Next uses an internal bind address', async () => {
  let calls = 0;
  const handler = createRescheduleHandler(
    () => 'booking-id',
    async () => { calls += 1; return { status: 'rescheduled' }; },
  );
  const response = await handler(new Request('http://0.0.0.0:3000/api/bookings/manage/valid/reschedule', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Host: 'localhost:3000',
      Origin: 'http://localhost:3000',
    },
    body: '{"startAt":"2030-01-01T10:00:00.000Z"}',
  }), 'valid');

  assert.equal(response.status, 200);
  assert.equal(calls, 1);
});

test('same-origin mutation accepts a trusted proxy-facing authority but still rejects another origin', async () => {
  let calls = 0;
  const handler = createRescheduleHandler(
    () => 'booking-id',
    async () => { calls += 1; return { status: 'rescheduled' }; },
  );
  const headers = {
    'Content-Type': 'application/json',
    Host: 'app:3000',
    'X-Forwarded-Host': 'bookings.example.test',
    'X-Forwarded-Proto': 'https',
  };
  const valid = await handler(new Request('http://app:3000/api/bookings/manage/valid/reschedule', {
    method: 'POST', headers: { ...headers, Origin: 'https://bookings.example.test' },
    body: '{"startAt":"2030-01-01T10:00:00.000Z"}',
  }), 'valid');
  const invalid = await handler(new Request('http://app:3000/api/bookings/manage/valid/reschedule', {
    method: 'POST', headers: { ...headers, Origin: 'https://attacker.example' },
    body: '{"startAt":"2030-01-01T10:00:00.000Z"}',
  }), 'valid');

  assert.equal(valid.status, 200);
  assert.equal(invalid.status, 403);
  assert.equal(calls, 1);
});

test('stale cancellation policy returns the authoritative outcome without cancelling', async () => {
  let calls = 0;
  const handler = createCancellationHandler(
    () => 'booking-id',
    async () => {
      calls += 1;
      throw new BookingCancellationError('refund_policy_changed', { refundEligible: false, cutoffHours: 24 });
    },
  );
  const response = await handler(request('/api/bookings/manage/valid/cancel', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: '{"expectedRefundEligible":true}',
  }), 'valid');
  assert.equal(calls, 1);
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'refund_policy_changed',
      message: 'The refund outcome changed while this page was open. Review the updated terms and confirm again.',
    },
    cancellation: { refundEligible: false, cutoffHours: 24 },
  });
});

test('reschedule rejects malformed JSON and maps sanitized stable errors', async () => {
  let input;
  const handler = createRescheduleHandler(
    () => 'booking-id',
    async (_bookingId, body) => { input = body; throw new BookingRescheduleError('slot_unavailable'); },
  );
  const malformed = await handler(request('/api/bookings/manage/valid/reschedule', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{',
  }), 'valid');
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'invalid_reschedule_request');

  const conflict = await handler(request('/api/bookings/manage/valid/reschedule', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"startAt":"2030-01-01T10:00:00.000Z"}',
  }), 'valid');
  assert.deepEqual(input, { startAt: '2030-01-01T10:00:00.000Z' });
  assert.equal(conflict.status, 409);
  const body = await conflict.json();
  assert.equal(body.error.code, 'slot_unavailable');
  assert.equal(JSON.stringify(body).includes('private'), false);
});
