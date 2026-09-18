// @ts-check

import "server-only";
import { SESSION_PRODUCT } from "./session-product.mjs";
import { getCancellationPolicy } from "./cancellation-policy.mjs";
import {
  getBookingManagementSecret,
  verifyBookingManagementCapability,
} from "./booking-management-token.mjs";

const select = {
  id: true,
  name: true,
  email: true,
  startAt: true,
  endAt: true,
  timezone: true,
  status: true,
  meetingUrl: true,
  cancelledAt: true,
  cancellationRefundDue: true,
  calendarEventId: true,
  calendarCancelledAt: true,
  stripePaymentIntentId: true,
  stripeRefundId: true,
  stripeRefundStatus: true,
  refundedAt: true,
  rescheduleHold: {
    select: { startAt: true, endAt: true, timezone: true, status: true },
  },
};

export function createBookingManagementPersistence(database) {
  return {
    findBooking: (bookingId) =>
      database.booking.findUnique({ where: { id: bookingId }, select }),
  };
}

function paymentLabel() {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: SESSION_PRODUCT.currency.toUpperCase(),
  }).format(SESSION_PRODUCT.amountMinor / 100);
}

function refundStatus(booking) {
  if (booking.cancellationRefundDue === false) return "not_applicable";
  if (
    booking.refundedAt ||
    booking.stripeRefundStatus === "succeeded" ||
    booking.status === "REFUNDED"
  )
    return "refunded";
  if (booking.stripeRefundStatus === "pending") return "processing";
  if (
    booking.stripeRefundStatus &&
    ["failed", "canceled", "requires_action"].includes(
      booking.stripeRefundStatus,
    )
  )
    return "needs_attention";
  return booking.cancellationRefundDue ? "pending" : "not_decided";
}

function view(booking, now) {
  const base = {
    name: booking.name,
    email: booking.email,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    timezone: booking.timezone,
    durationMinutes: SESSION_PRODUCT.durationMinutes,
    amountPaid: paymentLabel(),
    meetingUrl: booking.meetingUrl,
  };
  if (booking.status === "CANCELLED" || booking.status === "REFUNDED") {
    return {
      kind: "cancelled",
      booking: base,
      cancellation: {
        cancelledAt: booking.cancelledAt?.toISOString() ?? null,
        refundEligible: booking.cancellationRefundDue === true,
        refundStatus: refundStatus(booking),
        calendarStatus: booking.calendarCancelledAt ? "cancelled" : "pending",
      },
    };
  }
  if (booking.startAt <= now) return { kind: "past", booking: base };
  if (booking.status !== "CONFIRMED")
    return { kind: "inactive", booking: base };
  const policy = getCancellationPolicy({ startAt: booking.startAt, now });
  if (booking.rescheduleHold?.status === "HOLD") {
    return {
      kind: "reschedule_pending",
      booking: base,
      target: {
        startAt: booking.rescheduleHold.startAt.toISOString(),
        endAt: booking.rescheduleHold.endAt.toISOString(),
        timezone: booking.rescheduleHold.timezone,
      },
      cancellation: {
        refundEligible: policy.automaticRefundEligible,
        cutoffHours: policy.cutoffHours,
      },
    };
  }
  return {
    kind: "active",
    booking: base,
    cancellation: {
      refundEligible: policy.automaticRefundEligible,
      cutoffHours: policy.cutoffHours,
    },
  };
}

function needsCancellationReconciliation(booking) {
  if (!["CANCELLED", "REFUNDED"].includes(booking.status)) return false;
  const calendarPending = Boolean(
    booking.calendarEventId && !booking.calendarCancelledAt,
  );
  const refundPending =
    booking.cancellationRefundDue === true &&
    Boolean(booking.stripePaymentIntentId) &&
    !booking.refundedAt &&
    booking.stripeRefundStatus !== "succeeded" &&
    booking.status !== "REFUNDED";
  return calendarPending || refundPending;
}

export async function getBookingManagementState(
  capability,
  now,
  dependencies = {},
) {
  let secret;
  try {
    secret = dependencies.secret ?? getBookingManagementSecret();
  } catch {
    return { kind: "unavailable" };
  }
  const verified = verifyBookingManagementCapability(capability, secret);
  if (!verified) return { kind: "invalid" };

  try {
    const persistence =
      dependencies.persistence ??
      createBookingManagementPersistence((await import("../db.ts")).db);
    let booking = await persistence.findBooking(verified.bookingId);
    // A valid signature for a missing booking remains indistinguishable from any
    // other invalid capability to avoid existence disclosure.
    if (!booking) return { kind: "invalid" };
    if (needsCancellationReconciliation(booking)) {
      try {
        const reconcile =
          dependencies.reconcileCancellation ??
          (await import("./booking-cancellation.mjs"))
            .reconcileCancelledBookingWithDefaultDependencies;
        await reconcile(verified.bookingId, now);
        booking = await persistence.findBooking(verified.bookingId);
        if (!booking) return { kind: "invalid" };
      } catch {
        // The authoritative cancellation remains visible with precise pending
        // states. A later secure reload will retry the same idempotent work.
      }
    }
    return view(booking, now);
  } catch {
    return { kind: "unavailable" };
  }
}

export function authenticateBookingManagementCapability(
  capability,
  secret = getBookingManagementSecret(),
) {
  const verified = verifyBookingManagementCapability(capability, secret);
  if (!verified) return null;
  return verified.bookingId;
}
