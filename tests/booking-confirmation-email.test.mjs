import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BOOKING_CONFIRMATION_SUBJECT,
  BookingConfirmationEmailError,
  renderBookingConfirmationEmail,
  sendBookingConfirmationEmail,
} from '../src/lib/booking/booking-confirmation-email.mjs';
import { EmailDeliveryError, getBookingEmailConfiguration, sendEmailWithResend } from '../src/lib/email/resend.mjs';

const booking = (overrides = {}) => ({
  id: '5a449655-7be3-432c-a124-b769e10b50ef',
  name: 'Evelyn St. Claire',
  email: 'evelyn@example.test',
  startAt: new Date('2026-09-24T13:00:00.000Z'),
  endAt: new Date('2026-09-24T13:55:00.000Z'),
  timezone: 'Europe/London',
  status: 'CONFIRMED',
  stripePaymentIntentId: 'pi_secret_not_for_email',
  calendarEventId: 'rec5a4496557be3432ca124b769e10b50ef',
  meetingUrl: 'https://meet.google.com/abc-defg-hij',
  ...overrides,
});
const configuration = {
  apiKey: 'test-key',
  from: 'Re-Embroidered Conversations <bookings@example.test>',
  changesUrl: 'https://example.test/request-a-change',
};

test('renders branded HTML and plain text from authoritative confirmed booking data', () => {
  const result = renderBookingConfirmationEmail(booking(), configuration);
  assert.equal(result.subject, BOOKING_CONFIRMATION_SUBJECT);
  for (const expected of [
    'Evelyn St. Claire', 'Thursday, 24 September 2026', '14:00', '14:55',
    'Europe/London', '55-minute session', 'https://meet.google.com/abc-defg-hij',
    'Request cancellation or rescheduling', 'There is nothing you need to prepare formally',
    'Re-Embroidered Conversations',
  ]) {
    assert.ok(result.html.includes(expected), `HTML should include ${expected}`);
    assert.ok(result.text.includes(expected), `text should include ${expected}`);
  }
  assert.ok(result.html.includes(configuration.changesUrl));
  assert.ok(result.text.includes(configuration.changesUrl));
  for (const internal of ['pi_secret_not_for_email', 'rec5a4496557be3432ca124b769e10b50ef', booking().id]) {
    assert.equal(result.html.includes(internal), false);
    assert.equal(result.text.includes(internal), false);
  }
  assert.equal(/therapy|medical treatment/i.test(`${result.html} ${result.text}`), false);
});

test('escapes customer-controlled HTML values', () => {
  const result = renderBookingConfirmationEmail(booking({ name: '<img src=x onerror=alert(1)> & "Listener"' }), configuration);
  assert.ok(result.html.includes('&lt;img src=x onerror=alert(1)&gt; &amp; &quot;Listener&quot;'));
  assert.equal(result.html.includes('<img src=x'), false);
});

test('refuses incomplete or non-confirmed booking data', () => {
  for (const overrides of [
    { id: '' }, { status: 'HOLD' }, { status: 'PAID' }, { email: '' }, { name: '' }, { timezone: '' },
    { meetingUrl: 'https://example.test/not-meet' }, { calendarEventId: null },
    { stripePaymentIntentId: null }, { startAt: 'invalid' }, { endAt: new Date('2020-01-01T00:00:00Z') },
  ]) {
    assert.throws(() => renderBookingConfirmationEmail(booking(overrides), configuration), BookingConfirmationEmailError);
  }
});

test('sends one narrow provider request to the persisted recipient with a stable idempotency key', async () => {
  let message;
  const result = await sendBookingConfirmationEmail(booking(), {
    configuration,
    sendEmail: async (input) => { message = input; return { messageId: 'email_accepted' }; },
  });
  assert.deepEqual(result, { messageId: 'email_accepted' });
  assert.equal(message.to, 'evelyn@example.test');
  assert.equal(message.from, configuration.from);
  assert.equal(message.idempotencyKey, `booking-confirmation:${booking().id}`);
  assert.equal(message.subject, BOOKING_CONFIRMATION_SUBJECT);
});

test('Resend boundary uses provider idempotency and normalises failures', async () => {
  let request;
  const result = await sendEmailWithResend({
    from: configuration.from, to: booking().email, subject: 'subject', html: '<p>body</p>', text: 'body',
    idempotencyKey: 'booking-confirmation:test',
  }, {
    apiKey: 'secret',
    fetchImplementation: async (url, init) => { request = { url, init }; return new Response('{"id":"email_123"}', { status: 200 }); },
  });
  assert.deepEqual(result, { messageId: 'email_123' });
  assert.equal(request.init.headers['Idempotency-Key'], 'booking-confirmation:test');
  assert.equal(request.init.headers.Authorization, 'Bearer secret');
  assert.equal(JSON.parse(request.init.body).to[0], booking().email);
  await assert.rejects(() => sendEmailWithResend({
    from: 'from', to: 'to', subject: 's', html: 'h', text: 't', idempotencyKey: 'key',
  }, { apiKey: 'secret', fetchImplementation: async () => new Response('{"error":"private"}', { status: 422 }) }), EmailDeliveryError);
});

test('email configuration is server-only and requires HTTPS in production', () => {
  assert.deepEqual(getBookingEmailConfiguration({
    NODE_ENV: 'production', RESEND_API_KEY: 'key', BOOKING_EMAIL_FROM: 'Sender <sender@example.test>',
    BOOKING_CHANGES_URL: 'https://example.test/changes',
  }), { apiKey: 'key', from: 'Sender <sender@example.test>', changesUrl: 'https://example.test/changes' });
  assert.throws(() => getBookingEmailConfiguration({
    NODE_ENV: 'production', RESEND_API_KEY: 'key', BOOKING_EMAIL_FROM: 'sender@example.test',
    BOOKING_CHANGES_URL: 'http://example.test/changes',
  }), EmailDeliveryError);
});
