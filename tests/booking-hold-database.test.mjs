import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';

import { isActiveSlotUniqueConflict } from '../src/lib/booking/booking-hold.mjs';

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
