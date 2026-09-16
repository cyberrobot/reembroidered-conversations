# PR #13 — Create Google Calendar event + Google Meet

## Repository state

**Expected branch:**  
`feat/013-google-calendar-event-google-meet`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**

- PR #4 — Connect Google Calendar
- PR #5 — Google Calendar busy-time integration
- PR #6 — Unified availability engine
- PR #8 / merged Stripe Checkout implementation
- PR #12 — Automatic Checkout transition
- Existing PostgreSQL booking persistence
- Existing encrypted Google refresh-token storage
- Existing verified Stripe webhook flow

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/004-connect-google-calendar.md`
- `.codex/tasks/005-google-calendar-busy-time-integration.md`
- `.codex/tasks/008-stripe-checkout.md`
- `package.json`
- `.env.example`
- `prisma/schema.prisma`
- `src/app/api/stripe/webhook/route.ts`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/booking/stripe-webhook-handler.ts`
- `src/lib/calendar/busy-periods.mjs`
- `src/lib/google-calendar/constants.mjs`
- `src/lib/google-calendar/config.ts`
- `src/lib/google-calendar/connection.ts`
- `src/lib/google-calendar/google-api.mjs`
- `src/lib/google-calendar/oauth.mjs`
- `tests/stripe-webhook.test.mjs`
- `tests/google-calendar-busy-periods.test.mjs`
- `tests/google-calendar-oauth.test.mjs`
- relevant Google Calendar connection/flow tests

### Primary change area

Post-payment booking finalisation:

```text
Stripe payment
    ↓
PAID
    ↓
Google Calendar event
    ↓
Google Meet conference
    ↓
persist event + meeting details
    ↓
CONFIRMED
```

### Canonical implementation examples

Use the existing Google FreeBusy integration as the preferred pattern for:

- keeping Google API access server-side;
- obtaining the stored Google Calendar connection;
- decrypting the stored refresh token only on the server;
- refreshing an ephemeral access token;
- checking required OAuth scopes;
- normalising Google API errors;
- dependency injection around external API calls.

Relevant examples:

- `src/lib/calendar/busy-periods.mjs`
- `src/lib/google-calendar/google-api.mjs`
- `src/lib/google-calendar/connection.ts`
- `tests/google-calendar-busy-periods.test.mjs`

Use the existing Stripe webhook implementation as the preferred pattern for:

- verified payment authority;
- booking correlation;
- conditional state transitions;
- duplicate webhook handling;
- customer-safe errors;
- returning a non-success response when processing must be retried.

Relevant examples:

- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/booking/stripe-webhook-handler.ts`
- `src/app/api/stripe/webhook/route.ts`
- `tests/stripe-webhook.test.mjs`

### Relevant symbols

Inspect before editing:

- `processStripeWebhook`
- `processStripeWebhookEvent`
- `createStripeWebhookPersistence`
- `StripeWebhookReconciliationError`
- `getGoogleCalendarCredentials`
- `getGoogleOAuthConfig`
- `refreshGoogleAccessToken`
- `GoogleApiError`
- `GOOGLE_OAUTH_SCOPES`
- `GOOGLE_FREEBUSY_SCOPE`
- `BookingStatus`
- `Booking.calendarEventId`
- `Booking.meetingUrl`
- `Booking.startAt`
- `Booking.endAt`
- `Booking.timezone`
- `Booking.email`
- `Booking.stripeCheckoutSessionId`
- `Booking.stripePaymentIntentId`

### Expected change surface

Expected areas include:

```text
.codex/tasks/013-google-calendar-event-google-meet.md

