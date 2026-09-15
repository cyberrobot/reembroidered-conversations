// @ts-check

import 'server-only';
import { GOOGLE_EVENTS_OWNED_SCOPE } from '../google-calendar/constants.mjs';
import { GoogleApiError } from '../google-calendar/google-api.mjs';

export { GOOGLE_EVENTS_OWNED_SCOPE };

export class CalendarFinalizationError extends Error {
  /** @param {'invalid_booking' | 'not_connected' | 'reauthorization_required' | 'provider_unavailable' | 'invalid_provider_response' | 'conference_pending' | 'conference_failed' | 'event_mismatch'} code */
  constructor(code) {
    super(`Calendar finalization failed: ${code}.`);
    this.name = 'CalendarFinalizationError';
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function googleEventIdForBooking(bookingId) {
  if (typeof bookingId !== 'string' || !UUID_PATTERN.test(bookingId)) throw new CalendarFinalizationError('invalid_booking');
  return `rec${bookingId.toLowerCase().replaceAll('-', '')}`;
}

export function meetRequestIdForBooking(bookingId) {
  return `rec-meet-${googleEventIdForBooking(bookingId).slice(3)}`;
}

function instant(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CalendarFinalizationError('invalid_booking');
  return date.toISOString();
}

export function buildBookingCalendarEvent(booking) {
  const id = googleEventIdForBooking(booking?.id);
  if (typeof booking?.email !== 'string' || !booking.email.trim() || typeof booking?.timezone !== 'string' || !booking.timezone.trim()) {
    throw new CalendarFinalizationError('invalid_booking');
  }
  const start = instant(booking.startAt);
  const end = instant(booking.endAt);
  if (start >= end) throw new CalendarFinalizationError('invalid_booking');
  return {
    id,
    summary: 'Re-Embroidered Conversation',
    start: { dateTime: start, timeZone: booking.timezone },
    end: { dateTime: end, timeZone: booking.timezone },
    attendees: [{ email: booking.email }],
    extendedProperties: { private: { bookingId: booking.id } },
    conferenceData: { createRequest: {
      requestId: meetRequestIdForBooking(booking.id),
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    } },
  };
}

function meetUrl(event) {
  const candidates = [
    event?.hangoutLink,
    ...(Array.isArray(event?.conferenceData?.entryPoints)
      ? event.conferenceData.entryPoints.filter((entry) => entry?.entryPointType === 'video').map((entry) => entry?.uri)
      : []),
  ];
  return candidates.find((candidate) => {
    try { const url = new URL(candidate); return url.protocol === 'https:' && url.hostname === 'meet.google.com'; } catch { return false; }
  });
}

export function validateBookingCalendarEvent(event, booking, expectedEventId = googleEventIdForBooking(booking.id)) {
  if (!event || event.id !== expectedEventId || event.extendedProperties?.private?.bookingId !== booking.id) {
    throw new CalendarFinalizationError('event_mismatch');
  }
  let eventStart;
  let eventEnd;
  try { eventStart = instant(event.start?.dateTime); eventEnd = instant(event.end?.dateTime); }
  catch { throw new CalendarFinalizationError('invalid_provider_response'); }
  if (eventStart !== instant(booking.startAt) || eventEnd !== instant(booking.endAt) ||
      event.start?.timeZone !== booking.timezone || event.end?.timeZone !== booking.timezone) {
    throw new CalendarFinalizationError('event_mismatch');
  }
  if (!Array.isArray(event.attendees) || !event.attendees.some((attendee) => attendee?.email === booking.email)) {
    throw new CalendarFinalizationError('event_mismatch');
  }
  const status = event.conferenceData?.createRequest?.status?.statusCode;
  if (status === 'pending') throw new CalendarFinalizationError('conference_pending');
  if (status === 'failure') throw new CalendarFinalizationError('conference_failed');
  if (status !== 'success') throw new CalendarFinalizationError('invalid_provider_response');
  const meetingUrl = meetUrl(event);
  if (!meetingUrl) throw new CalendarFinalizationError('invalid_provider_response');
  return { calendarEventId: event.id, meetingUrl };
}

const defaultDependencies = {
  getCredentials: async () => (await import('../google-calendar/connection.ts')).getGoogleCalendarCredentials(),
  getOAuthConfig: async () => (await import('../google-calendar/config.ts')).getGoogleOAuthConfig(),
  refreshAccessToken: async (input) => (await import('../google-calendar/google-api.mjs')).refreshGoogleAccessToken(input),
  insertEvent: async (input) => (await import('../google-calendar/google-api.mjs')).insertGoogleCalendarEvent(input),
  getEvent: async (input) => (await import('../google-calendar/google-api.mjs')).getGoogleCalendarEvent(input),
};

export async function reconcileBookingCalendarEvent(booking, dependencies = defaultDependencies) {
  const event = buildBookingCalendarEvent(booking);
  let credentials;
  try { credentials = await dependencies.getCredentials(); } catch { throw new CalendarFinalizationError('provider_unavailable'); }
  if (!credentials) throw new CalendarFinalizationError('not_connected');
  if (!credentials.grantedScopes.includes(GOOGLE_EVENTS_OWNED_SCOPE)) throw new CalendarFinalizationError('reauthorization_required');
  try {
    const config = await dependencies.getOAuthConfig();
    const { accessToken } = await dependencies.refreshAccessToken({
      refreshToken: credentials.refreshToken, clientId: config.clientId, clientSecret: config.clientSecret,
    });
    let result;
    try {
      result = await dependencies.insertEvent({ accessToken, calendarId: credentials.calendarId, event });
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.category !== 'conflict') throw error;
      result = await dependencies.getEvent({ accessToken, calendarId: credentials.calendarId, eventId: event.id });
    }
    return validateBookingCalendarEvent(result, booking, event.id);
  } catch (error) {
    if (error instanceof CalendarFinalizationError) throw error;
    if (error instanceof GoogleApiError) {
      if (error.category === 'authorization') throw new CalendarFinalizationError('reauthorization_required');
      if (error.category === 'invalid_response') throw new CalendarFinalizationError('invalid_provider_response');
    }
    throw new CalendarFinalizationError('provider_unavailable');
  }
}
