import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

import { getAvailableSlots } from "../src/lib/availability/available-slots.mjs";
import { getActiveBookingConflicts } from "../src/lib/availability/booking-conflicts.mjs";
import { getProviderCandidateSlotsForDate } from "../src/lib/availability/candidate-slots.mjs";
import {
  createBookingHold,
  createHoldPersistence,
  SlotUnavailableError,
} from "../src/lib/booking/booking-hold.mjs";
import {
  cancelBooking,
  createBookingCancellationPersistence,
  reconcileCancelledBooking,
} from "../src/lib/booking/booking-cancellation.mjs";
import {
  BookingRescheduleError,
  createBookingReschedulePersistence,
  rescheduleBooking,
} from "../src/lib/booking/booking-reschedule.mjs";
import {
  createStripeWebhookPersistence,
  processStripeWebhookEvent,
} from "../src/lib/booking/stripe-webhook.mjs";
import {
  GOOGLE_EVENTS_OWNED_SCOPE,
  googleEventIdForBooking,
  reconcileBookingCalendarEvent,
  rescheduleBookingCalendarEvent,
} from "../src/lib/calendar/booking-event.mjs";
import { GoogleApiError } from "../src/lib/google-calendar/google-api.mjs";

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;
const skip = connectionString
  ? false
  : "DATABASE_SCHEMA_TEST_URL is not configured";
const activeStatuses = ["HOLD", "PAID", "CONFIRMED"];

function client() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function completedEvent({ bookingId, sessionId, paymentIntentId }) {
  return {
    id: `evt_test_${bookingId}`,
    type: "checkout.session.completed",
    data: {
      object: {
        object: "checkout.session",
        id: sessionId,
        client_reference_id: bookingId,
        metadata: { bookingId },
        mode: "payment",
        payment_status: "paid",
        amount_total: 5500,
        currency: "gbp",
        payment_intent: paymentIntentId,
      },
    },
  };
}

function bookingData(overrides = {}) {
  return {
    name: "Reliability Listener",
    email: "reliability-listener@example.test",
    timezone: "Europe/London",
    status: "CONFIRMED",
    expiresAt: new Date("2044-01-01T10:15:00.000Z"),
    createdAt: new Date("2044-01-01T10:00:00.000Z"),
    ...overrides,
  };
}

function realAvailabilityDependencies(db, getCalendarBusyPeriods) {
  return {
    getCandidates: getProviderCandidateSlotsForDate,
    getBookingConflicts: (input) => getActiveBookingConflicts(input, db),
    getCalendarBusyPeriods,
  };
}

