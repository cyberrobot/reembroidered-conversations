// @ts-check

import "server-only";
import { cancelBookingCalendarEvent } from "../calendar/booking-event.mjs";
import { getCancellationPolicy } from "./cancellation-policy.mjs";
import { SESSION_PRODUCT } from "./session-product.mjs";

export class BookingCancellationError extends Error {
  /** @param {'invalid_cancellation_request' | 'booking_not_cancellable' | 'refund_policy_changed' | 'management_unavailable'} code */
  constructor(code, details = {}) {
    super(`Booking cancellation failed: ${code}.`);
    this.name = "BookingCancellationError";
    this.code = code;
    this.details = details;
  }
}

const bookingSelection = {
  id: true,
  name: true,
  email: true,
  startAt: true,
  endAt: true,
  timezone: true,
  status: true,
  stripePaymentIntentId: true,
  calendarEventId: true,
  meetingUrl: true,
  cancelledAt: true,
  cancellationRefundDue: true,
  calendarCancelledAt: true,
  stripeRefundId: true,
  stripeRefundStatus: true,
  refundRequestedAt: true,
  refundedAt: true,
};

export function createBookingCancellationPersistence(database) {
  return {
    findBooking: (bookingId) =>
      database.booking.findUnique({
        where: { id: bookingId },
        select: bookingSelection,
      }),
    cancelAuthoritatively: ({ bookingId, now, refundDue }) =>
      database.$transaction(async (transaction) => {
        const booking = await transaction.booking.findUnique({
          where: { id: bookingId },
          select: bookingSelection,
        });
        if (!booking)
          throw new BookingCancellationError("booking_not_cancellable");
        if (booking.status === "CANCELLED" || booking.status === "REFUNDED")
          return booking;
        if (booking.status !== "CONFIRMED" || booking.startAt <= now) {
          throw new BookingCancellationError("booking_not_cancellable");
        }
        const changed = await transaction.booking.updateMany({
          where: { id: bookingId, status: "CONFIRMED", startAt: { gt: now } },
          data: {
            status: "CANCELLED",
            cancelledAt: now,
            cancellationRefundDue: refundDue,
          },
        });
        if (changed.count !== 1) {
          const current = await transaction.booking.findUnique({
            where: { id: bookingId },
            select: bookingSelection,
          });
          if (current && ["CANCELLED", "REFUNDED"].includes(current.status))
            return current;
          throw new BookingCancellationError("booking_not_cancellable");
        }
        // A cancellation wins over any in-progress reschedule and releases both slots.
        await transaction.booking.updateMany({
          where: { rescheduleSourceBookingId: bookingId, status: "HOLD" },
          data: { status: "CANCELLED", rescheduleSourceBookingId: null },
        });
        return transaction.booking.findUniqueOrThrow({
          where: { id: bookingId },
          select: bookingSelection,
        });
      }),
    recordCalendarCancelled: ({ bookingId, now }) =>
      database.booking.update({
        where: { id: bookingId },
        data: { calendarCancelledAt: now },
        select: bookingSelection,
      }),
    recordRefund: ({ bookingId, refund, now }) =>
      database.booking.update({
        where: { id: bookingId },
        data: {
          stripeRefundId: refund.id,
          stripeRefundStatus: refund.status,
          refundRequestedAt: now,
          ...(refund.status === "succeeded"
            ? { status: "REFUNDED", refundedAt: now }
            : {}),
        },
        select: bookingSelection,
      }),
  };
}

const refundStatuses = new Set([
  "pending",
  "requires_action",
  "succeeded",
  "failed",
  "canceled",
]);

