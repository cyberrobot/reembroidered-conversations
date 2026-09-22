// @ts-check

import "server-only";
import {
  googleEventIdForBooking,
  isUsableGoogleMeetUrl,
} from "../calendar/booking-event.mjs";
import {
  checkoutSessionBookingId,
  createStripeWebhookPersistence,
  reconcileBookingConfirmationEmail,
  reconcileCompletedCheckoutSession,
  reconcileExpiredCheckoutSession,
  reconcilePaidBooking,
  StripeWebhookReconciliationError,
} from "./stripe-webhook.mjs";
import { SESSION_PRODUCT } from "./session-product.mjs";

export const BOOKING_RECONCILIATION_BATCH_SIZE = 20;
export const CONFIRMATION_EMAIL_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

const outcomes = [
  "recovered",
  "already_reconciled",
  "deferred",
  "manual_attention",
  "failed",
];
const categories = [
  "paid",
  "confirmationEmail",
  "checkoutHold",
  "cancellation",
  "reschedule",
];

const bookingSelection = {
  id: true,
  name: true,
  email: true,
  startAt: true,
  endAt: true,
  timezone: true,
  status: true,
  stripeCheckoutSessionId: true,
  stripePaymentIntentId: true,
  calendarEventId: true,
  meetingUrl: true,
  confirmationEmailSentAt: true,
  confirmationEmailId: true,
  cancelledAt: true,
  cancellationRefundDue: true,
  calendarCancelledAt: true,
  stripeRefundId: true,
  stripeRefundStatus: true,
  refundRequestedAt: true,
  refundedAt: true,
  rescheduledAt: true,
  rescheduleSourceBookingId: true,
  expiresAt: true,
  createdAt: true,
};

export function createBookingReconciliationPersistence(database) {
  const oldest = { createdAt: "asc" };
  return {
    findBooking: (id) =>
      database.booking.findUnique({
        where: { id },
        select: bookingSelection,
      }),
    listPaid: ({ take }) =>
      database.booking.findMany({
        where: { status: "PAID" },
        select: bookingSelection,
        orderBy: oldest,
        take,
      }),
    listConfirmationEmail: ({ take }) =>
      database.booking.findMany({
        where: { status: "CONFIRMED", confirmationEmailSentAt: null },
        select: bookingSelection,
        orderBy: oldest,
        take,
      }),
    listCheckoutHolds: ({ now, take }) =>
      database.booking.findMany({
        where: {
          status: "HOLD",
          stripeCheckoutSessionId: { not: null },
          rescheduleSourceBookingId: null,
          expiresAt: { lte: now },
        },
        select: bookingSelection,
        orderBy: oldest,
        take,
      }),
    listCancellations: ({ take }) =>
      database.booking.findMany({
        where: {
          status: { in: ["CANCELLED", "REFUNDED"] },
          OR: [
            { calendarEventId: { not: null }, calendarCancelledAt: null },
            {
              AND: [
                { cancellationRefundDue: true },
                { stripePaymentIntentId: { not: null } },
                { refundedAt: null },
                {
                  OR: [
                    { stripeRefundStatus: null },
                    { stripeRefundStatus: { not: "succeeded" } },
                  ],
                },
              ],
            },
          ],
        },
        select: bookingSelection,
        orderBy: oldest,
        take,
      }),
    listReschedules: ({ now, take }) =>
      database.booking.findMany({
        where: {
          status: "HOLD",
          rescheduleSourceBookingId: { not: null },
          expiresAt: { lte: now },
        },
        select: bookingSelection,
        orderBy: oldest,
        take,
      }),
  };
}

function emptyCounts() {
  return {
    scanned: 0,
    recovered: 0,
    alreadyReconciled: 0,
    deferred: 0,
    manualAttention: 0,
    failed: 0,
  };
}

function resultSummary() {
  return {
    ...emptyCounts(),
    categories: Object.fromEntries(
      categories.map((category) => [category, emptyCounts()]),
    ),
  };
}

function countOutcome(counts, outcome) {
  const key =
    outcome === "already_reconciled"
      ? "alreadyReconciled"
      : outcome === "manual_attention"
        ? "manualAttention"
        : outcome;
  counts[key] += 1;
}

function safeResult(outcome, reason) {
  return { outcome, reason };
}

function isTerminalRefund(booking) {
  return ["failed", "canceled", "requires_action"].includes(
    booking.stripeRefundStatus,
  );
}