test(
  "two concurrent hold requests leave exactly one PostgreSQL slot owner",
  { skip },
  async () => {
    const first = client();
    const second = client();
    const startAt = "2044-01-04T10:00:00.000Z";
    const endAt = "2044-01-04T10:55:00.000Z";
    const now = new Date("2044-01-02T10:00:00.000Z");
    let arrivals = 0;
    let releaseAvailability;
    let bothObserved;
    const availabilityGate = new Promise((resolve) => {
      releaseAvailability = resolve;
    });
    const observedByBoth = new Promise((resolve) => {
      bothObserved = resolve;
    });
    const getAvailableSlots = async () => {
      arrivals += 1;
      if (arrivals === 2) bothObserved();
      await availabilityGate;
      return [{ date: "2044-01-04", startAt, endAt }];
    };
    const ids = [];

    try {
      await first.booking.deleteMany({ where: { startAt: new Date(startAt) } });
      const attempts = [
        createBookingHold(
          {
            name: "First Listener",
            email: "first@example.test",
            startAt,
            acceptedBoundaries: true,
          },
          now,
          { getAvailableSlots, persist: createHoldPersistence(first) },
        ),
        createBookingHold(
          {
            name: "Second Listener",
            email: "second@example.test",
            startAt,
            acceptedBoundaries: true,
          },
          now,
          { getAvailableSlots, persist: createHoldPersistence(second) },
        ),
      ];
      await observedByBoth;
      releaseAvailability();
      const results = await Promise.allSettled(attempts);
      const winners = results.filter((result) => result.status === "fulfilled");
      const losers = results.filter((result) => result.status === "rejected");
      assert.equal(winners.length, 1);
      assert.equal(losers.length, 1);
      assert.ok(losers[0].reason instanceof SlotUnavailableError);
      ids.push(winners[0].value.id);

      const owners = await first.booking.findMany({
        where: { startAt: new Date(startAt), status: { in: activeStatuses } },
      });
      assert.equal(owners.length, 1);
      assert.equal(owners[0].stripeCheckoutSessionId, null);
    } finally {
      await first.booking.deleteMany({ where: { startAt: new Date(startAt) } });
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  },
);

test(
  "paid webhook survives Calendar and authorization failure, then replays once without duplicate effects",
  { skip },
  async () => {
    const db = client();
    const bookingId = "5a449655-7be3-432c-a124-b769e10b5301";
    const sessionId = "cs_test_reliability_paid";
    const paymentIntentId = "pi_test_reliability_paid";
    const startAt = new Date("2044-01-05T10:00:00.000Z");
    const event = completedEvent({ bookingId, sessionId, paymentIntentId });
    let calendarAttempts = 0;
    let logicalEvents = 0;
    let emailAttempts = 0;
    let credentialsRepaired = false;
    const persistence = createStripeWebhookPersistence(db);
    const finalizeCalendar = async (booking) => {
      calendarAttempts += 1;
      return reconcileBookingCalendarEvent(booking, {
        getCredentials: async () => ({
          calendarId: "reliability-calendar@example.test",
          refreshToken: "stored-refresh-token",
          grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
        }),
        getOAuthConfig: async () => ({
          clientId: "client-id",
          clientSecret: "client-secret",
        }),
        refreshAccessToken: async ({ refreshToken }) => {
          assert.equal(refreshToken, "stored-refresh-token");
          if (!credentialsRepaired) throw new GoogleApiError("authorization");
          return { accessToken: `ephemeral-access-token-${calendarAttempts}` };
        },
        insertEvent: async ({ accessToken, event: calendarEvent }) => {
          assert.equal(accessToken, "ephemeral-access-token-2");
          logicalEvents += 1;
          return {
            ...calendarEvent,
            hangoutLink: "https://meet.google.com/abc-defg-hij",
            conferenceData: {
              createRequest: { status: { statusCode: "success" } },
              entryPoints: [
                {
                  entryPointType: "video",
                  uri: "https://meet.google.com/abc-defg-hij",
                },
              ],
            },
          };
        },
        getEvent: async () =>
          assert.fail("a successful deterministic insert must not need lookup"),
      });
    };
    const sendEmail = async () => {
      emailAttempts += 1;
      return { messageId: "email_reliability_paid" };
    };

    try {
      await db.booking.deleteMany({ where: { id: bookingId } });
      await db.booking.create({
        data: bookingData({
          id: bookingId,
          startAt,
          endAt: new Date("2044-01-05T10:55:00.000Z"),
          status: "HOLD",
          stripeCheckoutSessionId: sessionId,
        }),
      });

      await assert.rejects(() =>
        processStripeWebhookEvent(
          event,
          persistence,
          finalizeCalendar,
          sendEmail,
        ),
      );
      const paid = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(paid.status, "PAID");
      assert.equal(paid.stripePaymentIntentId, paymentIntentId);
      assert.equal(paid.calendarEventId, null);
      assert.equal(paid.meetingUrl, null);
      assert.equal(paid.confirmationEmailSentAt, null);
      assert.equal(emailAttempts, 0);
      assert.equal(
        await db.booking.count({
          where: { startAt, status: { in: activeStatuses } },
        }),
        1,
        "PAID remains the active slot owner",
      );

      credentialsRepaired = true;
      await processStripeWebhookEvent(
        event,
        persistence,
        finalizeCalendar,
        sendEmail,
      );
      await processStripeWebhookEvent(
        event,
        persistence,
        finalizeCalendar,
        sendEmail,
      );
      const confirmed = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(confirmed.stripePaymentIntentId, paymentIntentId);
      assert.equal(
        confirmed.calendarEventId,
        googleEventIdForBooking(bookingId),
      );
      assert.equal(
        confirmed.meetingUrl,
        "https://meet.google.com/abc-defg-hij",
      );
      assert.equal(confirmed.confirmationEmailId, "email_reliability_paid");
      assert.equal(await db.booking.count({ where: { id: bookingId } }), 1);
      assert.equal(calendarAttempts, 2, "failure plus one recovery attempt");
      assert.equal(logicalEvents, 1);
      assert.equal(emailAttempts, 1);
    } finally {
      await db.booking.deleteMany({ where: { id: bookingId } });
      await db.$disconnect();
    }
  },
);

test(
  "a provider event added after displayed availability is rejected before PostgreSQL HOLD creation",
  { skip },
  async () => {
    const db = client();
    const now = new Date("2044-01-12T10:00:00.000Z");
    const providerDate = "2044-01-14";
    let providerEventAdded = false;
    let checkoutCalls = 0;
    const getCalendarBusyPeriods = async () =>
      providerEventAdded
        ? [
            {
              startAt: "2044-01-14T10:00:00.000Z",
              endAt: "2044-01-14T10:55:00.000Z",
            },
          ]
        : [];
    const availabilityDependencies = realAvailabilityDependencies(
      db,
      getCalendarBusyPeriods,
    );
    const holdDependencies = {
      getAvailableSlots: (input) =>
        getAvailableSlots(input, availabilityDependencies),
      persist: createHoldPersistence(db),
    };
    const submitBooking = async (input) => {
      const hold = await createBookingHold(input, now, holdDependencies);
      checkoutCalls += 1;
      return hold;
    };

    try {
      await db.booking.deleteMany({
        where: { startAt: new Date("2044-01-14T10:00:00.000Z") },
      });
      const displayed = await getAvailableSlots(
        { fromDate: providerDate, toDate: providerDate, now },
        availabilityDependencies,
      );
      const selected = displayed.find(
        ({ startAt }) => startAt === "2044-01-14T10:00:00.000Z",
      );
      assert.ok(selected, "the customer must initially see the slot");

      providerEventAdded = true;
      await assert.rejects(
        () =>
          submitBooking({
            name: "Stale Availability Listener",
            email: "stale-availability@example.test",
            startAt: selected.startAt,
            acceptedBoundaries: true,
          }),
        SlotUnavailableError,
      );
      assert.equal(
        await db.booking.count({
          where: {
            startAt: new Date(selected.startAt),
            status: { in: activeStatuses },
          },
        }),
        0,
      );
      assert.equal(checkoutCalls, 0);
    } finally {
      await db.booking.deleteMany({
        where: { startAt: new Date("2044-01-14T10:00:00.000Z") },
      });
      await db.$disconnect();
    }
  },
);

test(
  "temporary Calendar insert outage leaves payment PAID and exact webhook replay confirms once",
  { skip },
  async () => {
    const db = client();
    const bookingId = "5a449655-7be3-432c-a124-b769e10b5306";
    const sessionId = "cs_test_calendar_outage";
    const paymentIntentId = "pi_test_calendar_outage";
    const startAt = new Date("2044-01-15T10:00:00.000Z");
    const event = completedEvent({ bookingId, sessionId, paymentIntentId });
    const persistence = createStripeWebhookPersistence(db);
    let calendarRecovered = false;
    let refreshCalls = 0;
    let insertCalls = 0;
    let logicalEvents = 0;
    let emailCalls = 0;
    const finalizeCalendar = (booking) =>
      reconcileBookingCalendarEvent(booking, {
        getCredentials: async () => ({
          calendarId: "outage-calendar@example.test",
          refreshToken: "outage-refresh-token",
          grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
        }),
        getOAuthConfig: async () => ({
          clientId: "client-id",
          clientSecret: "client-secret",
        }),
        refreshAccessToken: async () => {
          refreshCalls += 1;
          return { accessToken: `fresh-access-token-${refreshCalls}` };
        },
        insertEvent: async ({ accessToken, event: calendarEvent }) => {
          insertCalls += 1;
          assert.equal(accessToken, `fresh-access-token-${insertCalls}`);
          if (!calendarRecovered) throw new GoogleApiError("unavailable");
          logicalEvents += 1;
          return {
            ...calendarEvent,
            hangoutLink: "https://meet.google.com/out-age-test",
            conferenceData: {
              createRequest: { status: { statusCode: "success" } },
              entryPoints: [
                {
                  entryPointType: "video",
                  uri: "https://meet.google.com/out-age-test",
                },
              ],
            },
          };
        },
        getEvent: async () =>
          assert.fail("an unavailable insert is not a duplicate conflict"),
      });
    const sendEmail = async () => {
      emailCalls += 1;
      return { messageId: "email_calendar_outage" };
    };

    try {
      await db.booking.deleteMany({ where: { id: bookingId } });
      await db.booking.create({
        data: bookingData({
          id: bookingId,
          startAt,
          endAt: new Date("2044-01-15T10:55:00.000Z"),
          status: "HOLD",
          stripeCheckoutSessionId: sessionId,
        }),
      });

      await assert.rejects(() =>
        processStripeWebhookEvent(
          event,
          persistence,
          finalizeCalendar,
          sendEmail,
        ),
      );
      const paid = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(paid.status, "PAID");
      assert.equal(paid.stripePaymentIntentId, paymentIntentId);
      assert.equal(paid.calendarEventId, null);
      assert.equal(paid.meetingUrl, null);
      assert.equal(paid.confirmationEmailSentAt, null);
      assert.equal(emailCalls, 0);
      assert.equal(
        await db.booking.count({
          where: { startAt, status: { in: activeStatuses } },
        }),
        1,
      );

      calendarRecovered = true;
      await processStripeWebhookEvent(
        event,
        persistence,
        finalizeCalendar,
        sendEmail,
      );
      await processStripeWebhookEvent(
        event,
        persistence,
        finalizeCalendar,
        sendEmail,
      );
      const confirmed = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(confirmed.stripePaymentIntentId, paymentIntentId);
      assert.equal(
        confirmed.calendarEventId,
        googleEventIdForBooking(bookingId),
      );
      assert.equal(
        confirmed.meetingUrl,
        "https://meet.google.com/out-age-test",
      );
      assert.equal(confirmed.confirmationEmailId, "email_calendar_outage");
      assert.equal(await db.booking.count({ where: { id: bookingId } }), 1);
      assert.equal(refreshCalls, 2);
      assert.equal(insertCalls, 2);
      assert.equal(logicalEvents, 1);
      assert.equal(emailCalls, 1);
    } finally {
      await db.booking.deleteMany({ where: { id: bookingId } });
      await db.$disconnect();
    }
  },
);

test(
  "ordinary expired hold releases its slot and cannot receive an uncorrelated payment",
  { skip },
  async () => {
    const db = client();
    const staleId = "5a449655-7be3-432c-a124-b769e10b5302";
    const startAt = new Date("2044-01-08T10:00:00.000Z");
    const endAt = new Date("2044-01-08T10:55:00.000Z");
    const now = new Date("2044-01-07T10:00:00.000Z");
    let replacementId;
    try {
      await db.booking.deleteMany({ where: { startAt } });
      await db.booking.create({
        data: bookingData({
          id: staleId,
          startAt,
          endAt,
          status: "HOLD",
          expiresAt: new Date("2044-01-07T09:59:00.000Z"),
        }),
      });
      const replacement = await createHoldPersistence(db)({
        name: "Replacement Listener",
        email: "replacement@example.test",
        startAt,
        endAt,
        timezone: "Europe/London",
        expiresAt: new Date("2044-01-07T10:15:00.000Z"),
        now,
      });
      replacementId = replacement.id;
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: staleId } })).status,
        "CANCELLED",
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: replacementId } }))
          .status,
        "HOLD",
      );
      await assert.rejects(() =>
        processStripeWebhookEvent(
          completedEvent({
            bookingId: staleId,
            sessionId: "cs_test_unrelated",
            paymentIntentId: "pi_test_unrelated",
          }),
          createStripeWebhookPersistence(db),
        ),
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: staleId } })).status,
        "CANCELLED",
      );
    } finally {
      await db.booking.deleteMany({ where: { startAt } });
      await db.$disconnect();
    }
  },
);

