import 'server-only';

import { GOOGLE_CONNECTION_ID } from './constants.mjs';
import {
  decryptRefreshToken,
  encryptedRefreshTokenContainsOAuthState,
} from './token-encryption';

export type GoogleCalendarConnectionInput = {
  googleSubject: string;
  googleEmail: string;
  calendarId: string;
  calendarSummary: string;
  calendarTimeZone: string | null;
  refreshTokenEncrypted: string;
  grantedScopes: string[];
};

export async function saveGoogleCalendarConnection(input: GoogleCalendarConnectionInput) {
  const { db } = await import('@/lib/db');
  return db.googleCalendarConnection.upsert({
    where: { id: GOOGLE_CONNECTION_ID },
    create: { id: GOOGLE_CONNECTION_ID, ...input },
    update: input,
  });
}

export async function isGoogleOAuthStateConsumed(state: string): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const connection = await db.googleCalendarConnection.findUnique({
    where: { id: GOOGLE_CONNECTION_ID },
    select: { refreshTokenEncrypted: true },
  });
  return connection
    ? encryptedRefreshTokenContainsOAuthState(connection.refreshTokenEncrypted, state)
    : false;
}

export async function getGoogleCalendarConnection() {
  const { db } = await import('@/lib/db');
  return db.googleCalendarConnection.findUnique({
    where: { id: GOOGLE_CONNECTION_ID },
    select: {
      googleSubject: true,
      googleEmail: true,
      calendarId: true,
      calendarSummary: true,
      calendarTimeZone: true,
      grantedScopes: true,
      connectedAt: true,
      updatedAt: true,
    },
  });
}

export async function getGoogleCalendarCredentials() {
  const { db } = await import('@/lib/db');
  const connection = await db.googleCalendarConnection.findUnique({
    where: { id: GOOGLE_CONNECTION_ID },
  });
  if (!connection) return null;
  return {
    googleSubject: connection.googleSubject,
    googleEmail: connection.googleEmail,
    calendarId: connection.calendarId,
    calendarTimeZone: connection.calendarTimeZone,
    grantedScopes: connection.grantedScopes,
    refreshToken: decryptRefreshToken(connection.refreshTokenEncrypted),
  };
}
