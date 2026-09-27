# PR #37 — Fix Stripe Webhook Retries After Booking Cancellation or Refund

## Repository state

**Expected branch:**  
`fix/37-stripe-webhook-terminal-replay`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  
Existing Stripe webhook, booking cancellation, refund, and reconciliation implementations.

No new dependencies, services, or database migrations are required.

### Read first

Before making changes, inspect:

- `AGENTS.md`
- `.codex/tasks/TEMPLATE.md`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/booking/stripe-webhook-handler.ts`
- `src/lib/booking/booking-cancellation.mjs`
- `src/lib/booking/booking-reconciliation.mjs`
- `tests/stripe-webhook.test.mjs`
- `prisma/schema.prisma`

Read any applicable scoped `AGENTS.md` files.

### Primary change area

Stripe webhook processing and booking lifecycle idempotency.

### Canonical implementation examples

- `src/lib/booking/stripe-webhook.mjs` — existing payment reconciliation and webhook event processing.
- `src/lib/booking/booking-cancellation.mjs` — authoritative cancellation and refund state transitions.
- `src/lib/booking/booking-reconciliation.mjs` — recovery of incomplete booking operations.
- `tests/stripe-webhook.test.mjs` — existing webhook validation, failure handling, and duplicate-delivery tests.

### Relevant symbols

- `processStripeWebhookEvent`
- `reconcileCompletedCheckoutSession`
- `reconcilePaidBooking`
- `createStripeWebhookPersistence`
- `checkoutSessionBookingId`
- `StripeWebhookReconciliationError`
- `createStripeWebhookHandler`
- `reconcileCancelledBooking`

### Expected change surface

Primary:

```text
src/lib/booking/stripe-webhook.mjs
tests/stripe-webhook.test.mjs
```

Only modify additional files if required to satisfy the acceptance criteria.

### Excluded areas

- Booking UI and confirmation pages.
- Google Calendar event creation and cancellation logic.
- Google Meet integration.
- Stripe Checkout creation.
- Stripe refund creation and refund-policy calculations.
- Booking cancellation and rescheduling behaviour.
- Database schema and migrations.
- Reconciliation cron configuration.
- Deployment infrastructure.
- Unrelated refactoring or dependency upgrades.

### Unknowns Codex must verify

Before editing, confirm:

1. The current booking status model still includes `HOLD`, `PAID`, `CONFIRMED`, `CANCELLED`, and `REFUNDED`.
2. A successfully paid and subsequently cancelled booking retains its original Stripe Checkout Session ID and PaymentIntent ID.
3. An unpaid, expired Checkout Session can also produce a `CANCELLED` booking.
4. The webhook handler returns HTTP 200 when event processing resolves successfully.
5. The existing cancellation reconciliation process handles outstanding Calendar cleanup and refund work independently of the original payment webhook.

Do not assume every `CANCELLED` booking represents a successfully processed payment.

---

## Objective

Fix repeated Stripe webhook failures caused by delivery or redelivery of `checkout.session.completed` after the associated booking has already been cancelled or refunded.

The webhook must recognise a previously paid booking in a valid terminal state and acknowledge the original payment event without reversing or repeating completed business operations.

Specifically:

- A valid replay for a previously paid `CANCELLED` booking succeeds.
- A valid replay for a previously paid `REFUNDED` booking succeeds.
- The booking remains cancelled or refunded.
- No new Calendar event is created.
- No confirmation email is sent.
- No additional refund is initiated.
- Invalid or inconsistent payment correlations continue to fail.
- Existing `HOLD`, `PAID`, and `CONFIRMED` processing remains unchanged.

Completion means the original payment webhook can be safely delivered repeatedly, including after cancellation or refund, without generating unnecessary HTTP 500 responses.

---

## Current architecture

### Booking lifecycle

The relevant booking lifecycle is:

```text
HOLD
  |
  | Successful payment
  v
PAID
  |
  | Calendar finalization
  v
CONFIRMED
  |
  | Customer cancellation
  v
CANCELLED
  |
  | Successful eligible refund
  v
