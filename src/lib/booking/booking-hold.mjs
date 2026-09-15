// @ts-check

import 'server-only';

import { getCalendarDateInTimeZone } from '../booking-date.mjs';
import { getAvailableSlots } from '../availability/available-slots.mjs';
import { PROVIDER_AVAILABILITY_CONFIG } from '../availability/provider-config.mjs';

export const BOOKING_HOLD_MINUTES = 15;
const NAME_MAX_LENGTH = 120;
const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class InvalidHoldRequestError extends Error {
  constructor() { super('Invalid hold request.'); this.name = 'InvalidHoldRequestError'; }
}

export class SlotUnavailableError extends Error {
  constructor() { super('Slot unavailable.'); this.name = 'SlotUnavailableError'; }
}

export class HoldAvailabilityError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) { super('Hold availability unavailable.', { cause }); this.name = 'HoldAvailabilityError'; }
}

/** @param {unknown} error */
export function isActiveSlotUniqueConflict(error) {
  if (!error || typeof error !== 'object') return false;
  const candidate = /** @type {{ code?: unknown, originalCode?: unknown, constraint?: unknown, meta?: unknown, cause?: unknown, driverAdapterError?: unknown }} */ (error);
  const constraint = typeof candidate.constraint === 'string'
    ? candidate.constraint
    : candidate.constraint && typeof candidate.constraint === 'object' &&
        'index' in candidate.constraint && typeof candidate.constraint.index === 'string'
      ? candidate.constraint.index
      : null;
  const isUniqueViolation = candidate.code === 'P2002' || candidate.code === '23505' || candidate.originalCode === '23505';
  if (isUniqueViolation && constraint === 'bookings_active_start_at_key') return true;

  if (candidate.code === 'P2002') {
    return hasActiveSlotConstraint(candidate.meta);
  }
  return false;
}

/** @param {unknown} value */
function hasActiveSlotConstraint(value) {
  if (!value || typeof value !== 'object') return false;
  const candidate = /** @type {{ constraint?: unknown, target?: unknown, cause?: unknown, driverAdapterError?: unknown }} */ (value);
  if (candidate.target === 'bookings_active_start_at_key') return true;
  if (candidate.constraint === 'bookings_active_start_at_key') return true;
  if (candidate.constraint && typeof candidate.constraint === 'object' &&
      'index' in candidate.constraint && candidate.constraint.index === 'bookings_active_start_at_key') return true;
  return hasActiveSlotConstraint(candidate.driverAdapterError) || hasActiveSlotConstraint(candidate.cause);
}

/** @param {{ $transaction: (callback: (transaction: any) => Promise<any>) => Promise<any> }} database */
export function createHoldPersistence(database) {
  return async function persist({ name, email, startAt, endAt, timezone, expiresAt, now }) {
    return database.$transaction(async (transaction) => {
      await transaction.booking.updateMany({
        where: {
          startAt,
          status: 'HOLD',
          expiresAt: { lte: now },
          stripeCheckoutSessionId: null,
        },
        data: { status: 'CANCELLED' },
      });
      return transaction.booking.create({
        data: { name, email, startAt, endAt, timezone, status: 'HOLD', expiresAt },
        select: { id: true, startAt: true, endAt: true, timezone: true, expiresAt: true },
      });
    });
  };
}

const defaultDependencies = {
  getAvailableSlots,
  persist: async (input) => {
    const { db } = await import('../db.ts');
    return createHoldPersistence(db)(input);
  },
};

/**
 * @param {{ name?: unknown, email?: unknown, startAt?: unknown }} input
 * @param {Date} now
 * @param {typeof defaultDependencies} [dependencies]
 * @param {typeof PROVIDER_AVAILABILITY_CONFIG} [config]
 */
export async function createBookingHold(
  input,
  now,
  dependencies = defaultDependencies,
  config = PROVIDER_AVAILABILITY_CONFIG,
) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const email = typeof input?.email === 'string' ? input.email.trim() : '';
  if (!name || name.length > NAME_MAX_LENGTH || !email || email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new InvalidHoldRequestError();
  }
  if (typeof input?.startAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(input.startAt)) {
    throw new InvalidHoldRequestError();
  }
  const requestedStart = new Date(input.startAt);
  if (Number.isNaN(requestedStart.getTime()) || requestedStart.toISOString() !== input.startAt) {
    throw new InvalidHoldRequestError();
  }

  const date = getCalendarDateInTimeZone(requestedStart, config.timezone);
  let slots;
  try {
    slots = await dependencies.getAvailableSlots({ fromDate: date, toDate: date, now, config });
  } catch (error) {
    throw new HoldAvailabilityError(error);
  }
  const canonicalSlot = slots.find((slot) => slot.startAt === input.startAt);
  if (!canonicalSlot) throw new SlotUnavailableError();

  try {
    return await dependencies.persist({
      name,
      email,
      startAt: new Date(canonicalSlot.startAt),
      endAt: new Date(canonicalSlot.endAt),
      timezone: config.timezone,
      expiresAt: new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60_000),
      now,
    });
  } catch (error) {
    if (isActiveSlotUniqueConflict(error)) throw new SlotUnavailableError();
    throw error;
  }
}