function refundView(booking, reconciliationOutcome) {
  if (booking.cancellationRefundDue === false)
    return { eligible: false, status: "not_applicable" };
  if (booking.cancellationRefundDue !== true)
    return { eligible: false, status: "not_decided" };
  if (
    !booking.stripeRefundId &&
    (booking.stripeRefundStatus != null ||
      booking.refundedAt ||
      booking.status === "REFUNDED")
  ) {
    return { eligible: true, status: "needs_attention" };
  }
  if (reconciliationOutcome === "manual_attention") {
    return { eligible: true, status: "needs_attention" };
  }
  if (
    booking.refundedAt ||
    booking.stripeRefundStatus === "succeeded" ||
    booking.status === "REFUNDED"
  ) {
    return { eligible: true, status: "refunded" };
  }
  if (booking.stripeRefundId && booking.stripeRefundStatus === "pending")
    return { eligible: true, status: "processing" };
  if (
    booking.stripeRefundId &&
    ["failed", "canceled", "requires_action"].includes(
      booking.stripeRefundStatus,
    )
  ) {
    return { eligible: true, status: "needs_attention" };
  }
  return { eligible: true, status: "pending" };
}

function cancellationView(booking, refundReconciliationOutcome) {
  const refund = refundView(booking, refundReconciliationOutcome);
  return {
    status: booking.status === "REFUNDED" ? "refunded" : "cancelled",
    cancelledAt: booking.cancelledAt?.toISOString() ?? null,
    refund,
    calendar: { status: booking.calendarCancelledAt ? "cancelled" : "pending" },
    externalFollowUpPending:
      !booking.calendarCancelledAt ||
      (refund.eligible &&
        !["refunded", "not_applicable"].includes(refund.status)),
  };
}

function validRefundForBooking(refund, booking) {
  return (
    refund?.object === "refund" &&
    typeof refund.id === "string" &&
    refund.id.length > 0 &&
    refund.payment_intent === booking.stripePaymentIntentId &&
    refund.metadata?.bookingId === booking.id &&
    refund.amount === SESSION_PRODUCT.amountMinor &&
    (refund.currency === undefined ||
      refund.currency === SESSION_PRODUCT.currency) &&
    refundStatuses.has(refund.status)
  );
}

async function persistRefund(bookingId, booking, refund, dependencies) {
  if (!validRefundForBooking(refund, booking)) {
    return { booking, outcome: "manual_attention" };
  }
  try {
    return {
      booking: await dependencies.persistence.recordRefund({
        bookingId,
        refund,
        now: dependencies.getNow(),
      }),
      outcome: "recovered",
    };
  } catch {
    return { booking, outcome: "deferred" };
  }
}

async function reconcileRefund(bookingId, booking, dependencies) {
  if (
    booking.cancellationRefundDue !== true ||
    !booking.stripePaymentIntentId
  ) {
    return { booking, outcome: "already_reconciled" };
  }

  if (booking.stripeRefundId) {
    let refund;
    try {
      refund = await dependencies.stripe.refunds.retrieve(
        booking.stripeRefundId,
      );
    } catch {
      return { booking, outcome: "deferred" };
    }
    if (refund?.id !== booking.stripeRefundId) {
      return { booking, outcome: "manual_attention" };
    }
    return persistRefund(bookingId, booking, refund, dependencies);
  }

  if (
    booking.stripeRefundStatus != null ||
    booking.refundedAt ||
    booking.status === "REFUNDED"
  ) {
    return { booking, outcome: "manual_attention" };
  }

  let refunds;
  try {
    refunds = await dependencies.stripe.refunds.list({
      payment_intent: booking.stripePaymentIntentId,
      limit: 100,
    });
  } catch {
    return { booking, outcome: "deferred" };
  }
  if (
    refunds?.object !== "list" ||
    !Array.isArray(refunds.data) ||
    refunds.has_more !== false
  ) {
    return { booking, outcome: "manual_attention" };
  }
  if (refunds.data.length > 1) {
    return { booking, outcome: "manual_attention" };
  }
  if (refunds.data.length === 1) {
    return persistRefund(bookingId, booking, refunds.data[0], dependencies);
  }

  let created;
  try {
    created = await dependencies.stripe.refunds.create(
      {
        payment_intent: booking.stripePaymentIntentId,
        reason: "requested_by_customer",
        metadata: { bookingId: booking.id },
      },
      { idempotencyKey: `booking-cancellation-refund:${booking.id}` },
    );
  } catch {
    return { booking, outcome: "deferred" };
  }
  return persistRefund(bookingId, booking, created, dependencies);
}

