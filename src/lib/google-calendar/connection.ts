import 'server-only';

import { createHash } from 'node:crypto';

import { GOOGLE_CONNECTION_ID } from './constants.mjs';
import { decryptRefreshToken } from './token-encryption';

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

export async function consumeGoogleOAuthState(
  state: string,
  expiresAtSeconds: number,
): Promise<boolean> {
  const { db } = await import('@/lib/db');
  const stateHash = createHash('sha256').update(state, 'utf8').digest('hex');
  const [, inserted] = await db.$transaction([
    db.googleOAuthStateConsumption.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    }),
    db.googleOAuthStateConsumption.createMany({
      data: {
        stateHash,
        expiresAt: new Date(expiresAtSeconds * 1000),
      },
      skipDuplicates: true,
    }),
  ]);
  return inserted.count === 1;
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
