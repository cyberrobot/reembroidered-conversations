import assert from 'node:assert/strict';
import test from 'node:test';
import { createStripeWebhookHandler } from '../src/lib/booking/stripe-webhook-handler.ts';
import { processStripeWebhookEvent, StripeWebhookReconciliationError } from '../src/lib/booking/stripe-webhook.mjs';
import {
  googleEventIdForBooking,
  reconcileBookingCalendarEvent,
} from '../src/lib/calendar/booking-event.mjs';
import { GOOGLE_EVENTS_OWNED_SCOPE } from '../src/lib/google-calendar/constants.mjs';
import { GoogleApiError } from '../src/lib/google-calendar/google-api.mjs';
import { sendBookingConfirmationEmail } from '../src/lib/booking/booking-confirmation-email.mjs';
import { EmailDeliveryError } from '../src/lib/email/resend.mjs';

const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';
const calendarEventId = googleEventIdForBooking(bookingId);
const meetingUrl = 'https://meet.google.com/abc-defg-hij';
const session = (overrides = {}) => ({ object: 'checkout.session', id: 'cs_test_one', client_reference_id: bookingId, metadata: { bookingId }, mode: 'payment', payment_status: 'paid', amount_total: 5500, currency: 'gbp', payment_intent: 'pi_test_one', ...overrides });
const event = (type, overrides) => ({ id: 'evt_test', type, data: { object: session(overrides) } });

function persistence(initial = { status: 'HOLD', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: null }) {
  let booking = {
    id: bookingId, name: 'Persisted Listener', email: 'listener@example.com', startAt: new Date('2030-01-01T10:00:00Z'),
    endAt: new Date('2030-01-01T10:55:00Z'), timezone: 'Europe/London', calendarEventId: null,
    meetingUrl: null, confirmationEmailSentAt: null, confirmationEmailId: null, ...initial,
  };
  return {
    markPaid: async ({ sessionId, paymentIntentId }) => {
      if (booking.status !== 'HOLD' || booking.stripeCheckoutSessionId !== sessionId) return { count: 0 };
      booking = { ...booking, status: 'PAID', stripePaymentIntentId: paymentIntentId }; return { count: 1 };
    },
    cancelExpired: async ({ sessionId }) => {
      if (booking.status !== 'HOLD' || booking.stripeCheckoutSessionId !== sessionId) return { count: 0 };
      booking = { ...booking, status: 'CANCELLED' }; return { count: 1 };
    },
    findBooking: async () => booking,
    confirm: async ({ sessionId, paymentIntentId, calendarEventId, meetingUrl }) => {
      if (booking.status !== 'PAID' || booking.stripeCheckoutSessionId !== sessionId || booking.stripePaymentIntentId !== paymentIntentId) return { count: 0 };
      booking = { ...booking, status: 'CONFIRMED', calendarEventId, meetingUrl }; return { count: 1 };
    },
    recordConfirmationEmail: async ({ messageId, acceptedAt }) => {
      if (booking.status !== 'CONFIRMED' || booking.confirmationEmailSentAt) return { count: 0 };
      booking = { ...booking, confirmationEmailSentAt: acceptedAt, confirmationEmailId: messageId };
      return { count: 1 };
    },
    get: () => booking,
  };
}

test('completed paid Checkout moves HOLD to PAID and duplicate delivery is idempotent', async () => {
  const p = persistence();
  await processStripeWebhookEvent(event('checkout.session.completed'), p);
  await processStripeWebhookEvent(event('checkout.session.completed'), p);
  assert.equal(p.get().status, 'PAID');
  assert.equal(p.get().stripePaymentIntentId, 'pi_test_one');
});

test('confirmation email is sent only after durable CONFIRMED state using persisted booking data', async () => {
  const p = persistence();
  const seen = [];
  await processStripeWebhookEvent(
    event('checkout.session.completed'),
    p,
    async () => ({ calendarEventId, meetingUrl }),
    async (confirmedBooking) => {
      seen.push({ ...confirmedBooking });
      assert.equal(p.get().status, 'CONFIRMED');
      return { messageId: 'email_one' };
    },
  );
  assert.equal(seen.length, 1);
  assert.equal(seen[0].email, 'listener@example.com');
  assert.equal(seen[0].name, 'Persisted Listener');
  assert.ok(p.get().confirmationEmailSentAt instanceof Date);
  assert.equal(p.get().confirmationEmailId, 'email_one');
});

