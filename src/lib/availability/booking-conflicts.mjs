// @ts-check

import 'server-only';

const MINUTE_MS = 60_000;

/**
 * @typedef {{ startAt: Date, endAt: Date, status?: 'HOLD' | 'PAID' | 'CONFIRMED' | 'CANCELLED' | 'REFUNDED', expiresAt?: Date }} BookingConflict
 */

/**
 * Load every slot-owning booking which intersects one bounded candidate range.
 * Expired holds and released bookings are excluded by the database query.
 *
 * @param {{ from: Date, to: Date, now: Date }} input
 * @returns {Promise<BookingConflict[]>}
 */
export async function getActiveBookingConflicts({ from, to, now }) {
  const { db } = await import('../db.ts');
  return db.booking.findMany({
    where: {
      startAt: { lt: to },
      endAt: { gt: from },
      OR: [
        { status: { in: ['PAID', 'CONFIRMED'] } },
        { status: 'HOLD', expiresAt: { gt: now } },
      ],
    },
    select: { startAt: true, endAt: true, status: true, expiresAt: true },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Expand stored customer-session timestamps into provider occupancy intervals.
 * Persisted timestamps are deliberately left unchanged.
 *
 * @param {BookingConflict[]} bookings
 * @param {{ bufferBeforeMinutes: number, bufferAfterMinutes: number }} config
 * @param {Date} now
 */
export function toBookingOccupancyIntervals(bookings, config, now) {
  return bookings.filter((booking) =>
    booking.status === undefined || booking.status === 'PAID' || booking.status === 'CONFIRMED' ||
      (booking.status === 'HOLD' && booking.expiresAt instanceof Date && booking.expiresAt > now)
  ).map((booking) => ({
    startAt: new Date(booking.startAt.getTime() - config.bufferBeforeMinutes * MINUTE_MS).toISOString(),
    endAt: new Date(booking.endAt.getTime() + config.bufferAfterMinutes * MINUTE_MS).toISOString(),
  }));
}
