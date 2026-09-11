import 'server-only';

import { GOOGLE_OAUTH_SCOPES } from './constants.mjs';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function getGoogleOAuthConfig() {
  const appUrl = new URL(required('APP_URL'));
  if (appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    throw new Error('APP_URL must be an origin without a path, query, or fragment.');
  }
  const adminEmail = required('GOOGLE_ADMIN_EMAIL').toLowerCase();
  return {
    clientId: required('GOOGLE_OAUTH_CLIENT_ID'),
    clientSecret: required('GOOGLE_OAUTH_CLIENT_SECRET'),
    redirectUri: new URL('/api/admin/google-calendar/callback', appUrl).toString(),
    scopes: GOOGLE_OAUTH_SCOPES,
    adminEmail,
  };
}

export function getAdminSessionSecret() {
  const secret = required('ADMIN_SESSION_SECRET');
  if (Buffer.byteLength(secret) < 32) {
    throw new Error('ADMIN_SESSION_SECRET must be at least 32 bytes.');
  }
  return secret;
}

export function getTokenEncryptionKey() {
  return required('GOOGLE_TOKEN_ENCRYPTION_KEY');
}
