import assert from "node:assert/strict";
import test from "node:test";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

import { createAvailabilityHandler } from "../src/lib/availability/availability-handler.ts";
import { createBookingHoldHandler } from "../src/lib/booking/booking-hold-handler.ts";
import { createBookingCheckoutHandler } from "../src/lib/booking/stripe-checkout-handler.ts";
import {
  AbuseProtectionUnavailableError,
  ActiveHoldLimitError,
  RateLimitExceededError,
  createPostgresAbuseStore,
} from "../src/lib/security/abuse-store.mjs";
import {
  clearBusyPeriodCache,
  getCachedBusyPeriods,
} from "../src/lib/calendar/busy-period-cache.mjs";
import { TurnstileVerificationError } from "../src/lib/security/turnstile.mjs";
import { processStripeWebhookEvent } from "../src/lib/booking/stripe-webhook.mjs";

const now = new Date("2026-09-19T12:00:00.000Z");
const holdBody = {
  name: "Sarah",
  email: "sarah@example.com",
  startAt: "2026-09-21T09:00:00.000Z",
  turnstileToken: "token",
};
const holdRequest = () =>
  new Request("http://localhost/api/bookings/hold", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(holdBody),
  });

function holdProtection(overrides = {}) {
  return {
    getClientIdentity: () => "client-key",
    consumeRateLimit: async () => {},
    verifyChallenge: async () => {},
    acquirePermit: async () => "permit",
    commitPermit: async () => {},
    releasePermit: async () => {},
    cancelUntrackedHold: async () => {},
    ...overrides,
  };
}

test("HOLD rate limiting precedes verification and booking work and returns Retry-After", async () => {
  let verificationCalls = 0;
  let serviceCalls = 0;
  const response = await createBookingHoldHandler(
    async () => {
      serviceCalls++;
    },
    () => now,
    holdProtection({
      consumeRateLimit: async () => {
        throw new RateLimitExceededError(37);
      },
      verifyChallenge: async () => {
        verificationCalls++;
      },
    }),
  )(holdRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "37");
  assert.equal(verificationCalls, 0);
  assert.equal(serviceCalls, 0);
});

test("invalid and unavailable Turnstile results fail closed before permit and booking", async () => {
  for (const [code, status] of [
    ["verification_failed", 400],
    ["verification_unavailable", 503],
  ]) {
    let permitCalls = 0;
    let serviceCalls = 0;
    const response = await createBookingHoldHandler(
      async () => {
        serviceCalls++;
      },
      () => now,
      holdProtection({
        verifyChallenge: async () => {
          throw new TurnstileVerificationError(code);
        },
        acquirePermit: async () => {
          permitCalls++;
          return "permit";
        },
      }),
    )(holdRequest());
    assert.equal(response.status, status);
    assert.equal(permitCalls, 0);
    assert.equal(serviceCalls, 0);
  }
});

test("active HOLD quota and protection outage create no booking", async () => {
  for (const [error, status, code] of [
    [new ActiveHoldLimitError(), 409, "active_hold_limit"],
    [
      new AbuseProtectionUnavailableError(),
      503,
      "abuse_protection_unavailable",
    ],
  ]) {
    let serviceCalls = 0;
    const response = await createBookingHoldHandler(
      async () => {
        serviceCalls++;
      },
      () => now,
      holdProtection({
        acquirePermit: async () => {
          throw error;
        },
      }),
    )(holdRequest());
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
    assert.equal(serviceCalls, 0);
  }
});

test("permit commit failure compensates the newly persisted HOLD", async () => {
  let cancelled = 0;
  let released = 0;
  const response = await createBookingHoldHandler(
    async () => ({
      id: "5a449655-7be3-432c-a124-b769e10b50ef",
      startAt: new Date(holdBody.startAt),
      endAt: new Date("2026-09-21T09:55:00.000Z"),
      timezone: "Europe/London",
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    }),
    () => now,
    holdProtection({
      commitPermit: async () => {
        throw new AbuseProtectionUnavailableError();
      },
      cancelUntrackedHold: async () => {
        cancelled++;
      },
      releasePermit: async () => {
        released++;
      },
    }),
  )(holdRequest());
  assert.equal(response.status, 503);
  assert.equal(cancelled, 1);
  assert.ok(released >= 1);
});

test("availability rejection occurs before availability/Google service", async () => {
  let calls = 0;
  const handler = createAvailabilityHandler(
    async () => {
      calls++;
      return [];
    },
    undefined,
    () => now,
    {
      getClientIdentity: () => "client-key",
      consumeRateLimit: async () => {
        throw new RateLimitExceededError(12);
      },
    },
  );
  const response = await handler(
    new Request(
      "http://localhost/api/availability?from=2026-09-21&to=2026-09-21",
    ),
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "12");
  assert.equal(calls, 0);
});

test("checkout client or booking rejection occurs before Stripe service", async () => {
  for (const rejectedPolicy of ["checkout", "checkoutBooking"]) {
    let serviceCalls = 0;
    const seen = [];
    const response = await createBookingCheckoutHandler(
      async () => {
        serviceCalls++;
      },
      () => now,
      {
        getClientIdentity: () => "client-key",
        consumeRateLimit: async (policy) => {
          seen.push(policy);
          if (policy === rejectedPolicy) throw new RateLimitExceededError(9);
        },
        extendPermit: async () => {},
      },
    )(
      new Request("http://localhost/api/bookings/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bookingId: "5a449655-7be3-432c-a124-b769e10b50ef",
        }),
      }),
    );
    assert.equal(response.status, 429);
    assert.equal(serviceCalls, 0);
    assert.deepEqual(
      seen,
      rejectedPolicy === "checkout"
        ? ["checkout"]
        : ["checkout", "checkoutBooking"],
    );
  }
});

