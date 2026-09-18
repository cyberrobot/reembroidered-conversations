import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BookingCancellationError,
  cancelBooking,
  reconcileCancelledBooking,
} from '../src/lib/booking/booking-cancellation.mjs';

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
  const calls = {
    cancel: 0, calendar: 0, createRefund: 0, retrieveRefund: 0,
    createInput: null, createOptions: null, idempotencyKeys: [],
  };
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
        calls.idempotencyKeys.push(requestOptions.idempotencyKey);
        if (options.stripeFails) throw new Error('private stripe failure');
        return { id: 're_123', status: options.refundStatus ?? 'succeeded' };
      },
      retrieve: async () => {
        calls.retrieveRefund += 1;
        return { id: stored.stripeRefundId, status: options.retrieveRefundStatus ?? stored.stripeRefundStatus };
      },
    } },
    getNow: () => new Date('2030-01-01T12:00:01.000Z'),
  };
  return { dependencies, calls, stored: () => stored, controls: options };
}

test('refundable cancellation commits first and creates one full idempotent refund from the persisted PaymentIntent', async () => {
  const { dependencies, calls, stored } = fixture();
  const result = await cancelBooking(booking().id, { expectedRefundEligible: true }, new Date('2030-01-01T12:00:00.000Z'), dependencies);
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

  const retry = await cancelBooking(booking().id, { expectedRefundEligible: true }, new Date('2030-01-02T13:00:00.000Z'), dependencies);
  assert.equal(calls.cancel, 1);
  assert.equal(calls.createRefund, 1);
  assert.equal(calls.retrieveRefund, 1);
  assert.equal(retry.status, 'refunded');
});

test('late cancellation persists no-refund decision and never calls Stripe', async () => {
  const { dependencies, calls, stored } = fixture();
  const result = await cancelBooking(booking().id, { expectedRefundEligible: false }, new Date('2030-01-03T11:00:00.001Z'), dependencies);
  assert.equal(stored().status, 'CANCELLED');
  assert.equal(stored().cancellationRefundDue, false);
  assert.equal(calls.createRefund, 0);
  assert.deepEqual(result.refund, { eligible: false, status: 'not_applicable' });
});

test('provider failures never reactivate a cancelled booking and preserve the refund decision', async () => {
  const { dependencies, calls, stored } = fixture(booking(), { calendarFails: true, stripeFails: true });
  const result = await cancelBooking(booking().id, { expectedRefundEligible: true }, new Date('2030-01-01T12:00:00.000Z'), dependencies);
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
  await cancelBooking(cancelled.id, { expectedRefundEligible: false }, new Date('2030-01-03T11:59:00.000Z'), dependencies);
  assert.equal(calls.cancel, 0);
  assert.equal(calls.createRefund, 1);
});

test('stale refundable confirmation cannot silently become a no-refund cancellation', async () => {
  const stale = fixture();
  await assert.rejects(
    () => cancelBooking(
      booking().id,
      { expectedRefundEligible: true },
      new Date('2030-01-02T12:00:00.001Z'),
      stale.dependencies,
    ),
    (error) => error instanceof BookingCancellationError &&
      error.code === 'refund_policy_changed' && error.details.refundEligible === false,
  );
  assert.equal(stale.calls.cancel, 0);
  assert.equal(stale.stored().status, 'CONFIRMED');

  await cancelBooking(
    booking().id,
    { expectedRefundEligible: false },
    new Date('2030-01-02T12:00:00.001Z'),
    stale.dependencies,
  );
  assert.equal(stale.stored().status, 'CANCELLED');
  assert.equal(stale.stored().cancellationRefundDue, false);

  const boundary = fixture();
  await cancelBooking(
    booking().id,
    { expectedRefundEligible: true },
    new Date('2030-01-02T12:00:00.000Z'),
    boundary.dependencies,
  );
  assert.equal(boundary.stored().cancellationRefundDue, true);
});

test('cancelled provider work retries Calendar and Stripe deterministically', async () => {
  const calendar = fixture(booking(), { calendarFails: true, refundStatus: 'pending' });
  await cancelBooking(
    booking().id,
    { expectedRefundEligible: true },
    new Date('2030-01-01T12:00:00.000Z'),
    calendar.dependencies,
  );
  assert.equal(calendar.stored().calendarCancelledAt, null);
  calendar.controls.calendarFails = false;
  await reconcileCancelledBooking(booking().id, new Date('2030-01-01T12:05:00.000Z'), calendar.dependencies);
  assert.ok(calendar.stored().calendarCancelledAt instanceof Date);
  assert.equal(calendar.calls.calendar, 2);

  const refund = fixture(booking(), { stripeFails: true });
  await cancelBooking(
    booking().id,
    { expectedRefundEligible: true },
    new Date('2030-01-01T12:00:00.000Z'),
    refund.dependencies,
  );
  assert.equal(refund.stored().status, 'CANCELLED');
  refund.controls.stripeFails = false;
  await reconcileCancelledBooking(booking().id, new Date('2030-01-01T12:05:00.000Z'), refund.dependencies);
  assert.equal(refund.stored().status, 'REFUNDED');
  assert.deepEqual(refund.calls.idempotencyKeys, [
    `booking-cancellation-refund:${booking().id}`,
    `booking-cancellation-refund:${booking().id}`,
  ]);
});

test('an existing Stripe refund is retrieved and reconciled instead of recreated', async () => {
  const cancelled = booking({
    status: 'CANCELLED', cancelledAt: new Date('2030-01-01T12:00:00.000Z'), cancellationRefundDue: true,
    calendarCancelledAt: new Date('2030-01-01T12:01:00.000Z'),
    stripeRefundId: 're_existing', stripeRefundStatus: 'pending',
  });
  const retry = fixture(cancelled, { retrieveRefundStatus: 'succeeded' });
  const result = await reconcileCancelledBooking(cancelled.id, new Date('2030-01-01T12:05:00.000Z'), retry.dependencies);
  assert.equal(retry.calls.createRefund, 0);
  assert.equal(retry.calls.retrieveRefund, 1);
  assert.equal(retry.stored().status, 'REFUNDED');
  assert.equal(result.refund.status, 'refunded');
});
