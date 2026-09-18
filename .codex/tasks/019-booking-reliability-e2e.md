# PR #19 — Reliability + E2E tests

## Repository state

**Expected branch:**  
`test/019-booking-reliability-e2e`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**

- PR #17 — Cancellation and rescheduling
- Existing PostgreSQL booking persistence
- Existing unified availability engine
- Existing Stripe Checkout integration
- Existing Stripe webhook processing
- Existing Google Calendar + Google Meet reconciliation
- Existing booking confirmation flow
- Existing cancellation/refund reconciliation
- Existing rescheduling reservation/commit flow
- Existing PostgreSQL CI service
- Existing Playwright infrastructure

No dependency on PR #18 is required for the behaviour covered by this task.

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/014-postgresql-booking-lifecycle-happy-path.md`
- `.codex/tasks/017-cancellation-rescheduling.md`
- `package.json`
- `.github/workflows/ci.yml`
- `playwright.config.ts`
- `prisma/schema.prisma`
- relevant Prisma migrations
- `src/lib/availability/available-slots.mjs`
- `src/lib/availability/booking-conflicts.mjs`
- `src/lib/availability/candidate-slots.mjs`
- `src/lib/availability/provider-config.mjs`
- `src/lib/booking/booking-hold.mjs`
- `src/lib/booking/stripe-checkout.mjs`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/booking/booking-success.mjs`
- `src/lib/booking/booking-cancellation.mjs`
- `src/lib/booking/booking-reschedule.mjs`
- `src/lib/calendar/booking-event.mjs`
- `src/lib/calendar/busy-periods.mjs`
- `src/lib/google-calendar/google-api.mjs`
- existing booking, Stripe, Calendar, cancellation, rescheduling, database, and browser tests

Do not recreate coverage that already exists merely to increase the test count.

### Primary change area

Reliability testing of the complete booking lifecycle across:

```text
availability
    ↓
temporary HOLD
    ↓
Stripe Checkout
    ↓
Stripe webhook
    ↓
PAID
    ↓
Google Calendar + Meet
    ↓
CONFIRMED
    ↓
cancellation / refund
    ↓
rescheduling
```

The primary goal is to prove behaviour under concurrency, retries, stale state, external-service failures, expired reservations, timezone changes, and customer/browser interruption.

### Canonical implementation examples

Treat these existing tests as the preferred patterns:

```text
tests/booking-lifecycle-database.test.mjs
tests/booking-hold-database.test.mjs
tests/stripe-webhook.test.mjs
tests/google-calendar-event.test.mjs
tests/unified-availability.test.mjs
tests/booking-cancellation.test.mjs
tests/booking-reschedule.test.mjs
tests/booking-management-database.test.mjs

tests/browser/migration-smoke.spec.ts
tests/browser/booking-success.spec.ts
tests/browser/booking-management.spec.ts
```

Important existing foundations include:

- real PostgreSQL through `PrismaPg`
- deterministic cleanup
- `DATABASE_SCHEMA_TEST_URL`
- deterministic Stripe doubles
- deterministic Google Calendar doubles
- explicit Stripe idempotency assertions
- deterministic Google Calendar event IDs
- persisted `PAID` state before Calendar finalisation
- linked reschedule `HOLD`s
- browser tests using the real application and PostgreSQL where appropriate

### Relevant symbols

Inspect and reuse where applicable:

```text
createBookingHold
createHoldPersistence
isActiveSlotUniqueConflict

createBookingCheckout
createCheckoutPersistence

processStripeWebhookEvent
createStripeWebhookPersistence

getBookingSuccessState

getAvailableSlots
getActiveBookingConflicts
getProviderCandidateSlotsForDate
PROVIDER_AVAILABILITY_CONFIG

reconcileBookingCalendarEvent
rescheduleBookingCalendarEvent
cancelBookingCalendarEvent
googleEventIdForBooking

refreshGoogleAccessToken
GoogleApiError

cancelBooking
reconcileCancelledBooking
createBookingCancellationPersistence

rescheduleBooking
createBookingReschedulePersistence

SESSION_PRODUCT
```

