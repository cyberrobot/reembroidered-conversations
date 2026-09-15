import assert from 'node:assert/strict';
import test from 'node:test';
import { createStripeWebhookHandler } from '../src/lib/booking/stripe-webhook-handler.ts';
import { processStripeWebhookEvent, StripeWebhookReconciliationError } from '../src/lib/booking/stripe-webhook.mjs';

const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';
const session = (overrides = {}) => ({ object: 'checkout.session', id: 'cs_test_one', client_reference_id: bookingId, metadata: { bookingId }, mode: 'payment', payment_status: 'paid', amount_total: 5500, currency: 'gbp', payment_intent: 'pi_test_one', ...overrides });
const event = (type, overrides) => ({ id: 'evt_test', type, data: { object: session(overrides) } });

function persistence(initial = { status: 'HOLD', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: null }) {
  let booking = { ...initial };
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
  const confirmed = persistence({ status: 'CONFIRMED', stripeCheckoutSessionId: 'cs_test_one', stripePaymentIntentId: 'pi_test_one' });
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
