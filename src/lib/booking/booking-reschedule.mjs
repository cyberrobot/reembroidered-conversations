// @ts-check

import "server-only";
import { getCalendarDateInTimeZone } from "../booking-date.mjs";
import { getAvailableSlots } from "../availability/available-slots.mjs";
import { PROVIDER_AVAILABILITY_CONFIG } from "../availability/provider-config.mjs";
import {
  CalendarManagementError,
  rescheduleBookingCalendarEvent,
} from "../calendar/booking-event.mjs";
import {
  BOOKING_HOLD_MINUTES,
  isActiveSlotUniqueConflict,
} from "./booking-hold.mjs";

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class BookingRescheduleError extends Error {
  /** @param {'invalid_reschedule_request' | 'booking_not_reschedulable' | 'slot_unavailable' | 'change_in_progress' | 'calendar_unavailable' | 'reconciliation_pending' | 'management_unavailable'} code */
  constructor(code) {
    super(`Booking reschedule failed: ${code}.`);
    this.name = "BookingRescheduleError";
    this.code = code;
  }
}

const sourceSelection = {
  id: true,
  name: true,
  email: true,
  startAt: true,
  endAt: true,
  timezone: true,
  status: true,
  stripeCheckoutSessionId: true,
  stripePaymentIntentId: true,
  calendarEventId: true,
  meetingUrl: true,
  rescheduledAt: true,
};
const holdSelection = {
  id: true,
  startAt: true,
  endAt: true,
  timezone: true,
  status: true,
  rescheduleSourceBookingId: true,
};

export function createBookingReschedulePersistence(database) {
  const findPendingHold = (bookingId) =>
    database.booking.findUnique({
      where: { rescheduleSourceBookingId: bookingId },
      select: holdSelection,
    });
  return {
    findSource: (bookingId) =>
      database.booking.findUnique({
        where: { id: bookingId },
        select: sourceSelection,
      }),
    findPendingHold,
    reserveTarget: async ({ source, target, now }) => {
      try {
        return await database.$transaction(async (transaction) => {
          const current = await transaction.booking.findUnique({
            where: { id: source.id },
            select: sourceSelection,
          });
          if (
            !current ||
            current.status !== "CONFIRMED" ||
            current.startAt <= now ||
            current.startAt.getTime() !== source.startAt.getTime()
          ) {
            throw new BookingRescheduleError("booking_not_reschedulable");
          }
          const pending = await transaction.booking.findUnique({
            where: { rescheduleSourceBookingId: source.id },
            select: holdSelection,
          });
          if (pending) {
            if (
              pending.status === "HOLD" &&
              pending.startAt.getTime() === target.startAt.getTime()
            )
              return pending;
            throw new BookingRescheduleError("change_in_progress");
          }
          return transaction.booking.create({
            data: {
              name: current.name,
              email: current.email,
              startAt: target.startAt,
              endAt: target.endAt,
              timezone: target.timezone,
              status: "HOLD",
              expiresAt: new Date(
                now.getTime() + BOOKING_HOLD_MINUTES * 60_000,
              ),
              rescheduleSourceBookingId: current.id,
            },
            select: holdSelection,
          });
        });
      } catch (error) {
        if (error instanceof BookingRescheduleError) throw error;
        if (isActiveSlotUniqueConflict(error))
          throw new BookingRescheduleError("slot_unavailable");
        const pending = await findPendingHold(source.id);
        if (pending?.status === "HOLD") {
          if (pending.startAt.getTime() === target.startAt.getTime())
            return pending;
          throw new BookingRescheduleError("change_in_progress");
        }
        throw error;
      }
    },
    releaseTarget: ({ sourceId, holdId }) =>
      database.booking.updateMany({
        where: {
          id: holdId,
          status: "HOLD",
          rescheduleSourceBookingId: sourceId,
        },
        data: { status: "CANCELLED", rescheduleSourceBookingId: null },
      }),
    commitTarget: ({ source, hold, meetingUrl, now }) =>
      database.$transaction(async (transaction) => {
        const currentHold = await transaction.booking.findUnique({
          where: { id: hold.id },
          select: holdSelection,
        });
        if (
          !currentHold ||
          currentHold.status !== "HOLD" ||
          currentHold.rescheduleSourceBookingId !== source.id ||
          currentHold.startAt.getTime() !== hold.startAt.getTime()
        ) {
          throw new BookingRescheduleError("reconciliation_pending");
        }
        const retired = await transaction.booking.updateMany({
          where: {
            id: hold.id,
            status: "HOLD",
            rescheduleSourceBookingId: source.id,
          },
          data: { status: "CANCELLED", rescheduleSourceBookingId: null },
        });
        if (retired.count !== 1)
          throw new BookingRescheduleError("reconciliation_pending");
        const changed = await transaction.booking.updateMany({
          where: {
            id: source.id,
            status: "CONFIRMED",
            startAt: source.startAt,
          },
          data: {
            startAt: hold.startAt,
            endAt: hold.endAt,
            timezone: hold.timezone,
            meetingUrl,
            rescheduledAt: now,
          },
        });
        if (changed.count !== 1)
          throw new BookingRescheduleError("reconciliation_pending");
        return transaction.booking.findUniqueOrThrow({
          where: { id: source.id },
          select: sourceSelection,
        });
      }),
  };
}

