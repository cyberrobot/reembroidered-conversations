import { NextResponse } from 'next/server.js';
import {
  CheckoutUnavailableError,
  createBookingCheckout,
  HoldUnavailableError,
  InvalidCheckoutRequestError,
} from './stripe-checkout.mjs';

type CheckoutService = typeof createBookingCheckout;
const headers = { 'Cache-Control': 'no-store' };

export function createBookingCheckoutHandler(service: CheckoutService, getNow = () => new Date()) {
  return async function bookingCheckoutHandler(request: Request) {
    let input: unknown;
    try { input = await request.json(); } catch {
      return NextResponse.json({ error: { code: 'invalid_checkout_request', message: 'Check the payment request and try again.' } }, { status: 400, headers });
    }
    try {
      const checkout = await service(input as never, getNow());
      return NextResponse.json({ checkout: { url: checkout.url, expiresAt: checkout.expiresAt.toISOString() } }, { headers });
    } catch (error) {
      if (error instanceof InvalidCheckoutRequestError) {
        return NextResponse.json({ error: { code: 'invalid_checkout_request', message: 'Check the payment request and try again.' } }, { status: 400, headers });
      }
      if (error instanceof HoldUnavailableError) {
        return NextResponse.json({ error: { code: 'hold_unavailable', message: 'That time is no longer reserved.' } }, { status: 409, headers });
      }
      console.error('Stripe Checkout initiation failed.', { errorName: error instanceof Error ? error.name : 'UnknownError' });
      return NextResponse.json({ error: { code: 'checkout_unavailable', message: 'Secure payment could not be started. Please try again.' } }, { status: error instanceof CheckoutUnavailableError ? 503 : 500, headers });
    }
  };
}
