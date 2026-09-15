import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CheckoutUnavailableError,
  createBookingCheckout,
  HoldUnavailableError,
  InvalidCheckoutRequestError,
} from '../src/lib/booking/stripe-checkout.mjs';
import { SESSION_PRODUCT } from '../src/lib/booking/session-product.mjs';

const now = new Date('2026-09-15T12:00:00.000Z');
const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';

function fixture(overrides = {}) {
  const booking = { id: bookingId, email: 'customer@example.com', status: 'HOLD', expiresAt: new Date(now.getTime() + 15 * 60_000), stripeCheckoutSessionId: null, ...overrides };
  let attached;
  const session = { id: 'cs_test_one', object: 'checkout.session', status: 'open', url: 'https://checkout.stripe.com/c/pay/test', expires_at: Math.floor(now.getTime() / 1000) + 1800 };
  const calls = [];
  const persistence = {
    findBooking: async () => attached ? { ...booking, ...attached } : booking,
    attachSession: async (input) => { attached = { stripeCheckoutSessionId: input.sessionId, expiresAt: input.expiresAt }; return { count: 1 }; },
  };
  const stripe = { checkout: { sessions: {
    create: async (input, options) => { calls.push({ input, options }); return session; },
    retrieve: async () => session,
    expire: async () => ({ ...session, status: 'expired' }),
  } } };
  return { booking, persistence, stripe, session, calls, getAttached: () => attached };
}

test('canonical listening session product is 55 minutes and exactly GBP 5500', () => {
  assert.deepEqual(SESSION_PRODUCT, { durationMinutes: 55, amountMinor: 5500, currency: 'gbp', displayPrice: '£55', name: '55-minute private listening session' });
});

test('active hold creates and persists a correlated card-only Checkout Session', async () => {
  const f = fixture();
  const result = await createBookingCheckout({ bookingId, amount: 1, currency: 'usd' }, now, { ...f, appUrl: 'https://example.test', getNow: () => now });
  assert.equal(result.url, f.session.url);
  assert.equal(f.getAttached().stripeCheckoutSessionId, f.session.id);
  assert.equal(f.getAttached().expiresAt.toISOString(), '2026-09-15T12:30:00.000Z');
  const { input, options } = f.calls[0];
  assert.equal(input.line_items[0].price_data.unit_amount, 5500);
  assert.equal(input.line_items[0].price_data.currency, 'gbp');
  assert.deepEqual(input.payment_method_types, ['card']);
  assert.equal(input.client_reference_id, bookingId);
  assert.equal(input.metadata.bookingId, bookingId);
  assert.equal(input.payment_intent_data.metadata.bookingId, bookingId);
  assert.equal(input.customer_email, 'customer@example.com');
  assert.equal(options.idempotencyKey, `booking-checkout:${bookingId}`);
});

test('invalid, expired, and non-HOLD bookings cannot start Checkout', async () => {
  await assert.rejects(() => createBookingCheckout({ bookingId: 'bad' }, now, {}), InvalidCheckoutRequestError);
  for (const booking of [
    { expiresAt: now },
    { status: 'PAID' },
    { status: 'CANCELLED' },
  ]) {
    const f = fixture(booking);
    await assert.rejects(() => createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now }), HoldUnavailableError);
    assert.equal(f.calls.length, 0);
  }
});

test('retry retrieves the one persisted open Session', async () => {
  const f = fixture({ stripeCheckoutSessionId: 'cs_test_one', expiresAt: new Date(now.getTime() + 30 * 60_000) });
  const result = await createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now });
  assert.equal(result.url, f.session.url);
  assert.equal(f.calls.length, 0);
});

test('concurrent initiation exposes one Stripe Session and reconciles one database association', async () => {
  const f = fixture();
  let associated = false;
  f.persistence.attachSession = async () => {
    if (associated) return { count: 0 };
    associated = true;
    return { count: 1 };
  };
  f.persistence.findBooking = async () => associated
    ? { ...f.booking, stripeCheckoutSessionId: f.session.id, expiresAt: new Date(f.session.expires_at * 1000) }
    : f.booking;
  const [first, second] = await Promise.all([
    createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now }),
    createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now }),
  ]);
  assert.equal(first.url, f.session.url);
  assert.equal(second.url, f.session.url);
  assert.equal(new Set(f.calls.map(({ options }) => options.idempotencyKey)).size, 1);
});

test('Stripe failure keeps local HOLD untouched and is customer-safe', async () => {
  const f = fixture();
  f.stripe.checkout.sessions.create = async () => { throw new Error('secret provider detail'); };
  await assert.rejects(() => createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now }), CheckoutUnavailableError);
  assert.equal(f.getAttached(), undefined);
});

test('hold lost during Session creation expires the unusable Session', async () => {
  const f = fixture();
  f.persistence.attachSession = async () => ({ count: 0 });
  f.persistence.findBooking = async () => f.booking;
  let expired;
  f.stripe.checkout.sessions.expire = async (id) => { expired = id; };
  await assert.rejects(() => createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => new Date(now.getTime() + 16 * 60_000) }), HoldUnavailableError);
  assert.equal(expired, 'cs_test_one');
});

test('ambiguous persistence failure reuses the same Stripe idempotency key on retry', async () => {
  const f = fixture();
  f.persistence.attachSession = async () => { throw new Error('database unavailable'); };
  await assert.rejects(() => createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now }), CheckoutUnavailableError);
  await assert.rejects(() => createBookingCheckout({ bookingId }, now, { ...f, appUrl: 'https://example.test', getNow: () => now }), CheckoutUnavailableError);
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls[0].options.idempotencyKey, f.calls[1].options.idempotencyKey);
});
