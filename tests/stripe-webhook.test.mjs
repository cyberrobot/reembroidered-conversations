import assert from 'node:assert/strict';
import test from 'node:test';
import { createStripeWebhookHandler } from '../src/lib/booking/stripe-webhook-handler.ts';
import { processStripeWebhookEvent, StripeWebhookReconciliationError } from '../src/lib/booking/stripe-webhook.mjs';

const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';
const session = (overrides = {}) => ({ object: 'checkout.session', id: 'cs_test_one', client_reference_id: bookingId, metadata: { bookingId }, mode: 'payment', payment_status: 'paid', amount_total: 5500, currency: 'gbp', payment_intent: 'pi_test_one', ...overrides });
const event = (type, overrides) => ({ id: 'evt_test', type, data: { object: session(overrides) } });

function persistence(initial = { status: 'HOLD', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: null }) {
  let booking = {
    id: bookingId, email: 'listener@example.com', startAt: new Date('2030-01-01T10:00:00Z'),
    endAt: new Date('2030-01-01T10:55:00Z'), timezone: 'Europe/London', calendarEventId: null,
    meetingUrl: null, ...initial,
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

test('completed paid Checkout moves HOLD through PAID to CONFIRMED after Google succeeds', async () => {
  const p = persistence();
  const seen = [];
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async (paidBooking) => {
    seen.push(paidBooking.status);
    return { calendarEventId: 'rec5a4496557be3432ca124b769e10b50ef', meetingUrl: 'https://meet.google.com/abc-defg-hij' };
  });
  assert.deepEqual(seen, ['PAID']);
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(p.get().calendarEventId, 'rec5a4496557be3432ca124b769e10b50ef');
  assert.equal(p.get().meetingUrl, 'https://meet.google.com/abc-defg-hij');
});

test('Google failure leaves payment durably PAID and duplicate webhook retries finalization', async () => {
  const p = persistence(); let calls = 0;
  const finalize = async () => {
    calls += 1;
    if (calls === 1) throw new Error('provider detail');
    return { calendarEventId: 'event-id', meetingUrl: 'https://meet.google.com/abc-defg-hij' };
  };
  await assert.rejects(() => processStripeWebhookEvent(event('checkout.session.completed'), p, finalize), StripeWebhookReconciliationError);
  assert.equal(p.get().status, 'PAID');
  await processStripeWebhookEvent(event('checkout.session.completed'), p, finalize);
  assert.equal(p.get().status, 'CONFIRMED');
  assert.equal(calls, 2);
});

test('duplicate completed webhook after CONFIRMED is a Google no-op', async () => {
  const p = persistence({
    status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one',
    calendarEventId: 'event-id', meetingUrl: 'https://meet.google.com/abc-defg-hij',
  });
  let calls = 0;
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async () => { calls += 1; });
  assert.equal(calls, 0);
});

test('failed local confirmation is recovered only when matching confirmed data is reloaded', async () => {
  const p = persistence({ status: 'PAID', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one' });
  p.confirm = async ({ calendarEventId, meetingUrl }) => {
    const current = p.get();
    Object.assign(current, { status: 'CONFIRMED', calendarEventId, meetingUrl });
    return { count: 0 };
  };
  await processStripeWebhookEvent(event('checkout.session.completed'), p, async () => ({ calendarEventId: 'event-id', meetingUrl: 'https://meet.google.com/abc-defg-hij' }));
  assert.equal(p.get().status, 'CONFIRMED');
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
    calendarEventId: 'event-id', meetingUrl: 'https://meet.google.com/abc-defg-hij',
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
