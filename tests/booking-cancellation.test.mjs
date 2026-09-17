import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelBooking } from '../src/lib/booking/booking-cancellation.mjs';

const booking = (overrides = {}) => ({
  id: '5a449655-7be3-432c-a124-b769e10b50ef',
  name: 'Listener', email: 'listener@example.test',
  startAt: new Date('2030-01-03T12:00:00.000Z'), endAt: new Date('2030-01-03T12:55:00.000Z'),
  timezone: 'Europe/London', status: 'CONFIRMED', stripePaymentIntentId: 'pi_persisted',
  calendarEventId: 'event_persisted', meetingUrl: 'https://meet.google.com/abc-defg-hij',
  cancelledAt: null, cancellationRefundDue: null, calendarCancelledAt: null,
  stripeRefundId: null, stripeRefundStatus: null, refundRequestedAt: null, refundedAt: null,
  ...overrides,
});

function fixture(initial = booking(), options = {}) {
  let stored = { ...initial };
  const calls = { cancel: 0, calendar: 0, createRefund: 0, retrieveRefund: 0, createInput: null, createOptions: null };
  const persistence = {
    findBooking: async () => ({ ...stored }),
    cancelAuthoritatively: async ({ now, refundDue }) => {
      calls.cancel += 1;
      if (!['CANCELLED', 'REFUNDED'].includes(stored.status)) stored = { ...stored, status: 'CANCELLED', cancelledAt: now, cancellationRefundDue: refundDue };
      return { ...stored };
    },
    recordCalendarCancelled: async ({ now }) => (stored = { ...stored, calendarCancelledAt: now }),
    recordRefund: async ({ refund, now }) => (stored = {
      ...stored, stripeRefundId: refund.id, stripeRefundStatus: refund.status, refundRequestedAt: now,
      ...(refund.status === 'succeeded' ? { status: 'REFUNDED', refundedAt: now } : {}),
    }),
  };
  const dependencies = {
    persistence,
    cancelCalendarEvent: async () => { calls.calendar += 1; if (options.calendarFails) throw new Error('private calendar failure'); },
    stripe: { refunds: {
      create: async (input, requestOptions) => {
        calls.createRefund += 1; calls.createInput = input; calls.createOptions = requestOptions;
        if (options.stripeFails) throw new Error('private stripe failure');
        return { id: 're_123', status: options.refundStatus ?? 'succeeded' };
      },
      retrieve: async () => { calls.retrieveRefund += 1; return { id: stored.stripeRefundId, status: stored.stripeRefundStatus }; },
    } },
    getNow: () => new Date('2030-01-01T12:00:01.000Z'),
  };
  return { dependencies, calls, stored: () => stored };
}

test('refundable cancellation commits first and creates one full idempotent refund from the persisted PaymentIntent', async () => {
  const { dependencies, calls, stored } = fixture();
  const result = await cancelBooking(booking().id, new Date('2030-01-01T12:00:00.000Z'), dependencies);
  assert.equal(calls.cancel, 1);
  assert.equal(calls.calendar, 1);
  assert.equal(calls.createRefund, 1);
  assert.deepEqual(calls.createInput, {
    payment_intent: 'pi_persisted', reason: 'requested_by_customer', metadata: { bookingId: booking().id },
  });
  assert.equal(calls.createOptions.idempotencyKey, `booking-cancellation-refund:${booking().id}`);
  assert.equal(stored().status, 'REFUNDED');
  assert.equal(stored().cancellationRefundDue, true);
  assert.equal(stored().stripeRefundId, 're_123');
  assert.equal(result.refund.status, 'refunded');

  const retry = await cancelBooking(booking().id, new Date('2030-01-02T13:00:00.000Z'), dependencies);
  assert.equal(calls.cancel, 1);
  assert.equal(calls.createRefund, 1);
  assert.equal(calls.retrieveRefund, 1);
  assert.equal(retry.status, 'refunded');
});

test('late cancellation persists no-refund decision and never calls Stripe', async () => {
  const { dependencies, calls, stored } = fixture();
  const result = await cancelBooking(booking().id, new Date('2030-01-03T11:00:00.001Z'), dependencies);
  assert.equal(stored().status, 'CANCELLED');
  assert.equal(stored().cancellationRefundDue, false);
  assert.equal(calls.createRefund, 0);
  assert.deepEqual(result.refund, { eligible: false, status: 'not_applicable' });
});

test('provider failures never reactivate a cancelled booking and preserve the refund decision', async () => {
  const { dependencies, calls, stored } = fixture(booking(), { calendarFails: true, stripeFails: true });
  const result = await cancelBooking(booking().id, new Date('2030-01-01T12:00:00.000Z'), dependencies);
  assert.equal(stored().status, 'CANCELLED');
  assert.equal(stored().cancellationRefundDue, true);
  assert.equal(stored().calendarCancelledAt, null);
  assert.equal(calls.createRefund, 1);
  assert.equal(result.calendar.status, 'pending');
  assert.equal(result.refund.status, 'pending');
  assert.equal(result.externalFollowUpPending, true);
});

test('a previously persisted refund decision is reused without recalculating the cutoff', async () => {
  const cancelled = booking({
    status: 'CANCELLED', cancelledAt: new Date('2030-01-01T12:00:00.000Z'), cancellationRefundDue: true,
    calendarCancelledAt: new Date('2030-01-01T12:01:00.000Z'),
  });
  const { dependencies, calls } = fixture(cancelled);
  await cancelBooking(cancelled.id, new Date('2030-01-03T11:59:00.000Z'), dependencies);
  assert.equal(calls.cancel, 0);
  assert.equal(calls.createRefund, 1);
});