test(
  "pending Calendar deletion keeps same-interval FreeBusy authoritative until cancellation recovery",
  { skip },
  async () => {
    const db = client();
    const bookingId = "5a449655-7be3-432c-a124-b769e10b5303";
    const startAt = new Date("2044-01-13T10:00:00.000Z");
    const endAt = new Date("2044-01-13T10:55:00.000Z");
    const persistence = createBookingCancellationPersistence(db);
    let providersHealthy = false;
    let calendarCalls = 0;
    let listRefundCalls = 0;
    let createRefundCalls = 0;
    let retrieveRefundCalls = 0;
    const idempotencyKeys = [];
    const dependencies = {
      persistence,
      cancelCalendarEvent: async () => {
        calendarCalls += 1;
        if (!providersHealthy) throw new Error("temporary Calendar failure");
        return { cancelled: true };
      },
      stripe: {
        refunds: {
          list: async () => {
            listRefundCalls += 1;
            if (!providersHealthy) throw new Error("temporary Stripe failure");
            return { object: "list", data: [], has_more: false };
          },
          create: async (_input, options) => {
            createRefundCalls += 1;
            idempotencyKeys.push(options.idempotencyKey);
            if (!providersHealthy) throw new Error("temporary Stripe failure");
            return {
              object: "refund",
              id: "re_test_reliability",
              payment_intent: "pi_test_cancel_reliability",
              metadata: { bookingId },
              amount: 5500,
              currency: "gbp",
              status: "pending",
            };
          },
          retrieve: async () => {
            retrieveRefundCalls += 1;
            return {
              object: "refund",
              id: "re_test_reliability",
              payment_intent: "pi_test_cancel_reliability",
              metadata: { bookingId },
              amount: 5500,
              currency: "gbp",
              status: "succeeded",
            };
          },
        },
      },
      getNow: () => new Date("2044-01-01T10:05:00.000Z"),
    };

    try {
      await db.booking.deleteMany({ where: { id: bookingId } });
      await db.booking.create({
        data: bookingData({
          id: bookingId,
          startAt,
          endAt,
          stripeCheckoutSessionId: "cs_test_cancel_reliability",
          stripePaymentIntentId: "pi_test_cancel_reliability",
          calendarEventId: "evt_test_cancel_reliability",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
        }),
      });

      const first = await cancelBooking(
        bookingId,
        { expectedRefundEligible: true },
        new Date("2044-01-01T10:00:00.000Z"),
        dependencies,
      );
      assert.equal(first.status, "cancelled");
      assert.equal(first.externalFollowUpPending, true);
      const cancelled = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(cancelled.status, "CANCELLED");
      assert.equal(cancelled.cancellationRefundDue, true);
      assert.equal(cancelled.calendarCancelledAt, null);
      assert.equal(cancelled.stripeRefundId, null);
      assert.equal(
        await db.booking.count({
          where: { startAt, status: { in: activeStatuses } },
        }),
        0,
      );

      const availableAfterCancellation = await getAvailableSlots(
        {
          fromDate: "2044-01-13",
          toDate: "2044-01-13",
          now: new Date("2044-01-01T10:00:01.000Z"),
        },
        realAvailabilityDependencies(db, async () => [
          {
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
          },
          {
            startAt: "2044-01-13T10:55:00.000Z",
            endAt: "2044-01-13T11:50:00.000Z",
          },
        ]),
      );
      assert.equal(
        availableAfterCancellation.some(
          (slot) => slot.startAt === startAt.toISOString(),
        ),
        false,
        "FreeBusy may represent an independent same-interval event, so timestamp equality cannot release the slot",
      );
      assert.equal(
        availableAfterCancellation.some(
          (slot) => slot.startAt === "2044-01-13T10:55:00.000Z",
        ),
        false,
        "an unrelated Google busy period remains authoritative",
      );

      providersHealthy = true;
      const pending = await reconcileCancelledBooking(
        bookingId,
        new Date("2044-01-01T10:06:00.000Z"),
        dependencies,
      );
      assert.equal(pending.refund.status, "processing");
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: bookingId } }))
          .status,
        "CANCELLED",
      );
      const complete = await reconcileCancelledBooking(
        bookingId,
        new Date("2044-01-01T10:07:00.000Z"),
        dependencies,
      );
      assert.equal(complete.status, "refunded");
      const refunded = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(refunded.status, "REFUNDED");
      assert.equal(refunded.stripeRefundId, "re_test_reliability");
      assert.equal(
        refunded.stripePaymentIntentId,
        "pi_test_cancel_reliability",
      );
      assert.equal(calendarCalls, 2);
      assert.equal(listRefundCalls, 2);
      assert.equal(createRefundCalls, 1);
      assert.equal(retrieveRefundCalls, 1);
      assert.deepEqual(idempotencyKeys, [
        `booking-cancellation-refund:${bookingId}`,
      ]);

      const availableAfterReconciliation = await getAvailableSlots(
        {
          fromDate: "2044-01-13",
          toDate: "2044-01-13",
          now: new Date("2044-01-01T10:07:01.000Z"),
        },
        realAvailabilityDependencies(db, async () => [
          {
            startAt: "2044-01-13T10:55:00.000Z",
            endAt: "2044-01-13T11:50:00.000Z",
          },
        ]),
      );
      assert.equal(
        availableAfterReconciliation.some(
          (slot) => slot.startAt === startAt.toISOString(),
        ),
        true,
        "the cancelled slot becomes available after Calendar deletion is reconciled and FreeBusy no longer reports it",
      );
      assert.equal(
        availableAfterReconciliation.some(
          (slot) => slot.startAt === "2044-01-13T10:55:00.000Z",
        ),
        false,
        "the unrelated provider event remains authoritative after reconciliation",
      );
    } finally {
      await db.booking.deleteMany({ where: { id: bookingId } });
      await db.$disconnect();
    }
  },
);

