import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

import { getActiveBookingConflicts } from "../src/lib/availability/booking-conflicts.mjs";
import {
  createBookingCancellationPersistence,
  reconcileCancelledBooking,
} from "../src/lib/booking/booking-cancellation.mjs";
import {
  createBookingReconciliationPersistence,
  runBookingReconciliation,
} from "../src/lib/booking/booking-reconciliation.mjs";
import {
  createBookingReschedulePersistence,
  reconcilePendingReschedule,
} from "../src/lib/booking/booking-reschedule.mjs";
import {
  createStripeWebhookPersistence,
  processStripeWebhookEvent,
} from "../src/lib/booking/stripe-webhook.mjs";
import {
  CalendarManagementError,
  GOOGLE_EVENTS_OWNED_SCOPE,
  googleEventIdForBooking,
  reconcileBookingCalendarEvent,
} from "../src/lib/calendar/booking-event.mjs";
import { GoogleApiError } from "../src/lib/google-calendar/google-api.mjs";

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;
const skip = connectionString
  ? false
  : "DATABASE_SCHEMA_TEST_URL is not configured";
const now = new Date("2046-01-01T10:00:00.000Z");
const meetingUrl = "https://meet.google.com/rec-over-ydb";

function client() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

function data(id, startAt, overrides = {}) {
  return {
    id,
    name: "Database Recovery Listener",
    email: `${id}@example.test`,
    startAt,
    endAt: new Date(startAt.getTime() + 55 * 60_000),
    timezone: "Europe/London",
    status: "PAID",
    stripeCheckoutSessionId: `cs_${id}`,
    stripePaymentIntentId: `pi_${id}`,
    expiresAt: new Date("2046-01-01T09:00:00.000Z"),
    createdAt: new Date("2046-01-01T08:00:00.000Z"),
    ...overrides,
  };
}

function scopedPersistence(database, candidates = {}) {
  const base = createBookingReconciliationPersistence(database);
  return {
    findBooking: base.findBooking,
    listPaid: async () => candidates.paid ?? [],
    listConfirmationEmail: async () => candidates.confirmationEmail ?? [],
    listCheckoutHolds: async () => candidates.checkoutHold ?? [],
    listCancellations: async () => candidates.cancellation ?? [],
    listReschedules: async () => candidates.reschedule ?? [],
  };
}

function runnerDependencies(database, persistence, overrides = {}) {
  return {
    persistence,
    stripePersistence: createStripeWebhookPersistence(database),
    stripe: overrides.stripe ?? {
      checkout: {
        sessions: {
          retrieve: async () => assert.fail("unexpected Stripe call"),
        },
      },
    },
    finalizeCalendar:
      overrides.finalizeCalendar ??
      (async (booking) => ({
        calendarEventId: googleEventIdForBooking(booking.id),
        meetingUrl,
      })),
    sendConfirmationEmail:
      overrides.sendConfirmationEmail ??
      (async (booking) => ({ messageId: `email_${booking.id}` })),
    releaseActiveHoldPermit:
      overrides.releaseActiveHoldPermit ?? (async () => {}),
    reconcileCancellation:
      overrides.reconcileCancellation ??
      (async () => assert.fail("unexpected cancellation")),
    reconcileReschedule:
      overrides.reconcileReschedule ??
      (async () => assert.fail("unexpected reschedule")),
    getNow: () => now,
    logger: { warn: () => {} },
  };
}