src/lib/google-calendar/constants.mjs
src/lib/google-calendar/google-api.mjs
src/lib/calendar/**                       # booking-event/finalisation service
src/lib/booking/stripe-webhook.mjs

tests/google-calendar-event*.test.mjs
tests/google-calendar-oauth.test.mjs
tests/stripe-webhook.test.mjs
```

Small changes to existing Google Calendar connection/config modules are acceptable where required to reuse the established authentication boundary.

No Prisma migration is expected.

No new npm dependency is expected. The current Google integration already uses the Calendar REST API through `fetch`; preserve that approach unless the existing implementation demonstrates a concrete reason to change it.

### Excluded areas

Do not implement as part of this PR:

- confirmation emails separate from Google Calendar invitations
- cancellation or deletion of Calendar events
- rescheduling
- refunds
- automatic refunds when Google finalisation fails
- admin reconciliation UI
- Google Calendar disconnect/reconnect UI
- changing the existing session duration or price
- changing Stripe Checkout creation
- changing payment amount/currency rules
- exposing Calendar or OAuth functionality to the browser
- adding a separate Google Meet API integration
- redesigning the booking or payment-return UI
- unrelated marketing/editorial changes

### Unknowns Codex must verify

Before editing, verify from the current repository:

- whether any more narrowly scoped `AGENTS.md` applies;
- the current Stripe webhook persistence interface after PR #12;
- all existing tests that assert the exact `HOLD → PAID` webhook behaviour;
- whether any test fixtures assume the exact current Google OAuth scope list;
- whether any existing helper already provides deterministic provider IDs;
- whether the Google Calendar connection can ever target a calendar not owned by the authenticated practitioner.

Do not guess when these answers can be established from the codebase.

---

## Objective

After a verified Stripe `checkout.session.completed` webhook proves that the £55 booking has been paid, automatically finalise that booking through Google Calendar.

The system must:

1. preserve the existing verified Stripe payment handling;
2. transition the matching booking from `HOLD` to `PAID`;
3. create exactly one event on the connected practitioner's Google Calendar;
4. use the persisted booking start/end times rather than browser data;
5. add the booking customer's email address as an attendee;
6. request a new Google Meet conference for that event;
7. request Google to send the normal Calendar invitation to the attendee;
8. persist Google's event ID as `Booking.calendarEventId`;
9. persist the Google-generated Meet URL as `Booking.meetingUrl`;
10. change the booking from `PAID` to `CONFIRMED` only after both identifiers are valid;
11. tolerate duplicate Stripe webhook delivery and uncertain Google API outcomes without creating duplicate Calendar events or Meet conferences.

Successful completion is:

```text
HOLD
  ↓ verified Stripe payment
PAID
  ↓ Calendar event + Meet successfully reconciled
CONFIRMED
```

`PAID` is the recoverable state when payment succeeded but Google finalisation has not yet completed.

A paid booking must never be cancelled or lost merely because Google Calendar is temporarily unavailable.

---

## Current architecture

Stripe Checkout already treats the verified webhook as payment authority.

A successful `checkout.session.completed` currently:

- validates internal booking correlation;
- validates payment mode, amount, currency and payment state;
- conditionally changes the booking from `HOLD` to `PAID`;
- persists the Stripe PaymentIntent ID;
- safely accepts duplicate delivery when the same booking is already `PAID` or `CONFIRMED`.

The webhook route delegates processing to server-side booking-domain code and returns a processing failure when reconciliation cannot be completed.

The Google Calendar integration already provides:

- provider OAuth;
- encrypted refresh-token persistence;
- discovery and persistence of the practitioner's primary calendar;
- stored granted OAuth scopes;
- refresh-token → ephemeral access-token exchange;
- Google FreeBusy access;
- sanitised Google API error handling.

The existing `Booking` model already contains:

```text
calendarEventId String? @unique
meetingUrl      String?
```

and therefore already has the persistence required by this PR.

The payment-return page currently treats both `PAID` and `CONFIRMED` as successfully paid and tells the customer that Calendar/meeting details are being finalised. This PR does not require a UI redesign.

---

## External integrations affected

### Google Calendar

Add Calendar event creation to the existing server-side Google integration.

Required operations:

```text
Events.insert
Events.get / equivalent event lookup for reconciliation
```

The event must be created on the persisted:

```text
GoogleCalendarConnection.calendarId
```

Do not assume `"primary"` at event-creation time when the application has already persisted the resolved calendar ID.

### Google Meet

Do not introduce the separate Google Meet API.

Create the Meet conference through Google Calendar event conference data.

The Calendar request must use:

```text
conferenceDataVersion=1
```

and an event body containing a conference creation request equivalent to:

```json
{
  "conferenceData": {
    "createRequest": {
      "requestId": "<stable unique request id>",
      "conferenceSolutionKey": {
        "type": "hangoutsMeet"
      }
    }
  }
}
```

Do not construct or guess a Google Meet URL.

Only persist a URL returned by Google.

### Stripe

No new Stripe event types are required.

Continue consuming:

```text
checkout.session.completed
checkout.session.expired
```

The change is that successful processing of a paid Checkout Session now also orchestrates Calendar/Meet finalisation.

Stripe signature validation and existing payment reconciliation rules must remain unchanged.

---

## Configuration and data changes

### Environment variables

No new environment variables are expected.

Continue using the existing server-only:

```text
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
GOOGLE_ADMIN_EMAIL
ADMIN_SESSION_SECRET
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
DATABASE_URL
```

No Google credential, access token or refresh token may be exposed through a `NEXT_PUBLIC_*` variable.

### Database or schema

No schema migration is expected.

Use the existing:

```text
Booking.calendarEventId
Booking.meetingUrl
Booking.status
```

`calendarEventId` must remain unique.

Do not introduce another table merely to store the Google event ID or Meet URL.

### Webhooks

The existing Stripe webhook endpoint remains authoritative.

For a successfully paid `checkout.session.completed` event:

```text
verify Stripe
→ reconcile payment
→ booking becomes PAID
→ reconcile Google event + Meet
→ persist Google identifiers
→ booking becomes CONFIRMED
→ return success
```

If payment has been persisted but Google finalisation has not completed:

- leave the booking `PAID`;
- do not revert it to `HOLD`;
- do not cancel it;
- do not mark it `CONFIRMED`;
- return a webhook processing failure so Stripe can retry delivery.

A duplicate webhook must resume/reconcile finalisation rather than create a second event.

`checkout.session.expired` behaviour must remain unchanged and must never downgrade an already `PAID` or `CONFIRMED` booking.

### OAuth and permissions

Add the narrow event-write scope:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

to the existing Google OAuth scope set.

This is preferred over the broader full-Calendar scope because this application creates events on the connected practitioner's owned primary calendar.

The Calendar event service must explicitly verify that the persisted connection contains the required write scope before attempting event creation.

An existing Google connection created before this PR will not possess the new permission merely because the application now requests it.

The practitioner must therefore reconnect/reauthorise the Google Calendar connection after deployment so Google grants the additional event-write scope.

Missing scope must be treated as reauthorisation required, not as a generic malformed Calendar response.

### Deployment configuration

No new environment values are expected.

Deployment requires one external configuration action:

- ensure the Google OAuth consent configuration permits the new Calendar event-write scope.

The practitioner must then complete Google OAuth again so the stored connection contains that granted scope.

Deploy/re-authorise before accepting production payments where possible, to avoid accumulating paid bookings awaiting Calendar finalisation.

### Migration or backfill

No automatic database backfill is required.

Do not fabricate Calendar events for historical `CONFIRMED`, `CANCELLED` or `REFUNDED` bookings.

Any legitimate existing `PAID` booking without Calendar details should remain safely recoverable through an intentional reconciliation/replayed payment event rather than an uncontrolled migration.

---

## Security and privacy considerations

All Calendar and Meet operations must remain server-side.

The Calendar event requires the customer's email because the customer must be invited as an attendee.

Minimise all other customer information sent to Google.

In particular:

- do not include personal disclosures or booking notes;
- do not put Stripe IDs into the visible event title or description;
- do not put OAuth credentials or secrets into event metadata;
- do not use the customer's name in the event title unless an existing product requirement explicitly requires it;
- use a neutral deterministic title such as `Re-Embroidered Conversation`;
- use the internal booking ID only for private correlation metadata where useful.

A reasonable event payload is equivalent to:

```json
{
  "id": "<deterministic Google event id>",
  "summary": "Re-Embroidered Conversation",
  "start": {
    "dateTime": "<persisted booking start>",
    "timeZone": "<persisted booking timezone>"
  },
  "end": {
    "dateTime": "<persisted booking end>",
    "timeZone": "<persisted booking timezone>"
  },
  "attendees": [
    {
      "email": "<persisted booking email>"
    }
  ],
  "extendedProperties": {
    "private": {
      "bookingId": "<internal booking id>"
    }
  },
  "conferenceData": {
    "createRequest": {
      "requestId": "<deterministic conference request id>",
      "conferenceSolutionKey": {
        "type": "hangoutsMeet"
      }
    }
  }
}
```

Do not log:

- refresh tokens;
- access tokens;
- OAuth secrets;
- the complete Google API request/response;
- attendee email addresses unnecessarily.

Logging an internal booking ID, Stripe event ID, safe error category and Google event ID is acceptable where useful for reconciliation.

---

## Required implementation

### 1. Add the Google event-write OAuth scope

Add a named scope constant equivalent to:

```text
GOOGLE_EVENTS_OWNED_SCOPE
```

for:

```text
https://www.googleapis.com/auth/calendar.events.owned
```

Include it in the existing Google OAuth scope list.

Do not replace the current FreeBusy or CalendarList scopes.

Update relevant OAuth tests to verify that the new permission is requested.

The runtime event-creation service must also check `grantedScopes`; changing the requested scopes alone is insufficient because existing refresh tokens may predate this PR.

---

### 2. Add a low-level Calendar event API boundary

Extend the existing Google API boundary rather than calling Google directly from the Stripe route.

Provide operations equivalent to:

```text
insertGoogleCalendarEvent(...)
getGoogleCalendarEvent(...)
```

Use the existing:

```text
refreshGoogleAccessToken(...)
GoogleApiError
```

patterns.

The insert request must target:

```text
POST /calendar/v3/calendars/{calendarId}/events
```

with:

```text
conferenceDataVersion=1
sendUpdates=all
```

`sendUpdates=all` is required so Google is asked to send the attendee the normal Calendar invitation.

Do not send the refresh token to the Calendar API. Exchange it for an ephemeral access token first, as the current FreeBusy integration already does.

---

### 3. Generate a deterministic Google event ID

Do not allow Google to generate an unpredictable event ID for this workflow.

Generate the Google event ID deterministically from the internal booking UUID.

The generated value must:

- be stable for the same booking;
- satisfy Google's Calendar event-ID character restrictions;
- satisfy Google's length restrictions;
- not contain customer PII;
- produce a distinct ID for distinct bookings.

For example, a stable application prefix plus the lower-case booking UUID with hyphens removed is appropriate provided the final value satisfies Google's documented event-ID format.

The deterministic ID exists specifically to make this failure safe:

```text
Events.insert reaches Google
→ Google creates event
→ application connection/response fails
→ database never receives event ID
→ Stripe retries webhook
```

The retry must resolve the same Google event instead of creating another one.

---

### 4. Generate a stable Meet conference request ID

Derive a separate stable conference request ID from the booking ID.

Requirements:

- one logical Meet creation request per booking;
- stable across retries;
- not customer PII;
- not shared between different bookings.

Do not generate a fresh conference request ID every time Stripe retries the same booking.

---

### 5. Create the booking Calendar event from persisted data

The event must be constructed from the persisted booking.

Do not accept Calendar event details from:

- Stripe metadata beyond the internal booking correlation ID;
- browser query parameters;
- payment-return URL parameters;
- client-side state.

Use:

```text
Booking.startAt
Booking.endAt
Booking.timezone
Booking.email
Booking.id
```

Do not recompute the 55-minute duration from the current configuration during finalisation. The booking's persisted `startAt` and `endAt` are authoritative for the session already purchased.

Add the customer's persisted email as the event attendee.

The Calendar containing the event is the practitioner/organizer calendar.

---

### 6. Request Google Meet in the event creation operation

Create the Calendar event and request its Meet conference as one logical finalisation operation.

Set:

```text
conferenceDataVersion=1
```

and request:

```text
conferenceSolutionKey.type = hangoutsMeet
```

Do not create a Calendar event first and then independently invent or provision a meeting through another provider.

The implementation must recognise that Google conference creation can be asynchronous.

A successful event insertion does not by itself prove that a usable Meet URL already exists.

---

### 7. Validate Google's event response

Before confirmation, verify that Google returned/reconciled:

- the expected event ID;
- the expected booking correlation;
- valid event start/end data where reconciliation requires comparison;
- conference creation success;
- a usable Google-provided video/Meet URL.

Prefer the Google-provided event `hangoutLink` where valid, or the appropriate video conference entry-point URI if the API representation requires it.

Never derive a URL such as:

```text
https://meet.google.com/<guessed-code>
```

from local data.

If Google reports conference creation as:

```text
pending
```

the booking must remain `PAID`.

Do not mark it `CONFIRMED` while conference data is pending.

Do not perform unbounded polling inside the Stripe webhook.

Allow the operation to be retried/reconciled safely.

If Google explicitly reports conference creation failure, leave the booking `PAID` and surface a retry/reconciliation failure.

---

### 8. Reconcile an event that may already exist

The implementation must support this case:

```text
Google event successfully created
↓
attendee invitation may already have been sent
↓
application times out before saving calendarEventId
↓
Stripe delivers webhook again
```

On retry, use the deterministic event ID to recover the existing event.

Accept an already-existing event only after verifying that it belongs to the same booking.

Private event metadata containing the internal booking ID should be used for this correlation where practical.

An `Events.insert` conflict caused by the expected deterministic event must trigger reconciliation of the existing event rather than creation using another ID.

Never work around an event-ID collision by generating a random replacement ID.

That would risk:

- duplicate Calendar events;
- duplicate attendee invitations;
- duplicate Meet conferences.

---

### 9. Integrate Calendar finalisation into the paid webhook path

Extend the `checkout.session.completed` processing so the lifecycle becomes:

```text
HOLD
↓
validate verified Stripe payment
↓
PAID
↓
reconcile Calendar event + Meet
↓
CONFIRMED
```

Payment persistence must remain authoritative and durable even when Google subsequently fails.

Do not wrap the Stripe payment mutation and remote Google request in a fake database transaction that implies cross-provider atomicity.

The systems cannot be committed atomically.

Instead use the persisted `PAID` state as the recovery boundary.

If the booking was newly moved to `PAID`, continue immediately into Calendar finalisation.

If a duplicate webhook finds the matching booking already `PAID`, resume Calendar finalisation.

If the matching booking is already `CONFIRMED` with the expected Stripe IDs, Calendar event ID and Meet URL, treat the webhook as successfully reconciled and perform no new external side effect.

---

### 10. Persist Calendar details and confirmation together

Once Google has a valid event and completed Meet conference, persist:

```text
calendarEventId
meetingUrl
status = CONFIRMED
```

as one local booking-state mutation.

The application must not expose these invalid intermediate combinations as completed state:

```text
CONFIRMED + no calendarEventId
CONFIRMED + no meetingUrl
```

Use a conditional persistence update based on the expected `PAID` booking and matching Stripe correlation.

If the conditional update affects no row:

1. reload the booking;
2. accept it only if it is already `CONFIRMED` with the same Stripe correlation and same Google event/meeting data;
3. otherwise raise a reconciliation error.

The existing uniqueness constraint on `calendarEventId` must remain enforced.

---

### 11. Preserve idempotency across the complete workflow

The following must all be safe:

```text
same Stripe webhook delivered twice
same Stripe webhook delivered concurrently
Google insert succeeds but response is lost
Google returns an existing deterministic event
Meet creation is still pending
database write fails after Google success
application crashes after Google success
Stripe retries while booking is PAID
Stripe retries after booking is CONFIRMED
```

All of these cases must converge toward one:

```text
Booking
Google Calendar event
Google Meet conference
```

for the purchased session.

Client-side duplicate protection is irrelevant to this webhook workflow and must not be used as the idempotency mechanism.

---

### 12. Keep `PAID` as the explicit Google-recovery state

Do not introduce another booking status in this PR unless the existing state model proves incapable of representing the required workflow.

The existing `PAID` status already represents:

```text
money successfully received
Calendar/Meet finalisation not necessarily complete
```

Use it.

Examples:

```text
Google not connected        → PAID
new OAuth scope not granted → PAID
refresh token revoked       → PAID
Google temporarily down     → PAID
event response lost         → PAID
Meet pending                → PAID
local persistence failed    → PAID
```

A downstream Google failure must never move the booking back to `HOLD` or `CANCELLED`.

---

### 13. Make downstream failures retryable through the webhook

When payment has succeeded but Calendar/Meet cannot yet be finalised, webhook processing must fail intentionally so Stripe can retry.

The existing webhook handler may continue returning its generic processing-failure response.

Do not expose raw Google errors through the HTTP response.

Log only safe reconciliation context.

A `200` response must not be returned merely because payment was saved if Calendar/Meet finalisation is still required for that booking.

Once the booking is `CONFIRMED`, duplicate deliveries must return success without creating new external resources.

---

### 14. Handle Google authorisation failures explicitly

Required distinctions:

#### No connected Google Calendar

- leave booking `PAID`;
- do not confirm;
- raise a recoverable/reconciliation failure;
- do not create a substitute meeting URL.

#### Required event-write scope missing

- classify as reauthorisation required;
- leave booking `PAID`;
- do not broaden permissions automatically;
- do not pretend the event was created.

#### Refresh token revoked / rejected

- classify as reauthorisation required;
- leave booking `PAID`;
- avoid exposing Google's OAuth response.

#### Google rate-limited or temporarily unavailable

- leave booking `PAID`;
- make the operation safe for later retry.

#### Invalid Google response

- leave booking `PAID`;
- fail closed;
- do not confirm from partial or malformed data.

---

### 15. Do not add another post-payment availability race

At this stage the customer has already paid and the application booking owns the slot as `PAID`.

Do not cancel or release the paid booking because Calendar finalisation fails.

This PR is responsible for faithfully projecting the already-purchased booking into Google Calendar.

Any separate operational policy for a practitioner-created conflicting Calendar event discovered after payment is outside this PR and must not silently refund, cancel or overwrite the paid booking.

---

## External-service failure handling

The implementation must specifically cover:

**Payment succeeds, Calendar authentication fails**

```text
status = PAID
calendarEventId = null
meetingUrl = null
webhook processing fails for retry/reconciliation
```

**Calendar insert succeeds but HTTP response is lost**

```text
status remains PAID locally
retry uses deterministic event ID
existing Google event is recovered
no second invitation/event/Meet is created
```

**Calendar event exists but Meet creation is pending**

```text
status = PAID
same event is reconciled on retry
no second event is inserted
```

**Calendar + Meet succeed but database update fails**

```text
status remains PAID
retry resolves deterministic Google event
same Meet data is recovered
booking is then persisted as CONFIRMED
```

**Webhook is delivered after booking is already CONFIRMED**

```text
verify Stripe correlation
perform no Google mutation
return success
```

**Google event ID exists but belongs to different/unexpected data**

```text
do not overwrite
do not create a random replacement event
raise reconciliation failure
```

---

## UI implementation requirements

No material UI change is required.

Preserve the existing payment-return behaviour unless a small change is strictly required by the implementation.

Do not add:

- client-side Google API calls;
- Meet provisioning from the browser;
- a polling UI solely for this PR;
- a new confirmation design.

Because rendered output is not materially changing:

- new Playwright visual snapshots are not required;
- visual regression work is not required.

---

## Acceptance criteria

### Behaviour

- [ ] A verified paid `checkout.session.completed` event moves the booking through `PAID` to `CONFIRMED` only after Google finalisation succeeds.
- [ ] A Calendar event is created on the connected practitioner's persisted calendar.
- [ ] The event uses the booking's persisted start and end times.
- [ ] The customer is included as an attendee using the persisted booking email.
- [ ] Google is instructed to send attendee updates/invitations.
- [ ] A Google Meet conference is requested using Calendar `conferenceData`.
- [ ] Calendar requests that create/modify conference data use `conferenceDataVersion=1`.
- [ ] `conferenceSolutionKey.type` is `hangoutsMeet`.
- [ ] `Booking.calendarEventId` stores Google's event ID.
- [ ] `Booking.meetingUrl` stores a Google-returned Meet/video URL.
- [ ] `CONFIRMED` is never persisted without both `calendarEventId` and `meetingUrl`.
- [ ] Meet `pending` does not produce a false confirmation.
- [ ] Google failures leave a successfully paid booking in `PAID`.
- [ ] Existing Stripe expiry handling remains unchanged.

### Idempotency and reconciliation

- [ ] The Google event ID is deterministic for the booking.
- [ ] The Meet creation request ID is stable for the booking.
- [ ] Duplicate Stripe webhook delivery creates no duplicate event.
- [ ] Duplicate Stripe webhook delivery creates no duplicate Meet conference.
- [ ] A lost response after successful Google event creation is recoverable.
- [ ] A database failure after successful Google creation is recoverable.
- [ ] An already `CONFIRMED` booking is a no-op when the same Stripe webhook is replayed.
- [ ] An existing deterministic event is verified against the booking before being accepted.

### OAuth

- [ ] The narrow Google Calendar event-write scope is requested.
- [ ] Existing CalendarList and FreeBusy scopes remain intact.
- [ ] Event creation checks the actually persisted granted scopes.
- [ ] Missing event-write permission is treated as reauthorisation required.
- [ ] Refresh/access tokens remain entirely server-side.
- [ ] `.env.example` does not gain unnecessary configuration.

### Security and privacy

- [ ] The attendee email is the only customer PII required by the Calendar invitation unless existing requirements establish otherwise.
- [ ] The event title does not unnecessarily contain customer PII.
- [ ] OAuth tokens and secrets are never logged.
- [ ] Raw Google error bodies are not returned to the webhook caller.
- [ ] No Meet URL is generated locally.

### Code quality

- [ ] Existing Google Calendar service boundaries are extended rather than bypassed.
- [ ] Existing Stripe signature verification is preserved.
- [ ] Existing booking lifecycle conventions are preserved.
- [ ] No unnecessary dependency is introduced.
- [ ] No unnecessary schema migration is introduced.
- [ ] No unrelated refactor is included.
- [ ] Type checking passes.
- [ ] Tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### Unit tests

Add focused coverage for Calendar event construction and Google response handling.

Expected cases include:

- deterministic Google event ID from booking UUID;
- event ID satisfies Google's accepted character format;
- deterministic Meet request ID;
- correct event title;
- persisted `startAt` and `endAt` are used unchanged;
- persisted timezone is used;
- persisted customer email becomes the attendee;
- private booking correlation metadata is present;
- `conferenceData.createRequest` is correct;
- valid Meet URL extraction;
- `pending` conference state;
- failed conference state;
- malformed Calendar response;
- safe Google API error classification.

A suitable new location is:

```text
tests/google-calendar-event.test.mjs
```

### Integration tests

Extend Google Calendar integration tests to verify:

- required OAuth event-write scope;
- missing scope produces reauthorisation-required behaviour;
- access token is refreshed through the existing flow;
- `Events.insert` targets the persisted calendar;
- `conferenceDataVersion=1` is sent;
- `sendUpdates=all` is sent;
- attendee data is included;
- Google API requests use bearer access tokens, never the refresh token;
- an existing deterministic event can be retrieved/reconciled;
- an expected event conflict does not cause a second random event to be created;
- authorization, rate-limit and provider errors are normalised.

Extend:

```text
tests/google-calendar-oauth.test.mjs
tests/google-calendar-busy-periods.test.mjs
```

only where their existing scope assumptions require updating.

### Stripe webhook tests

Extend:

```text
tests/stripe-webhook.test.mjs
```

to cover the complete lifecycle.

Required cases:

```text
HOLD → PAID → CONFIRMED
```

when Calendar and Meet succeed.

Also cover:

- payment becomes `PAID` before downstream Google finalisation;
- Google failure leaves the booking `PAID`;
- duplicate completed webhook while `PAID` retries finalisation;
- duplicate completed webhook after `CONFIRMED` performs no duplicate Google operation;
- Calendar event success followed by local persistence failure is recoverable;
- existing remote event is reconciled on retry;
- Meet `pending` leaves booking `PAID`;
- Google authorization failure leaves booking `PAID`;
- `CONFIRMED` contains the expected event ID and Meet URL;
- mismatched existing event correlation fails safely;
- expired Checkout events do not create Calendar events;
- unsupported Stripe events do not invoke Calendar finalisation.

### Database tests

A new migration test is not required because the schema already contains the required fields.

Where practical, integration/persistence coverage should verify:

- `calendarEventId` uniqueness remains effective;
- the final persistence operation writes `calendarEventId`, `meetingUrl` and `CONFIRMED` together;
- conditional confirmation cannot downgrade or overwrite an unexpected booking state.

### Browser tests

N/A for this backend-only PR unless implementation changes rendered UI.

Do not add Playwright coverage merely to prove server-side Google API behaviour.

### Visual regression tests

N/A.

---

## Verification commands

Run the repository's existing verification commands:

```bash
npm run db:validate

npm run lint

npm test
```

Run the focused integration tests directly while developing, using the repository's existing Node test configuration. For example:

```bash
node --conditions=react-server --experimental-test-module-mocks --test \
  tests/google-calendar-event.test.mjs \
  tests/google-calendar-oauth.test.mjs \
  tests/google-calendar-busy-periods.test.mjs \
  tests/stripe-webhook.test.mjs
```

Then run the production build:

```bash
npm run build
```

If implementation changes any browser-visible behaviour unexpectedly, also run:

```bash
npm run test:browser
```

No live test should depend on:

- a developer's real Google Calendar;
- a real attendee receiving an invitation;
- a live Google Meet conference;
- a real Stripe payment.

External provider behaviour must be represented through deterministic test doubles/fixtures.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- new Google event-write permission;
- Calendar event creation;
- attendee invitation;
- Meet conference creation;
- deterministic Google idempotency;
- Stripe webhook finalisation;
- persistence of Calendar/Meet identifiers;
- `PAID → CONFIRMED`.

### Tests

List:

- tests added or updated;
- targeted tests run;
- full test result;
- type-check result;
- Prisma validation result;
- build result.

### External configuration

State clearly that the practitioner must:

1. ensure the new Calendar event-write scope is configured for the Google OAuth application where required;
2. reconnect/reauthorise the Google Calendar integration;
3. verify the stored connection has granted the new permission before accepting production bookings.

No new environment variable should be required.

### Deviations

Document any meaningful deviation from this specification and why it was necessary.

Use `None` when there were no deviations.

### Remaining issues

List unresolved:

- Google authorization problems;
- paid bookings still awaiting Calendar reconciliation;
- Meet conference creation failures;
- external configuration still required.

Use `None` when the task is fully complete.
