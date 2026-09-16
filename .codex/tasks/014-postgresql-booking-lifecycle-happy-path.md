# PR #14 — PostgreSQL-backed complete booking lifecycle test

## Repository state

**Expected branch:**  
`test/014-postgresql-booking-lifecycle-happy-path`

**Base branch:**  
`main` after PR #13 has been merged.

**Worktree:**  
N/A

**Dependencies:**

- PR #13 — Create Google Calendar event + Google Meet
- Existing PostgreSQL booking persistence
- Existing booking hold persistence
- Existing Stripe Checkout persistence
- Existing Stripe webhook persistence
- Existing Google Calendar booking-event reconciliation
- Existing unified availability engine
- Existing PostgreSQL CI service

PR #14 must be implemented from a base containing PR #13.

If PR #13 has not yet merged when implementation begins, do not reimplement its production changes in PR #14. Either wait until the base contains PR #13 or temporarily stack the work on the PR #13 branch and retarget it to `main` after PR #13 merges.

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/013-google-calendar-event-google-meet.md`
- `package.json`
- `.github/workflows/ci.yml`
- `prisma/schema.prisma`
- `src/lib/db.ts`
- `src/lib/booking/booking-hold.mjs`
- `src/lib/booking/stripe-checkout.mjs`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/booking/session-product.mjs`
- `src/lib/calendar/booking-event.mjs`
- `src/lib/availability/available-slots.mjs`
- `src/lib/availability/booking-conflicts.mjs`
- `src/lib/availability/candidate-slots.mjs`
- `src/lib/availability/provider-config.mjs`
- `tests/booking-hold-database.test.mjs`
- `tests/stripe-checkout.test.mjs`
- `tests/stripe-webhook.test.mjs`
- `tests/google-calendar-event.test.mjs`
- `tests/unified-availability.test.mjs`

### Primary change area

Integration testing of the complete persisted booking lifecycle:

```text
PostgreSQL
    ↓
HOLD
    ↓
Stripe Checkout Session attached
    ↓
verified paid Stripe event
    ↓
PAID
    ↓
Google Calendar + Meet reconciliation
    ↓
CONFIRMED
    ↓
availability still blocked
```

### Canonical implementation examples

Use these existing tests as the primary patterns:

- `tests/booking-hold-database.test.mjs`
  - PostgreSQL test setup
  - PrismaPg test client
  - `DATABASE_SCHEMA_TEST_URL`
  - deterministic cleanup
  - real booking persistence

- `tests/stripe-checkout.test.mjs`
  - deterministic Stripe Checkout stub
  - Checkout Session shape
  - Stripe idempotency expectations

- `tests/stripe-webhook.test.mjs`
  - paid Checkout Session event fixture
  - Calendar finalisation boundary
  - `HOLD → PAID → CONFIRMED`

- `tests/google-calendar-event.test.mjs`
  - deterministic Google event response
  - Meet URL validation
  - Calendar reconciliation dependencies

- `tests/unified-availability.test.mjs`
  - deterministic provider dates
  - `getAvailableSlots`
  - booking conflicts blocking availability

### Relevant symbols

Inspect and use where applicable:

```text
createHoldPersistence
createBookingCheckout
createCheckoutPersistence

processStripeWebhookEvent
createStripeWebhookPersistence

reconcileBookingCalendarEvent
googleEventIdForBooking
GOOGLE_EVENTS_OWNED_SCOPE

getAvailableSlots
getProviderCandidateSlotsForDate
getActiveBookingConflicts

SESSION_PRODUCT
PROVIDER_AVAILABILITY_CONFIG
```

### Expected change surface

Expected:

```text
.codex/tasks/014-postgresql-booking-lifecycle-happy-path.md
tests/booking-lifecycle-database.test.mjs
```

Small test-support changes are acceptable only if genuinely necessary to exercise the existing production boundaries.

No production behaviour change is expected.

### Excluded areas

Do not:

- change booking lifecycle behaviour;
- change Stripe Checkout behaviour;
- change Stripe webhook behaviour;
- change Google Calendar event creation behaviour;
- change availability rules;
- change the Prisma schema;
- add a migration;
- add npm dependencies;
- add browser or Playwright coverage for this task;
- call the real Stripe API;
- call the real Google APIs;
- create a second implementation of persistence for testing;
- replace PostgreSQL with an in-memory repository;
- seed the booking directly into its later lifecycle states;
- split the requested happy path into several isolated tests instead of providing the one complete lifecycle test.

