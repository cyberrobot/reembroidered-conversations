# PR #16 — Booking confirmation email

## Repository state

**Expected branch:**  
`feat/016-booking-confirmation-email`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**

- PR #13 — Create Google Calendar event + Google Meet
- PR #14 — PostgreSQL-backed complete booking lifecycle test
- PR #15 — Booking confirmation flow
- Existing PostgreSQL booking persistence
- Existing verified Stripe webhook
- Existing Google Calendar event + Google Meet finalisation
- Existing `SESSION_PRODUCT`
- Existing booking lifecycle:

```text
HOLD
  ↓
Stripe payment confirmed
  ↓
PAID
  ↓
Google Calendar event + Google Meet
  ↓
CONFIRMED
```

The confirmation email must only be sent for a genuinely `CONFIRMED` booking.

It must not be sent merely because Stripe redirected the customer back to the site or because a `checkout.session.completed` event was received before Calendar/Meet finalisation succeeds.

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/013-google-calendar-event-google-meet.md`
- `.codex/tasks/014-postgresql-booking-lifecycle-happy-path.md`
- `.codex/tasks/015-booking-confirmation-flow.md`
- `package.json`
- `prisma/schema.prisma`
- `src/lib/booking/session-product.mjs`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/booking/booking-success.mjs`
- `src/lib/calendar/booking-event.mjs`
- `src/lib/google-calendar/google-api.mjs`
- `src/app/api/stripe/webhook/**`
- `src/app/booking/success/page.tsx`
- `src/components/BookingConfirmationPage.tsx`
- existing webhook, lifecycle and booking tests
- `.github/workflows/ci.yml`

### Primary change area

Transactional booking communication after successful booking finalisation.

The required flow is:

```text
Stripe payment succeeds
        ↓
booking becomes PAID
        ↓
Google Calendar event created
        ↓
Google Meet URL obtained
        ↓
booking becomes CONFIRMED
        ↓
send branded confirmation email
        ↓
customer receives booking details
```

Email delivery is a consequence of confirmed booking finalisation.

It must not become the authority for booking state.

### Canonical implementation examples

#### Booking lifecycle

Treat:

```text
src/lib/booking/stripe-webhook.mjs
```

as the authority for payment and booking lifecycle transitions.

The confirmation email must not introduce an alternative path to:

```text
HOLD → PAID → CONFIRMED
```

#### Session product

Use:

```text
SESSION_PRODUCT
```

from:

```text
src/lib/booking/session-product.mjs
```

for the canonical:

- duration: 55 minutes;
- price: £55;
- currency: GBP.

Do not independently hard-code product values when the shared definition can be used.

#### Booking date/time

Use the persisted:

```text
Booking.startAt
Booking.endAt
Booking.timezone
```

Do not derive the booking time from Stripe metadata, query parameters, Calendar response text, or browser state.

#### Google Meet

Use the persisted:

```text
Booking.meetingUrl
```

The email must only include a Meet URL that has passed the existing Google Meet URL validation used by the booking lifecycle.

#### Customer identity

Send the email to the persisted:

```text
Booking.email
```

and personalise it with:

```text
Booking.name
```

Do not trust customer identity supplied by a webhook payload when persisted booking data is available.

### Relevant symbols

Inspect before editing:

```text
SESSION_PRODUCT

processStripeWebhook
processStripeWebhookEvent
createStripeWebhookPersistence

reconcileBookingCalendarEvent
isUsableGoogleMeetUrl

Booking.id
Booking.name
Booking.email
Booking.startAt
Booking.endAt
Booking.timezone
Booking.status
Booking.stripeCheckoutSessionId
Booking.stripePaymentIntentId
Booking.calendarEventId
Booking.meetingUrl
```

### Expected change surface

Expected areas include:

```text
.codex/tasks/016-booking-confirmation-email.md

src/lib/email/**
src/lib/booking/booking-confirmation-email.*
src/lib/booking/stripe-webhook.mjs

tests/booking-confirmation-email.test.mjs
tests/stripe-webhook.test.mjs
tests/booking-lifecycle-database.test.mjs

package.json                         # only if a provider SDK is genuinely required
.env.example                         # if present
README/docs                          # only where environment configuration is documented
```

No customer-facing booking-page redesign is expected.

A small provider-independent email boundary is preferred so the booking lifecycle does not depend directly on provider-specific payload structures.

### Excluded areas

Do not implement as part of PR #16:

- booking cancellation itself;
- booking rescheduling itself;
- refund handling;
- automatic refunds;
- Calendar event cancellation;
- Calendar event rescheduling;
- reminder emails;
- 24-hour reminder automation;
- marketing emails;
- mailing-list subscriptions;
- newsletters;
- email tracking pixels;
- customer profiling;
- a full notification framework;
- admin email management;
- a general-purpose email-template CMS;
- receipt generation;
- replacing Google's Calendar invitation;
- changing Google OAuth scopes;
- changing Stripe payment behaviour;
- changing the booking price or duration;
- changing the booking lifecycle states;
- unrelated UI redesign.

The confirmation email is separate from the Google Calendar attendee invitation.

Both may reach the customer, but they serve different purposes:

```text
Google Calendar invitation
→ calendar attendance/invitation

Re-Embroidered confirmation email
→ branded booking confirmation and instructions
```

### Unknowns Codex must verify

Before editing, verify:

- PR #13 behaviour is present on the implementation base.
- PR #14 lifecycle test is present.
- PR #15 is present.
- `CONFIRMED` still means payment has succeeded and Calendar/Meet finalisation has completed.
- `Booking.meetingUrl` is only persisted after successful validation.
- no transactional email provider has already been introduced.
- no existing cancellation/rescheduling endpoint has been added since this task was written.
- existing server configuration conventions.
- existing logging conventions.
- existing environment-variable documentation location.
- whether an existing HTML/text rendering utility can be reused.
- whether the repository has an existing retry/idempotency mechanism suitable for external side effects.

Do not guess when these can be established from the codebase.

---

## Objective

Send a branded transactional booking confirmation email after a booking becomes:

```text
CONFIRMED
```

The email must be sent to the customer's persisted booking email address and contain the information needed to attend or request a change to the session.

The email must include:

- Re-Embroidered Conversations branding;
- customer's first/name greeting where practical;
- confirmation that the session is booked;
- session date;
- session start time;
- session end time;
- booking timezone;
- `55-minute session`;
- Google Meet link;
- cancellation/rescheduling request link;
- short preparation instructions.

The email must not be treated as successfully sent until the configured email provider accepts the message.

Email-delivery problems must not reverse a successfully confirmed and paid booking.

The system must avoid sending duplicate confirmation emails when Stripe retries the same webhook or when booking finalisation is retried.

---

## Current architecture

### Booking persistence

The `Booking` row already contains:

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

These fields already provide the data required to render the booking details in the confirmation email.

### Booking finalisation

Successful payment processing currently:

1. validates the Stripe event;
2. correlates the Checkout Session to the booking;
3. persists payment state;
4. moves the booking to `PAID`;
5. creates/reconciles the Google Calendar event;
6. obtains the Google Meet URL;
7. persists `calendarEventId`;
8. persists `meetingUrl`;
9. moves the booking to `CONFIRMED`.

PR #16 adds email delivery after that successful finalisation.

### Existing Google invitation

The Calendar event already includes:

```text
Booking.email
```

as an attendee.

Google Calendar therefore sends its normal invitation separately.

PR #16 must preserve this behaviour.

### Existing customer confirmation page

`/booking/success` already presents the confirmed booking using persisted data.

Where practical, the email and success page should use shared formatting helpers for:

- dates;
- start/end times;
- timezone presentation;
- session duration;
- product wording.

