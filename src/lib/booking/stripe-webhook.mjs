// @ts-check

import 'server-only';
import {
  googleEventIdForBooking,
  isUsableGoogleMeetUrl,
} from '../calendar/booking-event.mjs';
import { SESSION_PRODUCT } from './session-product.mjs';

export class StripeWebhookReconciliationError extends Error {
  /**
   * @param {string} [message]
   * @param {'reconciliation_pending' | 'email_configuration' | 'email_provider_unavailable' | 'email_provider_rejected' | 'email_invalid_response' | 'email_delivery_pending' | 'email_persistence_pending'} [code]
   */
  constructor(message = 'Stripe event could not be reconciled.', code = 'reconciliation_pending') {
    super(message);
    this.name = 'StripeWebhookReconciliationError';
    this.code = code;
  }
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
      select: {
        id: true, name: true, email: true, startAt: true, endAt: true, timezone: true, status: true,
        stripeCheckoutSessionId: true, stripePaymentIntentId: true,
        calendarEventId: true, meetingUrl: true,
        confirmationEmailSentAt: true, confirmationEmailId: true,
      },
    }),
    confirm: ({ bookingId, sessionId, paymentIntentId, calendarEventId, meetingUrl }) => database.booking.updateMany({
      where: {
        id: bookingId, status: 'PAID', stripeCheckoutSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId,
      },
      data: { status: 'CONFIRMED', calendarEventId, meetingUrl },
    }),
    recordConfirmationEmail: ({ bookingId, messageId, acceptedAt }) => database.booking.updateMany({
      where: { id: bookingId, status: 'CONFIRMED', confirmationEmailSentAt: null },
      data: { confirmationEmailSentAt: acceptedAt, confirmationEmailId: messageId },
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

async function deliverConfirmationEmail(booking, persistence, sendConfirmationEmail) {
  if (!sendConfirmationEmail || booking.confirmationEmailSentAt) return;
  let result;
  try { result = await sendConfirmationEmail(booking); }
  catch (error) {
    const deliveryCode = {
      configuration: 'email_configuration',
      provider_unavailable: 'email_provider_unavailable',
      provider_rejected: 'email_provider_rejected',
      invalid_response: 'email_invalid_response',
    }[error?.code] ?? 'email_delivery_pending';
    throw new StripeWebhookReconciliationError('Confirmation email delivery is pending.', deliveryCode);
  }
  if (typeof result?.messageId !== 'string' || !result.messageId.trim()) {
    throw new StripeWebhookReconciliationError('Confirmation email delivery is pending.', 'email_invalid_response');
  }
  let recorded;
  try {
    recorded = await persistence.recordConfirmationEmail({
      bookingId: booking.id,
      messageId: result.messageId,
      acceptedAt: new Date(),
    });
  } catch {
    throw new StripeWebhookReconciliationError('Confirmation email persistence is pending.', 'email_persistence_pending');
  }
  if (recorded.count === 1) return;
  const current = await persistence.findBooking(booking.id);
  if (current?.status === 'CONFIRMED' && current.confirmationEmailSentAt) return;
  throw new StripeWebhookReconciliationError('Confirmation email persistence is pending.', 'email_persistence_pending');
}

export async function processStripeWebhookEvent(event, persistence, finalizeCalendar, sendConfirmationEmail) {
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
    await persistence.markPaid({ bookingId, sessionId: session.id, paymentIntentId: session.payment_intent });
    const booking = await persistence.findBooking(bookingId);
    if (!booking || !['PAID', 'CONFIRMED'].includes(booking.status) ||
        booking.stripeCheckoutSessionId !== session.id || booking.stripePaymentIntentId !== session.payment_intent) {
      throw new StripeWebhookReconciliationError();
    }
    if (booking.status === 'CONFIRMED') {
      let expectedEventId;
      try { expectedEventId = googleEventIdForBooking(booking.id); }
      catch { throw new StripeWebhookReconciliationError(); }
      if (booking.calendarEventId !== expectedEventId || !isUsableGoogleMeetUrl(booking.meetingUrl)) {
        throw new StripeWebhookReconciliationError();
      }
      return deliverConfirmationEmail(booking, persistence, sendConfirmationEmail);
    }
    if (!finalizeCalendar) return;
    let google;
    try { google = await finalizeCalendar(booking); } catch { throw new StripeWebhookReconciliationError('Calendar finalization is pending.'); }
    if (!google?.calendarEventId || !google?.meetingUrl) throw new StripeWebhookReconciliationError('Calendar finalization is pending.');
    let confirmed;
    try {
      confirmed = await persistence.confirm({
        bookingId, sessionId: session.id, paymentIntentId: session.payment_intent,
        calendarEventId: google.calendarEventId, meetingUrl: google.meetingUrl,
      });
    } catch {
      throw new StripeWebhookReconciliationError('Calendar finalization persistence is pending.');
    }
    const current = await persistence.findBooking(bookingId);
    if (confirmed.count === 1) {
      if (current?.status !== 'CONFIRMED') throw new StripeWebhookReconciliationError();
      return deliverConfirmationEmail(current, persistence, sendConfirmationEmail);
    }
    if (current?.status === 'CONFIRMED' && current.stripeCheckoutSessionId === session.id &&
        current.stripePaymentIntentId === session.payment_intent && current.calendarEventId === google.calendarEventId &&
        current.meetingUrl === google.meetingUrl) {
      return deliverConfirmationEmail(current, persistence, sendConfirmationEmail);
    }
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
  const { reconcileBookingCalendarEvent } = await import('../calendar/booking-event.mjs');
  const { sendBookingConfirmationEmail } = await import('./booking-confirmation-email.mjs');
  return processStripeWebhookEvent(
    event,
    createStripeWebhookPersistence(db),
    reconcileBookingCalendarEvent,
    sendBookingConfirmationEmail,
  );
}