test('HOLD, PAID, and Calendar or confirmation persistence failures never send email', async () => {
  let sends = 0;
  const send = async () => { sends += 1; return { messageId: 'email_one' }; };
  await processStripeWebhookEvent(event('checkout.session.completed'), persistence(), undefined, send);
  await assert.rejects(() => processStripeWebhookEvent(
    event('checkout.session.completed'), persistence(), async () => { throw new Error('calendar failed'); }, send,
  ), StripeWebhookReconciliationError);
  const p = persistence();
  p.confirm = async () => { throw new Error('database unavailable'); };
  await assert.rejects(() => processStripeWebhookEvent(
    event('checkout.session.completed'), p, async () => ({ calendarEventId, meetingUrl }), send,
  ), StripeWebhookReconciliationError);
  assert.equal(sends, 0);
});

test('email failure leaves booking CONFIRMED and replay retries until acceptance, then skips duplicates', async () => {
  const p = persistence();
  let sends = 0;
  const send = async () => {
    sends += 1;
    if (sends === 1) throw new Error('provider unavailable');
    return { messageId: 'email_retry' };
  };
  await assert.rejects(() => processStripeWebhookEvent(
    event('checkout.session.completed'), p, async () => ({ calendarEventId, meetingUrl }), send,
  ), StripeWebhookReconciliationError);
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(p.get().confirmationEmailSentAt, null);
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async () => assert.fail('Calendar must not repeat'), send);
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async () => assert.fail('Calendar must not repeat'), send);
  assert.equal(sends, 2);
  assert.ok(p.get().confirmationEmailSentAt instanceof Date);
});

test('email delivery failures preserve safe actionable reconciliation codes', async () => {
  for (const [providerCode, reconciliationCode] of [
    ['configuration', 'email_configuration'],
    ['provider_unavailable', 'email_provider_unavailable'],
    ['provider_rejected', 'email_provider_rejected'],
    ['invalid_response', 'email_invalid_response'],
  ]) {
    const p = persistence({
      status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one',
      calendarEventId, meetingUrl,
    });
    await assert.rejects(
      () => processStripeWebhookEvent(
        event('checkout.session.completed'), p, async () => assert.fail('Calendar must not repeat'),
        async () => { throw new EmailDeliveryError(providerCode); },
      ),
      (error) => error instanceof StripeWebhookReconciliationError && error.code === reconciliationCode,
    );
    assert.equal(p.get().status, 'CONFIRMED');
    assert.equal(p.get().confirmationEmailSentAt, null);
  }
});

test('remote email acceptance followed by local persistence failure recovers idempotently', async () => {
  const p = persistence();
  const recordConfirmationEmail = p.recordConfirmationEmail;
  let persistenceAttempts = 0;
  p.recordConfirmationEmail = async (input) => {
    persistenceAttempts += 1;
    if (persistenceAttempts === 1) throw new Error('database unavailable');
    return recordConfirmationEmail(input);
  };
  let calendarCalls = 0;
  const finalize = async () => {
    calendarCalls += 1;
    return { calendarEventId, meetingUrl };
  };
  const providerRequests = [];
  const send = (confirmedBooking) => sendBookingConfirmationEmail(confirmedBooking, {
    configuration: {
      apiKey: 'test-key', from: 'Bookings <bookings@example.test>',
      changesUrl: 'https://example.test/request-a-change',
      managementSecret: 'test-management-secret-with-at-least-32-bytes',
    },
    sendEmail: async (message) => {
      providerRequests.push(message);
      return { messageId: 'email_remote_accepted' };
    },
  });

  await assert.rejects(
    () => processStripeWebhookEvent(event('checkout.session.completed'), p, finalize, send),
    (error) => error instanceof StripeWebhookReconciliationError && error.code === 'email_persistence_pending',
  );
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(p.get().calendarEventId, calendarEventId);
  assert.equal(p.get().meetingUrl, meetingUrl);
  assert.equal(p.get().confirmationEmailSentAt, null);

  await processStripeWebhookEvent(
    event('checkout.session.completed'), p, async () => assert.fail('Calendar must not repeat'), send,
  );
  await processStripeWebhookEvent(
    event('checkout.session.completed'), p, async () => assert.fail('Calendar must not repeat'), send,
  );

  assert.equal(calendarCalls, 1);
  assert.equal(providerRequests.length, 2);
  assert.deepEqual(
    providerRequests.map(({ idempotencyKey }) => idempotencyKey),
    Array(2).fill(`booking-confirmation:${bookingId}`),
  );
  assert.ok(p.get().confirmationEmailSentAt instanceof Date);
  assert.equal(p.get().confirmationEmailId, 'email_remote_accepted');
  assert.equal(persistenceAttempts, 2);
});

