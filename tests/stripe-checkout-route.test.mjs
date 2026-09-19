import assert from "node:assert/strict";
import test from "node:test";
import { createBookingCheckoutHandler } from "../src/lib/booking/stripe-checkout-handler.ts";
import {
  CheckoutUnavailableError,
  HoldUnavailableError,
  InvalidCheckoutRequestError,
} from "../src/lib/booking/stripe-checkout.mjs";

const request = (body = "{}") =>
  new Request("http://localhost/api/bookings/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
const validRequest = () =>
  request('{"bookingId":"5a449655-7be3-432c-a124-b769e10b50ef"}');
const protection = {
  getClientIdentity: () => "test-client",
  consumeRateLimit: async () => {},
  extendPermit: async () => {},
};

test("checkout route returns only the browser redirect data with no-store", async () => {
  const response = await createBookingCheckoutHandler(
    async () => ({
      url: "https://checkout.stripe.com/test",
      expiresAt: new Date("2026-09-15T12:30:00Z"),
      secret: "hidden",
    }),
    () => new Date("2026-09-15T12:00:00Z"),
    protection,
  )(validRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    checkout: {
      url: "https://checkout.stripe.com/test",
      expiresAt: "2026-09-15T12:30:00.000Z",
    },
  });
});

test("checkout route classifies malformed, invalid, unavailable, and provider failures", async () => {
  const cases = [
    [request("{"), async () => assert.fail(), 400, "invalid_checkout_request"],
    [
      validRequest(),
      async () => {
        throw new InvalidCheckoutRequestError();
      },
      400,
      "invalid_checkout_request",
    ],
    [
      validRequest(),
      async () => {
        throw new HoldUnavailableError();
      },
      409,
      "hold_unavailable",
    ],
    [
      validRequest(),
      async () => {
        throw new CheckoutUnavailableError(new Error("secret"));
      },
      503,
      "checkout_unavailable",
    ],
  ];
  for (const [req, service, status, code] of cases) {
    const response = await createBookingCheckoutHandler(
      service,
      () => new Date("2026-09-15T12:00:00Z"),
      protection,
    )(req);
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.doesNotMatch(body.error.message ?? "", /secret/i);
  }
});
