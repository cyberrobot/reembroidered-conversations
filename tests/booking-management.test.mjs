import assert from 'node:assert/strict';
import test from 'node:test';
import { getBookingManagementState } from '../src/lib/booking/booking-management.mjs';
import { createBookingManagementCapability } from '../src/lib/booking/booking-management-token.mjs';

const secret = 'management-secret-for-tests-is-long-enough-123';
const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';

test('invalid capability fails before persistence and reveals no booking state', async () => {
  let lookups = 0;
  const state = await getBookingManagementState(`${bookingId}.tampered`, new Date(), {
    secret,
    persistence: { findBooking: async () => { lookups += 1; throw new Error('must not be called'); } },
  });
  assert.deepEqual(state, { kind: 'invalid' });
  assert.equal(lookups, 0);
});

test('valid capability returns a narrow active view with server-owned policy and product data', async () => {
  const capability = createBookingManagementCapability(bookingId, secret);
  const state = await getBookingManagementState(capability, new Date('2030-01-01T10:00:00.000Z'), {
    secret,
    persistence: { findBooking: async () => ({
      id: bookingId,
      name: 'Listener', email: 'listener@example.test',
      startAt: new Date('2030-01-03T10:00:00.000Z'), endAt: new Date('2030-01-03T10:55:00.000Z'),
      timezone: 'Europe/London', status: 'CONFIRMED', meetingUrl: 'https://meet.google.com/abc-defg-hij',
      stripePaymentIntentId: 'pi_must_not_be_returned', calendarEventId: 'event_must_not_be_returned',
      cancelledAt: null, cancellationRefundDue: null, calendarCancelledAt: null, stripeRefundStatus: null, refundedAt: null,
    }) },
  });
  assert.equal(state.kind, 'active');
  assert.equal(state.cancellation.refundEligible, true);
  assert.equal(state.booking.durationMinutes, 55);
  assert.equal(state.booking.amountPaid, '£55.00');
  assert.equal(JSON.stringify(state).includes('pi_must_not_be_returned'), false);
  assert.equal(JSON.stringify(state).includes('event_must_not_be_returned'), false);
  assert.equal(JSON.stringify(state).includes(bookingId), false);
});

test('a linked replacement hold is exposed as a resumable pending change', async () => {
  const capability = createBookingManagementCapability(bookingId, secret);
  const state = await getBookingManagementState(capability, new Date('2030-01-01T10:00:00.000Z'), {
    secret,
    persistence: { findBooking: async () => ({
      name: 'Listener', email: 'listener@example.test',
      startAt: new Date('2030-01-03T10:00:00.000Z'), endAt: new Date('2030-01-03T10:55:00.000Z'),
      timezone: 'Europe/London', status: 'CONFIRMED', meetingUrl: 'https://meet.google.com/abc-defg-hij',
      cancelledAt: null, cancellationRefundDue: null, calendarCancelledAt: null, stripeRefundStatus: null, refundedAt: null,
      rescheduleHold: {
        status: 'HOLD', startAt: new Date('2030-01-04T12:00:00.000Z'),
        endAt: new Date('2030-01-04T12:55:00.000Z'), timezone: 'Europe/London',
      },
    }) },
  });
  assert.equal(state.kind, 'reschedule_pending');
  assert.deepEqual(state.target, {
    startAt: '2030-01-04T12:00:00.000Z', endAt: '2030-01-04T12:55:00.000Z', timezone: 'Europe/London',
  });
});

test('secure reload retries pending cancellation providers and returns fully reconciled state', async () => {
  const capability = createBookingManagementCapability(bookingId, secret);
  let stored = {
    id: bookingId,
    name: 'Listener', email: 'listener@example.test',
    startAt: new Date('2030-01-03T10:00:00.000Z'), endAt: new Date('2030-01-03T10:55:00.000Z'),
    timezone: 'Europe/London', status: 'CANCELLED', meetingUrl: 'https://meet.google.com/abc-defg-hij',
    cancelledAt: new Date('2030-01-01T10:00:00.000Z'), cancellationRefundDue: true,
    calendarEventId: 'event_pending', calendarCancelledAt: null,
    stripePaymentIntentId: 'pi_existing', stripeRefundId: null, stripeRefundStatus: null, refundedAt: null,
  };
  let reconciliations = 0;
  const state = await getBookingManagementState(capability, new Date('2030-01-01T10:05:00.000Z'), {
    secret,
    persistence: { findBooking: async () => ({ ...stored }) },
    reconcileCancellation: async (id) => {
      assert.equal(id, bookingId);
      reconciliations += 1;
      stored = {
        ...stored,
        status: 'REFUNDED',
        calendarCancelledAt: new Date('2030-01-01T10:05:00.000Z'),
        stripeRefundId: 're_existing', stripeRefundStatus: 'succeeded',
        refundedAt: new Date('2030-01-01T10:05:00.000Z'),
      };
    },
  });
  assert.equal(reconciliations, 1);
  assert.equal(state.kind, 'cancelled');
  assert.equal(state.cancellation.calendarStatus, 'cancelled');
  assert.equal(state.cancellation.refundStatus, 'refunded');
  assert.equal(JSON.stringify(state).includes('pi_existing'), false);
  assert.equal(JSON.stringify(state).includes('re_existing'), false);
});