test('already-recorded confirmation email is idempotent on webhook replay', async () => {
  const p = persistence({
    status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one',
    calendarEventId, meetingUrl, confirmationEmailSentAt: new Date('2030-01-01T11:00:00Z'),
    confirmationEmailId: 'email_existing',
  });
  await processStripeWebhookEvent(
    event('checkout.session.completed'), p, async () => assert.fail('Calendar must not repeat'),
    async () => assert.fail('Email must not repeat'),
  );
});

test('completed paid Checkout moves HOLD through PAID to CONFIRMED after Google succeeds', async () => {
  const p = persistence();
  const seen = [];
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async (paidBooking) => {
    seen.push(paidBooking.status);
    return { calendarEventId, meetingUrl };
  });
  assert.deepEqual(seen, ['PAID']);
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(p.get().calendarEventId, calendarEventId);
  assert.equal(p.get().meetingUrl, meetingUrl);
});

test('Google failure leaves payment durably PAID and duplicate webhook retries finalization', async () => {
  const p = persistence(); let calls = 0;
  const finalize = async () => {
    calls += 1;
    if (calls === 1) throw new Error('provider detail');
    return { calendarEventId, meetingUrl };
  };
  await assert.rejects(() => processStripeWebhookEvent(event('checkout.session.completed'), p, finalize), StripeWebhookReconciliationError);
  assert.equal(p.get().status, 'PAID');
  await processStripeWebhookEvent(event('checkout.session.completed'), p, finalize);
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(calls, 2);
});

test('duplicate completed webhook accepts matching CONFIRMED Google data without another Google call', async () => {
  const p = persistence({
    status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one',
    calendarEventId, meetingUrl,
  });
  let calls = 0;
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async () => { calls += 1; });
  assert.equal(calls, 0);
});

test('CONFIRMED webhook rejects wrong event IDs and missing or invalid Meet URLs', async () => {
  const invalidGoogleData = [
    { calendarEventId: 'event-id', meetingUrl },
    { calendarEventId, meetingUrl: null },
    { calendarEventId, meetingUrl: 'https://example.com/not-meet' },
  ];
  for (const data of invalidGoogleData) {
    await assert.rejects(() => processStripeWebhookEvent(event('checkout.session.completed'), persistence({
      status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one', ...data,
    }), async () => assert.fail('Calendar finalization must not run')), StripeWebhookReconciliationError);
  }
});

test('remote success followed by local persistence failure recovers the same event and Meet on webhook retry', async () => {
  const p = persistence();
  const originalConfirm = p.confirm;
  let confirmAttempts = 0;
  p.confirm = async (input) => {
    confirmAttempts += 1;
    if (confirmAttempts === 1) throw new Error('database unavailable');
    return originalConfirm(input);
  };

  let remoteEvent;
  let logicalEventCreations = 0;
  let insertAttempts = 0;
  let getAttempts = 0;
  const finalize = (paidBooking) => reconcileBookingCalendarEvent(paidBooking, {
    getCredentials: async () => ({
      calendarId: 'persisted-calendar@example.com', refreshToken: 'refresh-token',
      grantedScopes: [GOOGLE_EVENTS_OWNED_SCOPE],
    }),
    getOAuthConfig: async () => ({ clientId: 'client-id', clientSecret: 'client-secret' }),
    refreshAccessToken: async () => ({ accessToken: 'access-token' }),
    insertEvent: async ({ event: requestedEvent }) => {
      insertAttempts += 1;
      if (remoteEvent) throw new GoogleApiError('conflict');
      logicalEventCreations += 1;
      remoteEvent = {
        ...requestedEvent,
        hangoutLink: meetingUrl,
        conferenceData: { createRequest: { status: { statusCode: 'success' } } },
      };
      return remoteEvent;
    },
    getEvent: async ({ eventId }) => {
      getAttempts += 1;
      assert.equal(eventId, calendarEventId);
      return remoteEvent;
    },
  });

  await assert.rejects(
    () => processStripeWebhookEvent(event('checkout.session.completed'), p, finalize),
    StripeWebhookReconciliationError,
  );
  assert.equal(p.get().status, 'PAID');
  assert.equal(p.get().calendarEventId, null);
  assert.equal(p.get().meetingUrl, null);

  await processStripeWebhookEvent(event('checkout.session.completed'), p, finalize);
  assert.equal(logicalEventCreations, 1);
  assert.equal(insertAttempts, 2);
  assert.equal(getAttempts, 1);
  assert.equal(confirmAttempts, 2);
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(p.get().calendarEventId, calendarEventId);
  assert.equal(p.get().meetingUrl, meetingUrl);
});