test(
  "scheduled PAID recovery reuses deterministic Calendar events and remains idempotent",
  { skip },
  async () => {
    const db = client();
    const firstId = "5a449655-7be3-432c-a124-b769e10b5501";
    const secondId = "5a449655-7be3-432c-a124-b769e10b5502";
    const ids = [firstId, secondId];
    const firstStart = new Date("2046-01-03T10:00:00.000Z");
    const secondStart = new Date("2046-01-04T10:00:00.000Z");
    const remote = new Map();
    let logicalCreates = 0;
    let emailSends = 0;
    try {
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.booking.createMany({
        data: [data(firstId, firstStart), data(secondId, secondStart)],
      });
      const preexisting = data(secondId, secondStart);
      remote.set(googleEventIdForBooking(secondId), {
        id: googleEventIdForBooking(secondId),
        start: {
          dateTime: preexisting.startAt.toISOString(),
          timeZone: preexisting.timezone,
        },
        end: {
          dateTime: preexisting.endAt.toISOString(),
          timeZone: preexisting.timezone,
        },
        attendees: [{ email: preexisting.email }],
        extendedProperties: { private: { bookingId: secondId } },
        hangoutLink: meetingUrl,
        conferenceData: {
          createRequest: { status: { statusCode: "success" } },
        },
      });
      const calendar = (booking) =>
        reconcileBookingCalendarEvent(booking, {
          getCredentials: async () => ({
            calendarId: "recovery@example.test",
            refreshToken: "refresh-token",
            grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
          }),
          getOAuthConfig: async () => ({
            clientId: "client-id",
            clientSecret: "client-secret",
          }),
          refreshAccessToken: async () => ({ accessToken: "access-token" }),
          insertEvent: async ({ event }) => {
            if (remote.has(event.id)) throw new GoogleApiError("conflict");
            logicalCreates += 1;
            const stored = {
              ...event,
              hangoutLink: meetingUrl,
              conferenceData: {
                createRequest: { status: { statusCode: "success" } },
              },
            };
            remote.set(event.id, stored);
            return stored;
          },
          getEvent: async ({ eventId }) => remote.get(eventId),
        });
      const paid = await db.booking.findMany({ where: { id: { in: ids } } });
      const persistence = scopedPersistence(db, { paid });
      const dependencies = runnerDependencies(db, persistence, {
        finalizeCalendar: calendar,
        sendConfirmationEmail: async (booking) => {
          emailSends += 1;
          return { messageId: `email_${booking.id}` };
        },
      });
      const result = await runBookingReconciliation(now, dependencies);
      assert.equal(result.recovered, 2);
      const confirmed = await db.booking.findMany({
        where: { id: { in: ids } },
        orderBy: { id: "asc" },
      });
      assert.deepEqual(
        confirmed.map(({ status }) => status),
        ["CONFIRMED", "CONFIRMED"],
      );
      assert.equal(logicalCreates, 1, "pre-existing event must be reused");
      assert.equal(remote.size, 2);
      assert.equal(emailSends, 2);

      const replay = await runBookingReconciliation(
        now,
        runnerDependencies(db, scopedPersistence(db)),
      );
      assert.equal(replay.scanned, 0);
      assert.equal(remote.size, 2);
      const conflicts = await getActiveBookingConflicts(
        {
          from: firstStart,
          to: new Date(secondStart.getTime() + 55 * 60_000),
          now,
        },
        db,
      );
      assert.equal(conflicts.length, 2);
    } finally {
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.$disconnect();
    }
  },
);

test(
  "concurrent webhook and scheduled recovery converge on one external booking result",
  { skip },
  async () => {
    const db = client();
    const id = "5a449655-7be3-432c-a124-b769e10b5503";
    const startAt = new Date("2046-01-14T10:00:00.000Z");
    const sessionId = `cs_${id}`;
    const paymentIntentId = `pi_${id}`;
    let arrivals = 0;
    let release;
    const bothArrived = new Promise((resolve) => {
      release = resolve;
    });
    let remoteEvent;
    let logicalEvents = 0;
    const acceptedEmails = new Map();
    try {
      await db.booking.deleteMany({ where: { id } });
      await db.booking.create({ data: data(id, startAt) });
      const stripePersistence = createStripeWebhookPersistence(db);
      const finalizeCalendar = (current) =>
        reconcileBookingCalendarEvent(current, {
          getCredentials: async () => ({
            calendarId: "concurrent@example.test",
            refreshToken: "refresh-token",
            grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
          }),
          getOAuthConfig: async () => ({
            clientId: "client-id",
            clientSecret: "client-secret",
          }),
          refreshAccessToken: async () => ({ accessToken: "access-token" }),
          insertEvent: async ({ event }) => {
            arrivals += 1;
            if (arrivals === 2) release();
            await bothArrived;
            if (remoteEvent) throw new GoogleApiError("conflict");
            logicalEvents += 1;
            remoteEvent = {
              ...event,
              hangoutLink: meetingUrl,
              conferenceData: {
                createRequest: { status: { statusCode: "success" } },
              },
            };
            return remoteEvent;
          },
          getEvent: async () => remoteEvent,
        });
      const sendEmail = async (current) => {
        const key = `booking-confirmation:${current.id}`;
        if (!acceptedEmails.has(key)) acceptedEmails.set(key, `email_${id}`);
        return { messageId: acceptedEmails.get(key) };
      };
      const candidate = await db.booking.findUniqueOrThrow({ where: { id } });
      const recovery = runBookingReconciliation(
        now,
        runnerDependencies(db, scopedPersistence(db, { paid: [candidate] }), {
          finalizeCalendar,
          sendConfirmationEmail: sendEmail,
        }),
      );
      const webhook = processStripeWebhookEvent(
        {
          type: "checkout.session.completed",
          data: {
            object: {
              object: "checkout.session",
              id: sessionId,
              client_reference_id: id,
              metadata: { bookingId: id },
              mode: "payment",
              payment_status: "paid",
              amount_total: 5500,
              currency: "gbp",
              payment_intent: paymentIntentId,
            },
          },
        },
        stripePersistence,
        finalizeCalendar,
        sendEmail,
      );
      await Promise.all([recovery, webhook]);
      const confirmed = await db.booking.findUniqueOrThrow({ where: { id } });
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(confirmed.calendarEventId, googleEventIdForBooking(id));
      assert.equal(logicalEvents, 1);
      assert.equal(acceptedEmails.size, 1);
      assert.equal(await db.booking.count({ where: { id } }), 1);
    } finally {
      await db.booking.deleteMany({ where: { id } });
      await db.$disconnect();
    }
  },
);