async function processPaid(candidate, now, dependencies) {
  const booking = await dependencies.persistence.findBooking(candidate.id);
  if (!booking || booking.status !== "PAID") {
    return safeResult("already_reconciled", "paid_state_changed");
  }
  if (booking.startAt <= now) {
    return safeResult("manual_attention", "paid_session_started");
  }
  if (!booking.stripeCheckoutSessionId || !booking.stripePaymentIntentId) {
    return safeResult("manual_attention", "paid_identifiers_missing");
  }
  try {
    await reconcilePaidBooking(
      {
        bookingId: booking.id,
        sessionId: booking.stripeCheckoutSessionId,
        paymentIntentId: booking.stripePaymentIntentId,
      },
      dependencies.stripePersistence,
      dependencies.finalizeCalendar,
      dependencies.sendConfirmationEmail,
      dependencies.getNow,
    );
    return safeResult("recovered", "paid_finalized");
  } catch (error) {
    if (error instanceof StripeWebhookReconciliationError) {
      return safeResult("deferred", error.code);
    }
    throw error;
  }
}

async function processConfirmationEmail(candidate, now, dependencies) {
  const booking = await dependencies.persistence.findBooking(candidate.id);
  if (
    !booking ||
    booking.status !== "CONFIRMED" ||
    booking.confirmationEmailSentAt
  ) {
    return safeResult("already_reconciled", "confirmation_email_recorded");
  }
  let expectedEventId;
  try {
    expectedEventId = googleEventIdForBooking(booking.id);
  } catch {
    return safeResult("manual_attention", "confirmation_email_invalid_booking");
  }
  if (
    !booking.stripePaymentIntentId ||
    booking.calendarEventId !== expectedEventId ||
    !isUsableGoogleMeetUrl(booking.meetingUrl)
  ) {
    return safeResult("manual_attention", "confirmation_email_ineligible");
  }
  if (
    !(booking.createdAt instanceof Date) ||
    booking.createdAt.getTime() <=
      now.getTime() - CONFIRMATION_EMAIL_RETRY_WINDOW_MS
  ) {
    return safeResult("manual_attention", "confirmation_email_ambiguous_age");
  }
  try {
    await reconcileBookingConfirmationEmail(
      booking,
      dependencies.stripePersistence,
      dependencies.sendConfirmationEmail,
      dependencies.getNow,
    );
    return safeResult("recovered", "confirmation_email_recorded");
  } catch (error) {
    if (error instanceof StripeWebhookReconciliationError) {
      if (
        ["email_configuration", "email_provider_rejected"].includes(error.code)
      ) {
        return safeResult("manual_attention", error.code);
      }
      return safeResult("deferred", error.code);
    }
    throw error;
  }
}

function stripeLookupFailure(error) {
  if (
    error?.statusCode === 404 ||
    error?.code === "resource_missing" ||
    error?.type === "StripeInvalidRequestError"
  ) {
    return safeResult("manual_attention", "checkout_session_not_found");
  }
  return safeResult("deferred", "checkout_session_unavailable");
}

async function processCheckoutHold(candidate, _now, dependencies) {
  const booking = await dependencies.persistence.findBooking(candidate.id);
  if (!booking || booking.status !== "HOLD") {
    return safeResult("already_reconciled", "checkout_hold_state_changed");
  }
  if (!booking.stripeCheckoutSessionId || booking.rescheduleSourceBookingId) {
    return safeResult("already_reconciled", "checkout_hold_not_eligible");
  }
  let session;
  try {
    session = await dependencies.stripe.checkout.sessions.retrieve(
      booking.stripeCheckoutSessionId,
    );
  } catch (error) {
    return stripeLookupFailure(error);
  }
  if (
    !session ||
    session.object !== "checkout.session" ||
    session.id !== booking.stripeCheckoutSessionId
  ) {
    return safeResult("manual_attention", "checkout_session_invalid");
  }
  try {
    checkoutSessionBookingId(session);
    if (
      session.mode !== "payment" ||
      session.amount_total !== SESSION_PRODUCT.amountMinor ||
      session.currency !== SESSION_PRODUCT.currency
    ) {
      return safeResult("manual_attention", "checkout_session_invalid_product");
    }
    if (session.status === "open" && session.payment_status === "unpaid") {
      return safeResult("deferred", "checkout_session_open");
    }
    if (session.status === "complete" && session.payment_status === "paid") {
      await reconcileCompletedCheckoutSession(
        session,
        dependencies.stripePersistence,
        dependencies.finalizeCalendar,
        dependencies.sendConfirmationEmail,
        dependencies.releaseActiveHoldPermit,
        dependencies.getNow,
      );
      const current = await dependencies.persistence.findBooking(booking.id);
      return current?.status === "CONFIRMED"
        ? safeResult("recovered", "checkout_paid_confirmed")
        : safeResult("deferred", "checkout_paid_finalization_pending");
    }
    if (session.status === "expired" && session.payment_status === "unpaid") {
      await reconcileExpiredCheckoutSession(
        session,
        dependencies.stripePersistence,
        dependencies.releaseActiveHoldPermit,
      );
      return safeResult("recovered", "checkout_expired_released");
    }
    return safeResult("manual_attention", "checkout_session_contradictory");
  } catch (error) {
    if (error instanceof StripeWebhookReconciliationError) {
      const current = await dependencies.persistence.findBooking(booking.id);
      if (["PAID", "CONFIRMED"].includes(current?.status)) {
        return safeResult("deferred", error.code);
      }
      return safeResult("manual_attention", "checkout_session_invalid");
    }
    throw error;
  }
}

