import assert from 'node:assert/strict';
import test from 'node:test';
import { CalendarManagementError } from '../src/lib/calendar/booking-event.mjs';
import { BookingRescheduleError, rescheduleBooking } from '../src/lib/booking/booking-reschedule.mjs';

const source = (overrides = {}) => ({
  id: '5a449655-7be3-432c-a124-b769e10b50ef',
  name: 'Listener', email: 'listener@example.test',
  startAt: new Date('2030-01-08T10:00:00.000Z'), endAt: new Date('2030-01-08T10:55:00.000Z'),
  timezone: 'Europe/London', status: 'CONFIRMED',
  stripeCheckoutSessionId: 'cs_existing', stripePaymentIntentId: 'pi_existing',
  calendarEventId: 'event_existing', meetingUrl: 'https://meet.google.com/abc-defg-hij', rescheduledAt: null,
  ...overrides,
});
const target = { date: '2030-01-09', startAt: '2030-01-09T10:00:00.000Z', endAt: '2030-01-09T10:55:00.000Z' };
const now = new Date('2030-01-01T12:00:00.000Z');

function fixture(options = {}) {
  let currentSource = source(options.source);
  let pending = options.pending ?? null;
  const order = [];
  const persistence = {
    findSource: async () => ({ ...currentSource }),
    findPendingHold: async () => pending && ({ ...pending }),
    reserveTarget: async ({ source: booking, target: selected }) => {
      order.push('reserve');
      pending = {
        id: 'target-hold', status: 'HOLD', rescheduleSourceBookingId: booking.id,
        startAt: selected.startAt, endAt: selected.endAt, timezone: selected.timezone,
      };
      return { ...pending };
    },
    releaseTarget: async () => { order.push('release'); pending = null; return { count: 1 }; },
    commitTarget: async ({ hold, meetingUrl }) => {
      order.push('commit');
      if (options.commitFails) throw new Error('private database failure');
      pending = null;
      currentSource = { ...currentSource, startAt: hold.startAt, endAt: hold.endAt, meetingUrl, rescheduledAt: new Date() };
      return { ...currentSource };
    },
  };
  return {
    dependencies: {
      persistence,
      getAvailableSlots: async () => options.available === false ? [] : [target],
      rescheduleCalendarEvent: async (_booking, hold) => {
        order.push('calendar');
        assert.ok(pending, 'target hold must exist before Calendar is updated');
        if (options.calendarError) throw options.calendarError;
        return { calendarEventId: 'event_existing', meetingUrl: options.meetingUrl ?? 'https://meet.google.com/abc-defg-hij' };
      },
      getNow: () => new Date('2030-01-01T12:00:01.000Z'),
    },
    order,
    pending: () => pending,
    source: () => currentSource,
  };
}

test('reschedule reserves target before Calendar and atomically keeps the same confirmed booking identity and payment', async () => {
  const { dependencies, order, pending, source: stored } = fixture();
  const result = await rescheduleBooking(source().id, { startAt: target.startAt }, now, dependencies);
  assert.deepEqual(order, ['reserve', 'calendar', 'commit']);
  assert.equal(pending(), null);
  assert.equal(stored().id, source().id);
  assert.equal(stored().status, 'CONFIRMED');
  assert.equal(stored().stripePaymentIntentId, 'pi_existing');
  assert.equal(stored().calendarEventId, 'event_existing');
  assert.equal(result.booking.startAt, target.startAt);
});

test('unavailable, same-slot and competing targets leave the original booking unchanged', async () => {
  const unavailable = fixture({ available: false });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, unavailable.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'slot_unavailable',
  );
  assert.deepEqual(unavailable.order, []);
  assert.equal(unavailable.source().startAt.toISOString(), source().startAt.toISOString());

  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: source().startAt.toISOString() }, now, fixture().dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'invalid_reschedule_request',
  );

  const pending = fixture({ pending: {
    id: 'other-hold', status: 'HOLD', rescheduleSourceBookingId: source().id,
    startAt: new Date('2030-01-10T10:00:00.000Z'), endAt: new Date('2030-01-10T10:55:00.000Z'), timezone: 'Europe/London',
  } });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, pending.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'change_in_progress',
  );
});

test('definite Calendar failure releases the target while uncertain failure retains both reservations', async () => {
  const definite = fixture({ calendarError: new CalendarManagementError('reauthorization_required', {
    outcome: 'definite_unchanged',
  }) });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, definite.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'calendar_unavailable',
  );
  assert.deepEqual(definite.order, ['reserve', 'calendar', 'release']);
  assert.equal(definite.pending(), null);

  const uncertain = fixture({ calendarError: new CalendarManagementError('provider_unavailable') });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, uncertain.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'reconciliation_pending',
  );
  assert.deepEqual(uncertain.order, ['reserve', 'calendar']);
  assert.equal(uncertain.pending().status, 'HOLD');
});

test('malformed PATCH results and post-PATCH validation failures retain the target hold', async () => {
  for (const code of ['invalid_provider_response', 'event_mismatch']) {
    const attempt = fixture({ calendarError: new CalendarManagementError(code, { outcome: 'uncertain' }) });
    await assert.rejects(
      () => rescheduleBooking(source().id, { startAt: target.startAt }, now, attempt.dependencies),
      (error) => error instanceof BookingRescheduleError && error.code === 'reconciliation_pending',
    );
    assert.deepEqual(attempt.order, ['reserve', 'calendar']);
    assert.equal(attempt.pending().status, 'HOLD');
  }
});

test('a pending retry releases only after Calendar positively observed the original slot', async () => {
  const pending = {
    id: 'target-hold', status: 'HOLD', rescheduleSourceBookingId: source().id,
    startAt: new Date(target.startAt), endAt: new Date(target.endAt), timezone: 'Europe/London',
  };
  const unknown = fixture({
    pending,
    calendarError: new CalendarManagementError('reauthorization_required', { outcome: 'definite_unchanged' }),
  });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, unknown.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'reconciliation_pending',
  );
  assert.equal(unknown.pending().status, 'HOLD');

  const observed = fixture({
    pending,
    calendarError: new CalendarManagementError('reauthorization_required', {
      outcome: 'definite_unchanged', observedOriginal: true,
    }),
  });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, observed.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'calendar_unavailable',
  );
  assert.equal(observed.pending(), null);
});

test('database failure after Calendar update retains the hold and retry resumes it without another reservation', async () => {
  const first = fixture({ commitFails: true });
  await assert.rejects(
    () => rescheduleBooking(source().id, { startAt: target.startAt }, now, first.dependencies),
    (error) => error instanceof BookingRescheduleError && error.code === 'reconciliation_pending',
  );
  assert.equal(first.pending().status, 'HOLD');
  assert.deepEqual(first.order, ['reserve', 'calendar', 'commit']);

  const retry = fixture({ pending: first.pending() });
  await rescheduleBooking(source().id, { startAt: target.startAt }, now, retry.dependencies);
  assert.deepEqual(retry.order, ['calendar', 'commit']);
});