test(
  "expired local Checkout holds use authoritative paid, expired, and unavailable outcomes",
  { skip },
  async () => {
    const db = client();
    const paidId = "5a449655-7be3-432c-a124-b769e10b5511";
    const expiredId = "5a449655-7be3-432c-a124-b769e10b5512";
    const unknownId = "5a449655-7be3-432c-a124-b769e10b5513";
    const ids = [paidId, expiredId, unknownId];
    const starts = [
      new Date("2046-01-05T10:00:00.000Z"),
      new Date("2046-01-06T10:00:00.000Z"),
      new Date("2046-01-07T10:00:00.000Z"),
    ];
    let permitReleases = 0;
    try {
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.booking.createMany({
        data: ids.map((id, index) =>
          data(id, starts[index], {
            status: "HOLD",
            stripePaymentIntentId: null,
          }),
        ),
      });
      const holds = await db.booking.findMany({ where: { id: { in: ids } } });
      const sessions = new Map(
        holds.slice(0, 2).map((hold, index) => [
          hold.stripeCheckoutSessionId,
          {
            object: "checkout.session",
            id: hold.stripeCheckoutSessionId,
            client_reference_id: hold.id,
            metadata: { bookingId: hold.id },
            mode: "payment",
            status: index === 0 ? "complete" : "expired",
            payment_status: index === 0 ? "paid" : "unpaid",
            amount_total: 5500,
            currency: "gbp",
            payment_intent: index === 0 ? `pi_recovered_${paidId}` : null,
          },
        ]),
      );
      const persistence = scopedPersistence(db, { checkoutHold: holds });
      const dependencies = runnerDependencies(db, persistence, {
        stripe: {
          checkout: {
            sessions: {
              retrieve: async (sessionId) => {
                if (!sessions.has(sessionId)) throw new Error("Stripe outage");
                return sessions.get(sessionId);
              },
            },
          },
        },
        releaseActiveHoldPermit: async () => {
          permitReleases += 1;
        },
      });
      const result = await runBookingReconciliation(now, dependencies);
      assert.equal(result.recovered, 2);
      assert.equal(result.deferred, 1);
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: paidId } })).status,
        "CONFIRMED",
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: expiredId } }))
          .status,
        "CANCELLED",
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: unknownId } }))
          .status,
        "HOLD",
      );
      assert.equal(permitReleases, 2);
      const unknownConflicts = await getActiveBookingConflicts(
        {
          from: starts[2],
          to: new Date(starts[2].getTime() + 55 * 60_000),
          now,
        },
        db,
      );
      assert.equal(unknownConflicts.length, 1);
    } finally {
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.$disconnect();
    }
  },
);