### Expected change surface

Expected primary changes:

```text
.codex/tasks/019-booking-reliability-e2e.md
tests/booking-reliability-database.test.mjs
tests/browser/booking-success.spec.ts
tests/browser/migration-smoke.spec.ts
tests/browser/booking-management.spec.ts
```

Existing unit/integration test files may be extended where that is clearer than creating duplicate coverage.

Small production changes are permitted only when a required reliability test demonstrates that the existing behaviour violates an invariant in this specification.

Any production fix must:

- be the smallest coherent correction;
- preserve the existing architecture;
- avoid unrelated refactoring;
- have a regression test reproducing the failure before the fix;
- preserve existing customer-facing behaviour unless changing it is necessary for correctness.

### Excluded areas

Do not:

- redesign the booking UI;
- introduce another testing framework;
- call real Stripe APIs from automated tests;
- call real Google APIs from automated tests;
- depend on a developer's real Google Calendar;
- weaken Stripe webhook signature verification;
- weaken Google OAuth security;
- introduce sleep-based race tests when deterministic coordination can be used;
- add visual snapshot coverage when rendering has not changed;
- regenerate existing screenshots merely because this PR runs browser tests;
- change the £55 / 55-minute product;
- change the 24-hour cancellation policy;
- broaden Google OAuth scopes;
- add background workers or reconciliation infrastructure solely for this task;
- add a new booking status unless a demonstrated reliability defect cannot be represented by the existing model.

### Unknowns Codex must verify

Before editing, verify:

- PR #17 is present on the implementation base.
- No scoped `AGENTS.md` changes the testing conventions.
- `DATABASE_URL` and `DATABASE_SCHEMA_TEST_URL` still use the same PostgreSQL database in CI.
- the partial PostgreSQL index `bookings_active_start_at_key` still owns identical active start times for `HOLD`, `PAID`, and `CONFIRMED`;
- Checkout-backed expired holds still remain slot-owning until Stripe authoritatively resolves the Checkout Session;
- linked reschedule holds still remain slot-owning until explicitly retired;
- Playwright continues to run against a built Next.js application;
- browser tests continue to run serially against PostgreSQL;
- no live Google or Stripe credentials are required by CI;
- the application still persists only the Google refresh token and obtains ephemeral access tokens for Calendar operations;
- the existing browser tests listed above have not already been expanded to fully cover one of the cases below.

Do not guess when these can be established from the repository.

---

## Objective

Add reliability coverage proving that the booking system fails safely under the failure and race conditions most likely to cause:

- double bookings;
- lost paid bookings;
- duplicate external side effects;
- incorrectly released slots;
- stuck reschedules;
- duplicate refunds;
- timezone errors;
- dependence on the customer returning from Stripe.

Use **real PostgreSQL** for persistence and concurrency-sensitive tests.

Use deterministic Stripe and Google test doubles at external-service boundaries.

Use Playwright for customer-visible recovery behaviour.

The test suite must specifically cover:

1. two people selecting the same slot;
2. payment succeeding while Calendar temporarily fails;
3. duplicate Stripe webhook delivery;
4. the customer closing Stripe after payment;
5. hold expiry;
6. Google token expiry/revocation;
7. the provider adding a Calendar event after availability was shown but before the booking is reserved;
8. DST/timezone transitions;
9. a booking Calendar event being manually changed or deleted;
10. refund/cancellation recovery;
11. rescheduling collisions.

A reliability test must assert the resulting persisted state and external side-effect count, not merely assert that an error was thrown.

If a required test exposes a real production defect, fix the defect rather than weakening the test.

---

## Current architecture

### Booking reservation

The browser receives available slots from the unified availability engine.

Displayed availability is not authoritative.

When the customer submits the booking form:

```text
POST /api/bookings/hold
        ↓
createBookingHold(...)
        ↓
fresh unified availability query
        ↓
createHoldPersistence(...)
        ↓
PostgreSQL HOLD
```

`createBookingHold` rechecks availability before persistence.

