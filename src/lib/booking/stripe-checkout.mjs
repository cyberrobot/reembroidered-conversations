// @ts-check

import 'server-only';
import { SESSION_PRODUCT, STRIPE_CHECKOUT_MINUTES } from './session-product.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class InvalidCheckoutRequestError extends Error {
  constructor() { super('Invalid checkout request.'); this.name = 'InvalidCheckoutRequestError'; }
}
export class HoldUnavailableError extends Error {
  constructor() { super('Booking hold unavailable.'); this.name = 'HoldUnavailableError'; }
}
export class CheckoutUnavailableError extends Error {
  /** @param {unknown} [cause] */
  constructor(cause) { super('Checkout unavailable.', { cause }); this.name = 'CheckoutUnavailableError'; }
}

/** @param {unknown} value */
function validateBookingId(value) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new InvalidCheckoutRequestError();
  return value;
}

/** @param {string | null | undefined} url */
function validCheckoutUrl(url) {
  if (!url) return false;
  try { return new URL(url).origin === 'https://checkout.stripe.com'; } catch { return false; }
}

export function createCheckoutPersistence(database) {
  return {
    findBooking: (id) => database.booking.findUnique({
      where: { id },
      select: { id: true, email: true, status: true, expiresAt: true, stripeCheckoutSessionId: true },
    }),
    attachSession: ({ bookingId, sessionId, expiresAt, now }) => database.booking.updateMany({
      where: { id: bookingId, status: 'HOLD', expiresAt: { gt: now }, stripeCheckoutSessionId: null },
      data: { stripeCheckoutSessionId: sessionId, expiresAt },
    }),
  };
}

const defaultDependencies = {
  persistence: undefined,
  stripe: undefined,
};

/**
 * @param {{ bookingId?: unknown }} input
 * @param {Date} now
 * @param {{ persistence?: ReturnType<typeof createCheckoutPersistence>, stripe?: any, appUrl?: string, getNow?: () => Date }} [dependencies]
 */
export async function createBookingCheckout(input, now, dependencies = defaultDependencies) {
  const bookingId = validateBookingId(input?.bookingId);
  let persistence = dependencies.persistence;
  let stripe = dependencies.stripe;
  if (!persistence) {
    const { db } = await import('../db.ts');
    persistence = createCheckoutPersistence(db);
  }
  if (!stripe) {
    const { getStripeClient } = await import('../stripe/client.ts');
    stripe = getStripeClient();
  }
  const appUrl = dependencies.appUrl ?? process.env.APP_URL;
  if (!appUrl) throw new CheckoutUnavailableError(new Error('APP_URL is required.'));

  const booking = await persistence.findBooking(bookingId);
  if (!booking || booking.status !== 'HOLD' || booking.expiresAt <= now) throw new HoldUnavailableError();

  if (booking.stripeCheckoutSessionId) {
    try {
      const existing = await stripe.checkout.sessions.retrieve(booking.stripeCheckoutSessionId);
      if (existing.status === 'open' && existing.expires_at * 1000 > now.getTime() && validCheckoutUrl(existing.url)) {
        return { url: existing.url, expiresAt: new Date(existing.expires_at * 1000) };
      }
    } catch (error) {
      throw new CheckoutUnavailableError(error);
    }
    throw new HoldUnavailableError();
  }

  const expiresAt = new Date(now.getTime() + STRIPE_CHECKOUT_MINUTES * 60_000);
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: booking.email,
      client_reference_id: booking.id,
      metadata: { bookingId: booking.id },
      payment_intent_data: { metadata: { bookingId: booking.id } },
      line_items: [{
        quantity: 1,
        price_data: {
          currency: SESSION_PRODUCT.currency,
          unit_amount: SESSION_PRODUCT.amountMinor,
          product_data: { name: SESSION_PRODUCT.name },
        },
      }],
      success_url: `${new URL('/booking/success', appUrl)}?booking_id=${encodeURIComponent(booking.id)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${new URL('/', appUrl)}?booking_cancelled=true#book-session`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
    }, { idempotencyKey: `booking-checkout:${booking.id}` });
  } catch (error) {
    throw new CheckoutUnavailableError(error);
  }

  if (!session?.id || session.status !== 'open' || !validCheckoutUrl(session.url)) {
    throw new CheckoutUnavailableError();
  }
  const effectiveExpiry = new Date(session.expires_at * 1000);
  const commitNow = dependencies.getNow?.() ?? new Date();
  try {
    const result = await persistence.attachSession({ bookingId, sessionId: session.id, expiresAt: effectiveExpiry, now: commitNow });
    if (result.count === 1) return { url: session.url, expiresAt: effectiveExpiry };
    const reconciled = await persistence.findBooking(bookingId);
    if (reconciled?.status === 'HOLD' && reconciled.expiresAt > commitNow && reconciled.stripeCheckoutSessionId === session.id) {
      return { url: session.url, expiresAt: reconciled.expiresAt };
    }
  } catch (error) {
    throw new CheckoutUnavailableError(error);
  }

  try { await stripe.checkout.sessions.expire(session.id); } catch { /* webhook/reconciliation can retry cleanup */ }
  throw new HoldUnavailableError();
}