test(
  "two confirmed bookings contest one reschedule target and only the winner moves atomically",
  { skip },
  async () => {
    const first = client();
    const second = client();
    const sourceAId = "5a449655-7be3-432c-a124-b769e10b5304";
    const sourceBId = "5a449655-7be3-432c-a124-b769e10b5305";
    const sourceAStart = new Date("2044-01-11T10:00:00.000Z");
    const sourceBStart = new Date("2044-01-11T12:00:00.000Z");
    const targetStart = new Date("2044-01-12T10:00:00.000Z");
    const targetEnd = new Date("2044-01-12T10:55:00.000Z");
    const now = new Date("2044-01-01T10:00:00.000Z");
    const ids = [sourceAId, sourceBId];
    try {
      await first.booking.deleteMany({
        where: { OR: [{ id: { in: ids } }, { startAt: targetStart }] },
      });
      await first.booking.createMany({
        data: [
          bookingData({
            id: sourceAId,
            startAt: sourceAStart,
            endAt: new Date("2044-01-11T10:55:00.000Z"),
            stripeCheckoutSessionId: "cs_test_reschedule_a",
            stripePaymentIntentId: "pi_test_reschedule_a",
            calendarEventId: "evt_test_reschedule_a",
            meetingUrl: "https://meet.google.com/aaa-bbbb-ccc",
          }),
          bookingData({
            id: sourceBId,
            startAt: sourceBStart,
            endAt: new Date("2044-01-11T12:55:00.000Z"),
            stripeCheckoutSessionId: "cs_test_reschedule_b",
            stripePaymentIntentId: "pi_test_reschedule_b",
            calendarEventId: "evt_test_reschedule_b",
            meetingUrl: "https://meet.google.com/ddd-eeee-fff",
          }),
        ],
      });
      const firstPersistence = createBookingReschedulePersistence(first);
      const secondPersistence = createBookingReschedulePersistence(second);
      const [sourceA, sourceB] = await Promise.all([
        firstPersistence.findSource(sourceAId),
        secondPersistence.findSource(sourceBId),
      ]);
      assert.equal(
        await first.booking.count({
          where: {
            id: { in: [sourceAId, sourceBId] },
            status: "CONFIRMED",
          },
        }),
        2,
      );
      const target = {
        startAt: targetStart,
        endAt: targetEnd,
        timezone: "Europe/London",
      };
      const results = await Promise.allSettled([
        firstPersistence.reserveTarget({ source: sourceA, target, now }),
        secondPersistence.reserveTarget({ source: sourceB, target, now }),
      ]);
      const winnerResult = results.find(
        (result) => result.status === "fulfilled",
      );
      const loserResult = results.find(
        (result) => result.status === "rejected",
      );
      assert.ok(winnerResult);
      assert.ok(loserResult);
      assert.ok(loserResult.reason instanceof BookingRescheduleError);
      assert.equal(loserResult.reason.code, "slot_unavailable");
      const hold = winnerResult.value;
      ids.push(hold.id);
      const persistedHold = await first.booking.findUniqueOrThrow({
        where: { id: hold.id },
      });
      assert.equal(persistedHold.stripeCheckoutSessionId, null);
      assert.equal(persistedHold.stripePaymentIntentId, null);
      assert.equal(persistedHold.stripeRefundId, null);
      assert.equal(
        await first.booking.count({
          where: {
            startAt: targetStart,
            status: "HOLD",
            rescheduleSourceBookingId: { not: null },
          },
        }),
        1,
      );

      const winner =
        hold.rescheduleSourceBookingId === sourceAId ? sourceA : sourceB;
      const loser = winner.id === sourceAId ? sourceB : sourceA;
      assert.equal(
        (await first.booking.findUniqueOrThrow({ where: { id: winner.id } }))
          .status,
        "CONFIRMED",
      );
      assert.equal(
        (await first.booking.findUniqueOrThrow({ where: { id: loser.id } }))
          .status,
        "CONFIRMED",
      );
      assert.equal(
        (
          await first.booking.findUniqueOrThrow({ where: { id: loser.id } })
        ).startAt.getTime(),
        loser.startAt.getTime(),
      );
      assert.equal(
        await first.booking.count({
          where: {
            status: { in: activeStatuses },
            startAt: { in: [winner.startAt, targetStart] },
          },
        }),
        2,
        "winner owns original and target before commit",
      );

      const winnerPersistence =
        winner.id === sourceAId ? firstPersistence : secondPersistence;
      await winnerPersistence.commitTarget({
        source: winner,
        hold,
        meetingUrl: winner.meetingUrl,
        now: new Date("2044-01-01T10:01:00.000Z"),
      });
      const moved = await first.booking.findUniqueOrThrow({
        where: { id: winner.id },
      });
      const protectedLoser = await first.booking.findUniqueOrThrow({
        where: { id: loser.id },
      });
      const retired = await first.booking.findUniqueOrThrow({
        where: { id: hold.id },
      });
      assert.equal(moved.startAt.getTime(), targetStart.getTime());
      assert.equal(moved.stripePaymentIntentId, winner.stripePaymentIntentId);
      assert.equal(
        moved.stripeCheckoutSessionId,
        winner.stripeCheckoutSessionId,
      );
      assert.equal(protectedLoser.startAt.getTime(), loser.startAt.getTime());
      assert.equal(
        protectedLoser.stripePaymentIntentId,
        loser.stripePaymentIntentId,
      );
      assert.equal(retired.status, "CANCELLED");
      assert.equal(retired.rescheduleSourceBookingId, null);
      assert.equal(
        await first.booking.count({
          where: {
            stripeCheckoutSessionId: { startsWith: "cs_test_reschedule_" },
          },
        }),
        2,
      );
      assert.equal(
        await first.booking.count({
          where: {
            stripeRefundId: { not: null },
            id: { in: [sourceAId, sourceBId] },
          },
        }),
        0,
      );
    } finally {
      await first.booking.deleteMany({
        where: { OR: [{ id: { in: ids } }, { startAt: targetStart }] },
      });
      await Promise.all([first.$disconnect(), second.$disconnect()]);
    }
  },
);

