import assert from "node:assert/strict";
import test from "node:test";

import { createBookingHoldHandler } from "../src/lib/booking/booking-hold-handler.ts";
import {
  HoldAvailabilityError,
  InvalidHoldRequestError,
  SlotUnavailableError,
} from "../src/lib/booking/booking-hold.mjs";

const now = new Date("2026-09-14T12:00:00.000Z");
const valid = {
  name: "Sarah",
  email: "sarah@example.com",
  startAt: "2026-09-16T09:00:00.000Z",
};
const request = (body = JSON.stringify(valid)) =>
  new Request("http://localhost/api/bookings/hold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

test("valid POST returns a customer-safe canonical 201 response with no-store", async () => {
  const handler = createBookingHoldHandler(
    async (input, observedNow) => {
      assert.deepEqual(input, valid);
      assert.equal(observedNow, now);
      return {
        id: "5a449655-7be3-432c-a124-b769e10b50ef",
        startAt: new Date(valid.startAt),
        endAt: new Date("2026-09-16T09:55:00.000Z"),
        timezone: "Europe/London",
        expiresAt: new Date("2026-09-14T12:15:00.000Z"),
        name: "private",
        email: "private@example.com",
        status: "HOLD",
      };
    },
    () => now,
  );
  const response = await handler(request());
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    hold: {
      id: "5a449655-7be3-432c-a124-b769e10b50ef",
      startAt: valid.startAt,
      endAt: "2026-09-16T09:55:00.000Z",
      timezone: "Europe/London",
      expiresAt: "2026-09-14T12:15:00.000Z",
    },
  });
});

test("malformed and invalid requests return stable safe 400 errors", async () => {
  const never = async () => {
    throw new InvalidHoldRequestError();
  };
  for (const response of [
    await createBookingHoldHandler(never)(request("{")),
    await createBookingHoldHandler(never)(request()),
  ]) {
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: {
        code: "invalid_hold_request",
        message: "Check your booking details and try again.",
      },
    });
  }
});

test("slot, availability, and persistence failures have stable non-leaking responses", async () => {
  const cases = [
    [new SlotUnavailableError(), 409, "slot_unavailable"],
    [
      new HoldAvailabilityError(new Error("google calendar secret")),
      503,
      "hold_unavailable",
    ],
    [
      Object.assign(new Error("database secret"), { code: "P2024" }),
      500,
      "hold_failed",
    ],
  ];
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const [error, status, code] of cases) {
      const response = await createBookingHoldHandler(async () => {
        throw error;
      })(request());
      assert.equal(response.status, status);
      const serialized = JSON.stringify(await response.json());
      assert.equal(JSON.parse(serialized).error.code, code);
      for (const privateText of [
        "google",
        "calendar",
        "secret",
        "P2024",
        "database",
      ])
        assert.equal(serialized.includes(privateText), false);
    }
  } finally {
    console.error = originalError;
  }
});
