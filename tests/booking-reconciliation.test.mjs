import assert from "node:assert/strict";
import test from "node:test";

import {
  CONFIRMATION_EMAIL_RETRY_WINDOW_MS,
  runBookingReconciliation,
} from "../src/lib/booking/booking-reconciliation.mjs";
import { googleEventIdForBooking } from "../src/lib/calendar/booking-event.mjs";

const now = new Date("2030-01-01T10:00:00.000Z");
const bookingId = "5a449655-7be3-432c-a124-b769e10b5401";
const meetingUrl = "https://meet.google.com/abc-defg-hij";

function booking(overrides = {}) {
  return {
    id: bookingId,
    name: "Recovery Listener",
    email: "recovery@example.test",
    startAt: new Date("2030-01-03T10:00:00.000Z"),
    endAt: new Date("2030-01-03T10:55:00.000Z"),
    timezone: "Europe/London",
    status: "PAID",
    stripeCheckoutSessionId: "cs_recovery",
    stripePaymentIntentId: "pi_recovery",
    calendarEventId: null,
    meetingUrl: null,
    confirmationEmailSentAt: null,
    confirmationEmailId: null,
    cancelledAt: null,
    cancellationRefundDue: null,
    calendarCancelledAt: null,
    stripeRefundId: null,
    stripeRefundStatus: null,
    refundRequestedAt: null,
    refundedAt: null,
    rescheduledAt: null,
    rescheduleSourceBookingId: null,
    expiresAt: new Date("2030-01-01T09:00:00.000Z"),
    createdAt: new Date("2030-01-01T09:30:00.000Z"),
    ...overrides,
  };
}

function fixture(initialBookings, options = {}) {
  const stored = new Map(
    initialBookings.map((value) => [value.id, { ...value }]),
  );
  const calls = {
    calendar: 0,
    email: 0,
    stripeRetrieve: 0,
    releasePermit: 0,
    cancellation: 0,
    reschedule: 0,
    warnings: [],
  };
  const candidates = options.candidates ?? {};
  const persistence = {
    findBooking: async (id) => {
      if (options.findFailsFor === id) throw new Error("database unavailable");
      return stored.get(id) ? { ...stored.get(id) } : null;
    },
    listPaid: async () => candidates.paid ?? [],
    listConfirmationEmail: async () => candidates.confirmationEmail ?? [],
    listCheckoutHolds: async () => candidates.checkoutHold ?? [],
    listCancellations: async () => candidates.cancellation ?? [],
    listReschedules: async () => candidates.reschedule ?? [],
  };
  const stripePersistence = {
    findBooking: persistence.findBooking,
    markPaid: async ({ bookingId: id, sessionId, paymentIntentId }) => {
      const current = stored.get(id);
      if (
        current?.status !== "HOLD" ||
        current.stripeCheckoutSessionId !== sessionId
      )
        return { count: 0 };
      stored.set(id, {
        ...current,
        status: "PAID",
        stripePaymentIntentId: paymentIntentId,
      });
      return { count: 1 };
    },
    cancelExpired: async ({ bookingId: id, sessionId }) => {
      const current = stored.get(id);
      if (
        current?.status !== "HOLD" ||
        current.stripeCheckoutSessionId !== sessionId
      )
        return { count: 0 };
      stored.set(id, { ...current, status: "CANCELLED" });
      return { count: 1 };
    },
    confirm: async ({ bookingId: id, calendarEventId, meetingUrl: meet }) => {
      const current = stored.get(id);
      if (current?.status !== "PAID") return { count: 0 };
      stored.set(id, {
        ...current,
        status: "CONFIRMED",
        calendarEventId,
        meetingUrl: meet,
      });
      return { count: 1 };
    },
    recordConfirmationEmail: async ({
      bookingId: id,
      messageId,
      acceptedAt,
    }) => {
      const current = stored.get(id);
      if (current?.status !== "CONFIRMED" || current.confirmationEmailSentAt)
        return { count: 0 };
      stored.set(id, {
        ...current,
        confirmationEmailSentAt: acceptedAt,
        confirmationEmailId: messageId,
      });
      return { count: 1 };
    },
  };
  return {
    dependencies: {
      persistence,
      stripePersistence,
      stripe: {
        checkout: {
          sessions: {
            retrieve: async () => {
              calls.stripeRetrieve += 1;
              if (options.stripeError) throw options.stripeError;
              return options.session;
            },
          },
        },
      },
      finalizeCalendar: async (current) => {
        calls.calendar += 1;
        if (options.calendarError) throw options.calendarError;
        return {
          calendarEventId: googleEventIdForBooking(current.id),
          meetingUrl,
        };
      },
      sendConfirmationEmail: async () => {
        calls.email += 1;
        if (options.emailError) throw options.emailError;
        return { messageId: "email_recovered" };
      },
      releaseActiveHoldPermit: async () => {
        calls.releasePermit += 1;
      },
      reconcileCancellation: async () => {
        calls.cancellation += 1;
        return (
          options.cancellationView ?? {
            externalFollowUpPending: false,
            refund: { status: "refunded" },
          }
        );
      },
      reconcileReschedule: async () => {
        calls.reschedule += 1;
        return (
          options.rescheduleResult ?? {
            outcome: "recovered",
            reason: "reschedule_committed",
          }
        );
      },
      getNow: () => now,
      logger: { warn: (...values) => calls.warnings.push(values) },
    },
    stored: (id = bookingId) => stored.get(id),
    calls,
  };
}

