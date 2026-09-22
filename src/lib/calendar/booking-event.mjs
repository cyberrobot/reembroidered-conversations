// @ts-check

import "server-only";
import { GOOGLE_EVENTS_OWNED_SCOPE } from "../google-calendar/constants.mjs";
import { GoogleApiError } from "../google-calendar/google-api.mjs";

export { GOOGLE_EVENTS_OWNED_SCOPE };

export class CalendarFinalizationError extends Error {
  /** @param {'invalid_booking' | 'not_connected' | 'reauthorization_required' | 'provider_unavailable' | 'invalid_provider_response' | 'conference_pending' | 'conference_failed' | 'event_mismatch'} code */
  constructor(code) {
    super(`Calendar finalization failed: ${code}.`);
    this.name = "CalendarFinalizationError";
    this.code = code;
  }
}

export class CalendarManagementError extends Error {
  /** @param {'invalid_booking' | 'not_connected' | 'reauthorization_required' | 'provider_unavailable' | 'invalid_provider_response' | 'event_mismatch'} code */
  constructor(code, { outcome = "uncertain", observedOriginal = false } = {}) {
    super(`Calendar management failed: ${code}.`);
    this.name = "CalendarManagementError";
    this.code = code;
    this.outcome = outcome;
    this.observedOriginal = observedOriginal;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function googleEventIdForBooking(bookingId) {
  if (typeof bookingId !== "string" || !UUID_PATTERN.test(bookingId))
    throw new CalendarFinalizationError("invalid_booking");
  return `rec${bookingId.toLowerCase().replaceAll("-", "")}`;
}

export function meetRequestIdForBooking(bookingId) {
  return `rec-meet-${googleEventIdForBooking(bookingId).slice(3)}`;
}

function instant(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new CalendarFinalizationError("invalid_booking");
  return date.toISOString();
}

export function buildBookingCalendarEvent(booking) {
  const id = googleEventIdForBooking(booking?.id);
  if (
    typeof booking?.email !== "string" ||
    !booking.email.trim() ||
    typeof booking?.timezone !== "string" ||
    !booking.timezone.trim()
  ) {
    throw new CalendarFinalizationError("invalid_booking");
  }
  const start = instant(booking.startAt);
  const end = instant(booking.endAt);
  if (start >= end) throw new CalendarFinalizationError("invalid_booking");
  return {
    id,
    summary: "Re-Embroidered Conversation",
    start: { dateTime: start, timeZone: booking.timezone },
    end: { dateTime: end, timeZone: booking.timezone },
    attendees: [{ email: booking.email }],
    extendedProperties: { private: { bookingId: booking.id } },
    conferenceData: {
      createRequest: {
        requestId: meetRequestIdForBooking(booking.id),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
  };
}

export function isUsableGoogleMeetUrl(candidate) {
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" && url.hostname === "meet.google.com";
  } catch {
    return false;
  }
}

function meetUrl(event) {
  const candidates = [
    event?.hangoutLink,
    ...(Array.isArray(event?.conferenceData?.entryPoints)
      ? event.conferenceData.entryPoints
          .filter((entry) => entry?.entryPointType === "video")
          .map((entry) => entry?.uri)
      : []),
  ];
  return candidates.find(isUsableGoogleMeetUrl);
}

function eventMatchesTime(event, booking) {
  try {
    return (
      instant(event?.start?.dateTime) === instant(booking.startAt) &&
      instant(event?.end?.dateTime) === instant(booking.endAt) &&
      event?.start?.timeZone === booking.timezone &&
      event?.end?.timeZone === booking.timezone
    );
  } catch {
    return false;
  }
}

export function validateBookingCalendarEvent(
  event,
  booking,
  expectedEventId = googleEventIdForBooking(booking.id),
) {
  if (
    !event ||
    event.id !== expectedEventId ||
    event.extendedProperties?.private?.bookingId !== booking.id
  ) {
    throw new CalendarFinalizationError("event_mismatch");
  }
  let eventStart;
  let eventEnd;
  try {
    eventStart = instant(event.start?.dateTime);
    eventEnd = instant(event.end?.dateTime);
  } catch {
    throw new CalendarFinalizationError("invalid_provider_response");
  }
  if (
    eventStart !== instant(booking.startAt) ||
    eventEnd !== instant(booking.endAt) ||
    event.start?.timeZone !== booking.timezone ||
    event.end?.timeZone !== booking.timezone
  ) {
    throw new CalendarFinalizationError("event_mismatch");
  }
  if (
    !Array.isArray(event.attendees) ||
    !event.attendees.some((attendee) => attendee?.email === booking.email)
  ) {
    throw new CalendarFinalizationError("event_mismatch");
  }
  const status = event.conferenceData?.createRequest?.status?.statusCode;
  if (status === "pending")
    throw new CalendarFinalizationError("conference_pending");
  if (status === "failure")
    throw new CalendarFinalizationError("conference_failed");
  if (status !== "success")
    throw new CalendarFinalizationError("invalid_provider_response");
  const meetingUrl = meetUrl(event);
  if (!meetingUrl)
    throw new CalendarFinalizationError("invalid_provider_response");
  return { calendarEventId: event.id, meetingUrl };
}

const defaultDependencies = {
  getCredentials: async () =>
    (
      await import("../google-calendar/connection.ts")
    ).getGoogleCalendarCredentials(),
  getOAuthConfig: async () =>
    (await import("../google-calendar/config.ts")).getGoogleOAuthConfig(),
  refreshAccessToken: async (input) =>
    (
      await import("../google-calendar/google-api.mjs")
    ).refreshGoogleAccessToken(input),
  insertEvent: async (input) =>
    (
      await import("../google-calendar/google-api.mjs")
    ).insertGoogleCalendarEvent(input),
  getEvent: async (input) =>
    (await import("../google-calendar/google-api.mjs")).getGoogleCalendarEvent(
      input,
    ),
  updateEvent: async (input) =>
    (
      await import("../google-calendar/google-api.mjs")
    ).updateGoogleCalendarEvent(input),
  deleteEvent: async (input) =>
    (
      await import("../google-calendar/google-api.mjs")
    ).deleteGoogleCalendarEvent(input),
};

export async function reconcileBookingCalendarEvent(
  booking,
  dependencies = defaultDependencies,
) {
  const event = buildBookingCalendarEvent(booking);
  let credentials;
  try {
    credentials = await dependencies.getCredentials();
  } catch {
    throw new CalendarFinalizationError("provider_unavailable");
  }
  if (!credentials) throw new CalendarFinalizationError("not_connected");
  if (!credentials.grantedScopes.includes(GOOGLE_EVENTS_OWNED_SCOPE))
    throw new CalendarFinalizationError("reauthorization_required");
  try {
    const config = await dependencies.getOAuthConfig();
    const { accessToken } = await dependencies.refreshAccessToken({
      refreshToken: credentials.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    let result;
    try {
      result = await dependencies.insertEvent({
        accessToken,
        calendarId: credentials.calendarId,
        event,
      });
    } catch (error) {
      if (!(error instanceof GoogleApiError) || error.category !== "conflict")
        throw error;
      result = await dependencies.getEvent({
        accessToken,
        calendarId: credentials.calendarId,
        eventId: event.id,
      });
    }
    return validateBookingCalendarEvent(result, booking, event.id);
  } catch (error) {
    if (error instanceof CalendarFinalizationError) throw error;
    if (error instanceof GoogleApiError) {
      if (error.category === "authorization")
        throw new CalendarFinalizationError("reauthorization_required");
      if (error.category === "invalid_response")
        throw new CalendarFinalizationError("invalid_provider_response");
    }
    throw new CalendarFinalizationError("provider_unavailable");
  }
}

async function getManagementAccess(dependencies) {
  let credentials;
  try {
    credentials = await dependencies.getCredentials();
  } catch {
    throw new CalendarManagementError("provider_unavailable");
  }
  if (!credentials) throw new CalendarManagementError("not_connected");
  if (!credentials.grantedScopes.includes(GOOGLE_EVENTS_OWNED_SCOPE))
    throw new CalendarManagementError("reauthorization_required");
  try {
    const config = await dependencies.getOAuthConfig();
    const { accessToken } = await dependencies.refreshAccessToken({
      refreshToken: credentials.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    return { accessToken, calendarId: credentials.calendarId };
  } catch (error) {
    if (error instanceof GoogleApiError && error.category === "authorization") {
      throw new CalendarManagementError("reauthorization_required");
    }
    throw new CalendarManagementError("provider_unavailable");
  }
}

export async function cancelBookingCalendarEvent(
  booking,
  dependencies = defaultDependencies,
) {
  if (
    typeof booking?.calendarEventId !== "string" ||
    !booking.calendarEventId.trim()
  ) {
    throw new CalendarManagementError("invalid_booking");
  }
  const access = await getManagementAccess(dependencies);
  try {
    await dependencies.deleteEvent({
      ...access,
      eventId: booking.calendarEventId,
    });
    return { cancelled: true };
  } catch (error) {
    if (error instanceof GoogleApiError) {
      if (error.category === "not_found") return { cancelled: true };
      if (error.category === "authorization")
        throw new CalendarManagementError("reauthorization_required");
      if (error.category === "invalid_response")
        throw new CalendarManagementError("invalid_provider_response");
    }
    throw new CalendarManagementError("provider_unavailable");
  }
}

export async function rescheduleBookingCalendarEvent(
  sourceBooking,
  target,
  dependencies = defaultDependencies,
  { allowUpdate = true } = {},
) {
  if (
    typeof sourceBooking?.calendarEventId !== "string" ||
    !sourceBooking.calendarEventId.trim() ||
    typeof sourceBooking?.id !== "string" ||
    !isUsableGoogleMeetUrl(sourceBooking.meetingUrl)
  ) {
    throw new CalendarManagementError("invalid_booking", {
      outcome: "definite_unchanged",
    });
  }
  // Validate target instants before any provider call.
  try {
    if (
      instant(target?.startAt) >= instant(target?.endAt) ||
      typeof target?.timezone !== "string" ||
      !target.timezone.trim()
    ) {
      throw new Error();
    }
  } catch {
    throw new CalendarManagementError("invalid_booking", {
      outcome: "definite_unchanged",
    });
  }

  let access;
  try {
    access = await getManagementAccess(dependencies);
  } catch (error) {
    if (error instanceof CalendarManagementError) {
      throw new CalendarManagementError(error.code, {
        outcome: "definite_unchanged",
      });
    }
    throw error;
  }
  let current;
  try {
    current = await dependencies.getEvent({
      ...access,
      eventId: sourceBooking.calendarEventId,
    });
  } catch (error) {
    if (error instanceof GoogleApiError) {
      if (error.category === "authorization") {
        throw new CalendarManagementError("reauthorization_required", {
          outcome: "definite_unchanged",
        });
      }
      if (
        error.category === "not_found" ||
        error.category === "invalid_response"
      ) {
        throw new CalendarManagementError("invalid_provider_response", {
          outcome: "definite_unchanged",
        });
      }
    }
    // No PATCH has been submitted. This invocation cannot have moved the
    // remote event, so a newly reserved target may be released. A retry with
    // an existing hold remains protected by the orchestrator's resume guard.
    throw new CalendarManagementError("provider_unavailable", {
      outcome: "definite_unchanged",
    });
  }
  if (
    current?.id !== sourceBooking.calendarEventId ||
    current?.extendedProperties?.private?.bookingId !== sourceBooking.id
  ) {
    throw new CalendarManagementError("event_mismatch", {
      outcome: "uncertain",
    });
  }

  if (!eventMatchesTime(current, target)) {
    if (!eventMatchesTime(current, sourceBooking)) {
      throw new CalendarManagementError("event_mismatch", {
        outcome: "uncertain",
      });
    }
    if (!allowUpdate) {
      throw new CalendarManagementError("invalid_booking", {
        outcome: "definite_unchanged",
        observedOriginal: true,
      });
    }
    try {
      current = await dependencies.updateEvent({
        ...access,
        eventId: sourceBooking.calendarEventId,
        event: {
          start: {
            dateTime: instant(target.startAt),
            timeZone: target.timezone,
          },
          end: { dateTime: instant(target.endAt), timeZone: target.timezone },
        },
      });
    } catch (error) {
      if (error instanceof GoogleApiError) {
        if (
          error.category === "authorization" ||
          error.category === "not_found"
        ) {
          throw new CalendarManagementError(
            error.category === "authorization"
              ? "reauthorization_required"
              : "invalid_provider_response",
            { outcome: "definite_unchanged", observedOriginal: true },
          );
        }
        if (error.category === "invalid_response") {
          // A successful PATCH with an unreadable body may already have moved
          // the event. Only a later GET can establish the remote state.
          throw new CalendarManagementError("invalid_provider_response", {
            outcome: "uncertain",
          });
        }
      }
      // Network/provider failures after PATCH submission have an uncertain outcome.
      throw new CalendarManagementError("provider_unavailable", {
        outcome: "uncertain",
      });
    }
  }

  if (
    current?.id !== sourceBooking.calendarEventId ||
    current?.extendedProperties?.private?.bookingId !== sourceBooking.id
  ) {
    throw new CalendarManagementError("event_mismatch", {
      outcome: "uncertain",
    });
  }
  if (!eventMatchesTime(current, target)) {
    // Any non-target PATCH representation is ambiguous. Even an echoed
    // original time is not a fresh authoritative GET after submission.
    throw new CalendarManagementError("event_mismatch", {
      outcome: "uncertain",
    });
  }
  const authoritativeMeetUrl = meetUrl(current);
  return {
    calendarEventId: sourceBooking.calendarEventId,
    meetingUrl: authoritativeMeetUrl ?? sourceBooking.meetingUrl,
  };
}
