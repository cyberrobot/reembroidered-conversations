// @ts-check

export const SESSION_PRODUCT = Object.freeze({
  durationMinutes: 55,
  amountMinor: 5500,
  currency: "gbp",
  displayPrice: "£55",
  name: "55-minute private listening session",
});

// Stripe requires at least 30 minutes from the instant its API processes the
// request. The extra minute absorbs request/network latency.
export const STRIPE_CHECKOUT_MINUTES = 31;
