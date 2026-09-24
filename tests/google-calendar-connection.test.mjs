import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const schemaTestUrl = process.env.DATABASE_SCHEMA_TEST_URL;
const applicationUrl = process.env.DATABASE_URL;
const databaseConfigured = Boolean(
  schemaTestUrl && applicationUrl && schemaTestUrl === applicationUrl,
);
const databaseSkipReason =
  !schemaTestUrl || !applicationUrl
    ? "DATABASE_SCHEMA_TEST_URL and DATABASE_URL are required"
    : schemaTestUrl !== applicationUrl
      ? "DATABASE_SCHEMA_TEST_URL and DATABASE_URL must be identical"
      : false;

test(
  "connection layer persists and decrypts Google credentials and OAuth state",
  { skip: databaseConfigured ? false : databaseSkipReason },
  async () => {
    const db = new PrismaClient({
      adapter: new PrismaPg({ connectionString: schemaTestUrl }),
    });
    const databaseModule = await mock.module("../src/lib/db.ts", {
      namedExports: { db },
    });
    const previousEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
    let originalConnection;
    let fixtureWriteAttempted = false;
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString(
      "base64",
    );

    try {
      const { encryptRefreshToken } =
        await import("../src/lib/google-calendar/token-encryption.ts");
      const {
        getGoogleCalendarCredentials,
        isGoogleOAuthStateConsumed,
        saveGoogleCalendarConnection,
      } = await import("../src/lib/google-calendar/connection.ts");
      const refreshToken = "connection-test-refresh-token-fixture";
      const oauthState = "connection-test-oauth-state-fixture";
      const grantedScopes = [
        "openid",
        "https://www.googleapis.com/auth/calendar.freebusy",
      ];

      originalConnection = await db.googleCalendarConnection.findUnique({
        where: { id: "primary" },
      });
      fixtureWriteAttempted = true;
      await saveGoogleCalendarConnection({
        googleSubject: "connection-test-google-subject",
        googleEmail: "connection-test@example.test",
        calendarId: "connection-test-calendar@example.test",
        calendarSummary: "Connection test calendar",
        calendarTimeZone: "Europe/London",
        refreshTokenEncrypted: encryptRefreshToken(refreshToken, oauthState),
        grantedScopes,
      });

      const credentials = await getGoogleCalendarCredentials();
      assert.deepEqual(credentials, {
        googleSubject: "connection-test-google-subject",
        googleEmail: "connection-test@example.test",
        calendarId: "connection-test-calendar@example.test",
        calendarTimeZone: "Europe/London",
        grantedScopes,
        refreshToken,
      });
      assert.equal(await isGoogleOAuthStateConsumed(oauthState), true);
      assert.equal(
        await isGoogleOAuthStateConsumed("different-oauth-state"),
        false,
      );
    } finally {
      try {
        if (fixtureWriteAttempted) {
          if (originalConnection) {
            const { id, ...originalFields } = originalConnection;
            await db.googleCalendarConnection.upsert({
              where: { id },
              create: originalConnection,
              update: originalFields,
            });
          } else {
            await db.googleCalendarConnection.deleteMany({
              where: { id: "primary" },
            });
          }
        }
      } finally {
        try {
          await db.$disconnect();
        } finally {
          databaseModule.restore();
          if (previousEncryptionKey === undefined) {
            delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
          } else {
            process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
          }
        }
      }
    }
  },
);
