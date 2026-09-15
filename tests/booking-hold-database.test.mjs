import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

import { isActiveSlotUniqueConflict } from '../src/lib/booking/booking-hold.mjs';
import { createStripeWebhookPersistence, processStripeWebhookEvent } from '../src/lib/booking/stripe-webhook.mjs';

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;

test(
  'Prisma exposes the active-slot partial-index collision and the classifier recognizes it',
  { skip: connectionString ? false : 'DATABASE_SCHEMA_TEST_URL is not configured' },
  async () => {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const data = {
      name: 'Race Test',
      email: 'race@example.com',
      startAt: new Date('2036-01-07T10:00:00.000Z'),
      endAt: new Date('2036-01-07T10:55:00.000Z'),
      timezone: 'Europe/London',
      status: 'HOLD',
      expiresAt: new Date('2036-01-06T10:15:00.000Z'),
      createdAt: new Date('2036-01-06T10:00:00.000Z'),
    };

    try {
      await assert.rejects(
        db.$transaction(async (transaction) => {
          await transaction.booking.create({ data });
          await transaction.booking.create({ data });
        }),
        (error) => {
          assert.equal(error.code, 'P2002');
          assert.equal(
            error.meta?.driverAdapterError?.cause?.constraint?.index,
            'bookings_active_start_at_key',
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
  'Stripe webhook persistence transitions HOLD to PAID and unpaid HOLD to CANCELLED',
  { skip: connectionString ? false : 'DATABASE_SCHEMA_TEST_URL is not configured' },
  async () => {
    const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const base = {
      name: 'Stripe Lifecycle', email: 'stripe-lifecycle@example.com', timezone: 'Europe/London', status: 'HOLD',
      expiresAt: new Date('2037-01-01T10:30:00.000Z'), createdAt: new Date('2037-01-01T10:00:00.000Z'),
    };
    const paidId = '5a449655-7be3-432c-a124-b769e10b50a1';
    const cancelledId = '5a449655-7be3-432c-a124-b769e10b50a2';
    try {
      await db.booking.createMany({ data: [
        { ...base, id: paidId, startAt: new Date('2037-01-02T10:00:00Z'), endAt: new Date('2037-01-02T10:55:00Z'), stripeCheckoutSessionId: 'cs_db_paid' },
        { ...base, id: cancelledId, startAt: new Date('2037-01-02T12:00:00Z'), endAt: new Date('2037-01-02T12:55:00Z'), stripeCheckoutSessionId: 'cs_db_expired' },
      ] });
      const persistence = createStripeWebhookPersistence(db);
      await processStripeWebhookEvent({ type: 'checkout.session.completed', data: { object: {
        object: 'checkout.session', id: 'cs_db_paid', client_reference_id: paidId, metadata: { bookingId: paidId },
        mode: 'payment', payment_status: 'paid', amount_total: 5500, currency: 'gbp', payment_intent: 'pi_db_paid',
      } } }, persistence);
      await processStripeWebhookEvent({ type: 'checkout.session.expired', data: { object: {
        object: 'checkout.session', id: 'cs_db_expired', client_reference_id: cancelledId,
        metadata: { bookingId: cancelledId }, payment_status: 'unpaid',
      } } }, persistence);
      const [paid, cancelled] = await Promise.all([
        db.booking.findUnique({ where: { id: paidId } }), db.booking.findUnique({ where: { id: cancelledId } }),
      ]);
      assert.equal(paid.status, 'PAID');
      assert.equal(paid.stripePaymentIntentId, 'pi_db_paid');
      assert.equal(cancelled.status, 'CANCELLED');
    } finally {
      await db.booking.deleteMany({ where: { id: { in: [paidId, cancelledId] } } });
      await db.$disconnect();
    }
  },
);
