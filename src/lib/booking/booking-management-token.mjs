// @ts-check

import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class BookingManagementConfigurationError extends Error {
  constructor() {
    super('Booking management is not configured.');
    this.name = 'BookingManagementConfigurationError';
  }
}

function normalizeSecret(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret.trim(), 'utf8') < 32) {
    throw new BookingManagementConfigurationError();
  }
  return secret.trim();
}

function signatureFor(bookingId, secret) {
  return createHmac('sha256', normalizeSecret(secret))
    .update(`booking-management:v1:${bookingId}`, 'utf8')
    .digest('base64url');
}

export function createBookingManagementCapability(bookingId, secret) {
  if (typeof bookingId !== 'string' || !UUID_PATTERN.test(bookingId)) {
    throw new BookingManagementConfigurationError();
  }
  const normalizedId = bookingId.toLowerCase();
  return `${normalizedId}.${signatureFor(normalizedId, secret)}`;
}

export function verifyBookingManagementCapability(capability, secret) {
  if (typeof capability !== 'string') return null;
  const separator = capability.indexOf('.');
  if (separator < 0 || separator !== capability.lastIndexOf('.')) return null;
  const bookingId = capability.slice(0, separator).toLowerCase();
  const suppliedSignature = capability.slice(separator + 1);
  if (!UUID_PATTERN.test(bookingId) || !SIGNATURE_PATTERN.test(suppliedSignature)) return null;

  let expected;
  try { expected = signatureFor(bookingId, secret); } catch { return null; }
  const supplied = Buffer.from(suppliedSignature, 'ascii');
  const expectedBuffer = Buffer.from(expected, 'ascii');
  if (supplied.length !== expectedBuffer.length || !timingSafeEqual(supplied, expectedBuffer)) return null;
  return { bookingId };
}

export function getBookingManagementSecret(environment = process.env) {
  return normalizeSecret(environment.BOOKING_MANAGEMENT_SECRET);
}

export function buildBookingManagementLink(bookingId, { baseUrl, secret }) {
  let url;
  try { url = new URL(baseUrl); } catch { throw new BookingManagementConfigurationError(); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new BookingManagementConfigurationError();
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${createBookingManagementCapability(bookingId, secret)}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}