function parseRequestedStart(value) {
  if (typeof value !== "string" || !ISO_INSTANT.test(value))
    throw new BookingRescheduleError("invalid_reschedule_request");
  const result = new Date(value);
  if (Number.isNaN(result.getTime()) || result.toISOString() !== value) {
    throw new BookingRescheduleError("invalid_reschedule_request");
  }
  return result;
}

function successView(booking) {
  return {
    status: "rescheduled",
    booking: {
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      timezone: booking.timezone,
      meetingUrl: booking.meetingUrl,
    },
  };
}

export async function rescheduleBooking(
  bookingId,
  input,
  now,
  dependencies,
  config = PROVIDER_AVAILABILITY_CONFIG,
) {
  const requestedStart = parseRequestedStart(input?.startAt);
  let source;
  try {
    source = await dependencies.persistence.findSource(bookingId);
  } catch {
    throw new BookingRescheduleError("management_unavailable");
  }
  if (!source || source.status !== "CONFIRMED" || source.startAt <= now) {
    throw new BookingRescheduleError("booking_not_reschedulable");
  }
  if (source.startAt.getTime() === requestedStart.getTime()) {
    if (source.rescheduledAt) return successView(source);
    throw new BookingRescheduleError("invalid_reschedule_request");
  }

  let hold = await dependencies.persistence.findPendingHold(bookingId);
  const resumingPendingChange = hold?.status === "HOLD";
  if (
    hold &&
    hold.status === "HOLD" &&
    hold.startAt.getTime() !== requestedStart.getTime()
  ) {
    throw new BookingRescheduleError("change_in_progress");
  }
  if (!hold) {
    const date = getCalendarDateInTimeZone(requestedStart, config.timezone);
    let slots;
    try {
      slots = await dependencies.getAvailableSlots({
        fromDate: date,
        toDate: date,
        now,
        config,
      });
    } catch {
      throw new BookingRescheduleError("management_unavailable");
    }
    const canonical = slots.find((slot) => slot.startAt === input.startAt);
    if (!canonical) throw new BookingRescheduleError("slot_unavailable");
    try {
      hold = await dependencies.persistence.reserveTarget({
        source,
        target: {
          startAt: new Date(canonical.startAt),
          endAt: new Date(canonical.endAt),
          timezone: config.timezone,
        },
        now,
      });
    } catch (error) {
      if (error instanceof BookingRescheduleError) throw error;
      throw new BookingRescheduleError("management_unavailable");
    }
  }

  let calendar;
  try {
    calendar = await dependencies.rescheduleCalendarEvent(source, hold);
  } catch (error) {
    const definitelyUnchanged =
      error instanceof CalendarManagementError &&
      error.outcome === "definite_unchanged" &&
      (!resumingPendingChange || error.observedOriginal);
    if (definitelyUnchanged) {
      try {
        await dependencies.persistence.releaseTarget({
          sourceId: source.id,
          holdId: hold.id,
        });
      } catch {}
      throw new BookingRescheduleError("calendar_unavailable");
    }
    // The Calendar request may have succeeded. Keep both old and replacement
    // slots owned until a retry can inspect the existing event.
    throw new BookingRescheduleError("reconciliation_pending");
  }

  try {
    const booking = await dependencies.persistence.commitTarget({
      source,
      hold,
      meetingUrl: calendar.meetingUrl,
      now: dependencies.getNow(),
    });
    return successView(booking);
  } catch {
    throw new BookingRescheduleError("reconciliation_pending");
  }
}

export async function rescheduleBookingWithDefaultDependencies(
  bookingId,
  input,
  now = new Date(),
) {
  const { db } = await import("../db.ts");
  return rescheduleBooking(bookingId, input, now, {
    persistence: createBookingReschedulePersistence(db),
    getAvailableSlots,
    rescheduleCalendarEvent: rescheduleBookingCalendarEvent,
    getNow: () => new Date(),
  });
}