async function processCancellation(candidate, now, dependencies) {
  const before = await dependencies.persistence.findBooking(candidate.id);
  if (!before || !["CANCELLED", "REFUNDED"].includes(before.status)) {
    return safeResult("already_reconciled", "cancellation_state_changed");
  }
  const terminalRefund = isTerminalRefund(before);
  const view = await dependencies.reconcileCancellation(candidate.id, now);
  if (terminalRefund || view?.refund?.status === "needs_attention") {
    return safeResult("manual_attention", "cancellation_refund_terminal");
  }
  if (view?.externalFollowUpPending) {
    return safeResult("deferred", "cancellation_cleanup_pending");
  }
  return safeResult("recovered", "cancellation_cleanup_complete");
}

async function processReschedule(candidate, now, dependencies) {
  if (!candidate.rescheduleSourceBookingId) {
    return safeResult("already_reconciled", "reschedule_link_removed");
  }
  return dependencies.reconcileReschedule(
    candidate.rescheduleSourceBookingId,
    now,
  );
}

async function defaultDependencies() {
  const [
    { db },
    { getStripeClient },
    { reconcileBookingCalendarEvent },
    { sendBookingConfirmationEmail },
    { reconcileCancelledBookingWithDefaultDependencies },
    { reconcilePendingRescheduleWithDefaultDependencies },
    { getAbuseStore },
  ] = await Promise.all([
    import("../db.ts"),
    import("../stripe/client.ts"),
    import("../calendar/booking-event.mjs"),
    import("./booking-confirmation-email.mjs"),
    import("./booking-cancellation.mjs"),
    import("./booking-reschedule.mjs"),
    import("../security/abuse-store.mjs"),
  ]);
  return {
    persistence: createBookingReconciliationPersistence(db),
    stripePersistence: createStripeWebhookPersistence(db),
    stripe: getStripeClient(),
    finalizeCalendar: reconcileBookingCalendarEvent,
    sendConfirmationEmail: sendBookingConfirmationEmail,
    reconcileCancellation: reconcileCancelledBookingWithDefaultDependencies,
    reconcileReschedule: reconcilePendingRescheduleWithDefaultDependencies,
    releaseActiveHoldPermit: async (bookingId) =>
      (await getAbuseStore()).releaseActiveHoldPermit(bookingId),
    getNow: () => new Date(),
    logger: console,
  };
}

export async function runBookingReconciliation(
  now = new Date(),
  injectedDependencies,
  batchSize = BOOKING_RECONCILIATION_BATCH_SIZE,
) {
  const dependencies = injectedDependencies ?? (await defaultDependencies());
  const take = Math.min(
    BOOKING_RECONCILIATION_BATCH_SIZE,
    Math.max(1, batchSize),
  );
  const candidates = await Promise.all([
    dependencies.persistence.listPaid({ now, take }),
    dependencies.persistence.listConfirmationEmail({ now, take }),
    dependencies.persistence.listCheckoutHolds({ now, take }),
    dependencies.persistence.listCancellations({ now, take }),
    dependencies.persistence.listReschedules({ now, take }),
  ]);
  const processors = [
    processPaid,
    processConfirmationEmail,
    processCheckoutHold,
    processCancellation,
    processReschedule,
  ];
  const summary = resultSummary();

  for (
    let categoryIndex = 0;
    categoryIndex < categories.length;
    categoryIndex++
  ) {
    const category = categories[categoryIndex];
    const categoryCounts = summary.categories[category];
    for (const candidate of candidates[categoryIndex]) {
      summary.scanned += 1;
      categoryCounts.scanned += 1;
      let result;
      try {
        result = await processors[categoryIndex](candidate, now, dependencies);
        if (!outcomes.includes(result?.outcome)) {
          result = safeResult("failed", "invalid_reconciliation_result");
        }
      } catch {
        result = safeResult("failed", `${category}_unexpected_error`);
      }
      countOutcome(summary, result.outcome);
      countOutcome(categoryCounts, result.outcome);
      if (["deferred", "manual_attention", "failed"].includes(result.outcome)) {
        dependencies.logger?.warn?.("Booking reconciliation unresolved.", {
          bookingId: candidate.id,
          category,
          outcome: result.outcome,
          reason: result.reason,
        });
      }
    }
  }
  return summary;
}
