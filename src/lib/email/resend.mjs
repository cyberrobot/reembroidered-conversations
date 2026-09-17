// @ts-check

import 'server-only';

const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

export class EmailDeliveryError extends Error {
  /** @param {'configuration' | 'provider_unavailable' | 'provider_rejected' | 'invalid_response'} code */
  constructor(code) {
    super(`Email delivery failed: ${code}.`);
    this.name = 'EmailDeliveryError';
    this.code = code;
  }
}

function requiredConfiguration(name, environment) {
  const value = environment[name]?.trim();
  if (!value) throw new EmailDeliveryError('configuration');
  return value;
}

export function getBookingEmailConfiguration(environment = process.env) {
  const changesUrl = requiredConfiguration('BOOKING_CHANGES_URL', environment);
  let parsedChangesUrl;
  try { parsedChangesUrl = new URL(changesUrl); } catch { throw new EmailDeliveryError('configuration'); }
  if (!['http:', 'https:'].includes(parsedChangesUrl.protocol) ||
      (environment.NODE_ENV === 'production' && parsedChangesUrl.protocol !== 'https:')) {
    throw new EmailDeliveryError('configuration');
  }
  return {
    apiKey: requiredConfiguration('RESEND_API_KEY', environment),
    from: requiredConfiguration('BOOKING_EMAIL_FROM', environment),
    changesUrl: parsedChangesUrl.toString(),
  };
}

export async function sendEmailWithResend(message, dependencies = {}) {
  const fetchImplementation = dependencies.fetchImplementation ?? fetch;
  const apiKey = dependencies.apiKey;
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new EmailDeliveryError('configuration');
  let response;
  try {
    response = await fetchImplementation(RESEND_EMAILS_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': message.idempotencyKey,
      },
      body: JSON.stringify({
        from: message.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      cache: 'no-store',
    });
  } catch {
    throw new EmailDeliveryError('provider_unavailable');
  }
  if (!response.ok) throw new EmailDeliveryError('provider_rejected');
  let body;
  try { body = await response.json(); } catch { throw new EmailDeliveryError('invalid_response'); }
  if (typeof body?.id !== 'string' || !body.id.trim()) throw new EmailDeliveryError('invalid_response');
  return { messageId: body.id };
}