Do not create subtly conflicting representations of the same booking.

---

## External integrations affected

### Email provider

Introduce one server-side transactional email integration.

Keep provider-specific API details behind a narrow application boundary such as:

```text
sendBookingConfirmationEmail(...)
```

or:

```text
EmailClient.send(...)
```

The booking/webhook code must not construct arbitrary provider API requests directly.

The email provider operation must:

```text
send one transactional booking confirmation
```

to:

```text
Booking.email
```

#### Authentication

Provider credentials must remain server-only.

No provider API keys may be exposed through:

```text
NEXT_PUBLIC_*
```

or browser JavaScript.

#### Provider selection

There is currently no email provider in the repository.

Prefer the smallest transactional-email integration consistent with the deployment environment.

If no project-level provider decision already exists, use **Resend** for this PR.

Prefer a small direct integration over introducing a large notification framework.

If using Resend, either:

- use its supported server SDK; or
- use its HTTPS API directly if that results in a smaller and clearer implementation.

Do not add an SDK purely for trivial functionality if the repository's existing conventions favour native `fetch`.

### Google Calendar

No Google Calendar behaviour should change.

The email consumes the persisted Meet URL after Calendar finalisation.

### Stripe

No Stripe configuration or payment behaviour should change.

Stripe webhook retries are relevant because they must not cause duplicate confirmation emails.

---

## Configuration and data changes

### Environment variables

Add server-only email configuration.

If Resend is used:

```text
RESEND_API_KEY
BOOKING_EMAIL_FROM
BOOKING_CHANGES_URL
```

#### `RESEND_API_KEY`

- server-only;
- secret;
- required in environments where email delivery is enabled.

#### `BOOKING_EMAIL_FROM`

Example shape:

```text
Re-Embroidered Conversations <bookings@example.com>
```

- server-only;
- required;
- must use a sender/domain accepted by the configured provider.

Do not hard-code a production sender address in application logic.

#### `BOOKING_CHANGES_URL`

Destination for the email's cancellation/rescheduling request action.

- server-only configuration;
- required for production email delivery;
- must use HTTPS in production.

The button/link wording must be:

```text
Request cancellation or rescheduling
```

or equivalent wording that clearly communicates that clicking the link does **not** itself cancel or reschedule the booking.

Do not say:

```text
Cancel booking
```

or:

```text
Reschedule booking
```

unless a real self-service workflow has subsequently been implemented.

The configured destination may initially be:

- a dedicated contact/request page;
- a secure external booking-change form;
- another approved customer-support destination.

Do not introduce fake self-service booking-management behaviour merely to satisfy the email design.

### Database or schema

Email delivery must be idempotent.

Add minimal persistence required to record successful confirmation-email delivery.

Preferred approach:

```text
Booking.confirmationEmailSentAt DateTime?
```

Optionally add a provider message identifier if it materially improves reconciliation:

```text
Booking.confirmationEmailId String?
```

Do not add multiple generic notification tables unless the implementation genuinely requires them.

A Prisma migration is therefore expected.

The timestamp means:

> the confirmation email provider accepted the confirmation message for delivery.

It does not claim the recipient opened or received it.

### Migration or backfill

Existing rows may have:

```text
confirmationEmailSentAt = null
```

No historical confirmation emails should be automatically sent as part of deployment.

Do not create a migration script that emails all previously confirmed bookings.

Only new/retried booking finalisation paths after deployment should invoke the confirmation-email behaviour according to the implementation rules below.

### Webhooks

No new public webhook is required for basic confirmation delivery.

Do not add email-provider delivery-status webhooks unless required for correct completion of this task.

The existing Stripe webhook remains responsible for triggering the booking finalisation sequence.

### OAuth and permissions

None.

### Deployment configuration

The production environment must configure:

```text
RESEND_API_KEY
BOOKING_EMAIL_FROM
BOOKING_CHANGES_URL
```