The database has a partial unique index:

```text
bookings_active_start_at_key
```

covering the same `startAt` while status is:

```text
HOLD
PAID
CONFIRMED
```

This database constraint is the final protection against two active bookings owning the exact same start time.

### Stripe Checkout

A valid unexpired `HOLD` creates or reuses one Stripe Checkout Session.

The internal booking ID is correlated through:

- `client_reference_id`
- Stripe metadata
- Stripe idempotency key

A Checkout-backed hold continues to own its slot even after its local expiry until Stripe resolves the Checkout Session.

### Successful payment

The verified Stripe webhook is authoritative for payment.

Current lifecycle:

```text
HOLD
 ↓
checkout.session.completed
 ↓
PAID + stripePaymentIntentId persisted
 ↓
Calendar reconciliation
 ↓
CONFIRMED + calendarEventId + meetingUrl
```

Calendar failure after payment intentionally leaves the booking durably `PAID`.

A replay of the webhook can retry Calendar reconciliation.

### Calendar reconciliation

Booking Calendar event IDs are deterministic from the booking ID.

If Calendar event insertion reports a duplicate/conflict for that deterministic ID, the implementation retrieves and validates the existing event rather than creating another event.

Google access tokens are ephemeral. The stored refresh token is used to obtain an access token before privileged Calendar operations.

### Hold expiry

Ordinary expired holds no longer block availability.

Checkout-backed holds remain blocking until Stripe reports the Checkout Session as expired or paid.

Reschedule-linked holds remain blocking until the reschedule operation explicitly commits or releases them.

### Cancellation

Cancellation commits the booking's inactive state before external provider reconciliation.

The slot is therefore released even if:

- Calendar deletion temporarily fails;
- Stripe refund creation temporarily fails.

Calendar and Stripe reconciliation can subsequently retry.

Stripe refund creation uses:

```text
booking-cancellation-refund:<booking-id>
```

as its idempotency key.

### Rescheduling

A reschedule:

```text
CONFIRMED source
        ↓
reserve linked replacement HOLD
        ↓
source still owns old slot
target HOLD owns new slot
        ↓
update existing Calendar event
        ↓
atomic PostgreSQL transfer
        ↓
same CONFIRMED booking moves to target
replacement HOLD retired
```

Uncertain Calendar outcomes deliberately retain the replacement hold until the remote state can be reconciled.

---

## External integrations affected

### Stripe

Operations under test:

- Checkout Session correlation;
- paid Checkout webhook processing;
- expired Checkout processing;
- duplicate webhook delivery;
- cancellation refunds;
- refund retrieval/retry;
- Stripe idempotency.

No Stripe API or webhook configuration change is expected.

Tests must use deterministic Stripe doubles.

### Google Calendar

Operations under test:

- FreeBusy availability;
- OAuth access-token refresh;
- event creation;
- deterministic event reconciliation;
- event lookup;
- event update for rescheduling;
- event deletion for cancellation;
- missing/manually altered events;
- temporary provider failure;
- authorization failure.

No additional Google scope is expected.

Tests must use deterministic Google doubles.

### PostgreSQL

PostgreSQL is part of the reliability boundary and must be real for:

- simultaneous slot claims;
- lifecycle recovery;
- cancellation state;
- reschedule collision;
- atomic slot transfer;
- availability following state transitions.

Do not replace PostgreSQL with an in-memory repository for these cases.

---

## Configuration and data changes

### Environment variables

No new environment variables are expected.

Continue using existing test configuration including:

```text
DATABASE_URL
DATABASE_SCHEMA_TEST_URL
BOOKING_MANAGEMENT_SECRET
BOOKING_CHANGES_URL
```

Real provider credentials must not be required.

### Database or schema

No schema change is expected.

The tests should exercise the existing:

- `BookingStatus`;
- `bookings_active_start_at_key`;
- Stripe identifier uniqueness;
- Calendar event identifier uniqueness;
- reschedule source uniqueness;
- cancellation/refund fields.

Do not add a migration merely to simplify testing.

