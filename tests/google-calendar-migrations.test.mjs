import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import pg from 'pg';

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;

test(
  'all migrations create the Google connection from the existing booking schema',
  { skip: connectionString ? false : 'DATABASE_SCHEMA_TEST_URL is not configured' },
  async () => {
    const schema = `pr4_migration_${randomBytes(8).toString('hex')}`;
    const admin = new pg.Client({ connectionString });
    const schemaUrl = new URL(connectionString);
    schemaUrl.searchParams.set('schema', schema);
    await admin.connect();
    try {
      await admin.query(`CREATE SCHEMA "${schema}"`);
      execFileSync(
        fileURLToPath(new URL('../node_modules/.bin/prisma', import.meta.url)),
        ['migrate', 'deploy'],
        {
          cwd: fileURLToPath(new URL('..', import.meta.url)),
          env: { ...process.env, DATABASE_URL: schemaUrl.toString() },
          stdio: 'pipe',
        },
      );

      const migrationCount = await admin.query(
        `SELECT COUNT(*)::int AS count FROM "${schema}"."_prisma_migrations" WHERE finished_at IS NOT NULL`,
      );
      assert.equal(migrationCount.rows[0].count, 3);

      const columns = await admin.query(
        `SELECT column_name, is_nullable
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = 'google_calendar_connections'`,
        [schema],
      );
      const nullableByColumn = Object.fromEntries(
        columns.rows.map(({ column_name, is_nullable }) => [column_name, is_nullable]),
      );
      for (const required of [
        'id',
        'googleSubject',
        'googleEmail',
        'calendarId',
        'calendarSummary',
        'refreshTokenEncrypted',
        'grantedScopes',
        'connectedAt',
        'updatedAt',
      ]) {
        assert.equal(nullableByColumn[required], 'NO', required);
      }
      assert.equal(nullableByColumn.calendarTimeZone, 'YES');

      const envelope = `v1.${'n'.repeat(16)}.${'t'.repeat(22)}.${'c'.repeat(2048)}`;
      const inserted = await admin.query(
        `INSERT INTO "${schema}"."google_calendar_connections"
          (id, "googleSubject", "googleEmail", "calendarId", "calendarSummary",
           "calendarTimeZone", "refreshTokenEncrypted", "grantedScopes", "updatedAt")
         VALUES ('primary', 'subject', 'admin@example.com', 'primary@example.com',
           'Primary', NULL, $1, ARRAY['openid'], CURRENT_TIMESTAMP)
         RETURNING id, "calendarTimeZone", "refreshTokenEncrypted"`,
        [envelope],
      );
      assert.deepEqual(inserted.rows[0], {
        id: 'primary',
        calendarTimeZone: null,
        refreshTokenEncrypted: envelope,
      });
      await assert.rejects(
        () => admin.query(
          `INSERT INTO "${schema}"."google_calendar_connections"
            (id, "googleSubject", "googleEmail", "calendarId", "calendarSummary",
             "refreshTokenEncrypted", "grantedScopes", "updatedAt")
           VALUES ('primary', 'other', 'other@example.com', 'other', 'Other',
             'v1.n.t.c', ARRAY[]::TEXT[], CURRENT_TIMESTAMP)`,
        ),
        (error) => error.constraint === 'google_calendar_connections_pkey',
      );

      const bookingConstraint = await admin.query(
        `SELECT 1 FROM pg_constraint
          WHERE connamespace = $1::regnamespace
            AND conname = 'bookings_session_duration_check'`,
        [schema],
      );
      assert.equal(bookingConstraint.rowCount, 1);

    } finally {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await admin.end();
    }
  },
);