test("future PAID booking finalizes Calendar, confirms, and records email", async () => {
  const initial = booking();
  const attempt = fixture([initial], { candidates: { paid: [initial] } });
  const result = await runBookingReconciliation(now, attempt.dependencies);
  assert.equal(result.recovered, 1);
  assert.equal(attempt.stored().status, "CONFIRMED");
  assert.equal(
    attempt.stored().calendarEventId,
    googleEventIdForBooking(bookingId),
  );
  assert.equal(attempt.stored().confirmationEmailId, "email_recovered");
  assert.equal(attempt.calls.calendar, 1);
  assert.equal(attempt.calls.email, 1);
});

test("temporary Calendar failure defers PAID booking while concurrent confirmation is already reconciled", async () => {
  const pending = booking();
  const unavailable = fixture([pending], {
    candidates: { paid: [pending] },
    calendarError: new Error("temporary provider failure"),
  });
  const deferred = await runBookingReconciliation(
    now,
    unavailable.dependencies,
  );
  assert.equal(deferred.deferred, 1);
  assert.equal(unavailable.stored().status, "PAID");

  const confirmed = booking({
    status: "CONFIRMED",
    calendarEventId: googleEventIdForBooking(bookingId),
    meetingUrl,
    confirmationEmailSentAt: now,
  });
  const concurrent = fixture([confirmed], { candidates: { paid: [pending] } });
  const replay = await runBookingReconciliation(now, concurrent.dependencies);
  assert.equal(replay.alreadyReconciled, 1);
  assert.equal(concurrent.calls.calendar, 0);
});

test("past PAID booking requires attention without creating a historical event", async () => {
  const past = booking({ startAt: new Date("2030-01-01T09:00:00.000Z") });
  const attempt = fixture([past], { candidates: { paid: [past] } });
  const result = await runBookingReconciliation(now, attempt.dependencies);
  assert.equal(result.manualAttention, 1);
  assert.equal(attempt.calls.calendar, 0);
  assert.equal(attempt.stored().status, "PAID");
});

test("recent missing confirmation email retries, but a 24-hour-old marker gap is ambiguous", async () => {
  const recent = booking({
    status: "CONFIRMED",
    calendarEventId: googleEventIdForBooking(bookingId),
    meetingUrl,
  });
  const retry = fixture([recent], {
    candidates: { confirmationEmail: [recent] },
  });
  const recovered = await runBookingReconciliation(now, retry.dependencies);
  assert.equal(recovered.recovered, 1);
  assert.equal(retry.calls.email, 1);

  const old = booking({
    status: "CONFIRMED",
    calendarEventId: googleEventIdForBooking(bookingId),
    meetingUrl,
    createdAt: new Date(now.getTime() - CONFIRMATION_EMAIL_RETRY_WINDOW_MS),
  });
  const ambiguous = fixture([old], {
    candidates: { confirmationEmail: [old] },
  });
  const result = await runBookingReconciliation(now, ambiguous.dependencies);
  assert.equal(result.manualAttention, 1);
  assert.equal(ambiguous.calls.email, 0);
});

