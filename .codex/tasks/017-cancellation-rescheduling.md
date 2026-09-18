# PR #17 — Cancellation and rescheduling

## Repository state

**Expected branch:** `feat/017-cancellation-rescheduling`
**Base branch:** `main`

## Objective

Provide a secure, booking-specific self-service management link for every newly
confirmed booking. A customer with the signed capability can view their own
authoritative booking, cancel it under the 24-hour refund policy, or reschedule
it to a slot returned by the unified availability engine.

The service remains a paid one-to-one listening session, not therapy. The
canonical product remains 55 minutes for £55 GBP.

## Security boundary

- `BOOKING_MANAGEMENT_SECRET` signs deterministic HMAC capabilities.
- An unsigned booking UUID is not authority.
- Signature structure is checked before any booking lookup and compared in
  constant time.
- Invalid capabilities disclose no customer or booking information.
- Management pages and APIs are `no-store`; the page uses `no-referrer`.
- Stripe, Calendar, persistence, policy, and capability verification remain
  server-side.
- Mutation routes accept only the authorised booking and server-validated
  input, and reject cross-origin requests when an Origin header is present.

## Cancellation invariants

1. Reload the authoritative future `CONFIRMED` booking.
2. Persist the 24-hour refund decision, `CANCELLED`, and `cancelledAt` first.
3. The slot is released by that committed inactive state.
4. Reconcile Calendar deletion and a full PaymentIntent refund independently.
5. Use `booking-cancellation-refund:<booking-id>` as Stripe idempotency key.
6. Provider failure never reactivates the booking or changes the persisted
   refund decision.
7. Use `REFUNDED` only for Stripe's successful refund state.

The exact 24-hour boundary is eligible; one millisecond inside is not.

## Rescheduling invariants

1. Revalidate the submitted `startAt` against `GET /api/availability` through
   the existing unified availability service.
2. Create a linked internal `HOLD` at the replacement slot while the source
   `CONFIRMED` booking continues to own its original slot.
3. Permit one linked hold per source booking at the database layer.
4. Update the existing Calendar event with `sendUpdates=all`; do not create a
   new event, payment, refund, or Checkout Session.
5. Retire the hold and move the same confirmed booking row in one PostgreSQL
   transaction. The hold is retired first inside the transaction, so outside
   observers continue to see the target as owned until commit.
6. Release a hold after a definite Calendar rejection. Retain it after an
   uncertain provider outcome or database failure after Calendar update.
7. A retry for the same target inspects the existing event and resumes; a
   different target returns `change_in_progress`.
8. A refreshed management page exposes the linked target and lets the customer
   resume that exact pending operation.

## Configuration and data

- `BOOKING_CHANGES_URL`: trusted management route base; HTTPS in production.
- `BOOKING_MANAGEMENT_SECRET`: server-only secret of at least 32 bytes.
- Booking cancellation, refund, reschedule, and source-hold fields are added by
  `20260917010000_booking_management`.
- The existing `bookings_active_start_at_key` partial unique index remains
  unchanged.
- The existing `calendar.events.owned` scope is sufficient; no new scope or
  Stripe webhook registration is introduced.

## Verification

Coverage includes capability tampering, cancellation policy boundaries,
idempotent cancellation/refund reconciliation, Calendar update/delete calls,
reschedule failure recovery, management routes, real PostgreSQL cancellation
and atomic transfer behavior, browser flows, accessibility states, responsive
layout, and macOS/Linux visual baselines.