If a requested invariant demonstrably cannot be represented using the existing persistence model, document that finding before making any schema change and keep the change narrowly scoped.

### Webhooks

No new webhook endpoint or Stripe event registration is expected.

Existing webhook signature verification must remain unchanged.

### OAuth and permissions

No OAuth scope changes are expected.

No access token should be persisted merely to facilitate tests.

### Deployment configuration

None expected.

### Migration or backfill

None expected.

---

## Security and privacy considerations

Reliability tests will handle booking identifiers, customer names/emails, Stripe identifiers, Calendar identifiers, Meet URLs, and OAuth failure conditions.

Use obviously synthetic test values such as:

```text
@example.test
cs_test_*
pi_test_*
evt_test_*
```

Tests and production fixes must not:

- log OAuth refresh tokens;
- log access tokens;
- expose Stripe secrets;
- expose webhook secrets;
- expose full provider errors to the browser;
- leak provider Calendar event details through availability responses;
- weaken capability verification for booking management;
- bypass webhook signature verification in production code.

External provider doubles belong at controlled test boundaries rather than by weakening production authentication.

---

## Required implementation

### 1. Concurrent customers selecting the same slot

Add a real-PostgreSQL concurrency test.

Two independent booking requests must attempt to reserve the **same canonical slot** concurrently.

Coordinate them deterministically so both requests can observe the slot as available before persistence is allowed to complete.

Expected result:

```text
exactly one active HOLD is created
exactly one request succeeds
the other request receives the slot-unavailable outcome
there is exactly one active row for that startAt
no duplicate Checkout Session is created
```

The test must prove that the PostgreSQL constraint remains the final concurrency guard.

Do not implement this as two sequential inserts and call it a concurrency test.

### 2. Payment succeeds but Google Calendar temporarily fails

Add a PostgreSQL-backed lifecycle test.

First delivery of the paid Stripe event:

```text
HOLD
 ↓
PAID
 ↓
Calendar temporary failure
```

Assert:

- `stripePaymentIntentId` is durably stored;
- status remains `PAID`;
- the booking still blocks availability;
- no fake Calendar/Meet data is persisted;
- the payment is not lost;
- no confirmation email is sent yet.

Replay the **same Stripe event** after the Google double recovers.

Assert:

```text
PAID
 ↓
CONFIRMED
```

and:

- the same booking row is used;
- the same PaymentIntent is retained;
- exactly one Calendar event exists logically;
- exactly one Meet URL is persisted;
- exactly one confirmation email is accepted;
- the slot remains unavailable.

### 3. Stripe webhook arrives twice

Add durable duplicate-delivery coverage using real booking persistence.

After the first successful paid event has fully confirmed the booking, process the exact same event again.

Assert that the second delivery:

- does not create a second booking;
- does not change the PaymentIntent;
- does not create another Calendar event;
- does not create another Meet conference;
- does not send another confirmation email;
- does not alter the confirmed slot;
- completes as a safe idempotent replay.

Where useful, count calls to the Stripe/Google/email doubles rather than relying only on final state.

### 4. Customer closes Stripe after payment

Prove that browser return is not part of payment authority.

The server-side lifecycle test must complete payment and booking confirmation using the Stripe webhook **without loading `/booking/success` at any point**.

Assert that the booking becomes authoritative solely through server-side processing.

Add or extend Playwright coverage so that when the customer later opens the known success URL:

```text
/booking/success?booking_id=...&session_id=...
```

the page reads the already persisted booking and shows the confirmed state.

The test must not depend on a Stripe browser redirect having occurred.

If the booking is still `PAID` because downstream Calendar reconciliation is pending, the existing finalising state must remain valid and subsequently transition to confirmed when persistence changes.

### 5. Hold expires

Cover both hold classes explicitly.

#### Ordinary hold

For a `HOLD` with:

```text
stripeCheckoutSessionId = null
rescheduleSourceBookingId = null
```

after expiry:

- it must stop blocking availability;
- a later reservation may claim the slot;
- the stale hold must never become `PAID` or `CONFIRMED` without the required Stripe correlation.