test("checkout fails closed before Stripe when its admission lease cannot be extended", async () => {
  let serviceCalls = 0;
  const response = await createBookingCheckoutHandler(
    async () => {
      serviceCalls++;
    },
    () => now,
    {
      getClientIdentity: () => "client-key",
      consumeRateLimit: async () => {},
      extendPermit: async () => {
        throw new AbuseProtectionUnavailableError();
      },
    },
  )(
    new Request("http://localhost/api/bookings/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bookingId: "5a449655-7be3-432c-a124-b769e10b50ef",
      }),
    }),
  );
  assert.equal(response.status, 503);
  assert.equal(serviceCalls, 0);
});

test("authoritative Stripe transitions release quota best-effort without rolling state back", async () => {
  let status = "HOLD";
  const persistence = {
    markPaid: async () => {
      status = "PAID";
      return { count: 1 };
    },
    findBooking: async () => ({
      id: "5a449655-7be3-432c-a124-b769e10b50ef",
      status,
      stripeCheckoutSessionId: "cs_test",
      stripePaymentIntentId: "pi_test",
    }),
  };
  await processStripeWebhookEvent(
    {
      type: "checkout.session.completed",
      data: {
        object: {
          object: "checkout.session",
          id: "cs_test",
          mode: "payment",
          payment_status: "paid",
          amount_total: 5500,
          currency: "gbp",
          payment_intent: "pi_test",
          client_reference_id: "5a449655-7be3-432c-a124-b769e10b50ef",
          metadata: {
            bookingId: "5a449655-7be3-432c-a124-b769e10b50ef",
          },
        },
      },
    },
    persistence,
    undefined,
    undefined,
    async () => {
      throw new Error("store unavailable");
    },
  );
  assert.equal(status, "PAID");
});

test("Google busy cache reuses successes, coalesces misses, expires, and never caches failures", async () => {
  clearBusyPeriodCache();
  let current = now;
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const from = new Date("2026-09-21T08:00:00Z");
  const to = new Date("2026-09-21T18:00:00Z");
  const dependencies = {
    now: () => current,
    load: async () => {
      calls++;
      await gate;
      return [{ startAt: from.toISOString(), endAt: to.toISOString() }];
    },
  };
  const requests = [
    getCachedBusyPeriods(from, to, dependencies),
    getCachedBusyPeriods(from, to, dependencies),
  ];
  assert.equal(calls, 1);
  release();
  await Promise.all(requests);
  await getCachedBusyPeriods(from, to, dependencies);
  assert.equal(calls, 1);
  current = new Date(now.getTime() + 30_001);
  await getCachedBusyPeriods(from, to, {
    ...dependencies,
    load: async () => {
      calls++;
      return [];
    },
  });
  assert.equal(calls, 2);

  clearBusyPeriodCache();
  let failures = 0;
  const failing = {
    load: async () => {
      failures++;
      throw new Error("provider");
    },
  };
  await assert.rejects(getCachedBusyPeriods(from, to, failing));
  await assert.rejects(getCachedBusyPeriods(from, to, failing));
  assert.equal(failures, 2);
});

test(
  "PostgreSQL store atomically caps, expires, extends, and releases active HOLD permits",
  { skip: !process.env.DATABASE_SCHEMA_TEST_URL },
  async () => {
    const database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_SCHEMA_TEST_URL,
      }),
    });
    const store = createPostgresAbuseStore(database);
    const clientKey = `atomic-${crypto.randomUUID()}`;
    const expiresAt = new Date(now.getTime() + 15 * 60_000);
    try {
      const results = await Promise.allSettled([
        store.acquireActiveHoldPermit(clientKey, expiresAt, now),
        store.acquireActiveHoldPermit(clientKey, expiresAt, now),
        store.acquireActiveHoldPermit(clientKey, expiresAt, now),
      ]);
      assert.equal(
        results.filter((result) => result.status === "fulfilled").length,
        2,
      );
      assert.equal(
        results.filter(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof ActiveHoldLimitError,
        ).length,
        1,
      );
      const permits = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
      await store.commitActiveHoldPermit(
        permits[0],
        "5a449655-7be3-432c-a124-b769e10b50ef",
      );
      const checkoutExpiry = new Date(now.getTime() + 31 * 60_000);
      await store.extendActiveHoldPermit(
        "5a449655-7be3-432c-a124-b769e10b50ef",
        checkoutExpiry,
      );
      await store.releaseActiveHoldPermit(
        "5a449655-7be3-432c-a124-b769e10b50ef",
      );
      const replacement = await store.acquireActiveHoldPermit(
        clientKey,
        expiresAt,
        now,
      );
      assert.equal(typeof replacement, "string");
      const afterExpiry = await store.acquireActiveHoldPermit(
        clientKey,
        expiresAt,
        new Date(expiresAt.getTime() + 1),
      );
      assert.equal(typeof afterExpiry, "string");
    } finally {
      await database.$executeRaw`DELETE FROM "abuse_hold_permits" WHERE "clientKey" = ${clientKey}`;
      await database.$disconnect();
    }
  },
);
