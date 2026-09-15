# PR #8 — Stripe Checkout

## Repository state

**Expected branch:**  
`feat/008-stripe-checkout`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**  

- PR #2 — booking domain + database schema
- PR #6 — unified availability engine
- PR #7 — booking UI → temporary slot hold
- Stripe account with test-mode API access
- Existing PostgreSQL persistence
- Existing `APP_URL` configuration

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `package.json`
- `.env.example`
- `.github/workflows/ci.yml`
- `prisma/schema.prisma`
- `prisma/migrations/20260911000000_booking_domain/migration.sql`
- `src/lib/booking/booking-hold.mjs`
- `src/lib/booking/booking-hold-handler.ts`
- `src/app/api/bookings/hold/route.ts`
- `src/lib/availability/booking-conflicts.mjs`
- `src/components/BookingSection.tsx`
- `src/components/BookingConfirmationPage.tsx`
- `src/types.ts`
- relevant booking, database, route-handler, and Playwright tests

### Primary change area

Stripe Checkout and the transition from a temporary booking `HOLD` to a paid booking.

### Canonical implementation examples

Use the existing booking hold implementation as the preferred pattern for:

- server-owned booking lifecycle logic;
- thin Next.js route handlers;
- stable customer-safe API errors;
- dependency injection for external boundaries;
- database-backed concurrency protection;
- deterministic Node tests.

Relevant examples:

- `src/lib/booking/booking-hold.mjs`
- `src/lib/booking/booking-hold-handler.ts`
- `src/app/api/bookings/hold/route.ts`
- `tests/booking-hold.test.mjs`
- `tests/booking-hold-route.test.mjs`
- `tests/booking-hold-database.test.mjs`

### Relevant symbols

Inspect before editing:

- `createBookingHold`
- `createHoldPersistence`
- `BOOKING_HOLD_MINUTES`
- `BookingStatus`
- `Booking.stripeCheckoutSessionId`
- `Booking.stripePaymentIntentId`
- `Booking.expiresAt`
- `getActiveBookingConflicts`
- `BookingSection`
- `BookingHold`
- `BookingHoldResponse`
- `PROVIDER_AVAILABILITY_CONFIG`

### Expected change surface

Expected areas include:

```text
package.json
package-lock.json
.env.example

src/app/api/bookings/checkout/**
src/app/api/stripe/webhook/**
src/app/payment/**                 # or equivalent minimal Stripe-return route

src/lib/booking/**
src/lib/stripe/**
src/components/BookingSection.tsx
src/types.ts

tests/stripe-checkout*.test.mjs
tests/stripe-webhook*.test.mjs
tests/browser/migration-smoke.spec.ts
tests/browser/migration-smoke.spec.ts-snapshots/**
```

A small shared booking-product module may be introduced for canonical price/currency constants.

No database migration is expected because the existing booking model already contains the required Stripe identifiers and payment lifecycle state.

If implementation proves that a schema change is genuinely required for safe idempotency, Codex must document why the existing fields are insufficient before adding it.

### Excluded areas

Do not implement as part of this PR:

- Google Calendar event creation
- Google Meet creation
- transition from `PAID` to `CONFIRMED`
- confirmation emails
- refunds
- booking cancellation after payment
- rescheduling
- Stripe subscriptions
- saved payment methods
- Stripe Customer management unless technically required by Checkout
- coupons or promotion codes
- automatic tax
- multiple products or prices
- delayed/offline payment methods
- admin payment management UI
- unrelated booking-calendar redesign
- unrelated marketing or editorial changes

---

## Objective

Allow a customer with an active temporary booking hold to pay **£55 GBP** through Stripe-hosted Checkout.

The customer must be able to:

1. choose an available session;
2. create the existing temporary booking hold;
3. continue from that hold to secure Stripe Checkout;
4. pay £55 using a supported card payment;
5. return to the application after Checkout.

The system must:

- create at most one usable Checkout Session for a booking hold;
- associate Stripe objects with the internal booking ID;
- keep the selected slot reserved for the entire period during which its Stripe Checkout Session can still accept payment;
- treat a verified Stripe webhook, not the browser redirect, as payment authority;
- transition a successfully paid `HOLD` booking to `PAID`;
- persist the Checkout Session ID and PaymentIntent ID;
- release an unpaid hold when its Checkout Session expires;
- tolerate retries and duplicate webhook deliveries;
- never charge for a slot that the application has already released to another customer;
- never claim that the booking is fully confirmed until later Calendar/Meet work has completed.

Completion means a test-mode Stripe payment can move a booking safely from:

```text
HOLD
  ↓
Stripe Checkout
  ↓
PAID
```

`CONFIRMED` remains outside this PR.

---

## Current architecture

The booking UI currently:

1. fetches server-calculated availability;
2. collects name/email and booking selections;
3. sends the selected slot to `POST /api/bookings/hold`;
4. receives a persisted booking with status `HOLD`;
5. displays a temporary-hold card.

The hold currently expires after 15 minutes.

The existing `Booking` model already contains:

```text
status
stripeCheckoutSessionId
stripePaymentIntentId
expiresAt
```

The existing booking statuses are:

```text
HOLD
PAID
CONFIRMED
CANCELLED
REFUNDED
```

Availability treats:

```text
active HOLD
PAID
CONFIRMED
```

as slot-owning bookings.

Expired holds and:

```text
CANCELLED
REFUNDED
```

do not block availability.

The database also protects active bookings for the same session start through the existing active-slot uniqueness constraint.

Stripe is not currently installed or configured.

---

## External integrations affected

### Stripe

Operations introduced by this PR:

- create hosted Checkout Sessions;
- retrieve an existing Checkout Session when needed for safe retries;
- optionally expire a duplicate/unusable Checkout Session during recovery;
- receive verified Stripe webhook events;
- correlate Stripe Sessions and PaymentIntents with internal booking IDs.

Authentication:

- server-side Stripe secret key only;
- webhook signing secret only;
- no Stripe secret may enter a browser bundle.

No Stripe publishable key is required when using redirect-based hosted Checkout unless the chosen implementation demonstrably requires one.

### Payment methods

Limit this PR to payment methods whose successful Checkout completion represents an immediately paid booking.

Prefer explicit card-only Checkout for this PR.

Do not enable delayed payment methods unless the implementation also correctly handles:

```text
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
```

That additional lifecycle complexity is not required for PR #8.

---

## Configuration and data changes

### Environment variables

Add:

```text
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Both are:

- server-only;
- required where Stripe Checkout is enabled;
- secrets;
- never exposed through `NEXT_PUBLIC_*`.

Continue using the existing:

```text
APP_URL
```

for Stripe return URLs.

Update `.env.example` with descriptive placeholders only.

Do not commit real Stripe credentials.

### Database or schema

No schema migration is expected.

Use the existing:

```text
Booking.status
Booking.stripeCheckoutSessionId
Booking.stripePaymentIntentId
Booking.expiresAt
```

`stripeCheckoutSessionId` and `stripePaymentIntentId` must remain unique.

### Booking product configuration

Introduce one canonical application definition for the paid session rather than independently hard-coding Stripe values throughout the application.

Required product values:

```text
duration: 55 minutes
amount: 5500 pence
currency: gbp
display price: £55
```

Stripe amounts must use integer minor units.

Do not use floating-point money calculations.

Where practical, reuse the same safe product constants in the booking UI instead of introducing another independent `£55` definition.

### Webhooks

Add a Stripe webhook route, following existing App Router route-handler conventions.

Expected event types:

```text
checkout.session.completed
checkout.session.expired
```

The endpoint must:

- read the raw request body;
- read `Stripe-Signature`;
- verify the signature with `STRIPE_WEBHOOK_SECRET`;
- reject invalid signatures;
- validate relevant Stripe object fields before mutation;
- tolerate duplicate delivery;
- avoid exposing raw Stripe errors;
- avoid logging payment details or unnecessary customer PII.

### OAuth and permissions

None.

### Deployment configuration

Production/test deployments require:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

A Stripe webhook endpoint must be configured for the deployed webhook route.

Local development should support Stripe CLI forwarding without weakening production signature validation.

### Migration or backfill

None.

Existing bookings do not require Stripe identifiers.

---

## Security and privacy considerations

All Stripe API operations must remain server-side.

Never send the Stripe secret key or webhook signing secret to the browser.

Do not collect card details in this application. Card entry belongs to Stripe-hosted Checkout.

Stripe metadata should contain only the stable internal correlation data required for reconciliation.

Use the internal booking UUID for correlation.

Do not put:

- personal notes;
- calendar details;
- secrets;
- OAuth data;
- unnecessary personal information

into Stripe metadata.

It is acceptable to provide the stored customer email to Checkout for payment communication/prefill where required.

Do not trust:

- client-supplied price;
- client-supplied currency;
- client-supplied session duration;
- client-supplied booking status;
- URL query parameters claiming payment succeeded.

The server owns all payment configuration.

---

## Required implementation

### 1. Add Stripe server integration

Add the supported Stripe Node SDK.

Create a server-only Stripe boundary rather than importing Stripe directly throughout route handlers and React components.

The Stripe client must:

- read server configuration lazily or through the repository's established configuration pattern;
- fail clearly when required configuration is missing;
- never expose secrets;
- be mockable/testable without contacting real Stripe services.

---

### 2. Add canonical session pricing

Define the session payment configuration centrally.

Required Stripe values:

```text
currency = gbp
unit_amount = 5500
quantity = 1
```

The line item should describe the existing 55-minute listening session without adding medical or therapeutic claims.

Do not accept amount or currency from the checkout request.

---

### 3. Create Checkout from an existing hold

Add a server endpoint equivalent to:

```text
POST /api/bookings/checkout
```

Input:

```json
{
  "bookingId": "<existing HOLD booking UUID>"
}
```

The server must load the booking rather than accepting booking details again from the browser.

Before creating Checkout, verify that:

- the booking exists;
- its status is `HOLD`;
- the hold has not expired;
- it has not already been paid;
- it still owns the selected slot.

The checkout request must not re-create the booking.

---

### 4. Configure hosted Checkout

Create a Stripe Checkout Session with:

```text
mode: payment
currency: gbp
amount: 5500
quantity: 1
```

Use the existing booking ID for correlation through appropriate Stripe fields such as:

```text
client_reference_id
metadata.bookingId
payment_intent_data.metadata.bookingId
```

Use the booking's existing customer email where appropriate.

The application must not create duplicate charges or independently recompute booking data from browser input.

---

### 5. Make Checkout creation idempotent

Repeated calls for the same active booking must not produce multiple independently usable Checkout Sessions.

Examples that must be safe:

- user double-clicks the payment button;
- browser retries after a timeout;
- the first response is lost;
- two requests arrive concurrently.

If the booking already has an open Checkout Session, return/resume that session rather than creating another usable payment path.

Use an appropriate Stripe/database idempotency strategy.

If concurrent creation results in an unnecessary Stripe Session, it must not remain as a second payable session for the same booking.

Tests must demonstrate the behaviour rather than relying only on a disabled client button.

---

### 6. Reconcile Checkout expiry with the booking hold

This is a required part of PR #8.

The current hold lasts 15 minutes, while Stripe-hosted Checkout requires a longer minimum Checkout Session expiry.

Do **not** leave:

```text
Booking.expiresAt = 15-minute hold
```

while Stripe can still accept payment afterwards.

When Checkout is successfully created:

- set an explicit Stripe Checkout expiry;
- extend the corresponding booking `expiresAt` to the same effective expiry;
- keep the booking in `HOLD` until payment or Checkout expiry.

The implementation must guarantee:

```text
Stripe can accept payment
    ⇒