REFUNDED
```

Cancellation does not necessarily require a refund. A booking can legitimately remain `CANCELLED`.

An unpaid Checkout Session can also result in a `CANCELLED` booking.

Therefore, terminal status alone is insufficient to establish that a completed payment was previously processed.

### Stripe webhook processing

The production endpoint is:

```text
POST /api/stripe/webhook
```

The route delegates event processing to `processStripeWebhook`.

For `checkout.session.completed`, the implementation:

1. Validates Checkout Session structure and payment details.
2. Resolves the booking identifier.
3. Attempts to transition a matching `HOLD` booking to `PAID`.
4. Retrieves the persisted booking.
5. Reconciles Calendar finalization and confirmation email delivery.

Existing retries for `PAID` and `CONFIRMED` bookings are already supported.

### Identified defect

In `reconcilePaidBooking`, the current validation only accepts:

```javascript
["PAID", "CONFIRMED"].includes(booking.status);
```

Consequently, a booking that was previously confirmed and subsequently cancelled or refunded fails this validation.

The function throws:

```text
StripeWebhookReconciliationError
```

with:

```text
reconciliationCode: reconciliation_pending
```

The webhook handler converts the error into HTTP 500.

Stripe interprets this as unsuccessful delivery and can retry the same event.

### Observed production incident

The reported incident involves:

- Repeated delivery failures for the same Stripe event.
- HTTP 500 responses.
- `StripeWebhookReconciliationError`.
- `reconciliation_pending`.
- An associated booking that the operator reports was subsequently cancelled and refunded.

This is consistent with the identified code path.

The implementation must nevertheless confirm the persisted payment identifiers before acknowledging a terminal booking.

---

## External integrations affected

### Stripe

The existing `checkout.session.completed` processing behaviour changes.

The implementation must continue to:

- Verify Stripe webhook signatures.
- Validate Checkout Session structure.
- Validate payment status, amount, currency, and mode.
- Correlate the event with the persisted booking.
- Return HTTP 500 for unresolved processing failures.

For an authenticated, correctly correlated event referencing a previously paid terminal booking, processing must instead complete successfully.

This results in the existing HTTP 200 response.

No additional Stripe API requests should be necessary.

No Stripe webhook destination, subscription, secret, or API version changes are required.

### Google Calendar and Google Meet

No integration changes.

Terminal-state webhook replays must not invoke Calendar finalization or generate a new meeting.

### Email provider

No integration changes.

Terminal-state webhook replays must not send or retry booking confirmation emails.

---

## Configuration and data changes

### Environment variables

None.

Existing server-only Stripe configuration remains unchanged.

### Database or schema

None.

Use the existing booking fields:

```text
status
stripeCheckoutSessionId
stripePaymentIntentId
```

No additional persistence fields are necessary for this fix.

### Webhooks

The existing endpoint remains:

```text
POST /api/stripe/webhook
```

The existing webhook event types remain unchanged.

Signature verification must remain mandatory.

The only intended change is the idempotent handling of valid payment-completion replays for terminal bookings.

### OAuth and permissions

None.

### Deployment configuration

None.

Deploy through the existing production deployment process.

### Migration or backfill

None.

Existing terminal bookings should benefit from the fix without database modification.

---

## Security and privacy considerations

A `CANCELLED` or `REFUNDED` status must not automatically authorize successful acknowledgement of an arbitrary payment event.

The implementation must verify the original payment correlation.

A terminal booking is eligible for the new idempotent acknowledgement only when:

- The persisted booking exists.
- The incoming Checkout Session passes the existing validation.
- The Checkout Session references the expected booking ID.
- The persisted Checkout Session ID matches the incoming session.
- The persisted PaymentIntent ID is non-null and matches the incoming PaymentIntent.

A missing or different PaymentIntent must not be treated as a previously processed payment.

Preserve existing webhook signature verification.

Do not log customer names, email addresses, payment payloads, credentials, or additional personal information.

No new customer data is collected or stored.

---

## Required implementation

### 1. Recognise previously paid terminal bookings

Update `reconcilePaidBooking` to distinguish three categories of booking state.

| Booking state               | Required behaviour                                                  |
| --------------------------- | ------------------------------------------------------------------- |
| `HOLD`                      | Preserve existing payment-processing behaviour.                     |
| `PAID`                      | Continue Calendar and confirmation reconciliation.                  |
| `CONFIRMED`                 | Preserve existing validation and confirmation-email reconciliation. |
| `CANCELLED`                 | Acknowledge only if the original payment identifiers match.         |
| `REFUNDED`                  | Acknowledge only if the original payment identifiers match.         |
| Missing or unexpected state | Preserve reconciliation failure.                                    |

The terminal-state handling must be explicit rather than broadening the list of states that are eligible for Calendar finalization.

### 2. Preserve payment correlation

Before accepting either terminal state, verify:

```text
booking.stripeCheckoutSessionId === sessionId
booking.stripePaymentIntentId === paymentIntentId
```

Both identifiers must be valid persisted identifiers.

A missing PaymentIntent must fail validation.

The existing upstream Checkout Session validation must also remain in effect.

Do not accept terminal bookings solely because their status is `CANCELLED` or `REFUNDED`.

### 3. Return successfully without additional processing

Once a valid previously paid terminal booking has been identified, reconciliation should complete without further work.

It must not:

- Update the booking to `PAID`.
- Update the booking to `CONFIRMED`.
- Invoke Calendar finalization.
- Recreate a deleted Calendar event.
- Generate another Google Meet meeting.
- Send a confirmation email.
- Invoke refund creation.
- Change the cancellation or refund status.
- Reopen the booking's time slot as an active reservation.

An idempotent acknowledgement must not depend on the presence of the original Calendar event or meeting URL.

These may legitimately be absent following cancellation or cleanup.

The new terminal-state path should not invoke additional callbacks or external operations.

### 4. Preserve existing payment reconciliation

Do not weaken the existing processing of active bookings.

Specifically:

- `HOLD` still transitions to `PAID` after valid payment confirmation.
- `PAID` still attempts Calendar finalization.
- A Calendar failure still leaves the payment recoverable.
- `CONFIRMED` still validates the expected Calendar event and meeting URL.
- Pending confirmation emails remain retryable.
- Duplicate deliveries must not create duplicate Calendar events or emails.

The new behaviour must be isolated to already-cancelled or refunded bookings with matching payment identifiers.

### 5. Preserve invalid-event failures

The implementation must continue rejecting:

- Missing bookings.
- Incorrect Checkout Session IDs.
- Incorrect PaymentIntent IDs.
- Missing persisted PaymentIntent IDs.
- Incorrect booking metadata.
- Incorrect `client_reference_id`.
- Unpaid Checkout Sessions presented as completed payments.
- Incorrect payment amounts.
- Incorrect currencies.
- Unsupported payment modes.
- Invalid Checkout Session structures.

An expired unpaid Checkout Session may leave a booking in `CANCELLED` with no persisted PaymentIntent.

If a contradictory completed-payment event later arrives for that booking, it must not be silently acknowledged by the new terminal-state handling.

Preserve the existing reconciliation error behaviour for that scenario.

### 6. Preserve cancellation and refund recovery

A previously paid `CANCELLED` booking may still have outstanding Calendar cleanup or refund processing.

Acknowledging the original payment webhook must not:

- Mark those operations complete.
- Remove outstanding recovery work.
- Change refund eligibility.
- Change the recorded refund status.
- Start another refund.

The existing cancellation reconciliation subsystem remains responsible for completing outstanding cancellation and refund work.

A successful acknowledgement of the original payment event does not establish that all cancellation or refund operations have completed.

### 7. Preserve the webhook HTTP contract

Do not introduce a new response shape.

The existing handler already returns:

```json
{
  "received": true
}
```

with HTTP 200 when event processing completes successfully.

The implementation should use that existing success path.

Invalid or unresolved events must continue to use the existing failure path.

Do not catch every reconciliation error and return HTTP 200.

### External-service failure handling

For the new terminal-state replay path, no Google Calendar, Google Meet, email, or refund operation should occur.

Therefore, temporary failures in those integrations must not prevent acknowledgement of a valid, previously paid terminal booking.

For active bookings, preserve the existing error and retry behaviour.

---

## UI implementation requirements

No UI changes.

Do not modify:

- Booking forms.
- Booking confirmation pages.
- Booking-management pages.
- Cancellation or refund messaging.
- Visual styling.
- Accessibility behaviour.

No new browser visual-regression snapshots are required.

---

## Acceptance criteria

### Behaviour

- [ ] A valid replay for a previously paid `CANCELLED` booking succeeds.
- [ ] A valid replay for a previously paid `REFUNDED` booking succeeds.
- [ ] Repeated delivery of either event remains successful.
- [ ] The terminal booking's status remains unchanged.
- [ ] Stored payment identifiers remain unchanged.
- [ ] No new Calendar event is created.
- [ ] No new Google Meet meeting is created.
- [ ] No confirmation email is sent.
- [ ] No additional refund is initiated.
- [ ] Outstanding cancellation or refund reconciliation remains independently recoverable.

### Payment validation

- [ ] The incoming Checkout Session ID must match the persisted identifier.
- [ ] The incoming PaymentIntent ID must match the persisted identifier.
- [ ] A missing persisted PaymentIntent is not accepted as proof of an earlier payment.
- [ ] Invalid booking metadata is rejected.
- [ ] Invalid payment details are rejected.
- [ ] A previously unpaid, expired booking is not incorrectly acknowledged as paid.
- [ ] Unknown booking states remain unsupported.

### Existing reconciliation

- [ ] Valid `HOLD` payment processing remains unchanged.
- [ ] `PAID` Calendar recovery remains functional.
- [ ] `CONFIRMED` duplicate delivery remains idempotent.
- [ ] Existing confirmation-email retries remain functional.
- [ ] Invalid Calendar data for an active `CONFIRMED` booking is still rejected.
- [ ] Existing checkout-expiry handling remains unchanged.

### Webhook responses

- [ ] Valid terminal-state replays produce HTTP 200.
- [ ] Invalid payment correlations continue to produce HTTP 500.
- [ ] Missing or invalid Stripe signatures continue to produce HTTP 400.
- [ ] The existing successful response body remains unchanged.

### Code quality

- [ ] The implementation follows existing repository conventions.
- [ ] No new dependencies are introduced.
- [ ] No database migration is required.
- [ ] No unrelated refactoring is included.
- [ ] Type checking passes.
- [ ] Formatting checks pass.
- [ ] Tests pass.
- [ ] Production build passes.

---

## Tests to add or update

Primary test file:

```text
tests/stripe-webhook.test.mjs
```

Use the existing test fixtures and Node test infrastructure.

### Unit tests

#### Test 1 — Cancelled booking accepts the original payment replay

Given a booking with:

```text
status = CANCELLED
stripeCheckoutSessionId = cs_test_one
stripePaymentIntentId = pi_test_one
```

When the corresponding `checkout.session.completed` event arrives:

- Processing succeeds.
- The booking remains `CANCELLED`.
- Calendar finalization is not called.
- Confirmation email delivery is not called.
- No persisted booking values change.

Deliver the event a second time and verify the same outcome.

#### Test 2 — Refunded booking accepts the original payment replay

Repeat the previous test using:

```text
status = REFUNDED
```

Verify that neither delivery causes additional processing or changes the refunded status.

#### Test 3 — Cancelled booking rejects an incorrect Checkout Session

Given a previously paid `CANCELLED` booking, deliver an otherwise valid completed-payment event containing a different Checkout Session ID.

Expect `StripeWebhookReconciliationError`.

Verify that no downstream operations execute.

Repeat for `REFUNDED`.

#### Test 4 — Terminal booking rejects an incorrect PaymentIntent

Given a previously paid terminal booking, deliver an event referencing a different PaymentIntent.

Expect reconciliation failure.

Repeat for both terminal states.

#### Test 5 — Unpaid cancelled booking is not accepted as paid

Given:

```text
status = CANCELLED
stripeCheckoutSessionId = cs_test_one
stripePaymentIntentId = null
```

Deliver a completed-payment event containing:

```text
payment_intent = pi_test_one
```

Expect reconciliation failure.

This test protects against incorrectly acknowledging a payment that was never durably recorded.

#### Test 6 — Terminal booking rejects invalid payment details

For each terminal state, verify rejection of:

- Incorrect amount.
- Incorrect currency.
- Unpaid session.
- Incorrect payment mode.
- Incorrect booking metadata.
- Incorrect client reference.
- Missing incoming PaymentIntent.

Reuse the existing payment-validation test patterns.

#### Test 7 — Terminal replay does not depend on Calendar data

Given a valid previously paid terminal booking with missing Calendar information:

```text
calendarEventId = null
meetingUrl = null
```

Verify that the matching payment replay succeeds.

No Calendar operation should execute.

This must not weaken the existing Calendar validation for `CONFIRMED` bookings.

### Integration tests

#### Test 8 — Webhook returns HTTP 200 for terminal replays

Use `createStripeWebhookHandler` with a deterministic, successfully verified test event and the existing webhook-processing implementation.

Test both `CANCELLED` and `REFUNDED`.

Assert:

```text
HTTP 200
```

and the existing success body.

Repeat the same event to verify duplicate-delivery behaviour.

Do not bypass the handler's signature-validation boundary when testing the HTTP contract.

#### Test 9 — Invalid terminal correlation still returns HTTP 500

Use a correctly signed test event whose payment identifiers do not match the persisted booking.

Assert:

```text
HTTP 500
```

and the existing error response.

The test must demonstrate that the fix does not acknowledge arbitrary completed-payment events.

#### Test 10 — Signature verification is unchanged

Preserve existing coverage demonstrating:

```text
Missing signature -> HTTP 400
Invalid signature -> HTTP 400
Valid signature -> Processing proceeds
```

### Existing regression tests

The existing tests for these behaviours must continue passing:

- Duplicate completed webhooks.
- Payment completion after local hold expiry.
- Google Calendar failure and retry.
- Calendar persistence failure and retry.
- Confirmation-email failure and retry.
- Duplicate confirmation-email prevention.
- Expired Checkout Sessions.
- Invalid payment details.

Do not weaken existing assertions to accommodate the new behaviour.

### Browser tests

N/A.

This is a backend-only change.

### Visual regression tests

N/A.

No rendered output changes.

---

## Verification commands

Use the existing repository commands.

Install dependencies when necessary:

```bash
npm ci
```

Run formatting:

```bash
npm run format
```

Run targeted webhook tests:

```bash
node --conditions=react-server --experimental-test-module-mocks --test tests/stripe-webhook.test.mjs
```

Run the complete Node test suite:

```bash
npm test
```

Run type checking:

```bash
npm run lint
```

Run the production build:

```bash
npm run build
```

Verify formatting:

```bash
npm run format:check
```

The complete GitHub Actions CI pipeline must also pass.

If any verification command cannot run, report the command, the reason, and the alternative verification performed.

---

## Production verification

After merging and deploying PR #37:

1. Locate the original failed `checkout.session.completed` event in Stripe.
2. Confirm that its booking is in `CANCELLED` or `REFUNDED`.
3. Confirm that the stored Checkout Session ID and PaymentIntent ID match the original Stripe event.
4. Confirm the existing Calendar cancellation and refund state.
5. Redeliver the original event through Stripe if it is eligible for manual redelivery.
6. Confirm that the production endpoint returns HTTP 200.
7. Confirm that the booking remains cancelled or refunded.
8. Confirm that no new Calendar event, confirmation email, or refund was created.

If Stripe's automatic retry window has already expired, successful deployment alone will not necessarily produce another delivery. Use Stripe's supported manual redelivery mechanism when available.

Do not initiate another customer payment to verify this fix.

Do not manually alter booking status or payment identifiers.

### Expected production result

```text
Stripe
  |
  | checkout.session.completed
  v
Webhook signature verification
  |
  v
Payment validation
  |
  v
Booking correlation
  |
  v
Previously paid CANCELLED / REFUNDED
  |
  v
No further booking processing
  |
  v
HTTP 200
```

The existing Stripe event should no longer fail solely because its associated booking was subsequently cancelled or refunded.

---

## Completion report

When implementation is complete, provide a concise report.

### Changed

Describe:

- The updated webhook reconciliation behaviour.
- The terminal states handled.
- The payment correlation safeguards.
- The files changed.

### Tests

List:

- New regression tests.
- Existing tests executed.
- Formatting results.
- Type-checking results.
- Production-build result.
- CI result.

### External configuration

None expected.

Confirm whether any production configuration changes were necessary.

### Deviations

Describe any meaningful deviation from this specification and its justification.

Use `None` if there were no deviations.

### Remaining issues

Identify any unresolved booking reconciliation or payment-processing concerns discovered during implementation.

Do not expand PR #37 to address unrelated issues.

Use `None` if the task is fully complete.
