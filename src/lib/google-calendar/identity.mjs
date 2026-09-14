import { createPublicKey, verify } from 'node:crypto';

import { GOOGLE_JWKS_ENDPOINT } from './constants.mjs';

function decodeJson(value) {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid Google identity token.');
  }
}

export function authorizeAdminIdentity(claims, configuredEmail) {
  if (
    typeof claims?.sub !== 'string' ||
    !claims.sub ||
    typeof claims.email !== 'string' ||
    claims.email_verified !== true
  ) {
    throw new Error('Invalid Google identity token.');
  }
  if (claims.email.trim().toLowerCase() !== configuredEmail.trim().toLowerCase()) {
    const error = new Error('Unauthorized Google account.');
    error.code = 'unauthorized_account';
    throw error;
  }
  return { subject: claims.sub, email: claims.email.trim().toLowerCase() };
}

export async function verifyGoogleIdentityToken(
  idToken,
  clientId,
  fetchImplementation = fetch,
  now = Date.now(),
) {
  const parts = typeof idToken === 'string' ? idToken.split('.') : [];
  if (parts.length !== 3) throw new Error('Invalid Google identity token.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJson(encodedHeader);
  const claims = decodeJson(encodedPayload);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Invalid Google identity token.');
  }
  const response = await fetchImplementation(GOOGLE_JWKS_ENDPOINT, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Google identity verification unavailable.');
  const document = await response.json();
  const jwk = Array.isArray(document.keys)
    ? document.keys.find((key) => key.kid === header.kid && key.alg === 'RS256')
    : undefined;
  if (!jwk) throw new Error('Invalid Google identity token.');
  const validSignature = verify(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(encodedSignature, 'base64url'),
  );
  const validIssuer =
    claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const validAudience =
    claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId));
  const validAuthorizedParty =
    !Array.isArray(claims.aud) || claims.aud.length <= 1 || claims.azp === clientId;
  if (
    !validSignature ||
    !validIssuer ||
    !validAudience ||
    !validAuthorizedParty ||
    !Number.isFinite(claims.exp) ||
    claims.exp <= Math.floor(now / 1000)
  ) {
    throw new Error('Invalid Google identity token.');
  }
  return claims;
}