test(
  "manual Calendar drift before reschedule PATCH retains the target hold and original database time",
  { skip },
  async () => {
    const db = client();
    const sourceId = "5a449655-7be3-432c-a124-b769e10b5307";
    const sourceStart = new Date("2044-01-18T10:00:00.000Z");
    const sourceEnd = new Date("2044-01-18T10:55:00.000Z");
    const target = {
      date: "2044-01-19",
      startAt: "2044-01-19T10:00:00.000Z",
      endAt: "2044-01-19T10:55:00.000Z",
    };
    const now = new Date("2044-01-01T10:00:00.000Z");
    let updateCalls = 0;

    try {
      await db.booking.deleteMany({
        where: {
          OR: [
            { id: sourceId },
            { rescheduleSourceBookingId: sourceId },
            { startAt: new Date(target.startAt) },
          ],
        },
      });
      await db.booking.create({
        data: bookingData({
          id: sourceId,
          startAt: sourceStart,
          endAt: sourceEnd,
          stripeCheckoutSessionId: "cs_test_manual_drift",
          stripePaymentIntentId: "pi_test_manual_drift",
          calendarEventId: "evt_test_manual_drift",
          meetingUrl: "https://meet.google.com/man-ual-drift",
        }),
      });
      const persistence = createBookingReschedulePersistence(db);
      await assert.rejects(
        () =>
          rescheduleBooking(sourceId, { startAt: target.startAt }, now, {
            persistence,
            getAvailableSlots: async () => [target],
            rescheduleCalendarEvent: (source, hold) =>
              rescheduleBookingCalendarEvent(source, hold, {
                getCredentials: async () => ({
                  calendarId: "drift-calendar@example.test",
                  refreshToken: "drift-refresh-token",
                  grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
                }),
                getOAuthConfig: async () => ({
                  clientId: "client-id",
                  clientSecret: "client-secret",
                }),
                refreshAccessToken: async () => ({
                  accessToken: "fresh-drift-access-token",
                }),
                getEvent: async () => ({
                  id: source.calendarEventId,
                  extendedProperties: {
                    private: { bookingId: source.id },
                  },
                  start: {
                    dateTime: "2044-01-20T10:00:00.000Z",
                    timeZone: "Europe/London",
                  },
                  end: {
                    dateTime: "2044-01-20T10:55:00.000Z",
                    timeZone: "Europe/London",
                  },
                }),
                updateEvent: async () => {
                  updateCalls += 1;
                  throw new Error("PATCH must not be submitted for drift");
                },
              }),
            getNow: () => new Date("2044-01-01T10:00:01.000Z"),
          }),
        (error) =>
          error instanceof BookingRescheduleError &&
          error.code === "reconciliation_pending",
      );
      assert.equal(updateCalls, 0);
      const source = await db.booking.findUniqueOrThrow({
        where: { id: sourceId },
      });
      assert.equal(source.status, "CONFIRMED");
      assert.equal(source.startAt.getTime(), sourceStart.getTime());
      assert.equal(source.endAt.getTime(), sourceEnd.getTime());
      assert.equal(source.stripePaymentIntentId, "pi_test_manual_drift");
      const hold = await db.booking.findUniqueOrThrow({
        where: { rescheduleSourceBookingId: sourceId },
      });
      assert.equal(hold.status, "HOLD");
      assert.equal(hold.startAt.toISOString(), target.startAt);
      assert.equal(hold.stripeCheckoutSessionId, null);
      assert.equal(hold.stripePaymentIntentId, null);
      assert.equal(hold.stripeRefundId, null);
    } finally {
      await db.booking.deleteMany({
        where: {
          OR: [{ id: sourceId }, { rescheduleSourceBookingId: sourceId }],
        },
      });
      await db.$disconnect();
    }
  },
);
