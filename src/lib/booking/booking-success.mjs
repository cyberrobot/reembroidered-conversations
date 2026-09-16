// @ts-check

import 'server-only';
import { isUsableGoogleMeetUrl } from '../calendar/booking-event.mjs';
import { SESSION_PRODUCT } from './session-product.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHECKOUT_SESSION_PATTERN = /^cs_[A-Za-z0-9_]+$/;

export function createBookingSuccessPersistence(database) {
  return {
    findBooking: (id) => database.booking.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, startAt: true, endAt: true, timezone: true, status: true,
        stripeCheckoutSessionId: true, stripePaymentIntentId: true, calendarEventId: true, meetingUrl: true,
      },
    }),
  };
}

function formatInTimeZone(value, timeZone, options) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(value);
}

export function formatConfirmedBooking(booking) {
  const startAt = booking.startAt instanceof Date ? booking.startAt : new Date(booking.startAt);
  const endAt = booking.endAt instanceof Date ? booking.endAt : new Date(booking.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) return null;
  try {
    return {
      id: booking.id,
      name: booking.name,
      email: booking.email,
      date: formatInTimeZone(startAt, booking.timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      startTime: formatInTimeZone(startAt, booking.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      endTime: formatInTimeZone(endAt, booking.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      timezone: booking.timezone,
      timezoneName: formatInTimeZone(startAt, booking.timezone, { timeZoneName: 'short' }).split(' ').at(-1),
      durationMinutes: SESSION_PRODUCT.durationMinutes,
      paymentLabel: `${SESSION_PRODUCT.displayPrice} paid`,
      meetingUrl: booking.meetingUrl,
    };
  } catch {
    return null;
  }
}

export async function getBookingSuccessState(input, dependencies = {}) {
  if (typeof input?.bookingId !== 'string' || !UUID_PATTERN.test(input.bookingId) ||
      typeof input?.sessionId !== 'string' || !CHECKOUT_SESSION_PATTERN.test(input.sessionId)) return { kind: 'invalid' };

  let persistence = dependencies.persistence;
  if (!persistence) {
    const { db } = await import('../db.ts');
    persistence = createBookingSuccessPersistence(db);
  }
  let booking;
  try { booking = await persistence.findBooking(input.bookingId); }
  catch { return { kind: 'unavailable' }; }
  if (!booking || booking.stripeCheckoutSessionId !== input.sessionId) return { kind: 'invalid' };
  if (booking.status === 'HOLD') return { kind: 'confirming-payment' };
  if (booking.status === 'PAID') return { kind: 'finalising-booking' };
  if (booking.status === 'CANCELLED' || booking.status === 'REFUNDED') return { kind: 'inactive' };
  if (booking.status !== 'CONFIRMED' || !booking.stripePaymentIntentId || !booking.calendarEventId ||
      !isUsableGoogleMeetUrl(booking.meetingUrl)) return { kind: 'unavailable' };
  const view = formatConfirmedBooking(booking);
  return view ? { kind: 'confirmed', booking: view } : { kind: 'unavailable' };
}
