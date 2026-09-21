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
import {
  TurnstileVerificationError,
  verifyTurnstileToken,
} from "../src/lib/security/turnstile.mjs";
import { processStripeWebhookEvent } from "../src/lib/booking/stripe-webhook.mjs";
import {
  getAvailableSlots,
  getFreshAvailableSlots,
} from "../src/lib/availability/available-slots.mjs";
import { getProviderCandidateSlotsForDate } from "../src/lib/availability/candidate-slots.mjs";
import {
  createBookingHold,
  SlotUnavailableError,
} from "../src/lib/booking/booking-hold.mjs";

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

function rejectsWithTurnstileCode(code) {
  return (error) =>
    error instanceof TurnstileVerificationError && error.code === code;
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

test("Turnstile verifier enforces success, action, hostname, and provider availability", async (t) => {
  const alwaysPassTestSitekey = "1x00000000000000000000AA";
  const alwaysPassTestSecret = "1x0000000000000000000000000000000AA";
  const originalFetch = globalThis.fetch;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;
  const originalHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  try {
    process.env.NODE_ENV = "test";
    process.env.TURNSTILE_SECRET_KEY = "test-secret";
    process.env.TURNSTILE_EXPECTED_HOSTNAME = "booking.example.test";

    await t.test("accepts the configured action and hostname", async () => {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            action: "booking_hold",
            hostname: "booking.example.test",
          }),
          { status: 200 },
        );
      await verifyTurnstileToken("accepted-token");
    });

    await t.test(
      "accepts Cloudflare's observed official test response outside production",
      async () => {
        process.env.TURNSTILE_SECRET_KEY = alwaysPassTestSecret;
        process.env.TURNSTILE_EXPECTED_HOSTNAME = "localhost";
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              success: true,
              hostname: "example.com",
              "error-codes": [],
              action: null,
            }),
            { status: 200 },
          );
        await verifyTurnstileToken("official-test-token");
      },
    );

    await t.test(
      "accepts successful official test responses without metadata",
      async () => {
        for (const result of [
          { success: true },
          { success: true, action: null, hostname: null },
        ]) {
          globalThis.fetch = async () =>
            new Response(JSON.stringify(result), { status: 200 });
          await verifyTurnstileToken("metadata-free-test-token");
        }
      },
    );

    await t.test("rejects failed official test verification", async () => {
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ success: false }), { status: 200 });
      await assert.rejects(
        () => verifyTurnstileToken("failed-official-test-token"),
        rejectsWithTurnstileCode("verification_failed"),
      );
    });

    await t.test("rejects the test action for a normal secret", async () => {
      process.env.TURNSTILE_SECRET_KEY = "test-secret";
      process.env.TURNSTILE_EXPECTED_HOSTNAME = "booking.example.test";
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            success: true,
            hostname: "booking.example.test",
            action: "test",
          }),
          { status: 200 },
        );
      await assert.rejects(
        () => verifyTurnstileToken("normal-secret-test-token"),
        rejectsWithTurnstileCode("verification_failed"),
      );
    });

    await t.test(
      "rejects official test credentials in production",
      async () => {
        process.env.NODE_ENV = "production";
        process.env.TURNSTILE_SECRET_KEY = alwaysPassTestSecret;
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = alwaysPassTestSitekey;
        let calls = 0;
        globalThis.fetch = async () => {
          calls += 1;
          throw new Error("must not be called");
        };
        await assert.rejects(
          () => verifyTurnstileToken("production-test-token"),
          rejectsWithTurnstileCode("verification_unavailable"),
        );
        assert.equal(calls, 0);
        process.env.NODE_ENV = "test";
        process.env.TURNSTILE_SECRET_KEY = "test-secret";
        process.env.TURNSTILE_EXPECTED_HOSTNAME = "booking.example.test";
        if (originalSitekey === undefined)
          delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
        else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSitekey;
      },
    );

    for (const [name, result] of [
      [
        "rejects a missing action",
        {
          success: true,
          hostname: "booking.example.test",
        },
      ],
      [
        "rejects a null action",
        {
          success: true,
          action: null,
          hostname: "booking.example.test",
        },
      ],
      [
        "rejects a wrong action",
        {
          success: true,
          action: "another_action",
          hostname: "booking.example.test",
        },
      ],
      [
        "rejects a wrong hostname",
        {
          success: true,
          action: "booking_hold",
          hostname: "attacker.example.test",
        },
      ],
      [
        "rejects a failed challenge",
        {
          success: false,
          action: "booking_hold",
          hostname: "booking.example.test",
        },
      ],
    ]) {
      await t.test(name, async () => {
        globalThis.fetch = async () =>
          new Response(JSON.stringify(result), { status: 200 });
        await assert.rejects(
          () => verifyTurnstileToken("rejected-token"),
          rejectsWithTurnstileCode("verification_failed"),
        );
      });
    }

    await t.test("maps provider HTTP failure to unavailable", async () => {
      globalThis.fetch = async () =>
        new Response("unavailable", { status: 503 });
      await assert.rejects(
        () => verifyTurnstileToken("provider-token"),
        rejectsWithTurnstileCode("verification_unavailable"),
      );
    });

    await t.test("maps malformed provider JSON to unavailable", async () => {
      globalThis.fetch = async () => new Response("not-json", { status: 200 });
      await assert.rejects(
        () => verifyTurnstileToken("malformed-token"),
        rejectsWithTurnstileCode("verification_unavailable"),
      );
    });

    await t.test("maps network failure to unavailable", async () => {
      globalThis.fetch = async () => {
        throw new Error("network unavailable");
      };
      await assert.rejects(
        () => verifyTurnstileToken("network-token"),
        rejectsWithTurnstileCode("verification_unavailable"),
      );
    });

    await t.test(
      "fails unavailable before fetch when the secret is missing",
      async () => {
        delete process.env.TURNSTILE_SECRET_KEY;
        let calls = 0;
        globalThis.fetch = async () => {
          calls += 1;
          throw new Error("must not be called");
        };
        await assert.rejects(
          () => verifyTurnstileToken("missing-secret-token"),
          rejectsWithTurnstileCode("verification_unavailable"),
        );
        assert.equal(calls, 0);
        process.env.TURNSTILE_SECRET_KEY = "test-secret";
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
    if (originalHostname === undefined)
      delete process.env.TURNSTILE_EXPECTED_HOSTNAME;
    else process.env.TURNSTILE_EXPECTED_HOSTNAME = originalHostname;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalSitekey === undefined)
      delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalSitekey;
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
  assert.equal(
    (await response.json()).error.code,
    "abuse_protection_unavailable",
  );
  assert.equal(cancelled, 1);
  assert.equal(released, 1);
});

