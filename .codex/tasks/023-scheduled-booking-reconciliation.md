# Scheduled booking reconciliation and lifecycle recovery

## Repository state

**Expected branch:**  
`fix/023-booking-reconciliation-recovery`

**Base branch:**  
`main` containing the booking reliability work through PR #22

**Worktree:**  
Repository root

**Dependencies:**  
Existing Stripe Checkout/webhook lifecycle, Google Calendar/Meet reconciliation,
confirmation email, cancellation/refund, rescheduling, abuse-protection, and
PostgreSQL booking implementations. Production hosting is Railway.

### Read first

- `AGENTS.md`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/calendar/booking-event.mjs`
- `src/lib/booking/booking-confirmation-email.mjs`
- `src/lib/booking/booking-cancellation.mjs`
- `src/lib/booking/booking-reschedule.mjs`
- `src/lib/availability/booking-conflicts.mjs`
- `src/lib/security/abuse-store.mjs`
- `prisma/schema.prisma`
- Existing booking, webhook, cancellation, rescheduling, and reliability tests

### Primary change area

Server-side booking lifecycle recovery and scheduled operational reconciliation.

### Canonical implementation examples

- `processStripeWebhookEvent` and its persistence adapter
- `reconcileBookingCalendarEvent`
- `reconcileCancelledBooking`
- `rescheduleBooking`
- `reconcileBookingConfirmationEmail`
- Existing route-handler authentication and safe error-response patterns

### Relevant symbols

- `processStripeWebhookEvent`
- `createStripeWebhookPersistence`
- `StripeWebhookReconciliationError`
- `reconcileBookingCalendarEvent`
- `googleEventIdForBooking`
- `isUsableGoogleMeetUrl`
- `reconcileCancelledBooking`
- `rescheduleBooking`
- `createBookingReschedulePersistence`
- `reconcileBookingConfirmationEmail`
- `releaseActiveHoldPermit`
- Booking status and payment/refund/calendar/email fields in `prisma/schema.prisma`

### Expected change surface

- Shared lifecycle helpers under `src/lib/booking/` and `src/lib/calendar/`
- A server-only reconciliation runner and protected internal route
- A Railway cron invocation script and deployment documentation
- `.env.example` and `package.json`
- Unit, route, PostgreSQL integration, concurrency, and regression tests

### Excluded areas

- Database schema or migration changes
- New booking statuses
- Queue, worker, or background-platform introduction
- Customer-facing UI changes
- New OAuth scopes or Google authentication architecture
- Real Stripe, Google, or email provider calls in tests
- Changes to the £55 GBP price or 55-minute session duration
- Therapy, medical, diagnostic, or treatment language

### Unknowns Codex must verify

- Existing persistence fields and state-transition semantics
- Existing idempotency and provider-correlation helpers
- Stripe SDK Checkout Session retrieval/status fields
- Resend idempotency-key retention and retry window
- Railway cron service limitations and schedule syntax
- Existing route authentication and error conventions
- Test database and deterministic external-provider test doubles

---

## Objective

Recover incomplete booking lifecycle operations without customer intervention,
using the existing idempotent lifecycle operations as the source of truth.

The system must safely process, in bounded scheduled batches:

1. paid bookings still awaiting Calendar/Meet finalisation;
2. confirmed bookings whose confirmation email was not durably recorded;
3. expired local Checkout holds whose Stripe Session must be authoritative;
4. cancelled/refunded bookings with incomplete Calendar deletion or refund work;
5. linked reschedule holds that remain pending after the initiating request.

The recovery process must preserve webhook authority, availability blocking,
deterministic Calendar/Meet identifiers, refund/email idempotency, and existing
customer-facing behaviour.

---

## Current architecture

Booking mutations are server-side Next.js route handlers backed by PostgreSQL
and Prisma. Stripe Checkout completion is authoritative through the verified
webhook route. A successful payment first persists `PAID`; Calendar/Meet
reconciliation subsequently transitions the booking to `CONFIRMED`.

Google Calendar event and Meet creation use deterministic identifiers and
reconcile an already-existing expected event rather than creating alternatives.
Cancellation persists the inactive booking state before independently
reconciling Calendar deletion and Stripe refund work. Rescheduling uses a
linked target `HOLD` and commits the source/target transition atomically after
Calendar reconciliation.

Availability treats holds and confirmed bookings as conflicts. An availability
response is not a reservation; PostgreSQL remains authoritative for booking
ownership.

The scheduled runner must be server-only and invoked by a separate short-lived
Railway cron service through an authenticated internal POST route.

---

## External integrations affected

### Stripe

- Retrieve expired/complete Checkout Sessions for stale local holds.
- Reuse the existing paid and expired-session lifecycle helpers.
- Never treat a browser redirect as payment authority.
- Preserve Checkout/payment correlation and idempotent replay behaviour.
- Do not create duplicate Checkout Sessions, charges, or refunds.

### Google Calendar and Google Meet

- Reuse deterministic event IDs and existing event reconciliation.
- Create/reconcile Meet only through the existing Calendar flow.
- Do not expose private calendar details.
- Treat uncertain provider outcomes as retryable/deferred; do not release a
  reservation unless the original remote state is positively known.

### Email provider

- Retry a missing confirmation-email persistence record only while the booking
  is within the documented 24-hour Resend idempotency-key retention window.
- Older ambiguous records become `manual_attention`, not an automatic resend.

### Railway

- Run a separate cron service at `*/10 * * * *` UTC.
- The service invokes the application endpoint and exits cleanly.
- Railway configuration is external deployment configuration, not a new queue
  or worker platform in the application.

---

## Configuration and data changes

### Environment variables

Add `BOOKING_RECONCILIATION_SECRET`:

- server-only;
- required by the protected application route;
- at least 32 bytes;
- shared only between the Railway web service and reconciliation cron service.

The cron service also requires the existing application origin as `APP_URL`.

### Database or schema

None. Existing booking fields must be sufficient for candidate selection,
correlation, state validation, retry, and reconciliation.

### Webhooks

No new webhook endpoint or event authority. Existing verified Stripe webhook
processing remains authoritative. Shared lifecycle helpers may be extracted so
the scheduler and webhook perform the same guarded transitions.

### OAuth and permissions

None. Do not add Google OAuth scopes or change token storage.

### Deployment configuration

Create a separate Railway cron service configured with:

- start command: `npm run booking:reconcile:scheduled`;
- schedule: `*/10 * * * *` UTC;
- restart policy: never;
- `APP_URL` and `BOOKING_RECONCILIATION_SECRET` environment variables.

### Migration or backfill

None.

---

## Security and privacy considerations

The route is an internal server-side operational endpoint. Require a bearer
secret and compare credentials safely. Return generic unauthorized and service
unavailable errors; never expose provider payloads, tokens, secrets, customer
notes, card data, or private calendar event details.

Logs may contain only safe aggregate counts, category, outcome, reason, and
internal booking correlation identifiers where needed. Confirmation email and
calendar operations remain server-side. Validate all provider responses and
local/provider identifiers before mutating state.

---

## Required implementation

### Runner and batches

Implement a server-only reconciliation runner with a maximum batch size of 20
per category per invocation. Categories are processed independently so one
failure does not abort the remaining candidates. Return aggregate counts for:

- `scanned`;
- `recovered`;
- `already_reconciled`;
- `deferred`;
- `manual_attention`;
- `failed`.

Include per-category counts. Do not return customer or provider payloads.

Candidate queries must be bounded and ordered deterministically. A candidate
must be re-read and revalidated immediately before its lifecycle operation.

### Outcome classification

- `recovered`: the intended durable operation completed.
- `already_reconciled`: another attempt completed it or the state is already
  safely terminal.
- `deferred`: a temporary provider, authorization, timeout, or persistence
  condition can be retried without changing ownership.
- `manual_attention`: state is contradictory, too old/ambiguous, unsafe to
  infer, or requires an operator decision.
- `failed`: unexpected isolated processing failure; continue the batch.

### Paid bookings

For future `PAID` bookings with valid Stripe identifiers, invoke the shared
paid finalisation operation. Reconcile deterministic Calendar/Meet data,
conditionally transition to `CONFIRMED`, then deliver and persist the
confirmation email idempotently.

If the booking start time has passed while still `PAID`, do not create a
historical event automatically; classify it as `manual_attention`.

Calendar/provider failure leaves the booking `PAID` and retryable. A successful
payment must never disappear because downstream Google work failed.

### Confirmation emails

Select `CONFIRMED` bookings with no persisted email acceptance. Validate the
expected deterministic Calendar ID, usable Google Meet URL, payment
correlation, and booking state. Retry only when `createdAt` is within the
24-hour provider idempotency retention window. Older or ambiguous records are
`manual_attention`.

### Checkout holds

Select expired local non-reschedule `HOLD` bookings with a Checkout Session.
Retrieve the Session from Stripe and validate object identity, booking
correlation, mode, amount, and currency.

- `open`/unpaid: retain the hold and classify `deferred`.
- `complete`/paid: invoke the shared paid lifecycle and release the active hold
  permit only after local payment validation.
- `expired`/unpaid: invoke the shared expired-session cancellation and release
  the permit after safe persistence.
- missing, contradictory, or invalid data: do not guess; classify safely as
  `manual_attention` or `deferred`.

Unknown Stripe availability must not release a slot.

### Cancellation and refund recovery

Reuse existing cancellation reconciliation for Calendar deletion and refunds.
Calendar deletion and refund work remain independently retryable. A terminal
refund status without a refund identifier must not trigger a second refund.
Uncertain provider outcomes retain the persisted inactive state and classify
for retry or manual attention rather than reactivating the booking.

### Linked reschedule recovery

Find expired/pending linked target holds and their source booking. If the
source is cancelled/refunded, release the target safely. If the source is
confirmed, reconcile the deterministic Calendar event and atomically commit
the target transfer.

If the source start time has passed, do not PATCH the event to a historical
target. Release the target only after positively observing that the original
event remains unchanged, and classify the source as `manual_attention`.

Calendar mismatch, authorization failure, and uncertain remote state must
retain the target hold and classify `manual_attention` or `deferred` according
to the existing lifecycle semantics.

### Internal route and cron invocation

Add a dynamic, uncached `POST /api/internal/bookings/reconcile` route protected
by `BOOKING_RECONCILIATION_SECRET`. It must invoke one runner execution and
return sanitized aggregate results. Configuration or unexpected top-level
runner failures return a stable non-sensitive 503 response.

Add an invocation script that:

- builds the endpoint from `APP_URL`;
- sends the bearer secret;
- uses a bounded timeout;
- exits non-zero for non-2xx responses or transport failures;
- never prints the secret.

---

## External-service failure handling

The implementation must explicitly handle:

1. availability becoming stale before reconciliation;
2. duplicate scheduler or webhook submissions;
3. Stripe object creation/retrieval succeeding while the client times out;
4. payment succeeding while the customer never returns;
5. duplicate and out-of-order webhook delivery;
6. payment succeeding while Calendar creation fails;
7. Calendar creation succeeding before local event-ID persistence;
8. Meet creation being delayed or failing;
9. expired/revoked Google authentication;
10. confirmation-page refreshes and revisits;
11. partial cancellation/refund completion.

Use deterministic IDs, conditional persistence, existing provider lookup and
reconciliation operations, safe retry classification, and aggregate logging.
Never fabricate a payment, Calendar event, Meet URL, refund, or email success.

---

## UI implementation requirements

None. This is a backend and deployment-operation change. Existing booking UI,
availability display, payment handoff, and confirmation behaviour must remain
unchanged.

---

## Acceptance criteria

### Behaviour

- [ ] Each recovery category is selected in a bounded batch of at most 20.
- [ ] One candidate failure does not abort other candidates or categories.
- [ ] All outcomes are classified as recovered, already reconciled, deferred,
      manual attention, or failed.
- [ ] Paid bookings reconcile through the existing Calendar/Meet lifecycle.
- [ ] Historical paid bookings are not automatically given new events.
- [ ] Missing confirmation emails retry only within the 24-hour safe window.
- [ ] Open or unknown Checkout Sessions retain slot ownership.
- [ ] Expired unpaid Checkout Sessions release their holds safely.
- [ ] Cancellation/refund reconciliation never creates duplicate refunds.
- [ ] Pending reschedules preserve uncertain target holds.
- [ ] Existing booking and availability behaviour remains unchanged.

### External integrations

- [ ] Stripe remains payment authority and all existing webhook signature
      verification remains intact.
- [ ] Calendar and Meet identifiers remain deterministic.
- [ ] Provider conflicts reconcile existing remote objects instead of creating
      duplicates.
- [ ] Provider failures leave durable retryable or manual-attention states.
- [ ] No secrets, tokens, private calendar data, or unnecessary personal data
      are returned or logged.
- [ ] Required Railway and environment configuration is documented.

### Code quality

- [ ] No schema, status, queue, OAuth scope, or UI changes are introduced.
- [ ] No unnecessary dependencies are added.
- [ ] Type checking, formatting, tests, and production build pass.

---

## Tests to add or update

### Unit tests

Add reconciliation tests covering:

- candidate selection and batch size;
- all outcome classifications;
- future versus past paid bookings;
- Calendar/Meet retry and already-reconciled states;
- confirmation-email 24-hour boundary;
- open, complete, expired, invalid, and unavailable Checkout Sessions;
- terminal refund safeguards;
- cancelled-source and past-source reschedule handling;
- failure isolation and aggregate counts.

### Integration tests

Add route tests for missing, invalid, and valid bearer authentication,
sanitized responses, configuration failures, and runner failures.

Add PostgreSQL tests for:

- deterministic Calendar event reuse;
- webhook and scheduler concurrency converging on one booking;
- Checkout hold state and slot-blocking preservation;
- cancellation/refund persistence;
- linked-reschedule commit, release, and uncertainty retention.

External providers must use deterministic test doubles; tests must not call
real Stripe, Google, Resend, or Railway services.

### Browser tests

N/A. No rendered UI or customer-facing interaction changes.

---

## Verification commands

```bash
npm ci
npm run format
npm run format:check
npm run db:validate
npm test
npm run lint
npm run build
git diff --check
```

Run PostgreSQL integration tests with an isolated `DATABASE_SCHEMA_TEST_URL`
and the existing migration/deployment command. Do not use a developer's real
provider accounts.

---

## Completion report

### Changed

Implement the scheduled reconciliation runner, shared lifecycle extraction,
protected route, cron invocation, deployment documentation, and tests
described above.

### Tests

Record the exact targeted and repository-wide commands and results.

### External configuration

Record `BOOKING_RECONCILIATION_SECRET`, `APP_URL`, and Railway cron service
creation/configuration.

### Deviations

Record any deviation from this specification, especially provider or Railway
configuration that cannot be applied from the repository.

### Remaining issues

Record unresolved reconciliation states, deployment follow-up, or test
environment limitations. Use `None` when complete.
