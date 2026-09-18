import { NextRequest, NextResponse } from "next/server.js";

import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  issueAdminSession,
} from "../../../../../lib/admin/session.ts";
import {
  isGoogleOAuthStateConsumed,
  saveGoogleCalendarConnection,
} from "../../../../../lib/google-calendar/connection.ts";
import {
  getAdminSessionSecret,
  getGoogleOAuthConfig,
} from "../../../../../lib/google-calendar/config.ts";
import {
  completeGoogleOAuth,
  OAuthFlowError,
} from "../../../../../lib/google-calendar/flow.mjs";
import {
  discoverPrimaryCalendar,
  exchangeAuthorizationCode,
} from "../../../../../lib/google-calendar/google-api.mjs";
import { verifyGoogleIdentityToken } from "../../../../../lib/google-calendar/identity.mjs";
import {
  isValidCodeVerifier,
  readOAuthStateEnvelope,
} from "../../../../../lib/google-calendar/oauth.mjs";
import { encryptRefreshToken } from "../../../../../lib/google-calendar/token-encryption.ts";
import {
  OAUTH_PKCE_COOKIE,
  OAUTH_STATE_COOKIE,
} from "../../../../../lib/google-calendar/transaction.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFE_ERROR_CODES = new Set([
  "authorization_cancelled",
  "authorization_expired",
  "unauthorized_account",
  "missing_refresh_token",
  "connection_failed",
]);

function resultResponse(appUrl: string, status?: string, error?: string) {
  const url = new URL("/admin/google-calendar/result", appUrl);
  if (status) url.searchParams.set("status", status);
  if (error) {
    url.searchParams.set(
      "error",
      SAFE_ERROR_CODES.has(error) ? error : "connection_failed",
    );
  }
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/admin/google-calendar/callback",
    maxAge: 0,
  });
  response.cookies.set(OAUTH_PKCE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/admin/google-calendar/callback",
    maxAge: 0,
  });
  return response;
}

export async function GET(request: NextRequest) {
  const config = getGoogleOAuthConfig();
  const returnedState = request.nextUrl.searchParams.get("state");
  const stateEnvelope = request.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const codeVerifier = request.cookies.get(OAUTH_PKCE_COOKIE)?.value;
  const transaction = readOAuthStateEnvelope(
    stateEnvelope,
    returnedState,
    getAdminSessionSecret(),
  );
  if (!transaction) {
    return resultResponse(
      config.redirectUri,
      undefined,
      "authorization_expired",
    );
  }

  try {
    if (await isGoogleOAuthStateConsumed(transaction.state)) {
      return resultResponse(
        config.redirectUri,
        undefined,
        "authorization_expired",
      );
    }
  } catch {
    return resultResponse(config.redirectUri, undefined, "connection_failed");
  }

  if (!isValidCodeVerifier(codeVerifier)) {
    return resultResponse(
      config.redirectUri,
      undefined,
      "authorization_expired",
    );
  }

  const googleError = request.nextUrl.searchParams.get("error");
  if (googleError) {
    return resultResponse(
      config.redirectUri,
      undefined,
      googleError === "access_denied"
        ? "authorization_cancelled"
        : "connection_failed",
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code)
    return resultResponse(config.redirectUri, undefined, "connection_failed");

  try {
    const identity = await completeGoogleOAuth(
      {
        code,
        codeVerifier,
        adminEmail: config.adminEmail,
        state: transaction.state,
      },
      {
        exchangeCode: () =>
          exchangeAuthorizationCode({
            code,
            codeVerifier,
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            redirectUri: config.redirectUri,
          }),
        verifyIdentity: (idToken: string) =>
          verifyGoogleIdentityToken(idToken, config.clientId),
        discoverCalendar: discoverPrimaryCalendar,
        encryptToken: encryptRefreshToken,
        persistConnection: saveGoogleCalendarConnection,
      },
    );
    const response = resultResponse(config.redirectUri, "connected");
    response.cookies.set(
      ADMIN_SESSION_COOKIE,
      issueAdminSession(identity.subject, identity.email),
      adminSessionCookieOptions(),
    );
    return response;
  } catch (error) {
    const code =
      error instanceof OAuthFlowError ? error.code : "connection_failed";
    return resultResponse(config.redirectUri, undefined, code);
  }
}
