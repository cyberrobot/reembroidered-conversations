import assert from "node:assert/strict";
import test from "node:test";

import { createBookingReconciliationHandler } from "../src/lib/booking/booking-reconciliation-handler.ts";

const secret = "a-booking-reconciliation-secret-over-32-bytes";
const aggregate = {
  scanned: 3,
  recovered: 1,
  alreadyReconciled: 0,
  deferred: 1,
  manualAttention: 1,
  failed: 0,
  categories: Object.fromEntries(
    [
      "paid",
      "confirmationEmail",
      "checkoutHold",
      "cancellation",
      "reschedule",
    ].map((category) => [
      category,
      {
        scanned: category === "paid" ? 3 : 0,
        recovered: category === "paid" ? 1 : 0,
        alreadyReconciled: 0,
        deferred: category === "paid" ? 1 : 0,
        manualAttention: category === "paid" ? 1 : 0,
        failed: 0,
      },
    ]),
  ),
};

function request(authorization) {
  return new Request("https://example.test/api/internal/bookings/reconcile", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : {},
  });
}

test("missing and incorrect authentication reject before reconciliation", async () => {
  let calls = 0;
  const handler = createBookingReconciliationHandler(
    async () => {
      calls += 1;
      return aggregate;
    },
    () => secret,
  );
  for (const authorization of [undefined, "Bearer wrong", `Basic ${secret}`]) {
    const response = await handler(request(authorization));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      error: { code: "unauthorized" },
    });
  }
  assert.equal(calls, 0);
});

test("valid bearer authentication invokes one run and returns aggregate counts only", async () => {
  let calls = 0;
  const handler = createBookingReconciliationHandler(
    async () => {
      calls += 1;
      return {
        ...aggregate,
        customerEmail: "must-not-leak@example.test",
        providerPayload: { secret: true },
      };
    },
    () => secret,
    () => new Date("2030-01-01T10:00:00.000Z"),
  );
  const response = await handler(request(`Bearer ${secret}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(calls, 1);
  assert.deepEqual(body, aggregate);
  assert.equal(JSON.stringify(body).includes("must-not-leak"), false);
  assert.equal(JSON.stringify(body).includes("providerPayload"), false);
});

test("deferred and manual-attention candidates do not fail the route", async () => {
  const handler = createBookingReconciliationHandler(
    async () => aggregate,
    () => secret,
  );
  const response = await handler(request(`Bearer ${secret}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.deferred, 1);
  assert.equal(body.manualAttention, 1);
});

test("configuration and top-level runner failures return safe service errors", async () => {
  let calls = 0;
  const unconfigured = createBookingReconciliationHandler(
    async () => {
      calls += 1;
      return aggregate;
    },
    () => {
      throw new Error("missing secret");
    },
  );
  assert.equal((await unconfigured(request(`Bearer ${secret}`))).status, 503);
  assert.equal(calls, 0);

  const originalError = console.error;
  console.error = () => {};
  try {
    const unavailable = createBookingReconciliationHandler(
      async () => {
        throw new Error("private database detail");
      },
      () => secret,
    );
    const response = await unavailable(request(`Bearer ${secret}`));
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      error: { code: "reconciliation_unavailable" },
    });
  } finally {
    console.error = originalError;
  }
});
