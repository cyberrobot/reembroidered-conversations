import assert from 'node:assert/strict';
import test from 'node:test';
import { createBookingCheckoutHandler } from '../src/lib/booking/stripe-checkout-handler.ts';
import { CheckoutUnavailableError, HoldUnavailableError, InvalidCheckoutRequestError } from '../src/lib/booking/stripe-checkout.mjs';

const request = (body = '{}') => new Request('http://localhost/api/bookings/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body });

test('checkout route returns only the browser redirect data with no-store', async () => {
  const response = await createBookingCheckoutHandler(async () => ({ url: 'https://checkout.stripe.com/test', expiresAt: new Date('2026-09-15T12:30:00Z'), secret: 'hidden' }))(request('{"bookingId":"x"}'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { checkout: { url: 'https://checkout.stripe.com/test', expiresAt: '2026-09-15T12:30:00.000Z' } });
});

test('checkout route classifies malformed, invalid, unavailable, and provider failures', async () => {
  const cases = [
    [request('{'), async () => assert.fail(), 400, 'invalid_checkout_request'],
    [request(), async () => { throw new InvalidCheckoutRequestError(); }, 400, 'invalid_checkout_request'],
    [request(), async () => { throw new HoldUnavailableError(); }, 409, 'hold_unavailable'],
    [request(), async () => { throw new CheckoutUnavailableError(new Error('secret')); }, 503, 'checkout_unavailable'],
  ];
  for (const [req, service, status, code] of cases) {
    const response = await createBookingCheckoutHandler(service)(req);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.doesNotMatch(body.error.message ?? '', /secret/i);
  }
});
