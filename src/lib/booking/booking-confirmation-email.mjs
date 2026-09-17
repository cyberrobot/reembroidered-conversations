// @ts-check

import 'server-only';
import { isUsableGoogleMeetUrl } from '../calendar/booking-event.mjs';
import { getBookingEmailConfiguration, sendEmailWithResend } from '../email/resend.mjs';
import { SESSION_PRODUCT } from './session-product.mjs';

export const BOOKING_CONFIRMATION_SUBJECT = 'Your Re-Embroidered Conversation is confirmed';
export const PREPARATION_GUIDANCE = 'There is nothing you need to prepare formally. Find somewhere private and comfortable where you can speak freely. You may want a glass of water and a few quiet minutes beforehand.';

export class BookingConfirmationEmailError extends Error {
  /** @param {'ineligible_booking' | 'invalid_configuration'} code */
  constructor(code) {
    super(`Booking confirmation email failed: ${code}.`);
    this.name = 'BookingConfirmationEmailError';
    this.code = code;
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]);
}

function formatInTimeZone(value, timeZone, options) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, ...options }).format(value);
}

function confirmationDetails(booking) {
  if (booking?.status !== 'CONFIRMED' || typeof booking.id !== 'string' || !booking.id.trim() ||
      !booking.stripePaymentIntentId || !booking.calendarEventId ||
      typeof booking.name !== 'string' || !booking.name.trim() ||
      typeof booking.email !== 'string' || !booking.email.trim() ||
      typeof booking.timezone !== 'string' || !booking.timezone.trim() ||
      !isUsableGoogleMeetUrl(booking.meetingUrl)) throw new BookingConfirmationEmailError('ineligible_booking');
  const startAt = booking.startAt instanceof Date ? booking.startAt : new Date(booking.startAt);
  const endAt = booking.endAt instanceof Date ? booking.endAt : new Date(booking.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || startAt >= endAt) {
    throw new BookingConfirmationEmailError('ineligible_booking');
  }
  try {
    return {
      date: formatInTimeZone(startAt, booking.timezone, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      startTime: formatInTimeZone(startAt, booking.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
      endTime: formatInTimeZone(endAt, booking.timezone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
    };
  } catch {
    throw new BookingConfirmationEmailError('ineligible_booking');
  }
}

export function renderBookingConfirmationEmail(booking, { changesUrl }) {
  const details = confirmationDetails(booking);
  let parsedChangesUrl;
  try { parsedChangesUrl = new URL(changesUrl); } catch { throw new BookingConfirmationEmailError('invalid_configuration'); }
  if (!['http:', 'https:'].includes(parsedChangesUrl.protocol)) throw new BookingConfirmationEmailError('invalid_configuration');
  const name = escapeHtml(booking.name.trim());
  const date = escapeHtml(details.date);
  const time = `${escapeHtml(details.startTime)}&ndash;${escapeHtml(details.endTime)}`;
  const timezone = escapeHtml(booking.timezone);
  const meetingUrl = escapeHtml(booking.meetingUrl);
  const safeChangesUrl = escapeHtml(parsedChangesUrl.toString());
  const duration = `${SESSION_PRODUCT.durationMinutes}-minute session`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${BOOKING_CONFIRMATION_SUBJECT}</title></head>
<body style="margin:0;padding:0;background:#faf7f2;color:#1c2a39;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden">Your Google Meet link and session details.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#faf7f2"><tr><td align="center" style="padding:32px 14px 48px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border:1px solid #e6dccf;border-radius:12px">
<tr><td style="height:5px;background:#bd4d36;font-size:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:34px 28px 24px;background:#fcfaf8;border-bottom:1px dashed #e6dccf">
<p style="margin:0 0 12px;font-size:11px;font-weight:bold;letter-spacing:.12em;color:#bd4d36">&#10022; CONFIRMED DIALOGUE &#10022;</p>
<h1 style="margin:0;font-family:Georgia,serif;font-size:32px;line-height:1.15">Re-Embroidered Conversations</h1>
<p style="margin:8px 0 0;font-family:Georgia,serif;font-style:italic;color:#5f6b7a">A space for thoughtful, unhurried dialogue</p></td></tr>
<tr><td style="padding:32px 36px"><p style="margin:0 0 16px;font-size:17px;font-weight:bold">Dear ${name},</p>
<p style="margin:0 0 24px;line-height:1.65;color:#425265">Your Re-Embroidered Conversation is booked. Everything you need for our time together is below.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 28px;background:#faf8f5;border:1px dashed #dccfbf"><tr><td style="padding:22px 24px">
<h2 style="margin:0 0 14px;font-family:Georgia,serif;font-size:22px">Session details</h2>
<p style="margin:7px 0"><strong>${date}</strong></p><p style="margin:7px 0">${time}</p><p style="margin:7px 0">${timezone}</p><p style="margin:7px 0">${duration}</p>
</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 30px;background:#1c2a39"><tr><td align="center" style="padding:24px">
<h2 style="margin:0 0 16px;font-family:Georgia,serif;color:#fff">Join via Google Meet</h2>
<a href="${meetingUrl}" style="display:inline-block;padding:13px 28px;background:#bd4d36;border-radius:6px;color:#fff;font-weight:bold;text-decoration:none">Join on Google Meet</a>
<p style="margin:14px 0 0;font-size:12px;color:#d7dfe7;word-break:break-all"><a href="${meetingUrl}" style="color:#f4ece1">${meetingUrl}</a></p></td></tr></table>
<h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:22px">A little preparation</h2><p style="margin:0 0 28px;line-height:1.65;color:#425265">${PREPARATION_GUIDANCE}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8f5f0;border:1px dashed #d9cebf"><tr><td style="padding:20px">
<h2 style="margin:0 0 8px;font-family:Georgia,serif;font-size:19px">Need to make a change?</h2><p style="margin:0 0 14px;line-height:1.55;color:#5f6b7a">Use the request link below. Opening it does not automatically change your booking.</p>
<a href="${safeChangesUrl}" style="color:#bd4d36;font-weight:bold">Request cancellation or rescheduling</a></td></tr></table>
<p style="margin:28px 0 0;line-height:1.6;color:#405162">Warmly,<br><strong style="font-family:Georgia,serif;font-size:18px">Shahd Karaeen</strong><br><span style="font-size:13px;color:#707f8f">Re-Embroidered Conversations</span></p>
</td></tr><tr><td align="center" style="padding:22px;background:#f7f3eb;border-top:1px dashed #e0d4c5;font-family:Georgia,serif">&mdash; Re-Embroidered Conversations &mdash;</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Re-Embroidered Conversations

Your session is confirmed

Dear ${booking.name.trim()},

Your Re-Embroidered Conversation is booked.

SESSION DETAILS
${details.date}
${details.startTime}–${details.endTime}
${booking.timezone}
${duration}

Join on Google Meet:
${booking.meetingUrl}

A little preparation
${PREPARATION_GUIDANCE}

Request cancellation or rescheduling:
${parsedChangesUrl.toString()}
Opening this link does not automatically change your booking.

Warmly,
Shahd Karaeen
Re-Embroidered Conversations`;
  return { subject: BOOKING_CONFIRMATION_SUBJECT, html, text };
}

export async function sendBookingConfirmationEmail(booking, dependencies = {}) {
  const configuration = dependencies.configuration ?? getBookingEmailConfiguration();
  const rendered = renderBookingConfirmationEmail(booking, configuration);
  const sendEmail = dependencies.sendEmail ?? sendEmailWithResend;
  return sendEmail({
    ...rendered,
    from: configuration.from,
    to: booking.email,
    idempotencyKey: `booking-confirmation:${booking.id}`,
  }, { apiKey: configuration.apiKey });
}