test(
  "scheduled cancellation and linked-reschedule cleanup persist safe durable outcomes",
  { skip },
  async () => {
    const db = client();
    const cancelledId = "5a449655-7be3-432c-a124-b769e10b5521";
    const sourceId = "5a449655-7be3-432c-a124-b769e10b5522";
    const holdId = "5a449655-7be3-432c-a124-b769e10b5523";
    const uncertainSourceId = "5a449655-7be3-432c-a124-b769e10b5524";
    const uncertainHoldId = "5a449655-7be3-432c-a124-b769e10b5525";
    const ids = [
      cancelledId,
      sourceId,
      holdId,
      uncertainSourceId,
      uncertainHoldId,
    ];
    const sourceStart = new Date("2046-01-08T10:00:00.000Z");
    const targetStart = new Date("2046-01-09T10:00:00.000Z");
    try {
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.booking.createMany({
        data: [
          data(cancelledId, new Date("2046-01-10T10:00:00.000Z"), {
            status: "CANCELLED",
            calendarEventId: "event_cancelled",
            meetingUrl,
            cancelledAt: now,
            cancellationRefundDue: true,
            stripeRefundStatus: null,
          }),
          data(sourceId, sourceStart, {
            status: "CONFIRMED",
            calendarEventId: "event_source",
            meetingUrl,
          }),
          data(holdId, targetStart, {
            status: "HOLD",
            stripeCheckoutSessionId: null,
            stripePaymentIntentId: null,
            rescheduleSourceBookingId: sourceId,
          }),
          data(uncertainSourceId, new Date("2046-01-11T10:00:00.000Z"), {
            status: "CONFIRMED",
            calendarEventId: "event_uncertain",
            meetingUrl,
          }),
          data(uncertainHoldId, new Date("2046-01-12T10:00:00.000Z"), {
            status: "HOLD",
            stripeCheckoutSessionId: null,
            stripePaymentIntentId: null,
            rescheduleSourceBookingId: uncertainSourceId,
          }),
        ],
      });
      const cancellationPersistence = createBookingCancellationPersistence(db);
      const cancellationDependencies = {
        persistence: cancellationPersistence,
        cancelCalendarEvent: async () => ({ cancelled: true }),
        stripe: {
          refunds: {
            create: async () => ({ id: "re_recovered", status: "succeeded" }),
            retrieve: async () => assert.fail("refund is newly created"),
          },
        },
        getNow: () => now,
      };
      const reschedulePersistence = createBookingReschedulePersistence(db);
      const reschedule = (bookingId) =>
        reconcilePendingReschedule(bookingId, now, {
          persistence: reschedulePersistence,
          rescheduleCalendarEvent: async (source, hold) => {
            if (source.id === uncertainSourceId) {
              throw new CalendarManagementError("provider_unavailable", {
                outcome: "uncertain",
              });
            }
            return { calendarEventId: source.calendarEventId, meetingUrl };
          },
          getNow: () => now,
        });
      const candidates = {
        cancellation: [
          await db.booking.findUniqueOrThrow({ where: { id: cancelledId } }),
        ],
        reschedule: await db.booking.findMany({
          where: { id: { in: [holdId, uncertainHoldId] } },
        }),
      };
      const persistence = scopedPersistence(db, candidates);
      const result = await runBookingReconciliation(
        now,
        runnerDependencies(db, persistence, {
          reconcileCancellation: (id, at) =>
            reconcileCancelledBooking(id, at, cancellationDependencies),
          reconcileReschedule: reschedule,
        }),
      );
      assert.equal(result.recovered, 2);
      assert.equal(result.deferred, 1);
      const cancelled = await db.booking.findUniqueOrThrow({
        where: { id: cancelledId },
      });
      assert.equal(cancelled.status, "REFUNDED");
      assert.ok(cancelled.calendarCancelledAt instanceof Date);
      assert.equal(cancelled.stripeRefundId, "re_recovered");
      const moved = await db.booking.findUniqueOrThrow({
        where: { id: sourceId },
      });
      assert.equal(moved.startAt.getTime(), targetStart.getTime());
      assert.ok(moved.rescheduledAt instanceof Date);
      const retired = await db.booking.findUniqueOrThrow({
        where: { id: holdId },
      });
      assert.equal(retired.status, "CANCELLED");
      assert.equal(retired.rescheduleSourceBookingId, null);
      const retained = await db.booking.findUniqueOrThrow({
        where: { id: uncertainHoldId },
      });
      assert.equal(retained.status, "HOLD");
      assert.equal(retained.rescheduleSourceBookingId, uncertainSourceId);
    } finally {
      await db.booking.deleteMany({ where: { id: { in: ids } } });
      await db.$disconnect();
    }
  },
);