### Unknowns Codex must verify

Before editing, verify:

- PR #13 is present in the implementation base.
- No scoped `AGENTS.md` changes the testing conventions.
- `DATABASE_URL` and `DATABASE_SCHEMA_TEST_URL` point to the same PostgreSQL database in CI.
- Existing Node test execution still includes `tests/*.test.mjs`.
- PR #13 still exposes `processStripeWebhookEvent`, `createStripeWebhookPersistence`, and `reconcileBookingCalendarEvent` in the forms expected by this task.
- The current provider configuration still exposes a deterministic weekday slot suitable for the test.

Do not guess if any of these have changed.

---

## Objective

Add **one PostgreSQL-backed integration test** proving that one booking row survives the complete successful booking lifecycle and continues to own its slot after confirmation.

The test must connect the production persistence and orchestration that are currently tested mostly in isolation.

The required lifecycle is:

```text
create real persisted HOLD
        ↓
create Stripe Checkout using real Checkout persistence
        ↓
same row contains stripeCheckoutSessionId
        ↓
process paid Stripe Checkout event
        ↓
real webhook persistence marks payment
        ↓
real Calendar reconciliation runs with Google stubbed
        ↓
same row becomes CONFIRMED
        ↓
same row contains:
  stripePaymentIntentId
  calendarEventId
  meetingUrl
        ↓
query unified availability
        ↓
confirmed slot remains unavailable
```

The test must prove that this is **one booking row** throughout the entire journey.

External network services are not part of this integration test:

- Stripe must be stubbed.
- Google API operations must be stubbed.
- PostgreSQL must be real.

---

## Current architecture

The booking lifecycle is divided into deliberately separate server-side modules.

### Hold persistence

`createHoldPersistence(database)` inserts a real `HOLD` booking through Prisma and handles expired ordinary holds before insertion.

### Checkout

`createBookingCheckout(...)` validates the existing hold and delegates booking storage to:

```text
createCheckoutPersistence(database)
```

The real persistence adapter:

- reads the existing booking;
- conditionally attaches `stripeCheckoutSessionId`;
- extends the hold expiry to the Stripe Session expiry;
- does not create a replacement booking row.

### Payment webhook

After PR #13, `processStripeWebhookEvent(...)` uses:

```text
createStripeWebhookPersistence(database)
```

to perform the persisted lifecycle:

```text
HOLD
→ PAID
→ CONFIRMED
```

The Stripe PaymentIntent ID is persisted when the booking becomes paid.

Calendar event ID and Meet URL are persisted when Calendar finalisation succeeds.

### Google Calendar

`reconcileBookingCalendarEvent(...)` owns the Calendar/Meet reconciliation logic.

Its external Google dependencies are injectable, allowing the lifecycle test to run the real application reconciliation logic without making Google network calls.

### Availability

`getAvailableSlots(...)` combines:

- provider candidate slots;
- persisted booking conflicts;
- Google busy periods.

Persisted `CONFIRMED` bookings are slot-owning conflicts and therefore must remain unavailable.

This final availability assertion is important: reaching `CONFIRMED` is not sufficient if the booking subsequently disappears from availability conflict detection.

---

## External integrations affected

### Stripe

No live Stripe request is allowed.

Use a deterministic Stripe test double implementing the minimum Checkout Session methods required by `createBookingCheckout`.

The Session creation stub must return a valid application-facing Stripe Session equivalent to:

```text
id
status = open
checkout.stripe.com URL
expires_at
```

The returned Session ID must subsequently be used in the paid webhook event.

The lifecycle test must therefore prove correlation between:

```text
Stripe stub Session
        ↓
Booking.stripeCheckoutSessionId
        ↓
paid webhook Session ID
```

### Google Calendar / Google Meet

No live Google request is allowed.

Prefer exercising the real:

```text
reconcileBookingCalendarEvent(...)
```

rather than replacing the entire Calendar finalisation service with a function that simply returns IDs.

Stub its external dependencies:

```text
getCredentials
getOAuthConfig
refreshAccessToken
insertEvent
getEvent
```

for the successful path.

The Calendar stub must return a provider response representing:

- the deterministic event requested by the application;
- successful conference creation;
- a valid `https://meet.google.com/...` URL.

