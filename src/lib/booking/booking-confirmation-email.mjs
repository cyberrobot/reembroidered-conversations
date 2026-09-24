// @ts-check

import "server-only";
import { isUsableGoogleMeetUrl } from "../calendar/booking-event.mjs";
import {
  getBookingEmailConfiguration,
  sendEmailWithResend,
} from "../email/resend.mjs";
import { buildBookingManagementLink } from "./booking-management-token.mjs";
import { SESSION_PRODUCT } from "./session-product.mjs";

export const BOOKING_CONFIRMATION_SUBJECT =
  "Your Re-Embroidered Conversation is confirmed";
export const PREPARATION_GUIDANCE =
  "There is nothing you need to prepare formally. Find somewhere private and comfortable where you can speak freely. You may want a glass of water and a few quiet minutes beforehand.";

export class BookingConfirmationEmailError extends Error {
  /** @param {'ineligible_booking' | 'invalid_configuration'} code */
  constructor(code) {
    super(`Booking confirmation email failed: ${code}.`);
    this.name = "BookingConfirmationEmailError";
    this.code = code;
  }
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character],
  );
}

function formatInTimeZone(value, timeZone, options) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, ...options }).format(
    value,
  );
}

function confirmationDetails(booking) {
  if (
    booking?.status !== "CONFIRMED" ||
    typeof booking.id !== "string" ||
    !booking.id.trim() ||
    !booking.stripePaymentIntentId ||
    !booking.calendarEventId ||
    typeof booking.name !== "string" ||
    !booking.name.trim() ||
    typeof booking.email !== "string" ||
    !booking.email.trim() ||
    typeof booking.timezone !== "string" ||
    !booking.timezone.trim() ||
    !isUsableGoogleMeetUrl(booking.meetingUrl)
  )
    throw new BookingConfirmationEmailError("ineligible_booking");
  const startAt =
    booking.startAt instanceof Date
      ? booking.startAt
      : new Date(booking.startAt);
  const endAt =
    booking.endAt instanceof Date ? booking.endAt : new Date(booking.endAt);
  if (
    Number.isNaN(startAt.getTime()) ||
    Number.isNaN(endAt.getTime()) ||
    startAt >= endAt
  ) {
    throw new BookingConfirmationEmailError("ineligible_booking");
  }
  try {
    return {
      date: formatInTimeZone(startAt, booking.timezone, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
      startTime: formatInTimeZone(startAt, booking.timezone, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
      endTime: formatInTimeZone(endAt, booking.timezone, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    };
  } catch {
    throw new BookingConfirmationEmailError("ineligible_booking");
  }
}

export function renderBookingConfirmationEmail(
  booking,
  { changesUrl, managementSecret },
) {
  const details = confirmationDetails(booking);
  let managementUrl;
  try {
    managementUrl = buildBookingManagementLink(booking.id, {
      baseUrl: changesUrl,
      secret: managementSecret,
    });
  } catch {
    throw new BookingConfirmationEmailError("invalid_configuration");
  }
  const name = escapeHtml(booking.name.trim());
  const date = escapeHtml(details.date);
  const time = `${escapeHtml(details.startTime)}&ndash;${escapeHtml(details.endTime)}`;
  const timezone = escapeHtml(booking.timezone);
  const meetingUrl = escapeHtml(booking.meetingUrl);
  const safeChangesUrl = escapeHtml(managementUrl);
  const duration = `${SESSION_PRODUCT.durationMinutes}-minute session`;
  const durationBadge = `${SESSION_PRODUCT.durationMinutes} Minutes`;
  const preparationItems = [
    [
      "Nothing formal to prepare",
      "There is nothing you need to prepare formally.",
    ],
    [
      "Find a comfortable space",
      "Find somewhere private and comfortable where you can speak freely.",
    ],
    ["Have some water nearby", "You may want a glass of water nearby."],
    ["Take a quiet moment", "Give yourself a few quiet minutes beforehand."],
  ];
  const preparationRows = preparationItems
    .map(
      ([heading, copy], index) => `
<tr><td style="padding:10px 0;vertical-align:top;border-bottom:1px dashed #e6dccf">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="38" style="vertical-align:top;padding-right:12px"><div style="width:26px;height:26px;border-radius:50%;background:#f8efe7;border:1.5px dashed #bd4d36;text-align:center;line-height:24px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:12px;font-weight:700;color:#bd4d36">${String(index + 1).padStart(2, "0")}</div></td>
<td style="vertical-align:top"><p style="margin:0 0 4px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14px;font-weight:600;color:#1c2a39">${heading}</p><p style="margin:0;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:13px;line-height:1.55;color:#5f6b7a">${copy}</p></td>
</tr></table></td></tr>`,
    )
    .join("");
  const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en"><head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><title>${BOOKING_CONFIRMATION_SUBJECT}</title>
<!--[if mso]><style type="text/css">body,table,td,p,a{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->
<style type="text/css">
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
body{margin:0;padding:0;min-width:100%;background-color:#faf7f2;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table{border-collapse:collapse;mso-table-lspace:0;mso-table-rspace:0}img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none}.email-container{width:100%;max-width:620px;margin:0 auto}.btn-meet:hover{background-color:#a33e29!important}.link-change:hover{color:#a33e29!important}@media only screen and (max-width:620px){.responsive-card{padding:24px 18px!important}.mobile-stack{display:block!important;width:100%!important}.mobile-center{text-align:center!important}}
</style></head>
<body style="margin:0;padding:0;background-color:#faf7f2;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="display:none;font-size:1px;color:#faf7f2;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">Your joining link, session details, and booking information.&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#faf7f2;table-layout:fixed"><tr><td align="center" style="padding:32px 14px 48px">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" class="email-container" style="max-width:620px;margin:0 auto;background-color:#ffffff;border:1px solid #e6dccf;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(28,42,57,.05)">
<tr><td style="background-color:#bd4d36;height:5px;font-size:0;line-height:0">&nbsp;</td></tr>
<tr><td align="center" style="padding:36px 32px 24px;background-color:#fcfaf8;border-bottom:1px dashed #e6dccf">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center"><tr><td align="center" style="padding-bottom:14px"><div style="display:inline-block;padding:8px 18px;border-radius:9999px;background-color:#faf3ec;border:1px solid #ebd5c5"><span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#bd4d36">&#10022; CONFIRMED DIALOGUE &#10022;</span></div></td></tr>
<tr><td align="center"><h1 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-weight:600;line-height:1.15;color:#1c2a39;letter-spacing:-.01em">Re-Embroidered Conversations</h1><p style="margin:8px 0 0;font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;font-size:16px;color:#5f6b7a">A space for thoughtful, unhurried dialogue</p></td></tr></table>
</td></tr>
<tr><td style="padding:16px 32px;background-color:#f8f5ee;border-bottom:1px solid #ece3d7"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td width="28" style="vertical-align:top;padding-top:2px"><span style="font-size:16px;color:#446654">&#9432;</span></td><td style="vertical-align:top;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:12.5px;line-height:1.5;color:#405060"><strong style="color:#1c2a39">Your branded confirmation:</strong> This email contains your session details and preparation guidance. Your Google Calendar invitation is sent separately for calendar alerts.</td></tr></table></td></tr>
<tr><td class="responsive-card" style="padding:32px 36px 24px">
<p style="margin:0 0 16px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:17px;font-weight:600;color:#1c2a39">Dear ${name},</p><p style="margin:0 0 24px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:15px;line-height:1.65;color:#425265">Your upcoming dialogue has been confirmed. Everything you need for our time together is below.</p>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 28px;background-color:#faf8f5;border:1.5px dashed #dccfbf;border-radius:8px;overflow:hidden"><tr><td style="padding:22px 24px">
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td colspan="2" style="padding-bottom:14px;border-bottom:1px solid #ece3d7"><table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%"><tr><td class="mobile-stack mobile-center" style="font-family:'Cormorant Garamond',Georgia,serif;font-size:21px;font-weight:700;color:#1c2a39;line-height:1.25">Re-Embroidered Conversations: One-to-One</td><td class="mobile-stack mobile-center" align="right" style="vertical-align:top"><span style="display:inline-block;padding:4px 10px;background-color:#446654;color:#ffffff;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:11.5px;font-weight:700;border-radius:4px;letter-spacing:.03em;white-space:nowrap">${durationBadge}</span></td></tr></table></td></tr>
<tr><td style="padding:14px 0 8px"><table role="presentation" width="100%"><tr><td width="30" style="color:#bd4d36;font-size:17px">&#128197;</td><td style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:15px;font-weight:600;color:#1c2a39">${date}</td></tr></table></td></tr>
<tr><td style="padding-bottom:14px;border-bottom:1px solid #ece3d7"><table role="presentation" width="100%"><tr><td width="30" style="color:#bd4d36;font-size:17px">&#9200;</td><td style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14.5px;color:#324354">${time} &nbsp;&middot;&nbsp; ${timezone}</td></tr></table></td></tr>
<tr><td style="padding-top:12px"><table role="presentation" width="100%"><tr><td width="30" style="color:#c7872a;font-size:17px">&#9997;</td><td style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:13.5px;color:#5f6b7a">Hosted by <strong style="color:#1c2a39">Shahd Karaeen</strong></td></tr></table></td></tr></table>
</td></tr></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px"><tr><td align="center" style="padding:24px;background-color:#1c2a39;border-radius:8px;text-align:center"><h2 style="margin:0 0 16px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:600;color:#ffffff">Join your session</h2><table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 14px"><tr><td align="center" style="background-color:#bd4d36;border-radius:6px"><a href="${meetingUrl}" class="btn-meet" style="display:inline-block;padding:13px 28px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px">Join on Google Meet &rarr;</a></td></tr></table><p style="margin:0;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:12.5px;color:#a0b0c0;line-height:1.5">Direct link: <a href="${meetingUrl}" style="color:#f4ece1;text-decoration:underline;word-break:break-all">${meetingUrl}</a></p></td></tr></table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 32px"><tr><td style="padding-bottom:12px;border-bottom:1.5px solid #1c2a39"><table role="presentation" width="100%"><tr><td><h2 style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;font-weight:700;color:#1c2a39">A little preparation</h2></td><td align="right"><span style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:12px;color:#bd4d36;font-weight:600">Gentle guidance</span></td></tr></table></td></tr>${preparationRows}</table>
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 24px;background-color:#f8f5f0;border-radius:8px;border:1px dashed #d9cebf"><tr><td style="padding:20px"><h2 style="margin:0 0 8px;font-family:'Cormorant Garamond',Georgia,serif;font-size:19px;font-weight:700;color:#1c2a39">Need to make a change?</h2><p style="margin:0 0 14px;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:13px;line-height:1.55;color:#5f6b7a">Use your private management link below. Opening it does not automatically change your booking.</p><a href="${safeChangesUrl}" class="link-change" style="font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:13.5px;font-weight:600;color:#bd4d36;text-decoration:underline">Manage your booking</a></td></tr></table>
<p style="margin:28px 0 0;font-family:'Plus Jakarta Sans',Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#405162">Warmly,<br><strong style="color:#1c2a39;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px">Shahd Karaeen</strong><br><span style="font-size:13px;color:#707f8f">Re-Embroidered Conversations</span></p>
</td></tr><tr><td align="center" style="padding:24px 32px;background-color:#f7f3eb;border-top:1px dashed #e0d4c5;text-align:center"><p style="margin:0;font-family:'Cormorant Garamond',Georgia,serif;font-size:16px;font-style:italic;color:#1c2a39">&mdash; Re-Embroidered Conversations &mdash;</p></td></tr>
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

Manage your booking:
${managementUrl}
Opening this link does not automatically change your booking.

Warmly,
Shahd Karaeen
Re-Embroidered Conversations`;
  return { subject: BOOKING_CONFIRMATION_SUBJECT, html, text };
}

export async function sendBookingConfirmationEmail(booking, dependencies = {}) {
  const configuration =
    dependencies.configuration ?? getBookingEmailConfiguration();
  const rendered = renderBookingConfirmationEmail(booking, configuration);
  const sendEmail = dependencies.sendEmail ?? sendEmailWithResend;
  return sendEmail(
    {
      ...rendered,
      from: configuration.from,
      to: booking.email,
      idempotencyKey: `booking-confirmation:${booking.id}`,
    },
    { apiKey: configuration.apiKey },
  );
}
