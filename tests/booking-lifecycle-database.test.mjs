import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

import { getAvailableSlots } from "../src/lib/availability/available-slots.mjs";
import { getActiveBookingConflicts } from "../src/lib/availability/booking-conflicts.mjs";
import { getProviderCandidateSlotsForDate } from "../src/lib/availability/candidate-slots.mjs";
import { PROVIDER_AVAILABILITY_CONFIG } from "../src/lib/availability/provider-config.mjs";
import { createHoldPersistence } from "../src/lib/booking/booking-hold.mjs";
import {
  createBookingCheckout,
  createCheckoutPersistence,
} from "../src/lib/booking/stripe-checkout.mjs";
import {
  createStripeWebhookPersistence,
  processStripeWebhookEvent,
} from "../src/lib/booking/stripe-webhook.mjs";
import {
  GOOGLE_EVENTS_OWNED_SCOPE,
  googleEventIdForBooking,
  reconcileBookingCalendarEvent,
} from "../src/lib/calendar/booking-event.mjs";

const schemaTestUrl = process.env.DATABASE_SCHEMA_TEST_URL;
const applicationUrl = process.env.DATABASE_URL;
const databaseConfigured = Boolean(
  schemaTestUrl && applicationUrl && schemaTestUrl === applicationUrl,
);
const databaseSkipReason =
  !schemaTestUrl || !applicationUrl
    ? "DATABASE_SCHEMA_TEST_URL and DATABASE_URL are required"
    : schemaTestUrl !== applicationUrl
      ? "DATABASE_SCHEMA_TEST_URL and DATABASE_URL must be identical"
      : false;