This ensures that the lifecycle test still exercises:

- application event construction;
- deterministic event identity;
- attendee propagation;
- persisted booking times;
- Meet response extraction;
- Google response validation.

`getEvent` should not normally be required by this simple successful insert path.

---

## Configuration and data changes

### Environment variables

No new environment variables.

The PostgreSQL test follows the existing database-test convention.

Relevant existing variables:

```text
DATABASE_SCHEMA_TEST_URL
DATABASE_URL
```

Because the production booking-conflict loader uses the normal application database connection while existing database tests create an explicit client from the schema-test connection, this test must not accidentally operate across two different databases.

Before running the complete lifecycle test, require the test environment to establish that both URLs refer to the intended test database.

In CI they are expected to be the same PostgreSQL service.

If the required test database configuration is unavailable, skip the PostgreSQL integration test in the same style as the existing database-backed tests.

Never silently run destructive test cleanup against an arbitrary developer database.

### Database or schema

None.

No migration.

Use the existing `Booking` model and fields:

```text
id
name
email
startAt
endAt
timezone
status
stripeCheckoutSessionId
stripePaymentIntentId
calendarEventId
meetingUrl
expiresAt
createdAt
```

### Webhooks

No webhook endpoint change.

The lifecycle test should invoke the already-verified webhook-domain processing boundary rather than duplicate signature verification coverage.

Signature validation remains covered by the existing webhook tests.

### OAuth and permissions

No change.

The Google dependency fixture must represent a connection containing the existing event-write scope required by PR #13.

### Deployment configuration

None.

### Migration or backfill

None.

---

## Security and privacy considerations

Use fictional test customer information only.

Do not use production customer data, Stripe IDs, Google event IDs, Meet URLs, OAuth credentials, or tokens.

All integration credentials in the test must be obvious deterministic fake values.

The lifecycle test must never make live Stripe or Google network requests.

PostgreSQL cleanup must be narrowly scoped to the booking created by the test.

---

## Required implementation

### 1. Add one complete PostgreSQL lifecycle test

Create:

```text
tests/booking-lifecycle-database.test.mjs
```

Add one primary test equivalent to:

```text
persists one booking through HOLD → Checkout → CONFIRMED and keeps its slot unavailable
```

This test is intentionally broader than the current isolated tests.

Do not break this lifecycle into separate tests.

---

### 2. Use a real PostgreSQL Prisma client

Follow the existing database test setup using:

```text
PrismaPg
PrismaClient
DATABASE_SCHEMA_TEST_URL
```

The test must use actual PostgreSQL persistence.

Do not use:

- an in-memory booking object;
- fake persistence methods;
- a hand-built repository replacing Prisma.

Use deterministic dates and identifiers sufficiently isolated from the dates already used by other database tests.

For example, a provider weekday in 2040 may be used with a corresponding deterministic `now`.

The selected slot must fall within the provider's configured:

- working hours;
- minimum notice;
- maximum booking horizon.

---

### 3. Create the initial HOLD using real hold persistence

Use:

```text
createHoldPersistence(db)
```

to create the booking.

Do not begin the test with:

```text
db.booking.create(...)
```

for the lifecycle booking.

Do not manually seed it as `PAID` or `CONFIRMED`.

After creation, query PostgreSQL and verify that the row:

```text
status === "HOLD"
stripeCheckoutSessionId === null
stripePaymentIntentId === null
calendarEventId === null
meetingUrl === null
```

Record the generated booking ID.

Every subsequent operation must operate on this same booking ID.

---

### 4. Create Checkout through the real Checkout persistence adapter

Build:

```text
createCheckoutPersistence(db)
```

and pass it to the real:

```text
createBookingCheckout(...)
```

Stub only Stripe.

The Stripe stub must return one deterministic open Checkout Session, for example:

```text
cs_test_lifecycle
```

with:

- a valid `https://checkout.stripe.com/...` URL;
- an expiry acceptable to the production Checkout code.

Use a deterministic `getNow` where required so time does not depend on test execution speed.

Do not directly assign `stripeCheckoutSessionId` through Prisma.

After `createBookingCheckout(...)` succeeds, query PostgreSQL again using the original booking ID.

Verify:

```text
status === "HOLD"
stripeCheckoutSessionId === <stubbed Session ID>
```

Also verify that this is still the same row created by the hold step.

The test should fail if Checkout persistence creates a replacement booking rather than modifying the existing row.

