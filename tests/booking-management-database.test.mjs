import assert from 'node:assert/strict';
import test from 'node:test';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.ts';
import { createBookingCancellationPersistence } from '../src/lib/booking/booking-cancellation.mjs';
import { createBookingReschedulePersistence } from '../src/lib/booking/booking-reschedule.mjs';
import { isActiveSlotUniqueConflict } from '../src/lib/booking/booking-hold.mjs';

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;
const skip = connectionString ? false : 'DATABASE_SCHEMA_TEST_URL is not configured';
const sourceId = '5a449655-7be3-432c-a124-b769e10b5201';
const holdId = '5a449655-7be3-432c-a124-b769e10b5202';
const competingId = '5a449655-7be3-432c-a124-b769e10b5203';
const originalStart = new Date('2042-01-06T10:00:00.000Z');
const originalEnd = new Date('2042-01-06T10:55:00.000Z');
const targetStart = new Date('2042-01-07T10:00:00.000Z');
const targetEnd = new Date('2042-01-07T10:55:00.000Z');

function confirmedData(overrides = {}) {
  return {
    id: sourceId, name: 'Database Listener', email: 'database-listener@example.test',
    startAt: originalStart, endAt: originalEnd, timezone: 'Europe/London', status: 'CONFIRMED',
    stripeCheckoutSessionId: 'cs_management_db', stripePaymentIntentId: 'pi_management_db',
    calendarEventId: 'event_management_db', meetingUrl: 'https://meet.google.com/abc-defg-hij',
    expiresAt: new Date('2042-01-01T12:15:00.000Z'), createdAt: new Date('2042-01-01T12:00:00.000Z'),
    ...overrides,
  };
}

test('authoritative cancellation releases the active slot and persists the refund decision', { skip }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await db.booking.deleteMany({ where: { id: { in: [sourceId, holdId, competingId] } } });
    await db.booking.create({ data: confirmedData() });
    const persistence = createBookingCancellationPersistence(db);
    const cancelled = await persistence.cancelAuthoritatively({
      bookingId: sourceId, now: new Date('2042-01-02T10:00:00.000Z'), refundDue: true,
    });
    assert.equal(cancelled.status, 'CANCELLED');
    assert.equal(cancelled.cancellationRefundDue, true);
    assert.ok(cancelled.cancelledAt instanceof Date);
    const replacement = await db.booking.create({ data: {
      id: competingId, name: 'Replacement', email: 'replacement@example.test',
      startAt: originalStart, endAt: originalEnd, timezone: 'Europe/London', status: 'HOLD',
      expiresAt: new Date('2042-01-02T10:15:00.000Z'), createdAt: new Date('2042-01-02T10:00:00.000Z'),
    } });
    assert.equal(replacement.startAt.toISOString(), originalStart.toISOString());
  } finally {
    await db.booking.deleteMany({ where: { id: { in: [sourceId, holdId, competingId] } } });
    await db.$disconnect();
  }
});

test('reschedule hold blocks both slots and atomic transfer keeps target continuously owned', { skip }, async () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  const competitor = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    await db.booking.deleteMany({ where: { id: { in: [sourceId, holdId, competingId] } } });
    await db.booking.create({ data: confirmedData() });
    const persistence = createBookingReschedulePersistence(db);
    const source = await persistence.findSource(sourceId);
    const hold = await persistence.reserveTarget({
      source,
      target: { startAt: targetStart, endAt: targetEnd, timezone: 'Europe/London' },
      now: new Date('2042-01-02T10:00:00.000Z'),
    });
    assert.equal(hold.status, 'HOLD');
    assert.equal(hold.rescheduleSourceBookingId, sourceId);
    assert.equal(await db.booking.count({ where: { status: { in: ['HOLD', 'PAID', 'CONFIRMED'] }, startAt: { in: [originalStart, targetStart] } } }), 2);

    const result = await persistence.commitTarget({
      source, hold, meetingUrl: source.meetingUrl, now: new Date('2042-01-02T10:01:00.000Z'),
    });
    assert.equal(result.id, sourceId);
    assert.equal(result.status, 'CONFIRMED');
    assert.equal(result.startAt.toISOString(), targetStart.toISOString());
    assert.equal(result.stripePaymentIntentId, 'pi_management_db');
    const retired = await db.booking.findUniqueOrThrow({ where: { id: hold.id } });
    assert.equal(retired.status, 'CANCELLED');
    assert.equal(retired.rescheduleSourceBookingId, null);
    await db.booking.create({ data: {
      id: competingId, name: 'Old Slot Reuse', email: 'old-slot@example.test',
      startAt: originalStart, endAt: originalEnd, timezone: 'Europe/London', status: 'HOLD',
      expiresAt: new Date('2042-01-02T10:15:00.000Z'), createdAt: new Date('2042-01-02T10:00:00.000Z'),
    } });
    await assert.rejects(db.booking.create({ data: {
      name: 'Target Contender', email: 'target@example.test',
      startAt: targetStart, endAt: targetEnd, timezone: 'Europe/London', status: 'HOLD',
      expiresAt: new Date('2042-01-02T10:15:00.000Z'), createdAt: new Date('2042-01-02T10:00:00.000Z'),
    } }), (error) => isActiveSlotUniqueConflict(error));

    // Recreate the pending state and pause after retiring the hold inside the
    // transaction. A concurrent insert cannot observe the target as free; it
    // waits and then conflicts with the source booking acquired before commit.
    await db.booking.delete({ where: { id: competingId } });
    await db.booking.update({ where: { id: sourceId }, data: { startAt: originalStart, endAt: originalEnd } });
    await db.booking.update({ where: { id: hold.id }, data: { status: 'HOLD', startAt: targetStart, endAt: targetEnd, rescheduleSourceBookingId: sourceId } });
    let continueTransaction;
    let retiredInside;
    const retiredSignal = new Promise((resolve) => { retiredInside = resolve; });
    const continueSignal = new Promise((resolve) => { continueTransaction = resolve; });
    const swap = db.$transaction(async (transaction) => {
      await transaction.booking.update({ where: { id: hold.id }, data: { status: 'CANCELLED', rescheduleSourceBookingId: null } });
      retiredInside();
      await continueSignal;
      await transaction.booking.update({ where: { id: sourceId }, data: { startAt: targetStart, endAt: targetEnd } });
    });
    await retiredSignal;
    let contenderSettled = false;
    const contender = competitor.booking.create({ data: {
      name: 'Concurrent Target', email: 'concurrent@example.test',
      startAt: targetStart, endAt: targetEnd, timezone: 'Europe/London', status: 'HOLD',
      expiresAt: new Date('2042-01-02T10:15:00.000Z'), createdAt: new Date('2042-01-02T10:00:00.000Z'),
    } }).finally(() => { contenderSettled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(contenderSettled, false, 'target must not be externally observable as free');
    continueTransaction();
    await swap;
    await assert.rejects(contender, (error) => isActiveSlotUniqueConflict(error));
  } finally {
    await db.booking.deleteMany({ where: { id: { in: [sourceId, holdId, competingId] } } });
    await competitor.booking.deleteMany({ where: { email: 'concurrent@example.test' } });
    await Promise.all([db.$disconnect(), competitor.$disconnect()]);
  }
});