the booking still owns the slot
```

There must never be a period where Stripe can successfully charge customer A after the database has released the slot for customer B.

Checkout-expiry calculation must also be compatible with the chosen retry/idempotency design.

---

### 7. Handle races while starting Checkout

Revalidate the hold server-side immediately before committing the Checkout association.

Consider this race:

```text
request loads HOLD
↓
HOLD expires
↓
another customer obtains slot
↓
Stripe Session creation returns
```

The first customer must not receive a usable Checkout URL for a slot they no longer own.

Use conditional persistence/concurrency protection rather than client timing.

If a newly created Stripe Session cannot safely be attached to the active hold, invalidate it where possible and return a customer-safe conflict response.

---

### 8. Persist the Checkout Session

After successful Checkout creation, persist:

```text
Booking.stripeCheckoutSessionId
```

and the reconciled:

```text
Booking.expiresAt
```

Do not change the booking to `PAID` merely because the Checkout Session exists.

State remains:

```text
HOLD
```

until verified payment evidence arrives.

---

### 9. Update the hold UI with payment handoff

Replace the current hold-only terminal state with a clear Stripe payment action.

After a temporary hold exists, show:

- selected time is temporarily held;
- the current effective expiry;
- price: £55;
- a clear action such as `Continue to secure payment`;
- loading/disabled state while Checkout is being created;
- recoverable error state when Stripe cannot be started.

On successful checkout-session creation:

```text
window.location
```

or equivalent browser navigation should redirect to the Stripe-hosted Checkout URL.

Do not use client-side routing intended for internal Next.js routes for the external Stripe navigation.

Prevent accidental duplicate clicks in the UI, while preserving server-side idempotency as the real protection.

---

### 10. Handle checkout-initiation failures

Required distinctions include:

#### Hold no longer valid

If the booking expired or no longer owns the slot:

- do not create/return a usable Checkout Session;
- clear the stale client hold state;
- refresh availability;
- tell the customer the time is no longer reserved.

#### Stripe unavailable

If Stripe cannot create or retrieve Checkout:

- keep the booking as `HOLD` if it is still valid;
- allow the customer to retry;
- do not mark it paid;
- do not leak Stripe's raw error.

#### Persistence failure

If Stripe may have created a remote object but local persistence failed:

- do not blindly create another payable session on retry;
- use reconciliation/idempotency to recover safely;
- never return a Checkout URL whose booking association cannot be established.

---

### 11. Add verified Stripe webhook processing

Add a webhook endpoint equivalent to:

```text
POST /api/stripe/webhook
```

Signature verification must use:

- the untouched raw request body;
- the `Stripe-Signature` header;
- `STRIPE_WEBHOOK_SECRET`.

Do not call `request.json()` before signature verification.

Invalid signatures must not mutate booking state.

---

### 12. Handle `checkout.session.completed`

For the matching booking:

1. validate the booking correlation;
2. verify the Stripe Checkout Session ID matches the booking's stored `stripeCheckoutSessionId`;
3. verify this is the expected one-time payment;
4. verify payment is actually paid;
5. validate the expected GBP £55 amount where the relevant Stripe object exposes it;
6. persist the Stripe PaymentIntent ID;
7. transition:

```text
HOLD → PAID
```

A paid booking must continue blocking availability.

Do not transition to:

```text
CONFIRMED
```

in this PR.

Calendar event and Meet creation belong to later work.

---

### 13. Make completed-payment processing idempotent

Stripe can deliver the same webhook more than once.

Processing the same successful Checkout event repeatedly must result in one logical transition only.

Examples:

```text
HOLD → PAID
PAID → PAID/no-op
```

Never:

- create another booking;
- create another charge;
- downgrade a later state;
- overwrite a different PaymentIntent silently.

Future-safe behaviour should permit a later `CONFIRMED` booking to receive a duplicate payment event without being downgraded to `PAID`.

If Stripe reports a successful payment that cannot be reconciled safely with local state, do not silently discard it.

Log sufficient non-sensitive correlation information and return an intentional error where retry/reconciliation is appropriate.

---

### 14. Handle `checkout.session.expired`

When Stripe reports that the stored Checkout Session expired unpaid:

```text
HOLD → CANCELLED
```

only when:

- the Checkout Session belongs to the booking;
- the session ID matches the persisted session;
- the booking is still `HOLD`.

This releases the slot through the existing availability behaviour.

Duplicate expiry events must be safe.

Do not change:

```text
PAID
CONFIRMED
REFUNDED
```

back to `CANCELLED`.

---

### 15. Do not trust the Stripe return redirect

The Checkout success URL may contain:

```text
{CHECKOUT_SESSION_ID}
```

but arrival at that URL is not proof that the booking is paid.

Do not restore the existing prototype behaviour that interprets query parameters such as:

```text
payment_success=true
success=true
```

as authoritative payment state.

A user must not be able to manufacture a "Paid" or "Confirmed" page by editing query parameters.

---

### 16. Add a minimal truthful Stripe-return state

Stripe Checkout needs a safe page to return to after payment.

Add a minimal payment-return route or equivalent server-backed state.

For a successfully paid booking, it may say in substance:

```text
Payment received.
Your booking is being finalised.
```

It must **not** claim:

- the booking is fully confirmed;
- a Google Calendar event exists;
- a Google Meet link exists;
- the session has been added to the practitioner's calendar

until those operations are actually implemented.

If webhook processing has not completed when the browser returns, show a neutral processing state rather than assuming success.

The final fully confirmed booking screen remains future work.

---

### 17. Checkout cancellation behaviour

Stripe's cancellation/back navigation must not mark the booking paid or confirmed.

An unpaid booking may remain held until its Stripe Checkout expiry.

When the Checkout Session eventually expires, the verified:

```text
checkout.session.expired
```

webhook releases the booking.

A better retry/cancel experience may be implemented if it remains small and reuses the existing Checkout Session, but cancellation/refund architecture must not expand this PR unnecessarily.

---

## API behaviour

### Create Checkout

Example:

```text
POST /api/bookings/checkout
```

Request:

```json
{
  "bookingId": "uuid"
}
```

Successful response should expose only what the browser needs, for example:

```json
{
  "checkout": {
    "url": "https://checkout.stripe.com/...",
    "expiresAt": "2026-09-14T17:30:00.000Z"
  }
}
```

Do not return raw Stripe objects.

Possible customer-safe error categories should distinguish at least:

```text
invalid_checkout_request
hold_unavailable
checkout_unavailable
```

Use stable status codes and response shapes.

All responses should prevent inappropriate caching.

### Stripe webhook

The webhook endpoint should normally return success quickly after deterministic local processing.

Unsupported Stripe event types should not fail merely because they are unsupported.

Invalid signatures must return an intentional non-success response.

---

## UI implementation requirements

Preserve the existing Re-Embroidered Conversations visual language.

The existing temporary-hold card should evolve naturally into the payment handoff rather than introducing an unrelated payment design system.

Required states:

```text
hold created
checkout starting
redirecting
recoverable Stripe error
hold expired
payment processing/return
payment received
```

Maintain:

- keyboard accessibility;
- visible focus;
- semantic button behaviour;
- accessible status/error messaging;
- responsive behaviour;
- existing typography and spacing patterns.

Do not embed payment-card inputs into the site.

Stripe-hosted Checkout owns card-entry UI.

---

## Acceptance criteria

### Checkout creation

- [ ] Stripe's supported Node SDK is installed and used server-side.
- [ ] An active `HOLD` booking can create a hosted Checkout Session.
- [ ] The customer is charged exactly `5500` GBP minor units.
- [ ] Price and currency cannot be overridden by browser input.
- [ ] The internal booking ID is attached to Stripe for correlation.
- [ ] Customer card details never pass through the application server.
- [ ] Stripe secrets never enter browser code.
- [ ] The booking stores the Stripe Checkout Session ID.
- [ ] Repeated checkout requests do not produce multiple independently payable sessions for the same booking.

### Hold and expiry

- [ ] An expired booking hold cannot start Checkout.
- [ ] Starting Checkout reconciles `Booking.expiresAt` with the Stripe Session expiry.
- [ ] Stripe can never accept payment after the application has released that booking slot.
- [ ] The longer Stripe Checkout expiry does not break existing availability conflict behaviour.
- [ ] An expired Stripe Checkout Session changes an unpaid `HOLD` to `CANCELLED`.
- [ ] The cancelled booking stops blocking availability.

### Payment

- [ ] A browser redirect is not treated as payment authority.
- [ ] Stripe webhook signatures are verified against the raw request body.
- [ ] `checkout.session.completed` for a valid paid session changes `HOLD` to `PAID`.
- [ ] `stripePaymentIntentId` is persisted.
- [ ] Duplicate successful webhooks are idempotent.
- [ ] Duplicate expiry webhooks are idempotent.
- [ ] A paid booking continues blocking availability.
- [ ] Payment does not transition the booking to `CONFIRMED`.

### Failure handling

- [ ] Stripe API failure does not mark the booking paid.
- [ ] Persistence failure does not cause uncontrolled duplicate Checkout Sessions.
- [ ] Invalid webhook signatures cannot mutate bookings.
- [ ] An unrelated/mismatched Checkout Session cannot mutate another booking.
- [ ] Customer-facing responses do not expose Stripe internals.
- [ ] A successful payment that cannot be reconciled is surfaced as an operational error rather than silently discarded.

### UI

- [ ] The temporary-hold state contains a £55 payment CTA.
- [ ] Checkout initiation has an accessible loading/disabled state.
- [ ] Checkout failure is recoverable while the hold remains active.
- [ ] An expired hold returns the customer to current availability.
- [ ] Successful Checkout navigation uses the returned Stripe URL.
- [ ] The Stripe return screen does not claim Calendar/Meet confirmation.
- [ ] URL query parameters alone cannot produce an authoritative "Paid" or "Confirmed" state.
- [ ] Existing responsive booking behaviour remains intact.

### Code quality

- [ ] Stripe-specific code is isolated behind a server-side boundary.
- [ ] Existing booking architecture is extended rather than replaced.
- [ ] No unnecessary authentication/payment architecture is introduced.
- [ ] No unrelated refactoring is included.
- [ ] Type checking passes.
- [ ] Node tests pass.
- [ ] Production build passes.
- [ ] Playwright browser tests pass.

---

## Tests to add or update

### Unit tests

Add focused tests for Checkout orchestration.

Suggested location:

```text
tests/stripe-checkout.test.mjs
```

Cover:

- canonical amount is 5500;
- canonical currency is GBP;
- active hold accepted;
- expired hold rejected;
- non-`HOLD` booking rejected appropriately;
- correct Checkout parameters;
- booking ID metadata/correlation;
- customer email handling;
- successful Session persistence;
- hold expiry extended to Checkout expiry;
- retry returns/reuses the same logical Checkout;
- concurrent duplicate initiation does not expose two payable sessions;
- Stripe failure leaves booking unpaid;
- persistence/reconciliation failure is handled safely;
- a hold expiring during Checkout creation cannot result in an unsafe payable session.

### Route-handler tests

Suggested location:

```text
tests/stripe-checkout-route.test.mjs
```

Cover:

- malformed JSON;
- missing booking ID;
- invalid booking ID;
- unavailable/expired hold;
- successful response shape;
- customer-safe Stripe failure;
- no raw Stripe object returned;
- no-store behaviour where applicable.

### Webhook tests

Suggested location:

```text
tests/stripe-webhook.test.mjs
```

Cover:

- valid signature;
- missing signature;
- invalid signature;
- unsupported event;
- successful paid `checkout.session.completed`;
- amount/currency validation;
- booking correlation validation;
- Session ID mismatch;
- PaymentIntent persistence;
- duplicate completed event;
- `checkout.session.expired`;
- duplicate expired event;
- expired event after `PAID` does not cancel payment;
- completed event does not downgrade future `CONFIRMED` state;
- malformed Stripe payload cannot mutate a booking.

External Stripe HTTP/API calls must be mocked or replaced by deterministic test doubles.

Tests must not require a developer's real Stripe account.

### Database/integration tests

Add database-backed coverage where useful for:

```text
HOLD → PAID
HOLD → CANCELLED
```

Verify the existing active-slot uniqueness and availability semantics continue to hold.

Specifically verify:

```text
PAID
```

continues owning the slot even though `expiresAt` is in the past later.

### Browser tests

Update:

```text
tests/browser/migration-smoke.spec.ts
```

Cover:

1. select a session;
2. enter customer details;
3. create the hold;
4. see the payment CTA;
5. click the payment CTA;
6. verify duplicate-click protection;
7. mock Checkout creation deterministically;
8. verify navigation to the returned Checkout URL or deterministic test substitute;
9. verify recoverable checkout-initiation failure;
10. verify hold-unavailable behaviour;
11. verify the return state does not claim full booking confirmation.

Do not make CI contact Stripe.

### Visual regression

The temporary-hold card materially changes by gaining a payment CTA.

Update the existing temporary-hold screenshot intentionally.

Cover the changed rendered state at the existing deterministic viewport used by the booking visual test.

Do not update unrelated snapshots.

---

## Verification commands

Run the repository's established commands:

```bash
npm ci