---

### 5. Construct the paid Stripe event from the created Session

Construct a deterministic:

```text
checkout.session.completed
```

event using the same:

```text
bookingId
stripeCheckoutSessionId
```

created earlier.

Use the canonical product values:

```text
mode = payment
payment_status = paid
amount_total = 5500
currency = gbp
```

Provide a deterministic PaymentIntent ID, for example:

```text
pi_test_lifecycle
```

Both:

```text
client_reference_id
metadata.bookingId
```

must correlate to the persisted booking ID.

Do not bypass normal webhook reconciliation by directly changing the row to `PAID`.

---

### 6. Process payment using real webhook persistence

Create:

```text
createStripeWebhookPersistence(db)
```

and invoke:

```text
processStripeWebhookEvent(...)
```

with the paid event.

This must exercise the real PostgreSQL state transitions introduced by the existing booking implementation and PR #13.

---

### 7. Run real Calendar reconciliation with Google stubbed

The webhook's Calendar finalisation callback should use:

```text
reconcileBookingCalendarEvent(...)
```

with deterministic fake Google dependencies.

The fake Google connection must contain:

```text
GOOGLE_EVENTS_OWNED_SCOPE
```

Use fake OAuth configuration and fake token exchange values.

The `insertEvent` stub must receive the event built from the actual persisted paid booking.

It should return that same logical event with successful conference data and a deterministic Meet URL such as:

```text
https://meet.google.com/abc-defg-hij
```

The returned Calendar event ID should correspond to:

```text
googleEventIdForBooking(bookingId)
```

The test should record the Calendar insert call count and verify that the happy path creates exactly one logical Calendar event.

No actual Google request may occur.

---

### 8. Verify the final persisted row

After webhook processing completes, query PostgreSQL by the original booking ID.

Verify:

```text
status === "CONFIRMED"
stripeCheckoutSessionId === <same Checkout Session ID>
stripePaymentIntentId === <paid event PaymentIntent ID>
calendarEventId === googleEventIdForBooking(bookingId)
meetingUrl === <stubbed Google Meet URL>
```

Also verify that the original booking identity and session timing have not changed:

```text
id
startAt
endAt
timezone
email
```

The test must therefore demonstrate one continuous database row:

```text
HOLD
→ HOLD + Checkout Session
→ PAID
→ CONFIRMED
```

No direct database mutation may be used to produce any of those transitions after the initial hold is created.

Direct database reads for assertions and cleanup are allowed.

---

### 9. Query availability after confirmation

After the booking is `CONFIRMED`, query:

```text
getAvailableSlots(...)
```

for the provider-local date containing the booking.

Use:

```text
getProviderCandidateSlotsForDate
getActiveBookingConflicts
```

so the actual persisted booking-conflict path participates in the test.

Stub only Google busy periods:

```text
getCalendarBusyPeriods: async () => []
```

This isolates the assertion to persisted booking ownership rather than an unrelated Google busy event.

Verify that the exact confirmed booking slot does **not** appear in the returned available slots.

Where practical, also assert that an adjacent otherwise-valid slot remains available. This demonstrates that availability is blocked by the confirmed booking rather than because the whole test date accidentally became unavailable.

The critical assertion is:

```text
available.some(slot => slot.startAt === confirmedBooking.startAt.toISOString())
=== false
```

---

### 10. Make the test deterministic and isolated

The test must:

- use a fixed `now`;
- use a fixed provider-local test date;
- avoid the machine's local timezone;
- use fictional customer data;
- use deterministic fake Stripe and Google identifiers;
- clean up the booking in `finally`;
- disconnect the explicit test Prisma client;
- not depend on existing rows being absent except for the exact slot chosen by this test;
- not leak test state into another database test.

Do not use real current time.

Do not use `setTimeout`, polling or sleeps.

---

## UI implementation requirements

N/A.

This PR does not change rendered UI.

No Playwright or visual-regression changes are required.

---

## Acceptance criteria

### Complete lifecycle