test(
  "persists one booking through HOLD → Checkout → CONFIRMED and keeps its slot unavailable",
  { skip: databaseConfigured ? false : databaseSkipReason },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: schemaTestUrl }),
    });
    const now = new Date("2040-01-02T12:00:00.000Z");
    const acceptedAt = new Date("2040-01-02T11:59:00.000Z");
    const providerDate = "2040-01-09";
    const checkoutSessionId = "cs_test_lifecycle";
    const paymentIntentId = "pi_test_lifecycle";
    const meetingUrl = "https://meet.google.com/abc-defg-hij";
    let bookingId;
    let calendarInsertCount = 0;
    let confirmationEmailCount = 0;
    const databaseModule = await mock.module("../src/lib/db.ts", {
      namedExports: { db },
    });
    const availabilityDependencies = {
      getCandidates: getProviderCandidateSlotsForDate,
      getBookingConflicts: getActiveBookingConflicts,
      getCalendarBusyPeriods: async () => [],
    };

    try {
      const initiallyAvailable = await getAvailableSlots(
        { fromDate: providerDate, toDate: providerDate, now },
        availabilityDependencies,
      );
      assert.ok(
        initiallyAvailable.length >= 1,
        "test date must expose an available provider slot",
      );
      const selectedSlot = initiallyAvailable[0];
      const comparisonSlot = initiallyAvailable[1];

      const hold = await createHoldPersistence(db)({
        name: "Lifecycle Listener",
        email: "lifecycle-listener@example.test",
        startAt: new Date(selectedSlot.startAt),
        endAt: new Date(selectedSlot.endAt),
        timezone: PROVIDER_AVAILABILITY_CONFIG.timezone,
        expiresAt: new Date(now.getTime() + 15 * 60_000),
        boundariesAcceptedAt: acceptedAt,
        now,
      });
      bookingId = hold.id;

      const initial = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(initial.status, "HOLD");
      assert.equal(initial.stripeCheckoutSessionId, null);
      assert.equal(initial.stripePaymentIntentId, null);
      assert.equal(initial.calendarEventId, null);
      assert.equal(initial.meetingUrl, null);
      assert.equal(initial.confirmationEmailSentAt, null);
      assert.equal(
        initial.boundariesAcceptedAt.toISOString(),
        acceptedAt.toISOString(),
      );

      const checkoutExpiry = new Date(now.getTime() + 31 * 60_000);
      const stripeCreateCalls = [];
      const stripe = {
        checkout: {
          sessions: {
            create: async (input, options) => {
              stripeCreateCalls.push({ input, options });
              return {
                id: checkoutSessionId,
                object: "checkout.session",
                status: "open",
                url: "https://checkout.stripe.com/c/pay/lifecycle",
                expires_at: Math.floor(checkoutExpiry.getTime() / 1000),
              };
            },
            expire: async () =>
              assert.fail(
                "the successful Checkout Session must not be expired",
              ),
          },
        },
      };
      await createBookingCheckout({ bookingId }, now, {
        persistence: createCheckoutPersistence(db),
        stripe,
        appUrl: "https://booking.example.test",
        getNow: () => now,
      });
      assert.equal(stripeCreateCalls.length, 1);
      assert.equal(stripeCreateCalls[0].input.client_reference_id, bookingId);
      assert.equal(stripeCreateCalls[0].input.metadata.bookingId, bookingId);
      assert.equal(
        stripeCreateCalls[0].options.idempotencyKey,
        `booking-checkout:${bookingId}`,
      );

      const withCheckout = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(withCheckout.id, initial.id);
      assert.equal(withCheckout.status, "HOLD");
      assert.equal(withCheckout.stripeCheckoutSessionId, checkoutSessionId);
      assert.equal(
        withCheckout.boundariesAcceptedAt.toISOString(),
        acceptedAt.toISOString(),
      );
      assert.equal(await db.booking.count({ where: { id: bookingId } }), 1);

      const paidEvent = {
        id: "evt_test_lifecycle",
        type: "checkout.session.completed",
        data: {
          object: {
            object: "checkout.session",
            id: withCheckout.stripeCheckoutSessionId,
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

      await processStripeWebhookEvent(
        paidEvent,
        createStripeWebhookPersistence(db),
        async (paidBooking) => {
          const persistedPaid = await db.booking.findUniqueOrThrow({
            where: { id: bookingId },
          });
          assert.equal(persistedPaid.id, initial.id);
          assert.equal(persistedPaid.status, "PAID");
          assert.equal(
            persistedPaid.stripeCheckoutSessionId,
            checkoutSessionId,
          );
          assert.equal(persistedPaid.stripePaymentIntentId, paymentIntentId);
          assert.equal(
            persistedPaid.boundariesAcceptedAt.toISOString(),
            acceptedAt.toISOString(),
          );

          return reconcileBookingCalendarEvent(paidBooking, {
            getCredentials: async () => ({
              calendarId: "lifecycle-calendar@example.test",
              refreshToken: "fake-lifecycle-refresh-token",
              grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
            }),
            getOAuthConfig: async () => ({
              clientId: "fake-lifecycle-client-id",
              clientSecret: "fake-lifecycle-client-secret",
            }),
            refreshAccessToken: async (input) => {
              assert.equal(input.refreshToken, "fake-lifecycle-refresh-token");
              return { accessToken: "fake-lifecycle-access-token" };
            },
            insertEvent: async ({ accessToken, calendarId, event }) => {
              calendarInsertCount += 1;
              assert.equal(accessToken, "fake-lifecycle-access-token");
              assert.equal(calendarId, "lifecycle-calendar@example.test");
              assert.equal(event.id, googleEventIdForBooking(bookingId));
              assert.equal(
                event.extendedProperties.private.bookingId,
                bookingId,
              );
              assert.equal(event.start.dateTime, initial.startAt.toISOString());
              assert.equal(event.end.dateTime, initial.endAt.toISOString());
              assert.equal(event.start.timeZone, initial.timezone);
              assert.deepEqual(event.attendees, [{ email: initial.email }]);
              return {
                ...event,
                hangoutLink: meetingUrl,
                conferenceData: {
                  createRequest: { status: { statusCode: "success" } },
                  entryPoints: [{ entryPointType: "video", uri: meetingUrl }],
                },
              };
            },
            getEvent: async () =>
              assert.fail("successful insert must not fetch an existing event"),
          });
        },
        async (confirmedBooking) => {
          confirmationEmailCount += 1;
          const persistedConfirmed = await db.booking.findUniqueOrThrow({
            where: { id: bookingId },
          });
          assert.equal(persistedConfirmed.status, "CONFIRMED");
          assert.equal(confirmedBooking.email, initial.email);
          assert.equal(confirmedBooking.meetingUrl, meetingUrl);
          return { messageId: "email_lifecycle" };
        },
      );

      const confirmed = await db.booking.findUniqueOrThrow({
        where: { id: bookingId },
      });
      assert.equal(confirmed.status, "CONFIRMED");
      assert.equal(confirmed.stripeCheckoutSessionId, checkoutSessionId);
      assert.equal(confirmed.stripePaymentIntentId, paymentIntentId);
      assert.equal(
        confirmed.calendarEventId,
        googleEventIdForBooking(bookingId),
      );
      assert.equal(confirmed.meetingUrl, meetingUrl);
      assert.ok(confirmed.confirmationEmailSentAt instanceof Date);
      assert.equal(confirmed.confirmationEmailId, "email_lifecycle");
      assert.equal(
        confirmed.boundariesAcceptedAt.toISOString(),
        acceptedAt.toISOString(),
      );
      assert.equal(confirmationEmailCount, 1);
      assert.equal(calendarInsertCount, 1);
      assert.equal(confirmed.id, initial.id);
      assert.equal(
        confirmed.startAt.toISOString(),
        initial.startAt.toISOString(),
      );
      assert.equal(confirmed.endAt.toISOString(), initial.endAt.toISOString());
      assert.equal(confirmed.timezone, initial.timezone);
      assert.equal(confirmed.email, initial.email);
      assert.equal(await db.booking.count({ where: { id: bookingId } }), 1);

      const available = await getAvailableSlots(
        { fromDate: providerDate, toDate: providerDate, now },
        availabilityDependencies,
      );
      assert.equal(
        available.some(
          (slot) => slot.startAt === confirmed.startAt.toISOString(),
        ),
        false,
      );
      if (comparisonSlot) {
        assert.equal(
          available.some((slot) => slot.startAt === comparisonSlot.startAt),
          true,
        );
      }
    } finally {
      if (bookingId) await db.booking.deleteMany({ where: { id: bookingId } });
      databaseModule.restore();
      await db.$disconnect();
    }
  },
);