or the equivalent variables if an already-established email provider is discovered before implementation.

The production sending domain/address must be verified with the provider outside the repository where required.

---

## Security and privacy considerations

The confirmation email contains customer and booking information including:

- customer's name;
- customer's email address;
- session date/time;
- timezone;
- Google Meet link.

Treat the Meet URL as customer-specific booking information.

### Email destination

Always derive the recipient from:

```text
Booking.email
```

Do not allow a request parameter, Stripe field, browser field, or webhook-controlled arbitrary recipient to override the persisted booking email.

### Content minimisation

Do not include:

- Stripe PaymentIntent IDs;
- Checkout Session IDs;
- internal booking IDs unless technically required;
- Calendar event IDs;
- database identifiers;
- OAuth information;
- provider access tokens;
- customer notes;
- sensitive conversation subject matter.

The email only needs enough information to identify and attend the session.

### Logging

Do not log:

- full email HTML;
- Meet links unnecessarily;
- email-provider API keys;
- raw provider authentication headers.

Operational logs may include safe identifiers required to diagnose delivery, but avoid unnecessary personal information.

### HTML safety

Customer-controlled values such as:

```text
Booking.name
```

must be safely escaped when inserted into HTML.

Do not construct unsafe HTML through unescaped string interpolation.

### Cancellation/rescheduling link

Do not put sensitive booking state into unsigned URL parameters.

PR #16 does not introduce booking-management authority.

If `BOOKING_CHANGES_URL` requires booking identification, use only the integration mechanism approved by that destination.

Do not invent a public:

```text
?booking_id=<uuid>
```

management endpoint that exposes booking actions without authentication or a sufficiently strong capability token.

---

## Required implementation

### 1. Email provider boundary

Introduce a small server-only email service.

Conceptually:

```text
sendBookingConfirmationEmail({
  booking,
  ...
})
```

The function must receive authoritative booking data, generate the email, send it using the configured provider, and return a narrow result.

Provider-specific response objects must not leak throughout the booking domain.

### 2. Confirmation eligibility

A confirmation email may only be sent when the booking:

```text
status === CONFIRMED
```

and has all required confirmation state, including:

```text
stripePaymentIntentId
calendarEventId
valid meetingUrl
email
name
startAt
endAt
timezone
```

Do not email a partially finalised `PAID` booking.

### 3. Branded email

Provide both:

```text
HTML
text/plain
```

versions.

The email should follow the existing Re-Embroidered Conversations tone and visual language:

- warm;
- calm;
- simple;
- editorial rather than corporate;
- terracotta/warm accent where supported;
- generous whitespace;
- clear hierarchy.

Email HTML must use email-compatible markup and styling.

Do not attempt to reproduce the full website component/CSS stack inside the email.

Do not depend on:

- Tailwind runtime CSS;
- JavaScript;
- web fonts that are essential to readability;
- external stylesheets.

The email must remain readable when advanced styling is unavailable.

### 4. Subject

Use a concise transactional subject such as:

```text
Your Re-Embroidered Conversation is confirmed
```

Do not use promotional language.

### 5. Email content

Recommended content structure:

```text
Re-Embroidered Conversations

Your session is confirmed

Hello <name>,

Your Re-Embroidered Conversation is booked.

SESSION DETAILS

<Date>
<start>–<end>
<timezone>
55-minute session

[Join on Google Meet]

A little preparation

There is nothing you need to prepare formally.
Find somewhere private and comfortable where you can speak freely.
You may want a glass of water and a few quiet minutes beforehand.

[Request cancellation or rescheduling]

Closing/sign-off
```

Keep preparation instructions brief.

Do not imply that the service is:

- psychotherapy;
- counselling;
- medical treatment;
- mental-health treatment;
- crisis support.

Do not ask the customer to prepare or disclose sensitive material by email.

### 6. Date/time formatting

Format the date and time using:

```text
Booking.timezone
```

not the application server timezone.

