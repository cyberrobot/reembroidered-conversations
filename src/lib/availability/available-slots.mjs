// @ts-check

import "server-only";

import { addCalendarDays } from "../booking-date.mjs";
import { getBusyPeriods } from "../calendar/busy-periods.mjs";
import { getProviderCandidateSlotsForDate } from "./candidate-slots.mjs";
import { PROVIDER_AVAILABILITY_CONFIG } from "./provider-config.mjs";
import {
  getActiveBookingConflicts,
  toBookingOccupancyIntervals,
} from "./booking-conflicts.mjs";

const defaultDependencies = {
  getCandidates: getProviderCandidateSlotsForDate,
  getBookingConflicts: getActiveBookingConflicts,
  getCalendarBusyPeriods: getBusyPeriods,
};

/** @param {{ startAt: string, endAt: string }} left @param {{ startAt: string, endAt: string }} right */
export function intervalsOverlap(left, right) {
  return (
    Date.parse(left.startAt) < Date.parse(right.endAt) &&
    Date.parse(left.endAt) > Date.parse(right.startAt)
  );
}

/**
 * Return the customer-safe slots that survive provider, booking, and calendar rules.
 * The inclusive input dates are provider-local calendar dates and `now` is read once
 * by the caller so every stage observes the same instant.
 *
 * @param {{ fromDate: string, toDate: string, now: Date, config?: import('./provider-config.mjs').ProviderAvailabilityConfig }} input
 * @param {typeof defaultDependencies} [dependencies]
 * @returns {Promise<Array<{ date: string, startAt: string, endAt: string }>>}
 */
export async function getAvailableSlots(
  { fromDate, toDate, now, config = PROVIDER_AVAILABILITY_CONFIG },
  dependencies = defaultDependencies,
) {
  /** @type {Array<import('./candidate-slots.mjs').ProviderCandidateSlot & { date: string }>} */
  const candidates = [];
  for (let date = fromDate; date <= toDate; date = addCalendarDays(date, 1)) {
    for (const candidate of dependencies.getCandidates({ date, now, config })) {
      candidates.push({ date, ...candidate });
    }
  }

  if (candidates.length === 0) return [];

  const occupancyStarts = candidates.map((slot) =>
    Date.parse(slot.occupancyStartAt),
  );
  const occupancyEnds = candidates.map((slot) =>
    Date.parse(slot.occupancyEndAt),
  );
  const from = new Date(Math.min(...occupancyStarts));
  const to = new Date(Math.max(...occupancyEnds));

  const bookingFrom = new Date(
    from.getTime() - config.bufferAfterMinutes * 60_000,
  );
  const bookingTo = new Date(
    to.getTime() + config.bufferBeforeMinutes * 60_000,
  );

  const [bookings, calendarBusyPeriods] = await Promise.all([
    dependencies.getBookingConflicts({ from: bookingFrom, to: bookingTo, now }),
    dependencies.getCalendarBusyPeriods(from, to),
  ]);
  const bookingOccupancy = toBookingOccupancyIntervals(bookings, config, now);

  const available = candidates
    .filter((candidate) => {
      const occupancy = {
        startAt: candidate.occupancyStartAt,
        endAt: candidate.occupancyEndAt,
      };
      return (
        !bookingOccupancy.some((conflict) =>
          intervalsOverlap(occupancy, conflict),
        ) &&
        !calendarBusyPeriods.some((conflict) =>
          intervalsOverlap(occupancy, conflict),
        )
      );
    })
    .map(({ date, startAt, endAt }) => ({ date, startAt, endAt }));

  return [
    ...new Map(
      available.map((slot) => [`${slot.startAt}/${slot.endAt}`, slot]),
    ).values(),
  ].sort((left, right) => left.startAt.localeCompare(right.startAt));
}
