import assert from 'node:assert/strict';
import test from 'node:test';
import { formatConfirmedBooking, getBookingSuccessState } from '../src/lib/booking/booking-success.mjs';

const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';
const sessionId = 'cs_test_confirmation';

function booking(overrides = {}) {
  return {
    id: bookingId,
    name: 'Sarah Jenkins',
    email: 'sarah@example.test',
    startAt: new Date('2026-09-24T13:00:00.000Z'),
    endAt: new Date('2026-09-24T13:55:00.000Z'),
    timezone: 'Europe/London',
    status: 'CONFIRMED',
    stripeCheckoutSessionId: sessionId,
    stripePaymentIntentId: 'pi_test_confirmation',
    calendarEventId: 'rec5a4496557be3432ca124b769e10b50ef',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    ...overrides,
  };
}

function persistence(value, onFind) {
  return { findBooking: async (id) => { onFind?.(id); return value; } };
}

test('invalid identifiers fail before persistence and reveal no booking data', async () => {
  let calls = 0;
  const dependency = { persistence: persistence(booking(), () => { calls += 1; }) };
  for (const input of [
    { bookingId: 'bad', sessionId },
    { bookingId, sessionId: 'bad' },
    { bookingId: undefined, sessionId },
  ]) assert.deepEqual(await getBookingSuccessState(input, dependency), { kind: 'invalid' });
  assert.equal(calls, 0);
});

test('missing and mismatched bookings use the same generic invalid state', async () => {
  assert.deepEqual(await getBookingSuccessState({ bookingId, sessionId }, { persistence: persistence(null) }), { kind: 'invalid' });
  const result = await getBookingSuccessState({ bookingId, sessionId: 'cs_test_attacker' }, { persistence: persistence(booking()) });
  assert.deepEqual(result, { kind: 'invalid' });
  assert.equal(JSON.stringify(result).includes('Sarah'), false);
  assert.equal(JSON.stringify(result).includes('meet.google.com'), false);
});

test('persisted lifecycle maps to truthful presentation states', async () => {
  for (const [status, kind] of [['HOLD', 'confirming-payment'], ['PAID', 'finalising-booking'], ['CANCELLED', 'inactive'], ['REFUNDED', 'inactive']]) {
    assert.deepEqual(await getBookingSuccessState({ bookingId, sessionId }, { persistence: persistence(booking({ status })) }), { kind });
  }
});

test('confirmed state exposes only required customer presentation data', async () => {
  const result = await getBookingSuccessState({ bookingId, sessionId }, { persistence: persistence(booking()) });
  assert.equal(result.kind, 'confirmed');
  assert.deepEqual(result.booking, {
    id: bookingId,
    name: 'Sarah Jenkins',
    email: 'sarah@example.test',
    date: 'Thursday, 24 September 2026',
    startTime: '14:00',
    endTime: '14:55',
    timezone: 'Europe/London',
    timezoneName: 'BST',
    durationMinutes: 55,
    paymentLabel: '£55 paid',
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
  });
  assert.equal('stripePaymentIntentId' in result.booking, false);
  assert.equal('calendarEventId' in result.booking, false);
  assert.equal('stripeCheckoutSessionId' in result.booking, false);
});

test('confirmed view uses persisted identity data only after correlation', async () => {
  const result = await getBookingSuccessState(
    { bookingId, sessionId, email: 'attacker@example.test' },
    { persistence: persistence(booking({ email: 'persisted@example.test' })) },
  );
  assert.equal(result.kind, 'confirmed');
  assert.equal(result.booking.id, bookingId);
  assert.equal(result.booking.email, 'persisted@example.test');
});

test('confirmed rows with incomplete finalisation or unsafe Meet URLs fail closed', async () => {
  for (const overrides of [
    { stripePaymentIntentId: null }, { calendarEventId: null }, { meetingUrl: null },
    { meetingUrl: 'http://meet.google.com/abc' }, { meetingUrl: 'https://example.com/not-meet' },
  ]) {
    assert.deepEqual(await getBookingSuccessState({ bookingId, sessionId }, { persistence: persistence(booking(overrides)) }), { kind: 'unavailable' });
  }
});

test('database failures become a customer-safe unavailable state', async () => {
  const result = await getBookingSuccessState({ bookingId, sessionId }, { persistence: { findBooking: async () => { throw new Error('postgres secret'); } } });
  assert.deepEqual(result, { kind: 'unavailable' });
});

test('time formatting follows the persisted timezone across London daylight saving', () => {
  const summer = formatConfirmedBooking(booking());
  const winter = formatConfirmedBooking(booking({ startAt: new Date('2026-12-03T14:00:00.000Z'), endAt: new Date('2026-12-03T14:55:00.000Z') }));
  assert.deepEqual([summer.startTime, summer.timezoneName], ['14:00', 'BST']);
  assert.deepEqual([winter.startTime, winter.timezoneName], ['14:00', 'GMT']);
  assert.equal(summer.durationMinutes, 55);
});
