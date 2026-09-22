import assert from "node:assert/strict";
import test from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

import {
  createHoldPersistence,
  isActiveSlotUniqueConflict,
} from "../src/lib/booking/booking-hold.mjs";
import {
  createStripeWebhookPersistence,
  processStripeWebhookEvent,
} from "../src/lib/booking/stripe-webhook.mjs";

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;

test(
  "accepted public HOLD stores server consent time and preserves it through payment",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const startAt = new Date("2039-01-04T10:00:00.000Z");
    const now = new Date("2039-01-03T10:00:00.000Z");
    try {
      const hold = await createHoldPersistence(db)({
        name: "Consent Test",
        email: "consent@example.test",
        startAt,
        endAt: new Date("2039-01-04T10:55:00.000Z"),
        timezone: "Europe/London",
        expiresAt: new Date("2039-01-03T10:15:00.000Z"),
        boundariesAcceptedAt: now,
        now,
      });
      const persisted = await db.booking.findUniqueOrThrow({
        where: { id: hold.id },
      });
      assert.equal(
        persisted.boundariesAcceptedAt.toISOString(),
        now.toISOString(),
      );

      await db.booking.update({
        where: { id: hold.id },
        data: { status: "PAID" },
      });
      const paid = await db.booking.findUniqueOrThrow({
        where: { id: hold.id },
      });
      assert.equal(paid.boundariesAcceptedAt.toISOString(), now.toISOString());
    } finally {
      await db.booking.deleteMany({ where: { startAt } });
      await db.$disconnect();
    }
  },
);

test(
  "Prisma exposes the active-slot partial-index collision and the classifier recognizes it",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const data = {
      name: "Race Test",
      email: "race@example.com",
      startAt: new Date("2036-01-07T10:00:00.000Z"),
      endAt: new Date("2036-01-07T10:55:00.000Z"),
      timezone: "Europe/London",
      status: "HOLD",
      expiresAt: new Date("2036-01-06T10:15:00.000Z"),
      createdAt: new Date("2036-01-06T10:00:00.000Z"),
    };

    try {
      await assert.rejects(
        db.$transaction(async (transaction) => {
          await transaction.booking.create({ data });
          await transaction.booking.create({ data });
        }),
        (error) => {
          assert.equal(error.code, "P2002");
          assert.equal(
            error.meta?.driverAdapterError?.cause?.constraint?.index,
            "bookings_active_start_at_key",
          );
          assert.equal(isActiveSlotUniqueConflict(error), true);
          return true;
        },
      );
    } finally {
      await db.$disconnect();
    }
  },
);

test(
  "expired Checkout-backed HOLD cannot be reclaimed before Stripe resolves payment",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const originalId = "5a449655-7be3-432c-a124-b769e10b50b1";
    const startAt = new Date("2038-01-04T10:00:00.000Z");
    const endAt = new Date("2038-01-04T10:55:00.000Z");
    const now = new Date("2038-01-03T11:00:00.000Z");
    try {
      await db.booking.create({
        data: {
          id: originalId,
          name: "Paid Race",
          email: "paid-race@example.com",
          startAt,
          endAt,
          timezone: "Europe/London",
          status: "HOLD",
          stripeCheckoutSessionId: "cs_db_race",
          expiresAt: new Date("2038-01-03T10:59:00.000Z"),
          createdAt: new Date("2038-01-03T10:00:00.000Z"),
        },
      });

      await assert.rejects(
        createHoldPersistence(db)({
          name: "Second Customer",
          email: "second@example.com",
          startAt,
          endAt,
          timezone: "Europe/London",
          expiresAt: new Date("2038-01-03T11:15:00.000Z"),
          now,
        }),
        (error) => isActiveSlotUniqueConflict(error),
      );
      assert.equal(
        (await db.booking.findUnique({ where: { id: originalId } })).status,
        "HOLD",
      );

      await processStripeWebhookEvent(
        {
          type: "checkout.session.completed",
          data: {
            object: {
              object: "checkout.session",
              id: "cs_db_race",
              client_reference_id: originalId,
              metadata: { bookingId: originalId },
              mode: "payment",
              payment_status: "paid",
              amount_total: 5500,
              currency: "gbp",
              payment_intent: "pi_db_race",
            },
          },
        },
        createStripeWebhookPersistence(db),
      );
      const paid = await db.booking.findUnique({ where: { id: originalId } });
      assert.equal(paid.status, "PAID");
      assert.equal(paid.stripePaymentIntentId, "pi_db_race");
      await assert.rejects(
        db.booking.create({
          data: {
            name: "Third Customer",
            email: "third@example.com",
            startAt,
            endAt,
            timezone: "Europe/London",
            status: "HOLD",
            expiresAt: new Date("2038-01-03T11:15:00.000Z"),
          },
        }),
        (error) => isActiveSlotUniqueConflict(error),
      );
    } finally {
      await db.booking.deleteMany({ where: { startAt } });
      await db.$disconnect();
    }
  },
);