#### Checkout-backed hold

For an expired `HOLD` with a Checkout Session:

- local expiry alone must **not** release the slot;
- the slot remains blocked while Stripe outcome is unresolved;
- `checkout.session.expired` releases it;
- `checkout.session.completed` transitions it to `PAID` instead of releasing it.

Preserve the existing browser behaviour that clears locally expired hold UI state and refreshes availability.

Do not create duplicate browser coverage if the existing migration smoke test already proves that UI behaviour.

### 6. Google token expires or becomes invalid

Test the actual authentication model used by the repository.

Routine Calendar operations must obtain a fresh ephemeral access token from the stored refresh token.

Add coverage proving that:

- the Calendar operation uses the newly refreshed access token;
- no previously issued access token must be persisted or relied upon across operations.

Also test an invalid/revoked refresh token.

For a paid booking waiting for Calendar finalisation:

- the Google authorization failure must be normalized safely;
- booking status remains `PAID`;
- payment identifiers remain stored;
- the slot remains blocked;
- no fabricated Calendar event or Meet link is stored;
- replay after credentials are repaired can complete the same booking.

Do not broaden Google scopes to solve this case.

### 7. Provider adds an event while the customer is booking

Test the stale-availability race already protected by hold-time server revalidation.

Scenario:

```text
customer loads availability
        ↓
slot appears free
        ↓
provider adds Google Calendar event
        ↓
customer submits booking
        ↓
server performs fresh availability check
```

The new busy period must cause the hold request to fail with the existing slot-unavailable behaviour.

Assert:

- no active booking hold is persisted for the now-busy slot;
- no Checkout Session is created;
- the browser clears the stale selection and refreshes availability;
- the customer is asked to select another time.

This task covers the race **before the application's HOLD is successfully committed**.

Do not introduce tentative Google Calendar events for unpaid holds as part of this PR.

### 8. DST and timezone transitions

Expand deterministic `Europe/London` coverage around both:

- the spring transition into BST;
- the autumn transition back to GMT.

Prove that:

- provider working hours remain defined in `Europe/London`;
- customer-facing local start times remain correct;
- corresponding UTC instants change when the UTC offset changes;
- session duration remains exactly 55 minutes;
- slots do not duplicate or disappear because the CI machine uses another timezone;
- confirmation formatting reports the correct GMT/BST timezone information;
- availability remains chronologically ordered.

Tests must use explicit fixed dates.

Do not depend on `new Date()` without a controlled clock for DST assertions.

### 9. Calendar event is manually changed or deleted

Cover the current safe reconciliation rules.

#### Deleted Calendar event during cancellation

If the booking is already being cancelled and the Google event has been manually deleted:

- Calendar deletion should be treated as already reconciled;
- cancellation must remain committed;
- refund reconciliation must continue normally;
- the slot must remain released.

#### Deleted Calendar event during a fresh reschedule

If Calendar lookup reports that the persisted event no longer exists before any PATCH is submitted:

- do not create a replacement Calendar event silently;
- do not move the confirmed booking row;
- release a newly reserved reschedule target when the remote outcome is definitely unchanged;
- return the existing safe Calendar-unavailable/reschedule failure;
- keep the original persisted booking intact.

#### Manually changed Calendar event

If the persisted event exists but its booking identity or start/end time no longer matches either the original booking or the intended target:

- do not overwrite the manually changed event blindly;
- do not silently update PostgreSQL to match it;
- classify the state using the existing reconciliation-pending/event-mismatch behaviour;
- retain reservations when the remote outcome cannot safely be determined.

The test must prove that Calendar drift cannot silently produce a different database booking time.

This PR does not add a background Calendar reconciliation worker.

### 10. Refund and cancellation recovery

Add a PostgreSQL-backed failure/retry test connecting cancellation persistence, availability, Calendar, and Stripe refund behaviour.

Scenario:

```text
CONFIRMED
 ↓
customer cancels
 ↓
CANCELLED committed
 ↓
Calendar and/or Stripe temporarily fails
```

