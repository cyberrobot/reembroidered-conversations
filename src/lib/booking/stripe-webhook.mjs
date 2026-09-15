// @ts-check

import 'server-only';
import { SESSION_PRODUCT } from './session-product.mjs';

export class StripeWebhookReconciliationError extends Error {
  constructor(message = 'Stripe event could not be reconciled.') { super(message); this.name = 'StripeWebhookReconciliationError'; }
}

export function createStripeWebhookPersistence(database) {
  return {
    markPaid: ({ bookingId, sessionId, paymentIntentId }) => database.booking.updateMany({
      where: { id: bookingId, status: 'HOLD', stripeCheckoutSessionId: sessionId },
      data: { status: 'PAID', stripePaymentIntentId: paymentIntentId },
    }),
    cancelExpired: ({ bookingId, sessionId }) => database.booking.updateMany({
      where: { id: bookingId, status: 'HOLD', stripeCheckoutSessionId: sessionId },
      data: { status: 'CANCELLED' },
    }),
    findBooking: (bookingId) => database.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, stripeCheckoutSessionId: true, stripePaymentIntentId: true },
    }),
  };
}

function correlation(session) {
  const metadataId = session?.metadata?.bookingId;
  if (typeof metadataId !== 'string' || session.client_reference_id !== metadataId) {
    throw new StripeWebhookReconciliationError('Invalid booking correlation.');
  }
  return metadataId;
}

export async function processStripeWebhookEvent(event, persistence) {
  if (event?.type !== 'checkout.session.completed' && event?.type !== 'checkout.session.expired') return;
  const session = event?.data?.object;
  if (!session || session.object !== 'checkout.session' || typeof session.id !== 'string') {
    throw new StripeWebhookReconciliationError('Invalid Checkout Session.');
  }
  const bookingId = correlation(session);

  if (event.type === 'checkout.session.completed') {
    if (session.mode !== 'payment' || session.payment_status !== 'paid' ||
        session.amount_total !== SESSION_PRODUCT.amountMinor || session.currency !== SESSION_PRODUCT.currency ||
        typeof session.payment_intent !== 'string') {
      throw new StripeWebhookReconciliationError('Unexpected payment details.');
    }
    const result = await persistence.markPaid({ bookingId, sessionId: session.id, paymentIntentId: session.payment_intent });
    if (result.count === 1) return;
    const booking = await persistence.findBooking(bookingId);
    if (booking && ['PAID', 'CONFIRMED'].includes(booking.status) &&
        booking.stripeCheckoutSessionId === session.id && booking.stripePaymentIntentId === session.payment_intent) return;
    throw new StripeWebhookReconciliationError();
  }

  if (session.payment_status === 'paid') throw new StripeWebhookReconciliationError('Paid Session reported expired.');
  const result = await persistence.cancelExpired({ bookingId, sessionId: session.id });
  if (result.count === 1) return;
  const booking = await persistence.findBooking(bookingId);
  if (booking?.stripeCheckoutSessionId === session.id && ['CANCELLED', 'PAID', 'CONFIRMED', 'REFUNDED'].includes(booking.status)) return;
  throw new StripeWebhookReconciliationError();
}

export async function processStripeWebhook(event) {
  const { db } = await import('../db.ts');
  return processStripeWebhookEvent(event, createStripeWebhookPersistence(db));
}