test(
  "authoritative Checkout expiry releases an expired Checkout-backed HOLD",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const originalId = "5a449655-7be3-432c-a124-b769e10b50b2";
    const startAt = new Date("2038-01-04T12:00:00.000Z");
    const endAt = new Date("2038-01-04T12:55:00.000Z");
    const now = new Date("2038-01-03T11:00:00.000Z");
    try {
      await db.booking.create({
        data: {
          id: originalId,
          name: "Expired Checkout",
          email: "expired-checkout@example.com",
          startAt,
          endAt,
          timezone: "Europe/London",
          status: "HOLD",
          stripeCheckoutSessionId: "cs_db_release",
          expiresAt: new Date("2038-01-03T10:59:00.000Z"),
          createdAt: new Date("2038-01-03T10:00:00.000Z"),
        },
      });
      await processStripeWebhookEvent(
        {
          type: "checkout.session.expired",
          data: {
            object: {
              object: "checkout.session",
              id: "cs_db_release",
              client_reference_id: originalId,
              metadata: { bookingId: originalId },
              payment_status: "unpaid",
            },
          },
        },
        createStripeWebhookPersistence(db),
      );
      assert.equal(
        (await db.booking.findUnique({ where: { id: originalId } })).status,
        "CANCELLED",
      );
      const replacement = await createHoldPersistence(db)({
        name: "Replacement",
        email: "replacement@example.com",
        startAt,
        endAt,
        timezone: "Europe/London",
        expiresAt: new Date("2038-01-03T11:15:00.000Z"),
        now,
      });
      assert.ok(replacement.id);
    } finally {
      await db.booking.deleteMany({ where: { startAt } });
      await db.$disconnect();
    }
  },
);

test(
  "expired reschedule-linked HOLD cannot be reclaimed by ordinary hold cleanup",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const sourceId = "5a449655-7be3-432c-a124-b769e10b50b3";
    const holdId = "5a449655-7be3-432c-a124-b769e10b50b4";
    const sourceStart = new Date("2038-01-05T10:00:00.000Z");
    const targetStart = new Date("2038-01-06T10:00:00.000Z");
    const targetEnd = new Date("2038-01-06T10:55:00.000Z");
    const now = new Date("2038-01-03T11:00:00.000Z");
    try {
      await db.booking.create({
        data: {
          id: sourceId,
          name: "Confirmed Source",
          email: "source@example.test",
          startAt: sourceStart,
          endAt: new Date("2038-01-05T10:55:00.000Z"),
          timezone: "Europe/London",
          status: "CONFIRMED",
          expiresAt: new Date("2038-01-03T10:30:00.000Z"),
          createdAt: new Date("2038-01-03T10:00:00.000Z"),
        },
      });
      await db.booking.create({
        data: {
          id: holdId,
          name: "Confirmed Source",
          email: "source@example.test",
          startAt: targetStart,
          endAt: targetEnd,
          timezone: "Europe/London",
          status: "HOLD",
          rescheduleSourceBookingId: sourceId,
          expiresAt: new Date("2038-01-03T10:59:00.000Z"),
          createdAt: new Date("2038-01-03T10:00:00.000Z"),
        },
      });
      await assert.rejects(
        createHoldPersistence(db)({
          name: "Competitor",
          email: "competitor@example.test",
          startAt: targetStart,
          endAt: targetEnd,
          timezone: "Europe/London",
          expiresAt: new Date("2038-01-03T11:15:00.000Z"),
          now,
        }),
        (error) => isActiveSlotUniqueConflict(error),
      );
      assert.equal(
        (await db.booking.findUniqueOrThrow({ where: { id: holdId } })).status,
        "HOLD",
      );
    } finally {
      await db.booking.deleteMany({
        where: { id: { in: [holdId, sourceId] } },
      });
      await db.$disconnect();
    }
  },
);

test(
  "Stripe webhook persistence transitions HOLD to PAID and unpaid HOLD to CANCELLED",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    const base = {
      name: "Stripe Lifecycle",
      email: "stripe-lifecycle@example.com",
      timezone: "Europe/London",
      status: "HOLD",
      expiresAt: new Date("2037-01-01T10:30:00.000Z"),
      createdAt: new Date("2037-01-01T10:00:00.000Z"),
    };
    const paidId = "5a449655-7be3-432c-a124-b769e10b50a1";
    const cancelledId = "5a449655-7be3-432c-a124-b769e10b50a2";
    try {
      await db.booking.createMany({
        data: [
          {
            ...base,
            id: paidId,
            startAt: new Date("2037-01-02T10:00:00Z"),
            endAt: new Date("2037-01-02T10:55:00Z"),
            stripeCheckoutSessionId: "cs_db_paid",
          },
          {
            ...base,
            id: cancelledId,
            startAt: new Date("2037-01-02T12:00:00Z"),
            endAt: new Date("2037-01-02T12:55:00Z"),
            stripeCheckoutSessionId: "cs_db_expired",
          },
        ],
      });
      const persistence = createStripeWebhookPersistence(db);
      await processStripeWebhookEvent(
        {
          type: "checkout.session.completed",
          data: {
            object: {
              object: "checkout.session",
              id: "cs_db_paid",
              client_reference_id: paidId,
              metadata: { bookingId: paidId },
              mode: "payment",
              payment_status: "paid",
              amount_total: 5500,
              currency: "gbp",
              payment_intent: "pi_db_paid",
            },
          },
        },
        persistence,
      );
      await processStripeWebhookEvent(
        {
          type: "checkout.session.expired",
          data: {
            object: {
              object: "checkout.session",
              id: "cs_db_expired",
              client_reference_id: cancelledId,
              metadata: { bookingId: cancelledId },
              payment_status: "unpaid",
            },
          },
        },
        persistence,
      );
      const [paid, cancelled] = await Promise.all([
        db.booking.findUnique({ where: { id: paidId } }),
        db.booking.findUnique({ where: { id: cancelledId } }),
      ]);
      assert.equal(paid.status, "PAID");
      assert.equal(paid.stripePaymentIntentId, "pi_db_paid");
      assert.equal(cancelled.status, "CANCELLED");
    } finally {
      await db.booking.deleteMany({
        where: { id: { in: [paidId, cancelledId] } },
      });
      await db.$disconnect();
    }
  },
);