test("permit commit compensation retains the permit when cancelling the HOLD fails", async () => {
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
        cancelled += 1;
        throw new Error("booking persistence unavailable");
      },
      releasePermit: async () => {
        released += 1;
      },
    }),
  )(holdRequest());
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, "abuse_protection_unavailable");
  assert.equal(body.error.message.includes("persistence"), false);
  assert.equal(cancelled, 1);
  assert.equal(released, 0);
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

test("fresh HOLD validation bypasses a populated browse-time Google busy cache", async () => {
  clearBusyPeriodCache();
  const testNow = new Date("2026-09-19T00:00:00.000Z");
  const date = "2026-09-21";
  const targetStartAt = "2026-09-21T09:00:00.000Z";
  const targetEndAt = "2026-09-21T09:55:00.000Z";
  const providerKey = `fresh-hold-${crypto.randomUUID()}`;
  let providerBusyPeriods = [];
  let googleCalls = 0;
  let bookingConflictCalls = 0;
  const getBookingConflicts = async () => {
    bookingConflictCalls += 1;
    return [];
  };
  const loadGoogleBusyPeriods = async () => {
    googleCalls += 1;
    return providerBusyPeriods;
  };

  const browseSlots = await getAvailableSlots(
    { fromDate: date, toDate: date, now: testNow },
    {
      getCandidates: getProviderCandidateSlotsForDate,
      getBookingConflicts,
      getCalendarBusyPeriods: (from, to) =>
        getCachedBusyPeriods(from, to, {
          providerKey,
          now: () => testNow,
          load: loadGoogleBusyPeriods,
        }),
    },
  );
  assert.equal(
    browseSlots.some((slot) => slot.startAt === targetStartAt),
    true,
  );

  providerBusyPeriods = [{ startAt: targetStartAt, endAt: targetEndAt }];
  let persisted = false;
  await assert.rejects(
    () =>
      createBookingHold(
        {
          name: "Fresh Calendar Check",
          email: "fresh-calendar@example.test",
          startAt: targetStartAt,
        },
        testNow,
        {
          getAvailableSlots: (input) =>
            getFreshAvailableSlots(input, {
              getCandidates: getProviderCandidateSlotsForDate,
              getBookingConflicts,
              getCalendarBusyPeriods: loadGoogleBusyPeriods,
            }),
          persist: async () => {
            persisted = true;
          },
        },
      ),
    SlotUnavailableError,
  );
  assert.equal(persisted, false);
  assert.equal(googleCalls, 2);
  assert.equal(bookingConflictCalls, 2);
});

test(
  "PostgreSQL rate limits enforce every policy boundary and isolate keys and policies",
  { skip: !process.env.DATABASE_SCHEMA_TEST_URL },
  async () => {
    const database = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_SCHEMA_TEST_URL,
      }),
    });
    const store = createPostgresAbuseStore(database);
    const prefix = `rate-${crypto.randomUUID()}`;
    const windowTime = new Date("2026-09-19T12:01:00.000Z");

    async function expectLimited(policy, clientKey, retryUpperBound) {
      try {
        await store.consumeRateLimit(policy, clientKey, windowTime);
        assert.fail(`${policy} should have been limited`);
      } catch (error) {
        assert.ok(error instanceof RateLimitExceededError);
        assert.ok(error.retryAfterSeconds > 0);
        assert.ok(error.retryAfterSeconds <= retryUpperBound);
      }
    }

    try {
      const availabilityKey = `${prefix}-availability`;
      for (let request = 0; request < 60; request += 1)
        await store.consumeRateLimit(
          "availability",
          availabilityKey,
          windowTime,
        );
      await expectLimited("availability", availabilityKey, 5 * 60);
      await store.consumeRateLimit(
        "availability",
        availabilityKey,
        new Date(windowTime.getTime() + 5 * 60_000),
      );
      await store.consumeRateLimit(
        "availability",
        `${prefix}-unrelated-client`,
        windowTime,
      );
      await store.consumeRateLimit("hold", availabilityKey, windowTime);

      for (const [policy, limit] of [
        ["hold", 10],
        ["checkout", 10],
        ["checkoutBooking", 4],
      ]) {
        const key = `${prefix}-${policy}`;
        for (let request = 0; request < limit; request += 1)
          await store.consumeRateLimit(policy, key, windowTime);
        await expectLimited(
          policy,
          key,
          policy === "checkoutBooking" ? 5 * 60 : 15 * 60,
        );
      }
    } finally {
      await database.abuseRateLimit.deleteMany({
        where: { key: { contains: prefix } },
      });
      await database.$disconnect();
    }
  },
);

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
      await database.abuseHoldPermit.deleteMany({ where: { clientKey } });
      await database.$disconnect();
    }
  },
);
