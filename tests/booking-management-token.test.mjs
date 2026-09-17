import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBookingManagementLink,
  createBookingManagementCapability,
  verifyBookingManagementCapability,
} from '../src/lib/booking/booking-management-token.mjs';

const bookingId = '5a449655-7be3-432c-a124-b769e10b50ef';
const secret = 'management-secret-for-tests-is-long-enough-123';

test('booking management capabilities are deterministic and verifiable', () => {
  const first = createBookingManagementCapability(bookingId, secret);
  const second = createBookingManagementCapability(bookingId, secret);
  assert.equal(first, second);
  assert.deepEqual(verifyBookingManagementCapability(first, secret), { bookingId });
  assert.equal(
    buildBookingManagementLink(bookingId, { baseUrl: 'https://example.test/booking/manage/', secret }),
    `https://example.test/booking/manage/${first}`,
  );
});

test('tampered identity, signature, malformed values and a wrong secret fail closed', () => {
  const capability = createBookingManagementCapability(bookingId, secret);
  const [identity, signature] = capability.split('.');
  for (const candidate of [
    `${identity.replace(/.$/, '0')}.${signature}`,
    `${identity}.${signature.replace(/.$/, signature.endsWith('A') ? 'B' : 'A')}`,
    identity,
    `not-a-uuid.${signature}`,
    `${identity}.short`,
    `${identity}.${signature}.extra`,
  ]) assert.equal(verifyBookingManagementCapability(candidate, secret), null);
  assert.equal(verifyBookingManagementCapability(capability, 'different-secret-that-is-also-long-enough'), null);
});

test('an unsigned booking UUID is never management authority', () => {
  assert.equal(verifyBookingManagementCapability(bookingId, secret), null);
  assert.throws(() => createBookingManagementCapability(bookingId, 'short'));
});