async function reconcileCancellationProviders(
  bookingId,
  booking,
  dependencies,
) {
  let current = booking;
  if (!current.calendarCancelledAt && current.calendarEventId) {
    try {
      await dependencies.cancelCalendarEvent(current);
      current = await dependencies.persistence.recordCalendarCancelled({
        bookingId,
        now: dependencies.getNow(),
      });
    } catch {
      // The booking remains authoritatively cancelled; a retry reconciles Calendar.
    }
  }

  const refundResult = await reconcileRefund(bookingId, current, dependencies);
  return refundResult;
}

export async function cancelBooking(bookingId, input, now, dependencies) {
  if (typeof input?.expectedRefundEligible !== "boolean") {
    throw new BookingCancellationError("invalid_cancellation_request");
  }
  const persistence = dependencies.persistence;
  let existing;
  try {
    existing = await persistence.findBooking(bookingId);
  } catch {
    throw new BookingCancellationError("management_unavailable");
  }
  if (!existing) throw new BookingCancellationError("booking_not_cancellable");

  let booking = existing;
  if (!["CANCELLED", "REFUNDED"].includes(existing.status)) {
    const policy = getCancellationPolicy({ startAt: existing.startAt, now });
    if (!policy.canCancel || existing.status !== "CONFIRMED")
      throw new BookingCancellationError("booking_not_cancellable");
    if (input.expectedRefundEligible !== policy.automaticRefundEligible) {
      throw new BookingCancellationError("refund_policy_changed", {
        refundEligible: policy.automaticRefundEligible,
        cutoffHours: policy.cutoffHours,
      });
    }
    try {
      booking = await persistence.cancelAuthoritatively({
        bookingId,
        now,
        refundDue: policy.automaticRefundEligible,
      });
    } catch (error) {
      if (error instanceof BookingCancellationError) throw error;
      throw new BookingCancellationError("management_unavailable");
    }
  }

  const reconciled = await reconcileCancellationProviders(
    bookingId,
    booking,
    dependencies,
  );
  return cancellationView(reconciled.booking, reconciled.outcome);
}

export async function reconcileCancelledBooking(bookingId, now, dependencies) {
  let booking;
  try {
    booking = await dependencies.persistence.findBooking(bookingId);
  } catch {
    throw new BookingCancellationError("management_unavailable");
  }
  if (!booking || !["CANCELLED", "REFUNDED"].includes(booking.status)) {
    throw new BookingCancellationError("booking_not_cancellable");
  }
  const reconciled = await reconcileCancellationProviders(
    bookingId,
    booking,
    dependencies,
  );
  return cancellationView(reconciled.booking, reconciled.outcome);
}

async function defaultDependencies() {
  const [{ db }, { getStripeClient }] = await Promise.all([
    import("../db.ts"),
    import("../stripe/client.ts"),
  ]);
  return {
    persistence: createBookingCancellationPersistence(db),
    cancelCalendarEvent: cancelBookingCalendarEvent,
    stripe: getStripeClient(),
    getNow: () => new Date(),
  };
}

export async function cancelBookingWithDefaultDependencies(
  bookingId,
  input,
  now = new Date(),
) {
  return cancelBooking(bookingId, input, now, await defaultDependencies());
}

export async function reconcileCancelledBookingWithDefaultDependencies(
  bookingId,
  now = new Date(),
) {
  return reconcileCancelledBooking(bookingId, now, await defaultDependencies());
}
