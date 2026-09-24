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
      exports: { db },
    });
    const previousEncryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
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
      await db.googleCalendarConnection.deleteMany({
        where: { id: "primary" },
      });
      await db.$disconnect();
      databaseModule.restore();
      if (previousEncryptionKey === undefined) {
        delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
      } else {
        process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = previousEncryptionKey;
      }
    }
  },
);
