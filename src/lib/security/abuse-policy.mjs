// @ts-check

export const ABUSE_POLICIES = Object.freeze({
  availability: { limit: 60, windowSeconds: 5 * 60 },
  hold: { limit: 10, windowSeconds: 15 * 60 },
  checkout: { limit: 10, windowSeconds: 15 * 60 },
  checkoutBooking: { limit: 4, windowSeconds: 5 * 60 },
  activeHolds: { limit: 2 },
  googleBusyCache: { ttlSeconds: 30 },
});
