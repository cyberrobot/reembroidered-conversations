import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';

import {
  authorizeAdminIdentity,
  verifyGoogleIdentityToken,
} from '../src/lib/google-calendar/identity.mjs';
import {
  createAdminSession,
  validateAdminSession,
} from '../src/lib/admin/session-core.mjs';

test('admin identity requires a verified, allowlisted email and retains Google subject', () => {
  assert.deepEqual(
    authorizeAdminIdentity(
      { sub: 'stable-google-subject', email: 'Admin@Example.com', email_verified: true },
      'admin@example.com',
    ),
    { subject: 'stable-google-subject', email: 'admin@example.com' },
  );
  assert.throws(
    () => authorizeAdminIdentity(
      { sub: 'subject', email: 'other@example.com', email_verified: true },
      'admin@example.com',
    ),
    (error) => error.code === 'unauthorized_account',
  );
  assert.throws(() => authorizeAdminIdentity(
    { sub: 'subject', email: 'admin@example.com', email_verified: false },
    'admin@example.com',
  ));
});

test('Google identity token validation verifies signature, issuer, audience, and expiry', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' });
  const now = Date.UTC(2030, 0, 1);
  const createToken = (overrides = {}, signingKey = privateKey) => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: 'client-id',
      exp: Math.floor(now / 1000) + 300,
      sub: 'subject',
      email: 'admin@example.com',
      email_verified: true,
      ...overrides,
    })).toString('base64url');
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), signingKey);
    return `${header}.${payload}.${signature.toString('base64url')}`;
  };
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({ keys: [{ ...publicJwk, kid: 'test-key', alg: 'RS256' }] }),
  });

  const claims = await verifyGoogleIdentityToken(createToken(), 'client-id', mockFetch, now);
  assert.equal(claims.sub, 'subject');
  assert.equal(claims.exp > Math.floor(now / 1000), true);
  await assert.rejects(() => verifyGoogleIdentityToken(createToken({ iss: 'https://attacker.invalid' }), 'client-id', mockFetch, now));
  await assert.rejects(() => verifyGoogleIdentityToken(createToken({ aud: 'other-client' }), 'client-id', mockFetch, now));
  await assert.rejects(() => verifyGoogleIdentityToken(createToken({ exp: Math.floor(now / 1000) }), 'client-id', mockFetch, now));
  await assert.rejects(() => verifyGoogleIdentityToken(createToken({ exp: Math.floor(now / 1000) - 1 }), 'client-id', mockFetch, now));

  const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(() => verifyGoogleIdentityToken(createToken({}, otherKeys.privateKey), 'client-id', mockFetch, now));
});

test('admin session is signed, finite, and rejects tampering', () => {
  const secret = 'a sufficiently long session signing secret';
  const now = Date.UTC(2030, 0, 1);
  const session = createAdminSession('subject', 'admin@example.com', secret, now);
  assert.deepEqual(validateAdminSession(session, secret, now), {
    subject: 'subject',
    email: 'admin@example.com',
    exp: Math.floor(now / 1000) + 8 * 60 * 60,
  });
  assert.equal(validateAdminSession(`${session}x`, secret, now), null);
  assert.equal(validateAdminSession(session, secret, now + 8 * 60 * 60 * 1000 + 1_000), null);
  assert.throws(() => createAdminSession('subject', 'email', 'short'));
});