test('unsupported and expired events never invoke Calendar finalization', async () => {
  let calls = 0; const finalize = async () => { calls += 1; };
  await processStripeWebhookEvent({ type: 'customer.created' }, persistence(), finalize);
  await processStripeWebhookEvent(event('checkout.session.expired', { payment_status: 'unpaid', payment_intent: null }), persistence(), finalize);
  assert.equal(calls, 0);
});

test('completed payment after local Checkout expiry still moves unresolved HOLD to PAID', async () => {
  const p = persistence({
    status: 'HOLD',
    expiresAt: new Date('2026-09-15T11:59:59.000Z'),
    stripeCheckoutSessionId: 'cs_test_one',
    stripePaymentIntentId: null,
  });
  await processStripeWebhookEvent(event('checkout.session.completed'), p);
  assert.equal(p.get().status, 'PAID');
  assert.equal(p.get().stripePaymentIntentId, 'pi_test_one');
});

test('completed webhook validates amount, currency, correlation, Session, and payment state', async () => {
  const bad = [
    { amount_total: 1 }, { currency: 'usd' }, { payment_status: 'unpaid' }, { mode: 'subscription' },
    { client_reference_id: 'other' }, { metadata: { bookingId: 'other' } }, { payment_intent: null },
  ];
  for (const override of bad) await assert.rejects(() => processStripeWebhookEvent(event('checkout.session.completed', override), persistence()), StripeWebhookReconciliationError);
  await assert.rejects(() => processStripeWebhookEvent(event('checkout.session.completed'), persistence({ status: 'HOLD', stripeCheckoutSessionId: 'different', stripePaymentIntentId: null })), StripeWebhookReconciliationError);
});

test('expired Checkout cancels only its matching unpaid HOLD and duplicate is safe', async () => {
  const p = persistence();
  const expired = event('checkout.session.expired', { payment_status: 'unpaid', payment_intent: null });
  await processStripeWebhookEvent(expired, p);
  await processStripeWebhookEvent(expired, p);
  assert.equal(p.get().status, 'CANCELLED');
});

test('expiry never downgrades paid and completion never downgrades confirmed', async () => {
  const paid = persistence({ status: 'PAID', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one' });
  await processStripeWebhookEvent(event('checkout.session.expired', { payment_status: 'unpaid' }), paid);
  assert.equal(paid.get().status, 'PAID');
  const confirmed = persistence({
    status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one',
    calendarEventId, meetingUrl,
  });
  await processStripeWebhookEvent(event('checkout.session.completed'), confirmed);
  assert.equal(confirmed.get().status, 'CONFIRMED');
});

test('unsupported event is accepted without mutation', async () => {
  const p = persistence();
  await processStripeWebhookEvent({ type: 'customer.created' }, p);
  assert.equal(p.get().status, 'HOLD');
});

test('webhook handler verifies raw text and rejects missing or invalid signatures before mutation', async () => {
  let processed = 0;
  const handler = createStripeWebhookHandler({ constructEvent: (payload, signature) => {
    assert.equal(payload, '{"raw":true}');
    if (signature !== 'valid') throw new Error('bad');
    return { type: 'customer.created' };
  }, processEvent: async () => { processed += 1; } });
  for (const signature of [undefined, 'invalid']) {
    const headers = signature ? { 'stripe-signature': signature } : {};
    const response = await handler(new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers, body: '{"raw":true}' }));
    assert.equal(response.status, 400);
  }
  const response = await handler(new Request('http://localhost/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 'valid' }, body: '{"raw":true}' }));
  assert.equal(response.status, 200);
  assert.equal(processed, 1);
});

test('webhook handler logs only the safe reconciliation category for email failures', async () => {
  const originalError = console.error;
  const logs = [];
  console.error = (...values) => logs.push(values);
  try {
    const handler = createStripeWebhookHandler({
      constructEvent: () => ({ id: 'evt_safe_log', type: 'checkout.session.completed' }),
      processEvent: async () => { throw new StripeWebhookReconciliationError('pending', 'email_provider_unavailable'); },
    });
    const response = await handler(new Request('http://localhost/api/stripe/webhook', {
      method: 'POST', headers: { 'stripe-signature': 'valid' }, body: '{}',
    }));
    assert.equal(response.status, 500);
    assert.equal(logs.length, 1);
    assert.deepEqual(logs[0][1], {
      eventId: 'evt_safe_log',
      errorName: 'StripeWebhookReconciliationError',
      reconciliationRequired: true,
      reconciliationCode: 'email_provider_unavailable',
    });
  } finally {
    console.error = originalError;
  }
});