npm run db:migrate:deploy

npm run db:validate

npm test

npm run lint

npm run build

npx playwright install chromium

npm run test:browser
```

Run targeted Stripe tests directly where useful, for example:

```bash
node --conditions=react-server \
  --experimental-test-module-mocks \
  --test \
  tests/stripe-checkout.test.mjs \
  tests/stripe-checkout-route.test.mjs \
  tests/stripe-webhook.test.mjs
```

If the final filenames differ, use the actual implemented test paths rather than inventing parallel tests.

### Manual Stripe test-mode verification

In addition to automated mocked tests, manually verify the integration in Stripe test mode.

Use Stripe CLI or the configured test webhook endpoint to verify:

```text
checkout.session.completed
checkout.session.expired
```

Confirm:

```text
HOLD → PAID
HOLD → CANCELLED
```

in the local database.

Do not weaken webhook signature verification for local testing.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- Stripe server integration;
- Checkout creation;
- booking/Checkout expiry reconciliation;
- booking UI payment handoff;
- webhook processing;
- payment lifecycle changes;
- Stripe-return state.

### Tests

List:

- unit tests added;
- route tests added;
- webhook tests added;
- database tests added/updated;
- Playwright tests updated;
- visual snapshots intentionally updated;
- all verification commands and results.

### External configuration

Document:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

and the required Stripe webhook endpoint/events.

State the local Stripe CLI forwarding command used during manual verification if one was used.

### Deviations

Document any meaningful deviation from this specification and why it was required.

Use `None` when there were no deviations.

### Remaining issues

Expected follow-up work includes:

- Google Calendar event creation;
- Google Meet conference creation;
- `PAID → CONFIRMED`;
- final authoritative booking confirmation UI;
- confirmation email;
- cancellation/refund workflow.

Do not implement those follow-ups as part of PR #8.
