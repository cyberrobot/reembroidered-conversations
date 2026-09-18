import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;

test(
  "Google Calendar connection migration stores one complete encrypted singleton",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO google_calendar_connections
          (id, "googleSubject", "googleEmail", "calendarId", "calendarSummary",
           "refreshTokenEncrypted", "grantedScopes", "updatedAt")
         VALUES ('primary', 'subject', 'admin@example.com', 'primary@example.com',
           'Primary', 'v1.nonce.tag.ciphertext', ARRAY['openid'], CURRENT_TIMESTAMP)
         RETURNING id, "refreshTokenEncrypted"`,
      );
      assert.equal(inserted.rows[0].id, "primary");
      assert.equal(
        inserted.rows[0].refreshTokenEncrypted,
        "v1.nonce.tag.ciphertext",
      );
      await assert.rejects(
        () =>
          client.query(
            `INSERT INTO google_calendar_connections
          (id, "googleSubject", "googleEmail", "calendarId", "calendarSummary",
           "refreshTokenEncrypted", "grantedScopes", "updatedAt")
         VALUES ('primary', 'other', 'other@example.com', 'other', 'Other',
           'v1.other.tag.ciphertext', ARRAY[]::TEXT[], CURRENT_TIMESTAMP)`,
          ),
        (error) => error.constraint === "google_calendar_connections_pkey",
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