Immediately after authoritative cancellation:

- the original slot must be available again;
- the booking must not return to `CONFIRMED`;
- the persisted refund eligibility decision must remain unchanged.

After retry:

- Calendar deletion is reconciled;
- the existing PaymentIntent is used;
- Stripe refund creation uses the existing idempotency key;
- duplicate cancellation must not create a second refund;
- an existing refund ID must be retrieved/reconciled rather than recreated;
- `REFUNDED` is used only after Stripe reports successful refund completion.

Include the manually deleted Calendar-event cancellation case in this coverage where practical.

### 11. Rescheduling collision

Add a real-PostgreSQL concurrency test involving **two different confirmed bookings** attempting to reschedule into the same target slot.

Both original bookings must remain confirmed while the target is being contested.

Expected outcome:

```text
source A ──┐
           ├─ same target slot
source B ──┘
```

Only one source may acquire the target hold.

Assert:

- exactly one linked target `HOLD` exists;
- the losing source remains on its original confirmed slot;
- the losing source receives `slot_unavailable` or the equivalent existing collision result;
- neither source's original slot is released merely by attempting the reschedule;
- the winning source retains both original and target ownership until Calendar reconciliation succeeds;
- successful commit moves only the winning source;
- the replacement hold is retired atomically;
- payment identifiers remain attached to the original confirmed booking row;
- no new Checkout Session, charge, or refund is created.

Use real PostgreSQL uniqueness/transactions rather than an in-memory simulation.

---

## Reliability test matrix

PR #19 must leave explicit automated evidence for every requested failure family.

| Failure case                     | Required layer                             | Core proof                                |
| -------------------------------- | ------------------------------------------ | ----------------------------------------- |
| Two customers choose same slot   | PostgreSQL integration                     | One active owner only                     |
| Payment succeeds, Calendar fails | PostgreSQL lifecycle                       | Durable `PAID`, safe retry to `CONFIRMED` |
| Duplicate Stripe webhook         | PostgreSQL lifecycle                       | No duplicate external effects             |
| Customer closes Stripe           | Integration + browser                      | Webhook independent of browser return     |
| Hold expires                     | PostgreSQL + existing browser coverage     | Correct release rules                     |
| Google token expiry/revocation   | Calendar/webhook integration               | Refresh or safe `PAID` recovery           |
| Provider adds Calendar event     | Availability/hold integration + browser UX | Stale slot rejected before HOLD           |
| DST/timezone changes             | Domain/integration                         | Correct London wall-clock/UTC mapping     |
| Calendar event changed/deleted   | Calendar management integration            | Fail safe; no silent drift                |
| Refund/cancellation              | PostgreSQL lifecycle                       | Slot releases before provider recovery    |
| Rescheduling collision           | PostgreSQL concurrency                     | One target owner, originals protected     |

A test may satisfy more than one row when it genuinely crosses those boundaries.

Do not add eleven nearly identical test files.

---

## External-service failure handling

Tests must explicitly distinguish between:

### Definite failure

The external operation is known not to have changed remote state.

Examples:

- authorization rejected before Calendar mutation;
- Calendar event is confirmed absent before a reschedule PATCH;
- stale slot rejected before persistence.

Local temporary reservations may be released when the existing orchestration defines the remote state as definitely unchanged.

### Uncertain failure

The request may have reached the provider.

Examples:

- network failure after a Calendar PATCH is submitted;
- invalid response after a Calendar mutation may have succeeded;
- local persistence fails after provider success.

The system must preserve enough local ownership/state to prevent another customer from taking a potentially moved booking until retry/reconciliation establishes the truth.

Tests must not replace these distinctions with generic `throws` assertions.

---

## UI implementation requirements

This task does not intentionally redesign UI.

Preserve existing booking, success, cancellation, and rescheduling visuals.

Browser reliability tests should focus on functional states such as:

- stale slot becomes unavailable;
- availability refreshes;
- temporary hold expires;
- payment finalisation remains pending;
- confirmed state appears after later persistence;
- reschedule collision keeps original booking protected;
- cancellation remains visibly cancelled while provider follow-up is pending.

