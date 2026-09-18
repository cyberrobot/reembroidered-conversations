import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

const connectionString = process.env.DATABASE_SCHEMA_TEST_URL;

test(
  "booking migration enforces persistence invariants",
  {
    skip: connectionString
      ? false
      : "DATABASE_SCHEMA_TEST_URL is not configured",
  },
  async () => {
    const client = new pg.Client({ connectionString });
    await client.connect();

    const insertBooking = async (overrides = {}) => {
      const defaults = {
        name: "Test Customer",
        email: "repeat@example.com",
        startAt: "2030-01-01T10:00:00.000Z",
        endAt: "2030-01-01T10:55:00.000Z",
        timezone: "Europe/London",
        status: "HOLD",
        expiresAt: "2029-12-31T10:15:00.000Z",
        createdAt: "2029-12-31T10:00:00.000Z",
        ...overrides,
      };

      return client.query(
        `INSERT INTO bookings
          (id, name, email, "startAt", "endAt", timezone, status, "expiresAt", "createdAt",
           "stripeCheckoutSessionId", "stripePaymentIntentId", "calendarEventId")
         VALUES
          (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, status`,
        [
          defaults.name,
          defaults.email,
          defaults.startAt,
          defaults.endAt,
          defaults.timezone,
          defaults.status,
          defaults.expiresAt,
          defaults.createdAt,
          defaults.stripeCheckoutSessionId ?? null,
          defaults.stripePaymentIntentId ?? null,
          defaults.calendarEventId ?? null,
        ],
      );
    };

    let savepointNumber = 0;
    const rejectsConstraint = async (operation, constraint) => {
      const savepoint = `expected_failure_${savepointNumber++}`;
      await client.query(`SAVEPOINT ${savepoint}`);
      try {
        await assert.rejects(operation, (error) => {
          assert.equal(error.constraint, constraint);
          return true;
        });
      } finally {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      }
    };

    try {
      await client.query("BEGIN");

      const first = await insertBooking();
      assert.equal(first.rows[0].status, "HOLD");

      const emailColumns = await client.query(
        `SELECT "confirmationEmailSentAt", "confirmationEmailId" FROM bookings WHERE id = $1`,
        [first.rows[0].id],
      );
      assert.equal(emailColumns.rows[0].confirmationEmailSentAt, null);
      assert.equal(emailColumns.rows[0].confirmationEmailId, null);

      const managementColumns = await client.query(
        `SELECT "cancelledAt", "cancellationRefundDue", "calendarCancelledAt", "stripeRefundId",
                "stripeRefundStatus", "refundRequestedAt", "refundedAt", "rescheduledAt",
                "rescheduleSourceBookingId"
         FROM bookings WHERE id = $1`,
        [first.rows[0].id],
      );
      assert.deepEqual(managementColumns.rows[0], {
        cancelledAt: null,
        cancellationRefundDue: null,
        calendarCancelledAt: null,
        stripeRefundId: null,
        stripeRefundStatus: null,
        refundRequestedAt: null,
        refundedAt: null,
        rescheduledAt: null,
        rescheduleSourceBookingId: null,
      });

      await rejectsConstraint(
        () => insertBooking(),
        "bookings_active_start_at_key",
      );

      for (const status of ["PAID", "CONFIRMED"]) {
        await rejectsConstraint(
          () => insertBooking({ status }),
          "bookings_active_start_at_key",
        );
      }

      await client.query(
        "UPDATE bookings SET status = 'CANCELLED' WHERE id = $1",
        [first.rows[0].id],
      );
      const reusedAfterCancellation = await insertBooking();
      await client.query(
        "UPDATE bookings SET status = 'REFUNDED' WHERE id = $1",
        [reusedAfterCancellation.rows[0].id],
      );
      await insertBooking();

      await rejectsConstraint(
        () =>
          insertBooking({
            startAt: "2030-01-02T10:00:00.000Z",
            endAt: "2030-01-02T10:54:00.000Z",
          }),
        "bookings_session_duration_check",
      );

      await rejectsConstraint(
        () =>
          insertBooking({
            startAt: "2030-01-03T10:00:00.000Z",
            endAt: "2030-01-03T10:55:00.000Z",
            expiresAt: "2029-12-31T10:00:00.000Z",
          }),
        "bookings_expiry_after_creation_check",
      );

      // Distinct slots with repeated email addresses and null provider IDs are valid.
      await insertBooking({
        startAt: "2030-01-04T10:00:00.000Z",
        endAt: "2030-01-04T10:55:00.000Z",
      });
      await insertBooking({
        startAt: "2030-01-05T10:00:00.000Z",
        endAt: "2030-01-05T10:55:00.000Z",
      });

      const providerIds = {
        stripeCheckoutSessionId: "cs_schema_test",
        stripePaymentIntentId: "pi_schema_test",
        calendarEventId: "calendar_schema_test",
      };
      await insertBooking({
        startAt: "2030-01-06T10:00:00.000Z",
        endAt: "2030-01-06T10:55:00.000Z",
        ...providerIds,
      });

      for (const [field, constraint, day] of [
        [
          "stripeCheckoutSessionId",
          "bookings_stripe_checkout_session_id_key",
          "07",
        ],
        [
          "stripePaymentIntentId",
          "bookings_stripe_payment_intent_id_key",
          "08",
        ],
        ["calendarEventId", "bookings_calendar_event_id_key", "09"],
      ]) {
        await rejectsConstraint(
          () =>
            insertBooking({
              startAt: `2030-01-${day}T10:00:00.000Z`,
              endAt: `2030-01-${day}T10:55:00.000Z`,
              [field]: providerIds[field],
            }),
          constraint,
        );
      }
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  },
);