Use UK-friendly presentation consistent with the booking success page, for example:

```text
Thursday, 24 September 2026
14:00–14:55
Europe/London
```

The implementation should reuse or extract existing date/time formatting logic where sensible.

Do not duplicate time-zone conversion logic unnecessarily.

### 7. Google Meet CTA

Provide a prominent:

```text
Join on Google Meet
```

button/link.

The href must come from:

```text
Booking.meetingUrl
```

after existing validation.

The plain-text version must include the complete Meet URL.

### 8. Cancellation/rescheduling CTA

Provide:

```text
Request cancellation or rescheduling
```

linked to:

```text
BOOKING_CHANGES_URL
```

This PR must not imply clicking the link automatically modifies the booking.

### 9. Preparation instructions

Include short, non-clinical preparation guidance.

Default intent:

```text
There is nothing you need to prepare formally. Find somewhere private and comfortable where you can speak freely. You may want a glass of water and a few quiet minutes beforehand.
```

Keep the wording in one obvious template location so it is easy to edit later.

Do not scatter preparation copy across booking lifecycle code.

### 10. Trigger point

Trigger confirmation email delivery only after Calendar/Meet finalisation has succeeded and the booking has reached:

```text
CONFIRMED
```

The email sender must never run before the durable confirmed state exists.

Preferred order:

```text
payment confirmed
    ↓
PAID persisted
    ↓
Calendar/Meet reconciled
    ↓
CONFIRMED persisted
    ↓
attempt confirmation email
    ↓
record successful email acceptance
```

### 11. Email failure behaviour

Email is secondary to the paid booking.

Therefore:

```text
email provider failure
```

must **not**:

- revert `CONFIRMED`;
- mark the booking `CANCELLED`;
- delete the Calendar event;
- remove the Meet link;
- cause another payment;
- claim that payment failed.

The booking remains confirmed.

The failure must remain observable and retryable.

### 12. Idempotency

Stripe may deliver:

```text
checkout.session.completed
```

more than once.

The confirmation email must therefore be idempotent.

Once:

```text
confirmationEmailSentAt
```

is populated, reprocessing the same event must not send another confirmation email.

The implementation must also consider races where two workers process the same Stripe event concurrently.

A simple:

```text
read sentAt → send → write sentAt
```

sequence is insufficient if two workers can both pass the initial read.

Use a persistence strategy that prevents duplicate sends as far as reasonably possible.

The implementation should preserve existing webhook idempotency and avoid weakening it.

### 13. Retry behaviour

If the booking is confirmed but email delivery fails, a later safe retry of booking finalisation/webhook processing may attempt email delivery again while:

```text
confirmationEmailSentAt === null
```

Do not create a duplicate Calendar event as part of that retry.

Do not send the confirmation again after successful email acceptance has been recorded.

### 14. Provider timeout/ambiguous result

If the email API times out after the remote provider may have accepted the message, avoid blindly assuming either success or failure where the provider supports an idempotency key.

Where supported, derive an email idempotency key from the booking, for example conceptually:

```text
booking-confirmation:<booking-id>
```

Use provider idempotency support where available.

This protects against duplicate sends following ambiguous network failures.

### 15. Existing Calendar invitation

Do not remove or disable:

```text
sendUpdates=all
```

from Google Calendar.

The branded confirmation email supplements the Calendar invitation.

It does not replace it.

---

## UI implementation requirements

This task does not materially change the website UI.

The email itself is rendered customer-facing content, so verify it independently.

Email markup should:

- use semantic structure;
- have descriptive link text;
- maintain sufficient colour contrast;
- remain understandable without images;
- avoid image-only CTAs;
- work when CSS support is limited;
- include meaningful plain-text fallback.

If a logo or decorative image is introduced, it must not contain information unavailable in text.

Do not add Playwright website visual-regression coverage solely for the email.

---

## Acceptance criteria

### Behaviour