Do not add new visual-regression snapshots unless this PR intentionally changes rendered output.

If no rendering changes are required, existing visual baselines must remain unchanged.

---

## Acceptance criteria

### Booking concurrency

- [ ] Two concurrent attempts to claim the exact same slot cannot both create active holds.
- [ ] The concurrency test uses real PostgreSQL.
- [ ] Exactly one active booking row owns the start time.
- [ ] The losing request receives the existing safe unavailable result.

### Payment and webhook reliability

- [ ] Successful payment is persisted before Calendar finalisation.
- [ ] Temporary Calendar failure leaves the booking durably `PAID`.
- [ ] A `PAID` booking remains unavailable to other customers.
- [ ] Replaying the same paid webhook can complete Calendar reconciliation.
- [ ] Duplicate successful webhook delivery does not duplicate Calendar, Meet, email, or booking state.
- [ ] Booking confirmation does not depend on the customer returning from Stripe.

### Hold expiry

- [ ] An ordinary expired hold stops blocking availability.
- [ ] An expired Checkout-backed hold remains blocking until Stripe resolves it.
- [ ] `checkout.session.expired` releases the unresolved Checkout-backed hold.
- [ ] A late paid webhook does not lose a valid payment merely because the local hold timestamp has passed.

### Google reliability

- [ ] Calendar operations use refreshed access tokens.
- [ ] Invalid/revoked Google authorization is normalized safely.
- [ ] Google authorization failure after payment does not lose payment or release the slot.
- [ ] Recovery can continue the same booking after Google access is restored.

### Calendar race and drift

- [ ] A provider event added after availability display but before hold submission makes the stale slot unavailable.
- [ ] No Checkout is initiated for that rejected stale slot.
- [ ] A manually deleted event is handled idempotently during cancellation.
- [ ] A missing or manually changed event cannot cause a reschedule to silently mutate database time.
- [ ] Uncertain Calendar outcomes preserve reservations required for later reconciliation.

### Timezone

- [ ] Spring BST transition is covered.
- [ ] Autumn GMT transition is covered.
- [ ] Provider-local working hours remain correct.
- [ ] UTC offsets change correctly.
- [ ] Session duration remains exactly 55 minutes.
- [ ] Tests do not rely on the CI runner's timezone.

### Cancellation/refund

- [ ] Authoritative cancellation releases the slot before external provider recovery.
- [ ] Calendar or Stripe failure cannot reactivate the booking.
- [ ] Retry reuses the persisted refund decision.
- [ ] Stripe refund idempotency prevents duplicate refunds.
- [ ] Existing refund identifiers are reconciled instead of recreating refunds.
- [ ] `REFUNDED` reflects successful Stripe refund state only.

### Rescheduling collision

- [ ] Two source bookings cannot both reserve the same replacement slot.
- [ ] The loser retains its original confirmed booking.
- [ ] The winner retains its original slot until the target transfer completes.
- [ ] The final transfer is atomic.
- [ ] No payment/refund/Checkout operation occurs during rescheduling.

### Browser behaviour

- [ ] Stale availability produces the existing actionable lost-slot UX.
- [ ] The UI refreshes availability after a slot race.
- [ ] A user who did not return from Stripe can later view authoritative confirmation.
- [ ] A `PAID` booking can remain visibly finalising and transition to confirmed without a full reload.
- [ ] Existing cancellation/reschedule recovery states remain functional.

### Code quality

- [ ] Existing helpers and patterns are reused.
- [ ] Tests are deterministic.
- [ ] Concurrency tests do not depend on timing sleeps.
- [ ] Test cleanup is deterministic.
- [ ] No real Stripe or Google calls occur.
- [ ] No unnecessary dependency is introduced.
- [ ] No unrelated refactor is included.
- [ ] Type checking passes.
- [ ] Unit/integration tests pass.
- [ ] Browser tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### PostgreSQL reliability tests

Prefer a focused new file:

```text
tests/booking-reliability-database.test.mjs
```

Use it for cross-boundary cases such as:

```text
same-slot concurrent hold race
PAID → Calendar failure → webhook replay → CONFIRMED
duplicate completed webhook after CONFIRMED
ordinary vs Checkout-backed hold expiry
cancellation provider failure + availability release + retry
concurrent reschedule target collision
```

Where an existing database test is clearly the better home, extending it is acceptable.

### Existing unit/integration coverage

Extend rather than duplicate:

```text
tests/stripe-webhook.test.mjs
tests/google-calendar-event.test.mjs
tests/unified-availability.test.mjs
tests/booking-hold.test.mjs
tests/booking-cancellation.test.mjs
tests/booking-reschedule.test.mjs
```

Important additional assertions include:

- Google refresh-token failure;
- stale provider Calendar availability;
- manual event drift/deletion;
- both London DST transitions.

### Browser tests

Extend existing suites where appropriate:

```text
tests/browser/migration-smoke.spec.ts
tests/browser/booking-success.spec.ts
tests/browser/booking-management.spec.ts
```

Do not create browser versions of backend-only idempotency tests.

Browser coverage should concentrate on observable recovery behaviour.

### Test doubles

Stripe and Google doubles must support deterministic call counting and controlled failure/recovery.

Prefer explicit gates/promises for concurrency tests rather than arbitrary delays.

Example conceptual pattern:

```text
request A reaches persistence gate
request B reaches persistence gate
release both
assert one winner
assert one collision
```

Do not make race tests depend on machine speed.

### Database isolation

Every PostgreSQL reliability test must:

- use unique deterministic booking IDs or time ranges;
- remove its rows during cleanup;
- avoid leaking linked reschedule rows;
- disconnect its database client;
- remain safe when other tests run before or after it.

---

## Verification commands

Use the repository's existing commands.

```bash
# Install dependencies
npm ci

# Apply migrations to the test database
npm run db:migrate:deploy

# Validate Prisma
npm run db:validate

# Targeted reliability integration tests
node --conditions=react-server --experimental-test-module-mocks --test tests/booking-reliability-database.test.mjs

# Full Node/unit/integration suite
npm test

# Type checking
npm run lint

# Targeted browser reliability coverage
npm run test:browser -- tests/browser/migration-smoke.spec.ts tests/browser/booking-success.spec.ts tests/browser/booking-management.spec.ts

# Full browser suite
npm run test:browser

# Production build
npm run build
```

If `tests/booking-reliability-database.test.mjs` is not created because the coverage is placed into existing database files, replace the targeted command with the actual changed test files.

Do not claim a concurrency or database test passed if the required PostgreSQL environment was skipped.

If a command cannot run, report:

1. the command;
2. why it could not run;
3. which verification was performed instead.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- reliability tests added;
- existing tests extended;
- production defects fixed, if any;
- significant affected modules.

### Reliability coverage

Report each requested scenario and the test that proves it:

```text
same-slot race
Calendar failure after payment
duplicate webhook
closed Stripe browser
hold expiry
Google token expiry
provider Calendar race
DST/timezone
manual Calendar modification/deletion
refund/cancellation
rescheduling collision
```

No requested scenario should be omitted silently.

### Tests

List:

- tests added or updated;
- targeted commands run;
- full commands run;
- pass/fail results;
- any tests skipped and why.

### Production fixes

If reliability testing exposed production defects, document for each:

- failing invariant;
- root cause;
- smallest fix applied;
- regression test proving the fix.

Use `None` if no production behaviour change was necessary.

### External configuration

Expected:

`None`

If anything outside the repository must change, state it explicitly and explain why the original expectation was incorrect.

### Deviations

Describe meaningful deviations from this specification and why they were necessary.

Use `None` when there were no deviations.

### Remaining issues

List any reliability condition that remains operational rather than automatically recoverable.

In particular, do not claim automatic reconciliation exists for manually modified/deleted Google Calendar events unless this PR actually implements it.

Use `None` when all required behaviour is fully covered.