test("Checkout-backed holds retain open/unknown Sessions and retire expired unpaid Sessions", async () => {
  const hold = booking({ status: "HOLD", stripePaymentIntentId: null });
  const session = (overrides) => ({
    object: "checkout.session",
    id: hold.stripeCheckoutSessionId,
    client_reference_id: hold.id,
    metadata: { bookingId: hold.id },
    mode: "payment",
    payment_status: "unpaid",
    amount_total: 5500,
    currency: "gbp",
    payment_intent: null,
    ...overrides,
  });
  const open = fixture([hold], {
    candidates: { checkoutHold: [hold] },
    session: session({ status: "open" }),
  });
  assert.equal(
    (await runBookingReconciliation(now, open.dependencies)).deferred,
    1,
  );
  assert.equal(open.stored().status, "HOLD");

  const expired = fixture([hold], {
    candidates: { checkoutHold: [hold] },
    session: session({ status: "expired" }),
  });
  assert.equal(
    (await runBookingReconciliation(now, expired.dependencies)).recovered,
    1,
  );
  assert.equal(expired.stored().status, "CANCELLED");
  assert.equal(expired.calls.releasePermit, 1);

  const unavailable = fixture([hold], {
    candidates: { checkoutHold: [hold] },
    stripeError: new Error("Stripe unavailable"),
  });
  assert.equal(
    (await runBookingReconciliation(now, unavailable.dependencies)).deferred,
    1,
  );
  assert.equal(unavailable.stored().status, "HOLD");
});

test("complete paid Checkout uses the shared paid lifecycle and releases its permit", async () => {
  const hold = booking({ status: "HOLD", stripePaymentIntentId: null });
  const attempt = fixture([hold], {
    candidates: { checkoutHold: [hold] },
    session: {
      object: "checkout.session",
      id: hold.stripeCheckoutSessionId,
      client_reference_id: hold.id,
      metadata: { bookingId: hold.id },
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 5500,
      currency: "gbp",
      payment_intent: "pi_recovered",
    },
  });
  const result = await runBookingReconciliation(now, attempt.dependencies);
  assert.equal(result.recovered, 1);
  assert.equal(attempt.stored().status, "CONFIRMED");
  assert.equal(attempt.stored().stripePaymentIntentId, "pi_recovered");
  assert.equal(attempt.calls.releasePermit, 1);
});

test("cancellation and reschedule candidates delegate and preserve operational classifications", async () => {
  const cancelled = booking({
    id: "5a449655-7be3-432c-a124-b769e10b5402",
    status: "CANCELLED",
    cancellationRefundDue: true,
  });
  const linked = booking({
    id: "5a449655-7be3-432c-a124-b769e10b5403",
    status: "HOLD",
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    rescheduleSourceBookingId: bookingId,
  });
  const attempt = fixture([cancelled, linked], {
    candidates: { cancellation: [cancelled], reschedule: [linked] },
    cancellationView: {
      externalFollowUpPending: true,
      refund: { status: "processing" },
    },
    rescheduleResult: {
      outcome: "manual_attention",
      reason: "reschedule_calendar_mismatch",
    },
  });
  const result = await runBookingReconciliation(now, attempt.dependencies);
  assert.equal(result.scanned, 2);
  assert.equal(result.deferred, 1);
  assert.equal(result.manualAttention, 1);
  assert.equal(attempt.calls.cancellation, 1);
  assert.equal(attempt.calls.reschedule, 1);
});

test("one candidate failure does not abort another category and aggregate counts stay correct", async () => {
  const broken = booking({ id: "5a449655-7be3-432c-a124-b769e10b5404" });
  const oldEmail = booking({
    id: "5a449655-7be3-432c-a124-b769e10b5405",
    status: "CONFIRMED",
    calendarEventId: googleEventIdForBooking(
      "5a449655-7be3-432c-a124-b769e10b5405",
    ),
    meetingUrl,
    createdAt: new Date("2029-12-01T00:00:00.000Z"),
  });
  const attempt = fixture([broken, oldEmail], {
    candidates: { paid: [broken], confirmationEmail: [oldEmail] },
    findFailsFor: broken.id,
  });
  const result = await runBookingReconciliation(now, attempt.dependencies);
  assert.equal(result.scanned, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.manualAttention, 1);
  assert.equal(result.categories.paid.failed, 1);
  assert.equal(result.categories.confirmationEmail.manualAttention, 1);
  assert.equal(attempt.calls.warnings.length, 2);
});

test("every recovery category receives its own bounded batch", async () => {
  const observed = [];
  const list = async ({ take }) => {
    observed.push(take);
    return [];
  };
  const result = await runBookingReconciliation(
    now,
    {
      persistence: {
        listPaid: list,
        listConfirmationEmail: list,
        listCheckoutHolds: list,
        listCancellations: list,
        listReschedules: list,
      },
      logger: { warn: () => {} },
    },
    100,
  );
  assert.deepEqual(observed, [20, 20, 20, 20, 20]);
  assert.equal(result.scanned, 0);
});