- [ ] Exactly one new complete happy-path lifecycle test connects the persisted booking flow.
- [ ] The test uses real PostgreSQL.
- [ ] The initial `HOLD` is created through `createHoldPersistence`.
- [ ] The same booking row is used throughout the entire test.
- [ ] Checkout is created through `createBookingCheckout`.
- [ ] Checkout persistence is the real `createCheckoutPersistence(db)`.
- [ ] Stripe itself is stubbed.
- [ ] The resulting Stripe Checkout Session ID is persisted on the same booking row.
- [ ] The paid event uses that exact persisted Session ID.
- [ ] Payment processing uses real `createStripeWebhookPersistence(db)`.
- [ ] No direct Prisma update is used to fake the payment lifecycle.
- [ ] Google network operations are stubbed.
- [ ] Real Calendar booking reconciliation is exercised where practical.
- [ ] The booking reaches `CONFIRMED`.
- [ ] `stripePaymentIntentId` is persisted.
- [ ] `calendarEventId` is persisted.
- [ ] `meetingUrl` is persisted.
- [ ] The persisted event ID corresponds to the booking's deterministic Google event ID.
- [ ] Exactly one Calendar insert occurs during the normal successful path.

### Availability

- [ ] Availability is queried after the row is `CONFIRMED`.
- [ ] The availability query reads booking conflict state from PostgreSQL rather than an in-memory booking fixture.
- [ ] Google busy periods are stubbed empty for this assertion.
- [ ] The confirmed slot remains unavailable.
- [ ] An adjacent slot remains available where the provider configuration provides one suitable for asserting this safely.

### Test isolation

- [ ] The lifecycle booking is cleaned up in `finally`.
- [ ] The explicit Prisma client is disconnected.
- [ ] The test does not access live Stripe.
- [ ] The test does not access live Google APIs.
- [ ] Fake credentials and customer data are used.
- [ ] The test skips safely when the required PostgreSQL test environment is not configured.
- [ ] The test cannot silently mutate an unrelated developer database.
- [ ] Dates and time are deterministic.

### Scope

- [ ] No Prisma schema change.
- [ ] No migration.
- [ ] No new package.
- [ ] No unrelated production refactor.
- [ ] No browser-test change.
- [ ] Existing isolated booking, Stripe, Calendar and availability tests remain intact.

---

## Tests to add or update

### Unit tests

N/A.

The purpose of PR #14 is integration coverage rather than additional isolated unit coverage.

### Integration tests

Add:

```text
tests/booking-lifecycle-database.test.mjs
```

One complete test must cover:

```text
real PostgreSQL HOLD persistence
→ real Checkout persistence + Stripe stub
→ persisted Checkout Session ID
→ real paid webhook persistence
→ real Calendar reconciliation + Google API stub
→ CONFIRMED persisted state
→ real PostgreSQL-backed availability conflict
```

Do not replace existing focused tests. They remain useful for failure cases and precise diagnostics.

This new test exists to prove that their boundaries actually compose correctly.

### Browser tests

N/A.

### Visual regression tests

N/A.

---

## Verification commands

The repository currently uses the Node test runner with the React Server condition and module-mock support.

With the PostgreSQL test database configured and migrations applied, run the targeted test:

```bash
node --conditions=react-server --experimental-test-module-mocks --test tests/booking-lifecycle-database.test.mjs
```

Then run the repository verification:

```bash
npm run db:migrate:deploy
npm run db:validate
npm test
npm run lint
npm run build
```

No Playwright run is required specifically for this backend-only PR, although the normal CI workflow may continue running the repository's existing browser suite.

If the PostgreSQL-backed test cannot run locally because the test database is unavailable, document that explicitly. It must still run in CI where the PostgreSQL service and database environment are configured.

---

## Completion report

When implementation is complete, report:

### Changed

- Added the PostgreSQL-backed complete booking lifecycle test.
- State whether any production file needed modification. The expected answer is `None`.

### Tests

Report:

- targeted lifecycle test result;
- full `npm test` result;
- Prisma validation result;
- type-check result;
- build result.

### External configuration

None.

No real Stripe or Google test credentials are required.

### Deviations

Document any departure from the requirement to use:

```text
createHoldPersistence
createCheckoutPersistence
createStripeWebhookPersistence
reconcileBookingCalendarEvent
getAvailableSlots
```

and explain why it was necessary.

Use `None` when there were no deviations.

### Remaining issues

Use `None` if the lifecycle test passes and no integration gap was discovered.

If the lifecycle test exposes a production integration defect, do not weaken the test to accommodate it. Report the defect as a remaining issue or fix it only if the change is small, directly necessary to make the documented existing lifecycle work, and clearly identified as a deviation from this test-focused PR.
