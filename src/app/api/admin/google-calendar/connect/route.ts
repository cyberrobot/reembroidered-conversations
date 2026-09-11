import { NextResponse } from 'next/server';

import { getAdminSessionSecret, getGoogleOAuthConfig } from '@/lib/google-calendar/config';
import {
  buildGoogleAuthorizationUrl,
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
  createOAuthStateEnvelope,
  OAUTH_TRANSACTION_TTL_SECONDS,
} from '@/lib/google-calendar/oauth.mjs';
import {
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from '@/lib/google-calendar/transaction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function temporaryCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/api/admin/google-calendar/callback',
    maxAge: OAUTH_TRANSACTION_TTL_SECONDS,
  };
}

export async function GET() {
  const config = getGoogleOAuthConfig();
  const secret = getAdminSessionSecret();
  const state = createOAuthState();
  const codeVerifier = createCodeVerifier();
  const authorizationUrl = buildGoogleAuthorizationUrl({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scopes: config.scopes,
    state,
    codeChallenge: createCodeChallenge(codeVerifier),
    loginHint: config.adminEmail,
  });
  const response = NextResponse.redirect(authorizationUrl);
  response.cookies.set(
    OAUTH_STATE_COOKIE,
    createOAuthStateEnvelope(state, secret),
    temporaryCookieOptions(),
  );
  response.cookies.set(OAUTH_PKCE_COOKIE, codeVerifier, temporaryCookieOptions());
  return response;
}
