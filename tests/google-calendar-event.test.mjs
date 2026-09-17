import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBookingCalendarEvent,
  CalendarFinalizationError,
  CalendarManagementError,
  cancelBookingCalendarEvent,
  googleEventIdForBooking,
  isUsableGoogleMeetUrl,
  meetRequestIdForBooking,
  reconcileBookingCalendarEvent,
  rescheduleBookingCalendarEvent,
  validateBookingCalendarEvent,
} from '../src/lib/calendar/booking-event.mjs';
import {
  getGoogleCalendarEvent,
  GoogleApiError,
  insertGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from '../src/lib/google-calendar/google-api.mjs';
import { GOOGLE_EVENTS_OWNED_SCOPE } from '../src/lib/google-calendar/constants.mjs';

const booking = {
  id: '5a449655-7be3-432c-a124-b769e10b50ef',
  email: 'listener@example.com',
  startAt: new Date('2030-01-01T10:00:00.000Z'),
  endAt: new Date('2030-01-01T10:55:00.000Z'),
  timezone: 'Europe/London',
};

const createdEvent = (overrides = {}) => ({
  ...buildBookingCalendarEvent(booking),
  hangoutLink: 'https://meet.google.com/abc-defg-hij',
  conferenceData: {
    createRequest: { status: { statusCode: 'success' } },
    entryPoints: [{ entryPointType: 'video', uri: 'https://meet.google.com/abc-defg-hij' }],
  },
  ...overrides,
});

function dependencies(overrides = {}) {
  return {
    getCredentials: async () => ({
      calendarId: 'persisted-calendar@example.com', refreshToken: 'refresh-token',
      grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
    }),
    getOAuthConfig: async () => ({ clientId: 'client-id', clientSecret: 'client-secret' }),
    refreshAccessToken: async () => ({ accessToken: 'access-token' }),
    insertEvent: async () => createdEvent(),
    getEvent: async () => createdEvent(),
    ...overrides,
  };
}

const rejectsWith = (code) => (error) => error instanceof CalendarFinalizationError && error.code === code;

test('booking event and Meet IDs are deterministic, distinct, and Google-compatible', () => {
  assert.equal(googleEventIdForBooking(booking.id), 'rec5a4496557be3432ca124b769e10b50ef');
  assert.match(googleEventIdForBooking(booking.id), /^[a-v0-9]{5,1024}$/);
  assert.equal(meetRequestIdForBooking(booking.id), 'rec-meet-5a4496557be3432ca124b769e10b50ef');
  assert.notEqual(googleEventIdForBooking(booking.id), googleEventIdForBooking('5a449655-7be3-432c-a124-b769e10b50ee'));
});

test('event payload uses only persisted booking details and requests Meet', () => {
  assert.deepEqual(buildBookingCalendarEvent(booking), {
    id: 'rec5a4496557be3432ca124b769e10b50ef',
    summary: 'Re-Embroidered Conversation',
    start: { dateTime: '2030-01-01T10:00:00.000Z', timeZone: 'Europe/London' },
    end: { dateTime: '2030-01-01T10:55:00.000Z', timeZone: 'Europe/London' },
    attendees: [{ email: 'listener@example.com' }],
    extendedProperties: { private: { bookingId: booking.id } },
    conferenceData: { createRequest: {
      requestId: 'rec-meet-5a4496557be3432ca124b769e10b50ef',
      conferenceSolutionKey: { type: 'hangoutsMeet' },
    } },
  });
});

test('valid response extracts only a Google-provided Meet URL', () => {
  assert.deepEqual(validateBookingCalendarEvent(createdEvent(), booking), {
    calendarEventId: googleEventIdForBooking(booking.id),
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
  });
});

test('stored Meet URL validation accepts only usable Google Meet HTTPS URLs', () => {
  assert.equal(isUsableGoogleMeetUrl('https://meet.google.com/abc-defg-hij'), true);
  assert.equal(isUsableGoogleMeetUrl('http://meet.google.com/abc-defg-hij'), false);
  assert.equal(isUsableGoogleMeetUrl('https://meet.google.com.example/abc'), false);
  assert.equal(isUsableGoogleMeetUrl('not-a-url'), false);
  assert.equal(isUsableGoogleMeetUrl(null), false);
});

test('pending, failed, malformed, and mismatched events fail closed', () => {
  assert.throws(() => validateBookingCalendarEvent(createdEvent({ conferenceData: { createRequest: { status: { statusCode: 'pending' } } } }), booking), rejectsWith('conference_pending'));
  assert.throws(() => validateBookingCalendarEvent(createdEvent({ conferenceData: { createRequest: { status: { statusCode: 'failure' } } } }), booking), rejectsWith('conference_failed'));
  assert.throws(() => validateBookingCalendarEvent(createdEvent({ hangoutLink: 'https://example.com/not-meet', conferenceData: { createRequest: { status: { statusCode: 'success' } } } }), booking), rejectsWith('invalid_provider_response'));
  assert.throws(() => validateBookingCalendarEvent(createdEvent({ extendedProperties: { private: { bookingId: 'other' } } }), booking), rejectsWith('event_mismatch'));
});

test('service checks connection and granted scope before Google calls', async () => {
  let calls = 0;
  await assert.rejects(() => reconcileBookingCalendarEvent(booking, dependencies({ getCredentials: async () => null })), rejectsWith('not_connected'));
  await assert.rejects(() => reconcileBookingCalendarEvent(booking, dependencies({
    getCredentials: async () => ({ calendarId: 'x', refreshToken: 'secret', grantedScopes: [] }),
    refreshAccessToken: async () => { calls += 1; },
  })), rejectsWith('reauthorization_required'));
  assert.equal(calls, 0);
});

test('service refreshes access and inserts into the persisted calendar', async () => {
  const calls = [];
  const result = await reconcileBookingCalendarEvent(booking, dependencies({
    refreshAccessToken: async (input) => { calls.push(['refresh', input]); return { accessToken: 'access-token' }; },
    insertEvent: async (input) => { calls.push(['insert', input]); return createdEvent(); },
  }));
  assert.equal(result.calendarEventId, googleEventIdForBooking(booking.id));
  assert.deepEqual(calls[0][1], { refreshToken: 'refresh-token', clientId: 'client-id', clientSecret: 'client-secret' });
  assert.equal(calls[1][1].calendarId, 'persisted-calendar@example.com');
  assert.equal(calls[1][1].accessToken, 'access-token');
});

test('deterministic insert conflict retrieves and validates the existing event', async () => {
  let inserts = 0; let gets = 0;
  await reconcileBookingCalendarEvent(booking, dependencies({
    insertEvent: async () => { inserts += 1; throw new GoogleApiError('conflict'); },
    getEvent: async (input) => { gets += 1; assert.equal(input.eventId, googleEventIdForBooking(booking.id)); return createdEvent(); },
  }));
  assert.equal(inserts, 1); assert.equal(gets, 1);
});

test('authorization and provider failures are normalized safely', async () => {
  for (const [category, code] of [['authorization', 'reauthorization_required'], ['unavailable', 'provider_unavailable'], ['invalid_response', 'invalid_provider_response']]) {
    await assert.rejects(() => reconcileBookingCalendarEvent(booking, dependencies({
      insertEvent: async () => { throw new GoogleApiError(category); },
    })), rejectsWith(code));
  }
});

test('Calendar API insert and get use bearer access token and required query controls', async () => {
  const requests = [];
  const fetchImplementation = async (url, options) => { requests.push({ url, options }); return Response.json(createdEvent()); };
  await insertGoogleCalendarEvent({ accessToken: 'access-token', calendarId: 'calendar/id', event: buildBookingCalendarEvent(booking) }, fetchImplementation);
  await getGoogleCalendarEvent({ accessToken: 'access-token', calendarId: 'calendar/id', eventId: googleEventIdForBooking(booking.id) }, fetchImplementation);
  assert.equal(requests[0].url.pathname, '/calendar/v3/calendars/calendar%2Fid/events');
  assert.equal(requests[0].url.searchParams.get('conferenceDataVersion'), '1');
  assert.equal(requests[0].url.searchParams.get('sendUpdates'), 'all');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer access-token');
  assert.equal(requests[0].options.body.includes('refresh-token'), false);
  assert.equal(requests[1].url.pathname.endsWith(`/${googleEventIdForBooking(booking.id)}`), true);
  assert.equal(requests[1].url.searchParams.get('conferenceDataVersion'), '1');
});

test('Calendar API classifies conflict, authorization, rate-limit, outage, and malformed success', async () => {
  const input = { accessToken: 'token', calendarId: 'calendar', event: buildBookingCalendarEvent(booking) };
  const scenarios = [
    [new Response('', { status: 409 }), 'conflict'],
    [new Response('', { status: 401 }), 'authorization'],
    [Response.json({ error: { errors: [{ reason: 'rateLimitExceeded' }] } }, { status: 403 }), 'unavailable'],
    [new Response('', { status: 503 }), 'unavailable'],
    [new Response('not-json'), 'invalid_response'],
  ];
  for (const [response, category] of scenarios) {
    await assert.rejects(() => insertGoogleCalendarEvent(input, async () => response), (error) => error instanceof GoogleApiError && error.category === category);
  }
});

test('reschedule updates the stored event in place, preserves Meet, and requests attendee notifications', async () => {
  const managedBooking = {
    ...booking,
    calendarEventId: googleEventIdForBooking(booking.id),
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
  };
  const target = {
    startAt: new Date('2030-01-02T11:00:00.000Z'),
    endAt: new Date('2030-01-02T11:55:00.000Z'),
    timezone: 'Europe/London',
  };
  let patch;
  const result = await rescheduleBookingCalendarEvent(managedBooking, target, dependencies({
    getEvent: async () => createdEvent(),
    updateEvent: async (input) => {
      patch = input;
      return createdEvent({
        start: input.event.start,
        end: input.event.end,
      });
    },
  }));
  assert.equal(patch.eventId, managedBooking.calendarEventId);
  assert.deepEqual(patch.event, {
    start: { dateTime: target.startAt.toISOString(), timeZone: target.timezone },
    end: { dateTime: target.endAt.toISOString(), timeZone: target.timezone },
  });
  assert.equal('conferenceData' in patch.event, false);
  assert.deepEqual(result, { calendarEventId: managedBooking.calendarEventId, meetingUrl: managedBooking.meetingUrl });
});

test('reschedule retry observes an already moved event and does not patch again', async () => {
  const managedBooking = { ...booking, calendarEventId: googleEventIdForBooking(booking.id), meetingUrl: 'https://meet.google.com/abc-defg-hij' };
  const target = { startAt: new Date('2030-01-02T11:00:00.000Z'), endAt: new Date('2030-01-02T11:55:00.000Z'), timezone: 'Europe/London' };
  let updates = 0;
  await rescheduleBookingCalendarEvent(managedBooking, target, dependencies({
    getEvent: async () => createdEvent({
      start: { dateTime: target.startAt.toISOString(), timeZone: target.timezone },
      end: { dateTime: target.endAt.toISOString(), timeZone: target.timezone },
    }),
    updateEvent: async () => { updates += 1; },
  }));
  assert.equal(updates, 0);
});

test('Calendar cancellation uses the persisted event and treats already removed as success', async () => {
  const managedBooking = { ...booking, calendarEventId: 'persisted-event-id' };
  let deleted;
  assert.deepEqual(await cancelBookingCalendarEvent(managedBooking, dependencies({
    deleteEvent: async (input) => { deleted = input; return { removed: true }; },
  })), { cancelled: true });
  assert.equal(deleted.eventId, 'persisted-event-id');

  assert.deepEqual(await cancelBookingCalendarEvent(managedBooking, dependencies({
    deleteEvent: async () => { throw new GoogleApiError('not_found'); },
  })), { cancelled: true });
});

test('Calendar update and delete API boundaries preserve event identity and sendUpdates=all', async () => {
  const requests = [];
  const updated = createdEvent();
  await updateGoogleCalendarEvent({ accessToken: 'token', calendarId: 'calendar/id', eventId: 'event/id', event: { start: updated.start, end: updated.end } }, async (url, options) => {
    requests.push({ url, options });
    return Response.json(updated);
  });
  await deleteGoogleCalendarEvent({ accessToken: 'token', calendarId: 'calendar/id', eventId: 'event/id' }, async (url, options) => {
    requests.push({ url, options });
    return new Response(null, { status: 204 });
  });
  assert.equal(requests[0].options.method, 'PATCH');
  assert.equal(requests[0].url.pathname.endsWith('/event%2Fid'), true);
  assert.equal(requests[0].url.searchParams.get('sendUpdates'), 'all');
  assert.equal(requests[0].url.searchParams.get('conferenceDataVersion'), '1');
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(requests[1].url.searchParams.get('sendUpdates'), 'all');
});

test('Calendar management authorization/provider errors stay sanitized', async () => {
  const managedBooking = { ...booking, calendarEventId: 'event', meetingUrl: 'https://meet.google.com/abc-defg-hij' };
  await assert.rejects(
    () => cancelBookingCalendarEvent(managedBooking, dependencies({ deleteEvent: async () => { throw new GoogleApiError('authorization'); } })),
    (error) => error instanceof CalendarManagementError && error.code === 'reauthorization_required',
  );
});