- [ ] A newly confirmed booking causes one branded confirmation email to be sent.
- [ ] The recipient is the persisted `Booking.email`.
- [ ] The customer's name comes from the persisted booking.
- [ ] The email is not sent while the booking is `HOLD`.
- [ ] The email is not sent while the booking is `PAID`.
- [ ] The email is only eligible once the booking is durably `CONFIRMED`.
- [ ] A failed email send does not undo or invalidate a confirmed booking.
- [ ] A retry can send an email that previously failed.
- [ ] A successfully recorded email is not sent again on repeated Stripe webhook delivery.
- [ ] Concurrent/repeated processing does not normally generate duplicate confirmation messages.

### Email content

- [ ] The email clearly states that the booking is confirmed.
- [ ] It includes the booking date.
- [ ] It includes the start time.
- [ ] It includes the end time.
- [ ] Times are formatted in `Booking.timezone`.
- [ ] It identifies the session as a `55-minute session`.
- [ ] It includes the persisted Google Meet URL.
- [ ] The Meet URL is presented as a clear CTA.
- [ ] It includes a `Request cancellation or rescheduling` action.
- [ ] The cancellation/rescheduling destination comes from server configuration.
- [ ] It contains short preparation instructions.
- [ ] It contains both HTML and plain-text bodies.
- [ ] It does not contain internal Stripe/Calendar/database identifiers.
- [ ] It does not describe the service as therapy or medical treatment.

### Branding

- [ ] The email identifies Re-Embroidered Conversations clearly.
- [ ] Styling is consistent with the existing warm editorial brand.
- [ ] The email remains fully understandable if styling or images fail to load.
- [ ] Important content is text, not image-only content.

### External integrations

- [ ] Email-provider credentials remain server-side.
- [ ] Production sender configuration is documented.
- [ ] Email-provider errors are normalised rather than exposing raw provider responses through customer-facing code.
- [ ] Provider idempotency functionality is used when available.
- [ ] Existing Stripe webhook verification remains unchanged.
- [ ] Existing Google Calendar invitation behaviour remains unchanged.

### Persistence

- [ ] The schema contains the minimal state required to determine whether the confirmation email has already been accepted for delivery.
- [ ] A migration is included.
- [ ] Existing confirmed bookings are not bulk-emailed by the migration/deployment.
- [ ] Successful provider acceptance is persisted.
- [ ] Failed provider calls do not falsely mark the email as sent.

### Security/privacy

- [ ] Customer-controlled values are safely escaped in HTML.
- [ ] No provider secrets enter client bundles.
- [ ] Meet URLs are only sourced from validated confirmed bookings.
- [ ] Email logs do not unnecessarily expose customer or Meet information.
- [ ] The cancellation/rescheduling link does not expose an unauthenticated booking mutation endpoint.

### Code quality

- [ ] Existing repository conventions are followed.
- [ ] Provider-specific code is isolated from the booking domain.
- [ ] No general-purpose notification framework is introduced unnecessarily.
- [ ] No unrelated refactors are included.
- [ ] Type safety is preserved.
- [ ] Lint/type checking passes.
- [ ] Relevant tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### Unit tests

Add:

```text
tests/booking-confirmation-email.test.mjs
```

or the equivalent repository-standard location.

Cover at minimum:

#### Rendering

- confirmed booking produces expected subject;
- customer name appears;
- correctly formatted date appears;
- start/end times are formatted in the booking timezone;
- `55-minute session` appears;
- valid Meet URL appears;
- cancellation/rescheduling URL appears;
- preparation instructions appear;
- plain-text body contains the essential information;
- HTML escapes unsafe customer-controlled text.

#### Validation

Verify that email generation/sending rejects or refuses incomplete confirmation data such as:

- missing email;
- invalid meeting URL;
- missing timezone;
- invalid dates;
- non-confirmed booking where the domain function owns that check.

### Stripe/webhook integration tests

Update:

```text
tests/stripe-webhook.test.mjs
```

to prove:

```text
checkout.session.completed
→ PAID
→ Calendar finalisation
→ CONFIRMED
→ confirmation email
```

Cover:

1. email is sent after confirmation;
2. email receives the correct persisted booking data;
3. Calendar failure means no confirmation email;
4. confirmation persistence failure means no confirmation email;
5. email provider failure leaves the booking `CONFIRMED`;
6. replaying the Stripe event after successful email delivery does not send again;
7. retry after email failure can attempt delivery again;
8. an already-confirmed booking with recorded email delivery remains idempotent.

### PostgreSQL lifecycle test

Extend the existing PostgreSQL-backed lifecycle coverage where practical.

The real-persistence happy path should prove that the same booking row progresses through:

```text
HOLD
→ Checkout Session attached
→ PAID
→ CONFIRMED
→ confirmationEmailSentAt populated
```

while retaining:

```text
stripeCheckoutSessionId
stripePaymentIntentId
calendarEventId
meetingUrl
```

The email provider itself should remain stubbed.

The test must not send real email.

### Database migration test

Where existing schema tests cover persistence invariants, extend them to verify the new confirmation-email field.

### Browser tests

N/A for the core feature.

Do not send actual transactional emails from Playwright.

Existing booking-success browser coverage should continue to pass unchanged.

---

## Verification commands

Use the repository's established commands:

```bash
# Generate Prisma client after schema changes
npm run db:generate

# Validate Prisma schema
npm run db:validate

# Type checking
npm run lint

# Unit/integration tests
npm test

# Targeted email tests
node --conditions=react-server --experimental-test-module-mocks --test tests/booking-confirmation-email.test.mjs

# Relevant webhook tests
node --conditions=react-server --experimental-test-module-mocks --test tests/stripe-webhook.test.mjs

# Existing PostgreSQL lifecycle test
node --conditions=react-server --experimental-test-module-mocks --test tests/booking-lifecycle-database.test.mjs

# Browser regression suite
npm run test:browser

# Production build
npm run build
```

If a test filename changes during implementation, run the actual corresponding repository test rather than inventing a duplicate test file solely to match this specification.

No verification command should contact the real email provider.

Provider requests must be stubbed/mocked in automated tests.

If a command cannot run in the available environment, document:

1. the command;
2. why it could not run;
3. the verification performed instead.

---

## Manual external verification

After deploying to an environment with a verified email sender:

1. complete one real/test-mode booking using a real recipient address;
2. allow Stripe webhook processing to complete;
3. verify the booking reaches `CONFIRMED`;
4. verify the Google Calendar invitation is received;
5. verify the separate branded confirmation email is received;
6. verify the displayed session date/time and timezone;
7. verify the Meet button opens the same persisted Google Meet URL;
8. verify the cancellation/rescheduling request link opens the configured destination;
9. verify the plain-text version is sensible where the mail client exposes it;
10. replay/retry the Stripe webhook and verify no second branded confirmation email is generated.

Actual inbox placement cannot be guaranteed by the application because final delivery is controlled by the email provider and recipient mail service.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- transactional email provider integration;
- email rendering/template;
- booking finalisation integration;
- email-delivery persistence/idempotency;
- Prisma migration;
- configuration changes.

### Tests

List:

- tests added;
- tests updated;
- verification commands run;
- results.

### External configuration

Document:

```text
RESEND_API_KEY
BOOKING_EMAIL_FROM
BOOKING_CHANGES_URL
```

or the corresponding variables for an already-established provider.

Also identify any required sender-domain verification.

### Deviations

Describe any meaningful deviation from this specification and why it was necessary.

Use:

```text
None
```

when there were no deviations.

### Remaining issues

Explicitly state that self-service cancellation/rescheduling remains outside PR #16 unless it was independently implemented before this work.

Use:

```text
None
```

for any other unresolved issues when the PR is complete.
