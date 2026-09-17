// @ts-check

import 'server-only';
import { cancelBookingCalendarEvent } from '../calendar/booking-event.mjs';
import { getCancellationPolicy } from './cancellation-policy.mjs';

export class BookingCancellationError extends Error {
  /** @param {'booking_not_cancellable' | 'management_unavailable'} code */
  constructor(code) {
    super(`Booking cancellation failed: ${code}.`);
    this.name = 'BookingCancellationError';
    this.code = code;
  }
}

const bookingSelection = {
  id: true, name: true, email: true, startAt: true, endAt: true, timezone: true, status: true,
  stripePaymentIntentId: true, calendarEventId: true, meetingUrl: true,
  cancelledAt: true, cancellationRefundDue: true, calendarCancelledAt: true,
  stripeRefundId: true, stripeRefundStatus: true, refundRequestedAt: true, refundedAt: true,
};

export function createBookingCancellationPersistence(database) {
  return {
    findBooking: (bookingId) => database.booking.findUnique({ where: { id: bookingId }, select: bookingSelection }),
    cancelAuthoritatively: ({ bookingId, now, refundDue }) => database.$transaction(async (transaction) => {
      const booking = await transaction.booking.findUnique({ where: { id: bookingId }, select: bookingSelection });
      if (!booking) throw new BookingCancellationError('booking_not_cancellable');
      if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') return booking;
      if (booking.status !== 'CONFIRMED' || booking.startAt <= now) {
        throw new BookingCancellationError('booking_not_cancellable');
      }
      const changed = await transaction.booking.updateMany({
        where: { id: bookingId, status: 'CONFIRMED', startAt: { gt: now } },
        data: { status: 'CANCELLED', cancelledAt: now, cancellationRefundDue: refundDue },
      });
      if (changed.count !== 1) {
        const current = await transaction.booking.findUnique({ where: { id: bookingId }, select: bookingSelection });
        if (current && ['CANCELLED', 'REFUNDED'].includes(current.status)) return current;
        throw new BookingCancellationError('booking_not_cancellable');
      }
      // A cancellation wins over any in-progress reschedule and releases both slots.
      await transaction.booking.updateMany({
        where: { rescheduleSourceBookingId: bookingId, status: 'HOLD' },
        data: { status: 'CANCELLED', rescheduleSourceBookingId: null },
      });
      return transaction.booking.findUniqueOrThrow({ where: { id: bookingId }, select: bookingSelection });
    }),
    recordCalendarCancelled: ({ bookingId, now }) => database.booking.update({
      where: { id: bookingId }, data: { calendarCancelledAt: now }, select: bookingSelection,
    }),
    recordRefund: ({ bookingId, refund, now }) => database.booking.update({
      where: { id: bookingId },
      data: {
        stripeRefundId: refund.id,
        stripeRefundStatus: refund.status,
        refundRequestedAt: now,
        ...(refund.status === 'succeeded' ? { status: 'REFUNDED', refundedAt: now } : {}),
      },
      select: bookingSelection,
    }),
  };
}

function refundView(booking) {
  if (booking.cancellationRefundDue === false) return { eligible: false, status: 'not_applicable' };
  if (booking.cancellationRefundDue !== true) return { eligible: false, status: 'not_decided' };
  if (booking.refundedAt || booking.stripeRefundStatus === 'succeeded' || booking.status === 'REFUNDED') {
    return { eligible: true, status: 'refunded' };
  }
  if (booking.stripeRefundId && booking.stripeRefundStatus === 'pending') return { eligible: true, status: 'processing' };
  if (booking.stripeRefundId && ['failed', 'canceled', 'requires_action'].includes(booking.stripeRefundStatus)) {
    return { eligible: true, status: 'needs_attention' };
  }
  return { eligible: true, status: 'pending' };
}

function cancellationView(booking) {
  const refund = refundView(booking);
  return {
    status: booking.status === 'REFUNDED' ? 'refunded' : 'cancelled',
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    refund,
    calendar: { status: booking.calendarCancelledAt ? 'cancelled' : 'pending' },
    externalFollowUpPending: !booking.calendarCancelledAt ||
      (refund.eligible && !['refunded', 'not_applicable'].includes(refund.status)),
  };
}

export async function cancelBooking(bookingId, now, dependencies) {
  const persistence = dependencies.persistence;
  let existing;
  try { existing = await persistence.findBooking(bookingId); }
  catch { throw new BookingCancellationError('management_unavailable'); }
  if (!existing) throw new BookingCancellationError('booking_not_cancellable');

  let booking = existing;
  if (!['CANCELLED', 'REFUNDED'].includes(existing.status)) {
    const policy = getCancellationPolicy({ startAt: existing.startAt, now });
    if (!policy.canCancel || existing.status !== 'CONFIRMED') throw new BookingCancellationError('booking_not_cancellable');
    try {
      booking = await persistence.cancelAuthoritatively({
        bookingId, now, refundDue: policy.automaticRefundEligible,
      });
    } catch (error) {
      if (error instanceof BookingCancellationError) throw error;
      throw new BookingCancellationError('management_unavailable');
    }
  }

  if (!booking.calendarCancelledAt && booking.calendarEventId) {
    try {
      await dependencies.cancelCalendarEvent(booking);
      booking = await persistence.recordCalendarCancelled({ bookingId, now: dependencies.getNow() });
    } catch {
      // The booking remains authoritatively cancelled; a retry reconciles Calendar.
    }
  }

  if (booking.cancellationRefundDue === true && booking.stripePaymentIntentId) {
    try {
      const refund = booking.stripeRefundId
        ? await dependencies.stripe.refunds.retrieve(booking.stripeRefundId)
        : await dependencies.stripe.refunds.create({
            payment_intent: booking.stripePaymentIntentId,
            reason: 'requested_by_customer',
            metadata: { bookingId: booking.id },
          }, { idempotencyKey: `booking-cancellation-refund:${booking.id}` });
      if (typeof refund?.id === 'string' && typeof refund?.status === 'string') {
        booking = await persistence.recordRefund({ bookingId, refund, now: dependencies.getNow() });
      }
    } catch {
      // The persisted decision is retained and the same idempotency key is reused.
    }
  }
  return cancellationView(booking);
}

export async function cancelBookingWithDefaultDependencies(bookingId, now = new Date()) {
  const [{ db }, { getStripeClient }] = await Promise.all([
    import('../db.ts'), import('../stripe/client.ts'),
  ]);
  return cancelBooking(bookingId, now, {
    persistence: createBookingCancellationPersistence(db),
    cancelCalendarEvent: cancelBookingCalendarEvent,
    stripe: getStripeClient(),
    getNow: () => new Date(),
  });
}
