# PR #15 — Booking confirmation flow

## Repository state

**Expected branch:**  
`feat/015-booking-confirmation-flow`

**Base branch:**  
`main` after PR #13 has been merged.

**Worktree:**  
N/A

**Dependencies:**

- PR #12 — Automatic Checkout transition
- PR #13 — Create Google Calendar event + Google Meet
- PR #14 — PostgreSQL-backed complete booking lifecycle test
- Existing PostgreSQL booking persistence
- Existing Stripe Checkout implementation
- Existing verified Stripe webhook flow
- Existing Google Calendar event + Google Meet reconciliation
- Existing `BookingConfirmationPage.tsx` visual prototype
- Existing Playwright browser-test infrastructure

PR #15 depends on the booking lifecycle introduced by PR #13:

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

The confirmation page must not claim the booking is confirmed before the persisted booking actually reaches `CONFIRMED`.

If PR #13 has not yet merged when implementation begins, temporarily stack PR #15 on:

```text
feat/013-google-calendar-event-google-meet
```

That branch already contains PR #14.

Do not reimplement PR #13 or PR #14 inside PR #15. Retarget/rebase PR #15 onto `main` after PR #13 merges.

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/013-google-calendar-event-google-meet.md`
- `.codex/tasks/014-postgresql-booking-lifecycle-happy-path.md`
- `package.json`
- `playwright.config.ts`
- `.github/workflows/ci.yml`
- `prisma/schema.prisma`
- `src/app/payment/page.tsx`
- `src/app/confirmation/page.tsx`
- `src/components/BookingConfirmationPage.tsx`
- `src/components/BookingSection.tsx`
- `src/lib/db.ts`
- `src/lib/booking/session-product.mjs`
- `src/lib/booking/stripe-checkout.mjs`
- `src/lib/booking/stripe-checkout-handler.ts`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/calendar/booking-event.mjs`
- `src/lib/google-calendar/google-api.mjs`
- `tests/stripe-checkout.test.mjs`
- `tests/stripe-webhook.test.mjs`
- `tests/google-calendar-event.test.mjs`
- `tests/booking-lifecycle-database.test.mjs`
- `tests/browser/migration-smoke.spec.ts`

### Primary change area

The post-Stripe customer confirmation journey:

```text
Stripe Checkout
      ↓
/booking/success
      ↓
correlate booking_id + Checkout session
      ↓
read persisted booking state
      ↓
┌─────────────┬─────────────────────────────┐
│ HOLD        │ payment confirmation pending │
│ PAID        │ Calendar/Meet finalising     │
│ CONFIRMED   │ show confirmation            │
└─────────────┴─────────────────────────────┘
      ↓
CONFIRMED
      ↓
show persisted booking details + Google Meet
```

The page is a read-only view of the booking lifecycle.

It must **not** perform payment reconciliation, create Calendar events, create Meet conferences, or otherwise mutate booking state.

### Canonical implementation examples

Use the existing implementation as follows.

#### Confirmation visual design

Treat:

```text
src/components/BookingConfirmationPage.tsx
```

as the visual reference for the confirmed state.

Preserve the established Re-Embroidered Conversations visual language where practical:

- warm cream background;
- paper-grain treatment;
- terracotta accent;
- editorial serif headings;
- rounded bordered confirmation card;
- confirmation icon and status badge;
- session-details grid;
- quiet, reassuring tone;
- prominent return-to-site action.

The existing component is currently a prototype. Its URL-controlled fake data, test toolbar, fake booking defaults, and unsupported claims are **not** canonical behaviour.

#### Payment return

Use:

```text
src/app/payment/page.tsx
```

as the existing server-side pattern for:

- validating `booking_id`;
- validating `session_id`;
- querying PostgreSQL server-side;
- correlating the supplied Checkout Session ID with the booking;
- keeping booking/payment data out of arbitrary client state;
- disabling stale caching for payment-sensitive information.

#### Booking lifecycle

Use:

```text
src/lib/booking/stripe-webhook.mjs
```

as the authority for booking state.

The success page must consume the state produced by the webhook. It must not infer payment success from the Stripe redirect.

#### Product definition

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
- amount: £55;
- currency: GBP.

Do not introduce another independently maintained `55` or `£55` product definition where the canonical product constant can be reused.

#### Google Meet

Use the persisted:

```text
Booking.meetingUrl
```

created by PR #13.

Where validation is required, reuse:

```text
isUsableGoogleMeetUrl
```

rather than introducing a different definition of a valid Meet URL.

#### Google Calendar invitation

PR #13 already:

- uses `Booking.email` as the Calendar attendee;
- inserts the Calendar event with `sendUpdates=all`.

Preserve that integration and its existing idempotency model.

Do not send a duplicate confirmation invitation through another email provider.

### Relevant symbols

Inspect before editing:

```text
BookingConfirmationPage
PaymentReturn

SESSION_PRODUCT

createBookingCheckout
createCheckoutPersistence

processStripeWebhook
processStripeWebhookEvent
createStripeWebhookPersistence

reconcileBookingCalendarEvent
buildBookingCalendarEvent
isUsableGoogleMeetUrl

insertGoogleCalendarEvent

db.booking.findUnique

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
.codex/tasks/015-booking-confirmation-flow.md

src/app/booking/success/page.tsx
src/components/BookingConfirmationPage.tsx
src/components/**                         # small confirmation/polling component if required
src/lib/booking/**                       # server-side success-state/query helper if useful
src/lib/booking/stripe-checkout.mjs

src/app/payment/page.tsx                 # optional backwards-compatible redirect

tests/booking-success*.test.mjs
tests/stripe-checkout.test.mjs
tests/google-calendar-event.test.mjs
tests/browser/booking-success.spec.ts
tests/browser/**-snapshots/**
```

A small server-only booking-confirmation query/helper is preferred if it keeps route rendering and validation easy to test.

No Prisma migration is expected.

No new npm dependency is expected.

### Excluded areas

Do not implement as part of PR #15:

- a new email provider;
- a separate confirmation email system;
- a new Google Meet integration;
- Gmail integration;
- Calendar event cancellation;
- Calendar event rescheduling;
- booking rescheduling;
- refunds;
- cancellation handling;
- reminder emails;
- 24-hour reminder automation;
- receipt-generation logic;
- Stripe receipt configuration;
- admin booking management;
- Calendar reconnect/disconnect functionality;
- new OAuth scopes;
- a new booking state;
- a Prisma schema redesign;
- manual Calendar-event creation from the browser;
- payment verification from browser-supplied query parameters;
- payment verification by calling Stripe from the success page;
- Calendar reconciliation from the success page;
- a public endpoint exposing arbitrary bookings by booking ID;
- unrelated marketing-site changes.

Do not preserve prototype functionality merely because it currently exists in `BookingConfirmationPage.tsx`.

In particular, the production confirmation flow must not claim any of the following unless there is real implemented behaviour supporting them:

- “Receipt emailed automatically”
- “24-Hour Reminder”
- “Flexible Rescheduling”
- a phone/audio session option
- an encrypted private video product distinct from Google Meet

The existing development/test banner and URL presets must not appear in production.

### Unknowns Codex must verify

Before editing, verify:

- PR #13 is present in the implementation base.
- PR #14's lifecycle test is present in the implementation base.
- No scoped `AGENTS.md` changes the route/component conventions.
- `BookingConfirmationPage.tsx` is still prototype/dead UI rather than a production route.
- `/payment` is still the Stripe Checkout `success_url`.
- `SESSION_PRODUCT` remains the canonical 55-minute / £55 definition.
- `CONFIRMED` still guarantees successful Stripe payment followed by Calendar + Meet finalisation.
- Google Calendar event creation still uses the persisted client email as an attendee.
- Google event creation still requests `sendUpdates=all`.
- `meetingUrl` is still Google-generated and persisted only after validation.
- Playwright CI still has PostgreSQL available and migrations applied.
- No existing booking-success query/helper already implements the required correlation.

Do not guess if these have changed.

---

## Objective

Build the production booking confirmation flow at:

```text
/booking/success
```

After Stripe Checkout redirects the client back to the application, the page must retrieve the persisted booking state and follow it until the booking is fully `CONFIRMED`.

Once confirmed, display:

- booking confirmation;
- client's name;
- date;
- start time;
- end time;
- timezone;
- `55-minute session`;
- `£55 paid`;
- Google Meet link.

The Google Calendar event created during booking finalisation must also invite the client's persisted email address so Google's normal Calendar invitation reaches the client.

The final customer journey is:

```text
Book & pay £55
      ↓
Stripe Checkout
      ↓
Stripe redirects to /booking/success
      ↓
booking may still be HOLD while webhook arrives
      ↓
payment webhook → PAID
      ↓
Calendar event + Google Meet → CONFIRMED
      ↓
success page automatically observes CONFIRMED
      ↓
show real booking details + real Meet link
```

A customer must not need to manually refresh the page during the normal successful path.

The page must derive confirmation data from PostgreSQL.

Browser query parameters must never be treated as authoritative booking details.

---

## Current architecture

### Checkout

`createBookingCheckout` creates the Stripe Checkout Session.

The current success URL is:

```text
/payment?booking_id=<booking UUID>&session_id={CHECKOUT_SESSION_ID}
```

The Checkout Session is correlated to the booking through:

```text
Booking.stripeCheckoutSessionId
```

and Stripe metadata/client-reference data.

### Payment return

`/payment` currently:

1. reads `booking_id`;
2. reads `session_id`;
3. validates their basic formats;
4. queries the booking;
5. verifies that the persisted `stripeCheckoutSessionId` matches;
6. treats `PAID` or `CONFIRMED` as evidence that the webhook has processed payment;
7. renders either:
   - “Payment received”; or
   - “Payment is being processed.”

It performs a single server render.

It does not currently wait for the booking to move from `PAID` to `CONFIRMED`.

### Confirmation prototype

`src/components/BookingConfirmationPage.tsx` already contains a strong visual prototype for the intended confirmation screen.

It is not production-safe because booking details can currently be populated from URL parameters and fallback values such as:

```text
Sarah Jenkins
Thursday, 24 September 2026
14:00 - 14:55
£55.00
cs_live_...
```

It also contains development controls and claims for functionality that does not currently exist.

PR #15 should reuse/refactor the useful visual implementation rather than building an unrelated design, but all production content must be driven by real persisted state.

### Booking persistence

The existing `Booking` row contains the data required by this feature:

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
```

No new booking fields are required.

### Stripe webhook

The verified webhook remains the authority for payment.

Successful processing moves:

```text
HOLD → PAID
```

and stores the Stripe PaymentIntent ID.

Calendar finalisation subsequently moves:

```text
PAID → CONFIRMED
```

after persisting:

```text
calendarEventId
meetingUrl
```

### Google Calendar

PR #13 creates an event using persisted booking data.

The client email is included as:

```text
attendees: [
  { email: booking.email }
]
```

The Calendar insert requests:

```text
sendUpdates=all
```

Google therefore owns delivery of the normal Calendar attendee invitation.

PR #15 must not introduce a parallel invitation mechanism.

---

## External integrations affected

### Stripe

**Operation changed:**

Stripe Checkout's successful return URL changes from:

```text
/payment
```

to:

```text
/booking/success
```

with the existing correlation parameters:

```text
booking_id
session_id
```

The URL should remain generated server-side.

Example shape:

```text
/booking/success?booking_id=<booking UUID>&session_id={CHECKOUT_SESSION_ID}
```

#### Stripe behaviour that must remain unchanged

Do not change:

- payment amount;
- currency;
- payment methods;
- Checkout Session correlation;
- Checkout idempotency key;
- Checkout expiry;
- webhook signature verification;
- `checkout.session.completed` handling;
- PaymentIntent persistence;
- payment-state transitions.

The success page must not call Stripe to decide whether the booking is paid.

The persisted booking state remains authoritative.

### Google Calendar

No new Calendar operation should be introduced by the page.

Existing post-payment finalisation must continue to:

1. create the practitioner's Calendar event;
2. add `Booking.email` as the attendee;
3. request Google Meet conference creation;
4. call Calendar with `sendUpdates=all`;
5. persist Google's event ID;
6. persist Google's Meet URL;
7. move the booking to `CONFIRMED`.

The success page merely reads the result.

### Google Meet

No direct Meet API call is required.

Render the Google-provided URL already stored in:

```text
Booking.meetingUrl
```

### Email

No separate email provider is part of this PR.

The booking invitation requirement is satisfied through the existing Google Calendar attendee invitation.

Automated tests can prove that the application:

- supplies the correct persisted attendee email;
- requests `sendUpdates=all`.

Actual third-party mail delivery should be verified manually in an integration environment because delivery itself is controlled by Google and the recipient's mail provider.

---

## Configuration and data changes

### Environment variables

None.

Continue using the existing:

```text
APP_URL
DATABASE_URL
Stripe configuration
Google OAuth configuration
```

No new public environment variables are required.

### Database or schema

None.

Do not add fields merely for rendering the confirmation page.

### Webhooks

No new webhook endpoint.

No change to Stripe webhook authority.

The existing webhook must remain the only flow responsible for:

```text
HOLD → PAID → CONFIRMED
```

### OAuth and permissions

None.

Do not broaden Google Calendar scopes.

### Deployment configuration

None expected.

### Migration or backfill

None.

---

## Security and privacy considerations

The confirmation flow handles:

- client name;
- client email server-side;
- booking date/time;
- timezone;
- payment state;
- Stripe Checkout Session correlation;
- Google Calendar identifiers;
- Google Meet URL.

### Authoritative data

Only use the database for displayed booking details.

Do not trust query parameters such as:

```text
name
email
date
time
timezone
amount
meetingUrl
payment_success
success
format
```

The only expected query values are identifiers used to locate/correlate the persisted booking:

```text
booking_id
session_id
```

Those values identify what to query. They do not prove payment or confirmation.

### Booking/session correlation

Before returning any customer booking information:

1. validate `booking_id`;
2. validate `session_id`;
3. load the booking server-side;
4. require:

```text
booking.stripeCheckoutSessionId === session_id
```

If correlation fails, do not expose:

- whether the booking exists;
- the client's name;
- email;
- dates;
- payment identifiers;
- Calendar identifiers;
- Meet link.

Use one generic invalid/unverifiable state.

### Information minimisation

The confirmed UI does not need to expose:

```text
stripePaymentIntentId
calendarEventId
stripeCheckoutSessionId
```

Keep those server-side.

Do not reproduce the prototype's raw Stripe Session ID in the customer UI.

The page does not need to display the client's email merely to prove the Calendar invitation was sent.

### Meet link

Only expose the Meet link for a valid, correlated `CONFIRMED` booking.

Prefer reusing the existing Google Meet URL validator.

A malformed/non-Google `meetingUrl` must not be rendered as a clickable external link.

### Payment authority

The following must **not** produce the “£55 paid” confirmed screen by themselves:

```text
?payment_success=true
?success=true
?session_id=...
```

Only persisted lifecycle state can establish confirmation.

### External calls

Refreshing or polling `/booking/success` must be read-only.

It must never cause:

- another Stripe charge;
- another Checkout Session;
- another Calendar event;
- another Meet conference;
- another Calendar invitation.

---

## Required implementation

### 1. Change Stripe's success URL

Update `createBookingCheckout` so new Checkout Sessions return to:

```text
/booking/success
```

instead of:

```text
/payment
```

Preserve both existing correlation values:

```text
booking_id=<booking id>
session_id={CHECKOUT_SESSION_ID}
```

Do not encode user-controlled booking display data into the redirect URL.

Required shape:

```text
${APP_URL}/booking/success?booking_id=<booking UUID>&session_id={CHECKOUT_SESSION_ID}
```

Continue constructing the URL safely using `URL`.

Update the Stripe Checkout tests to assert the new return path.

### 2. Build `/booking/success`

Add:

```text
src/app/booking/success/page.tsx
```

The route must be dynamically rendered.

Do not allow payment/booking state to become stale through Next.js caching.

The route should:

1. parse `booking_id`;
2. parse `session_id`;
3. validate both;
4. query PostgreSQL server-side;
5. correlate the booking to the supplied Checkout Session ID;
6. determine the current lifecycle state;
7. render the correct customer state.

### 3. Keep booking-state retrieval server-side

Prefer a small server-only booking-success query/domain helper rather than embedding all validation and mapping directly inside JSX.

A suitable conceptual result is:

```ts
type BookingSuccessState =
  | { kind: "invalid" }
  | { kind: "confirming-payment" }
  | { kind: "finalising-booking" }
  | { kind: "confirmed"; booking: ConfirmedBookingView }
  | { kind: "inactive" }
  | { kind: "unavailable" };
```

Exact naming may follow repository conventions.

For a successful lookup, select only fields genuinely required by the flow.

For example:

```text
id
name
startAt
endAt
timezone
status
stripeCheckoutSessionId
stripePaymentIntentId
calendarEventId
meetingUrl
```

`email` may additionally be selected if required for server-side verification/tests, but do not expose it to the browser unnecessarily.

### 4. Map lifecycle states deliberately

#### `HOLD`

A Stripe redirect can reach the application before the webhook has committed payment.

Do not show the final confirmation.

Render a state equivalent to:

```text
Confirming your payment…
```

The customer should understand that the page is still working and should not restart Checkout.

#### `PAID`

The payment is confirmed, but Calendar/Meet finalisation has not completed.

Render a state equivalent to:

```text
Payment received.
We're preparing your calendar invitation and Google Meet link…
```

Do not display a fake Meet URL.

Do not create/reconcile the Calendar event from the browser or page request.

Webhook retry/reconciliation remains responsible for reaching `CONFIRMED`.

#### `CONFIRMED`

Only now render the final confirmation.

A valid confirmed view requires:

- status `CONFIRMED`;
- correlated Checkout Session;
- persisted Stripe payment state;
- persisted Calendar event ID;
- usable persisted Google Meet URL.

If a row says `CONFIRMED` but required finalisation data is malformed or missing, fail closed rather than rendering misleading success information.

#### `CANCELLED`

Do not show confirmed booking details.

Render an inactive/generic booking state.

#### `REFUNDED`

Do not expose the old Meet link as an active confirmed booking.

Render an inactive/generic booking state.

#### invalid or missing correlation

Render the same generic invalid confirmation-link state whether:

- the booking does not exist;
- the UUID is malformed;
- the Stripe Session format is malformed;
- the session does not belong to the booking.

Do not provide an enumeration oracle for booking IDs.

### 5. Automatically observe asynchronous confirmation

Stripe redirect and Stripe webhook delivery are asynchronous.

A normal customer must not be required to refresh manually.

Use a **narrow client-side revalidation component** around the otherwise server-rendered page.

Preferred behaviour:

```text
HOLD/PAID server render
      ↓
small client poller
      ↓
router.refresh()
      ↓
server re-queries PostgreSQL
      ↓
CONFIRMED props returned
      ↓
polling stops
```

The poller must not receive sensitive booking/payment data.

It only needs enough state to know whether revalidation should continue.

Recommended polling interval:

```text
approximately 1.5–2 seconds
```

Do not poll more aggressively without a demonstrated need.

Bound automatic polling to a reasonable period, for example approximately 60 seconds.

If the booking has not reached `CONFIRMED` within that period:

- stop rapid polling;
- keep the truthful current state visible;
- offer a manual “Check again” action or equivalent;
- do not tell the client payment failed merely because Calendar finalisation is delayed.

A page reload must safely resume from the persisted state.

### 6. Do not use the success page as reconciliation

The following architecture is explicitly prohibited:

```text
GET /booking/success
      ↓
call Stripe
      ↓
mark payment
      ↓
call Google Calendar
      ↓
confirm booking
```

The success page is only a projection of persisted booking state.

The existing webhook/reconciliation system remains the lifecycle owner.

### 7. Render real confirmed booking data

Once `CONFIRMED`, show the following.

#### Confirmation

Clearly indicate that the reservation is confirmed.

Preferred wording can follow the existing prototype, for example:

```text
Reservation confirmed & secured
```

and:

```text
Your conversation with Shahd Karaeen is reserved.
```

Avoid wording that implies therapeutic treatment.

#### Client name

Display:

```text
Booking.name
```

Do not read a client name from the URL.

#### Date

Derive the date from:

```text
Booking.startAt
```

using:

```text
Booking.timezone
```

A suitable UK display is:

```text
Thursday, 24 September 2026
```

Do not format using the web server's local timezone.

#### Start and end time

Derive from:

```text
Booking.startAt
Booking.endAt
Booking.timezone
```

A suitable display is:

```text
14:00–14:55
```

Do not reconstruct `endAt` in the browser from an assumed duration when the persisted end instant already exists.

#### Timezone

Show the booking's persisted timezone.

For example:

```text
Europe/London
```

A localized abbreviation such as `BST` or `GMT` may be shown additionally when derived correctly for the booking date.

Never hardcode:

```text
BST
```

because bookings may occur on either side of daylight-saving changes.

#### Duration

Display:

```text
55-minute session
```

using the canonical product definition.

Do not maintain a second independent duration constant solely for this UI.

#### Payment

Display:

```text
£55 paid
```

using the canonical product definition.

Do not accept an `amount` URL parameter.

Do not call Stripe merely to populate this label.

A `CONFIRMED` booking has already passed the webhook's £55 GBP validation.

#### Google Meet

Display a clear customer action such as:

```text
Join Google Meet
```

linked to:

```text
Booking.meetingUrl
```

The link must:

- be the persisted Google-generated URL;
- be a valid HTTPS `meet.google.com` URL;
- be keyboard accessible;
- make its destination/purpose clear;
- use safe external-link attributes where appropriate.

Do not generate a Meet URL locally.

### 8. Preserve the confirmation visual language

Refactor the useful parts of the existing:

```text
BookingConfirmationPage.tsx
```

rather than creating a visually unrelated page.

The confirmed screen should retain, where appropriate:

- terracotta success accent;
- circular confirmation icon;
- confirmation badge;
- editorial heading;
- personalized thank-you;
- structured session-information panel;
- quiet-note treatment;
- dark return-to-home button;
- existing typography and spacing language.

The layout in the existing component is a design reference, not a data/behaviour reference.

### 9. Remove prototype-only behaviour

The production component must not contain:

```text
URL Test Mode
Preset: Video Session
Preset: Phone Call
Copy Stripe URL
random booking IDs
fake Sarah Jenkins fallback
fake date fallback
fake Stripe Session fallback
payment_success URL flag
success URL flag
format URL flag
amount URL flag
```

Do not allow arbitrary URL parameters to alter what the confirmation says.

### 10. Remove unsupported confirmation claims

Unless another implementation in the repository actually provides them, do not render prototype copy claiming:

```text
Receipt emailed automatically
24-Hour Reminder
Shahd will send a quiet reminder
Flexible Rescheduling
```

Those are separate product features.

Do not make PR #15 larger by implementing them.

### 11. Calendar sync controls

A separate:

```text
Add to Google Calendar
```

link is not required in PR #15 because Google Calendar is already inviting the client as an attendee.

A browser-generated `.ics` implementation is also not required.

Do not retain prototype Calendar/ICS controls if they contain incomplete or fabricated event timestamps.

They can be implemented correctly in a later PR if required.

### 12. Google Calendar invitation

Preserve the PR #13 behaviour:

```text
attendees: [
  { email: booking.email }
]
```

and:

```text
sendUpdates=all
```

This is the mechanism by which the client's email address receives the Calendar invitation.

Do not use a URL-supplied email address.

Do not send the invitation before verified payment.

Do not send another invitation when the success page is refreshed.

### 13. Backwards compatibility for existing Checkout Sessions

Checkout Sessions created shortly before deployment may still contain the old:

```text
/payment
```

return URL.

Do not make those successful payments dead-end.

Prefer updating `/payment` into a thin compatibility path which preserves valid:

```text
booking_id
session_id
```

and redirects to:

```text
/booking/success
```

Alternatively, if retaining the existing `/payment` behaviour is demonstrably safer in the current architecture, document the reason.

Do not remove `/payment` in a way that breaks already-created open Checkout Sessions.

### 14. Date/time formatting

Use explicit `Booking.timezone` formatting.

Prefer deterministic server-side helpers using `Intl.DateTimeFormat`.

Tests must not depend on the CI host timezone.

At minimum verify a `Europe/London` example.

Where appropriate, cover dates on both sides of daylight-saving changes so the UI cannot permanently label London times as `BST`.

### 15. Accessibility

The page must:

- use a single meaningful `h1`;
- expose loading/finalisation status accessibly;
- use semantic links/buttons;
- give the Meet action an unambiguous accessible name;
- preserve visible keyboard focus;
- not communicate booking state through colour alone;
- maintain readable text contrast;
- work without hover interaction;
- avoid repeatedly stealing focus while polling.

Use an appropriate status/live region for the transition from finalising to confirmed if it improves the experience without causing noisy repeated announcements.

### 16. Responsive behaviour

The route must remain usable at:

- desktop widths;
- tablet widths;
- mobile widths.

On narrow screens:

- booking details should stack cleanly;
- long text must wrap safely;
- the Meet action must remain tappable;
- no horizontal scrolling should be introduced;
- dates/timezones must not overflow the confirmation card.

---

## External-service failure handling

### Stripe webhook has not arrived yet

Persisted state:

```text
HOLD
```

UI:

```text
Confirming payment…
```

Keep revalidating.

Do not report success or failure based on the redirect itself.

### Payment succeeded but Google Calendar is temporarily unavailable

Persisted state:

```text
PAID
```

UI:

```text
Payment received.
We're finalising your calendar invitation and Google Meet link.
```

The page continues observing persisted state.

Do not attempt a second Calendar implementation from the UI.

### Calendar event exists but conference finalisation is pending

Persisted state should remain:

```text
PAID
```

until the existing reconciliation system succeeds.

Do not show a fake or absent Meet link.

### Duplicate Stripe webhook

Existing webhook idempotency remains responsible.

The success page performs no mutation, so refreshing it cannot create duplication.

### Duplicate browser requests

Safe.

Repeated GET/render/revalidation operations must only read the existing booking.

### Database temporarily unavailable

Render a generic temporary-error state.

Do not expose raw Prisma/PostgreSQL errors.

Provide a safe retry/check-again action.

### Invalid Meet URL

Do not render it.

Do not silently link to an arbitrary host.

Treat the final display state as unavailable/inconsistent rather than showing a misleading confirmed screen.

---

## UI implementation requirements

The confirmation page is a material UI change.

### Confirming-payment state

Show a calm intermediary state.

It should communicate:

```text
Confirming your payment…
```

and avoid giving the impression that the customer needs to pay again.

### Finalising state

Show:

```text
Payment received
```

and explain that Calendar/Meet details are still being prepared.

Do not render blank information rows for data that is not ready.

### Confirmed state

The confirmed card must include all required information:

```text
Confirmation
Client name
Date
Start/end time
Timezone
55-minute session
£55 paid
Google Meet link
```

A booking reference may also be shown using the real booking ID if retained from the existing design.

### Invalid state

Use neutral wording such as:

```text
We couldn't verify this booking link.
```

Do not say:

```text
Booking <UUID> does not exist
```

or expose whether the booking/session mismatch is the cause.

### Inactive state

For correlated `CANCELLED` or `REFUNDED` rows, do not show the Meet link or active reservation confirmation.

### Prototype cleanup

The production UI must contain no developer testing toolbar.

No realistic-looking fake booking data may be used as a fallback.

Missing production data must produce a deliberate state instead.

### Visual regression

Add deterministic visual regression coverage for at least:

1. confirmed desktop state;
2. confirmed mobile state;
3. one pre-confirmation/finalising state where visually meaningful.

Snapshots must use deterministic:

- booking data;
- viewport;
- database state;
- time;
- animations;
- fonts;
- network behaviour.

Do not update snapshots blindly.

---

## Acceptance criteria

### Stripe return flow

- [ ] New Stripe Checkout Sessions return to `/booking/success`.
- [ ] The return URL contains the booking ID.
- [ ] The return URL contains Stripe's `{CHECKOUT_SESSION_ID}` placeholder.
- [ ] No display data such as name, price, date, timezone, or Meet URL is encoded into the success URL.
- [ ] Existing Checkout amount, currency, payment methods, expiry, metadata and idempotency behaviour remain unchanged.
- [ ] Existing open Checkout Sessions that still return to `/payment` are not unnecessarily broken.

### Booking correlation

- [ ] `booking_id` is validated server-side.
- [ ] `session_id` is validated server-side.
- [ ] The booking is queried from PostgreSQL.
- [ ] The supplied session must match `Booking.stripeCheckoutSessionId`.
- [ ] A mismatched session cannot reveal booking data.
- [ ] Missing/unknown/mismatched bookings use one generic customer-safe state.

### Lifecycle

- [ ] `HOLD` does not render a confirmed booking.
- [ ] `HOLD` communicates that payment confirmation is still pending.
- [ ] `PAID` does not render the final Meet link.
- [ ] `PAID` communicates that Calendar/Meet finalisation is still in progress.
- [ ] `CONFIRMED` renders the final booking.
- [ ] `CANCELLED` does not render an active confirmation.
- [ ] `REFUNDED` does not render an active confirmation.
- [ ] The success page never mutates the booking lifecycle.
- [ ] The success page never calls Stripe to establish payment status.
- [ ] The success page never creates or reconciles a Google event.
- [ ] Refreshing the page cannot create duplicate external side effects.

### Automatic transition

- [ ] A client redirected before webhook completion does not need to manually reload during the normal happy path.
- [ ] The UI automatically revalidates while the booking is `HOLD` or `PAID`.
- [ ] Revalidation stops after the booking becomes `CONFIRMED`.
- [ ] Automatic polling is bounded and does not continue indefinitely at high frequency.
- [ ] A safe manual check/retry remains possible after the automatic wait period.

### Confirmed booking details

For a `CONFIRMED` booking:

- [ ] The client's persisted name is displayed.
- [ ] The persisted booking date is displayed.
- [ ] The persisted start time is displayed.
- [ ] The persisted end time is displayed.
- [ ] Times are formatted in `Booking.timezone`.
- [ ] The timezone is displayed.
- [ ] The UI says `55-minute session`.
- [ ] The UI says `£55 paid`.
- [ ] Duration/price come from the canonical session product rather than URL parameters.
- [ ] A valid Google Meet link is displayed.
- [ ] The Meet link equals the persisted Google-generated `Booking.meetingUrl`.
- [ ] An arbitrary/non-Google URL cannot become the Join Meet action.
- [ ] Stripe/Calendar internal IDs are not exposed unnecessarily.

### Google Calendar invitation

- [ ] The Calendar event attendee is the persisted `Booking.email`.
- [ ] Event insertion requests `sendUpdates=all`.
- [ ] No browser-supplied email address can change the attendee.
- [ ] Refreshing `/booking/success` does not send another invitation.
- [ ] No second confirmation-email provider is introduced.
- [ ] Existing Calendar-event idempotency remains intact.

### Truthfulness

- [ ] URL values cannot override client name.
- [ ] URL values cannot override date or time.
- [ ] URL values cannot override timezone.
- [ ] URL values cannot override payment amount.
- [ ] URL values cannot provide the Meet link.
- [ ] `payment_success=true` cannot produce a confirmed screen.
- [ ] `success=true` cannot produce a confirmed screen.
- [ ] Prototype fake values have been removed from the production path.
- [ ] The UI does not promise a 24-hour reminder that has not been implemented.
- [ ] The UI does not promise automated rescheduling that has not been implemented.
- [ ] The UI does not claim a Stripe receipt has been emailed unless that behaviour is genuinely guaranteed elsewhere.

### UI

- [ ] The existing Re-Embroidered confirmation visual language is preserved.
- [ ] No developer/test toolbar appears.
- [ ] Desktop layout is correct.
- [ ] Mobile layout is correct.
- [ ] Keyboard interaction is functional.
- [ ] Meet CTA is accessible.
- [ ] Loading/finalising state is accessible.
- [ ] No horizontal overflow appears at supported mobile widths.
- [ ] Automated browser coverage exists for the success route.
- [ ] Visual regression coverage exists for the confirmed page.
- [ ] Functional assertions accompany screenshot assertions.

### Security/privacy

- [ ] Booking details are queried server-side.
- [ ] Sensitive integration logic remains server-side.
- [ ] No OAuth token is sent to the browser.
- [ ] No Stripe secret is sent to the browser.
- [ ] No PaymentIntent ID needs to be rendered.
- [ ] No Calendar event ID needs to be rendered.
- [ ] Database/provider failures do not expose raw implementation errors.
- [ ] The route is not cached in a way that could return one customer's status to another customer.

### Existing behaviour

- [ ] Booking holds remain unchanged.
- [ ] Availability remains unchanged.
- [ ] Stripe payment validation remains unchanged.
- [ ] Stripe webhook signature verification remains unchanged.
- [ ] `HOLD → PAID → CONFIRMED` behaviour remains unchanged.
- [ ] Google event/Meet idempotency remains unchanged.
- [ ] Confirmed bookings continue blocking availability.
- [ ] No schema migration is introduced.
- [ ] No unnecessary dependency is introduced.

---

## Tests to add or update

### Unit/domain tests

Add a focused test file, for example:

```text
tests/booking-success.test.mjs
```

Prefer testing a server/domain helper independently of React where practical.

Cover at least:

#### Invalid request

```text
invalid booking UUID
invalid Checkout Session ID
```

Result:

```text
invalid
```

and no booking details are returned.

#### Booking not found

Result:

```text
invalid
```

#### Session mismatch

Persisted:

```text
stripeCheckoutSessionId = cs_test_expected
```

Requested:

```text
cs_test_attacker
```

Result:

```text
invalid
```

Verify no client name/date/Meet URL is returned.

#### HOLD

Result:

```text
confirming-payment
```

#### PAID

Result:

```text
finalising-booking
```

#### CONFIRMED

Fixture should contain:

```text
status: CONFIRMED
stripeCheckoutSessionId
stripePaymentIntentId
calendarEventId
meetingUrl
```

Result must expose only the presentation data required by the customer page.

#### CONFIRMED with missing Meet URL

Must fail closed.

#### CONFIRMED with malformed Meet URL

Must fail closed.

#### CANCELLED

Must not return an active confirmed view.

#### REFUNDED

Must not return an active confirmed view.

#### Time formatting

Verify date/time rendering uses the booking timezone rather than process-local timezone.

Where a formatting helper is introduced, include a London daylight-saving example.

### Stripe Checkout tests

Update:

```text
tests/stripe-checkout.test.mjs
```

The Checkout test must assert the new `success_url`.

Expected route:

```text
/booking/success
```

It must contain:

```text
booking_id=<booking id>
session_id={CHECKOUT_SESSION_ID}
```

Also assert that the existing Checkout configuration remains unchanged:

```text
£55
GBP
card payment
customer email
booking metadata
payment_intent metadata
idempotency key
expiry
```

### Google Calendar invitation regression tests

Use/update:

```text
tests/google-calendar-event.test.mjs
```

Retain explicit coverage proving:

```text
buildBookingCalendarEvent(...)
```

sets:

```text
attendees: [
  { email: booking.email }
]
```

and that:

```text
insertGoogleCalendarEvent(...)
```

uses:

```text
sendUpdates=all
```

If the existing assertions already prove both behaviours clearly, avoid duplicating equivalent tests merely to increase test count.

The requirement is regression protection, not redundant coverage.

### Existing lifecycle test

Do not duplicate PR #14.

The existing PostgreSQL happy-path test already proves:

```text
HOLD
→ Checkout attached
→ PAID
→ CONFIRMED
→ stripePaymentIntentId
→ calendarEventId
→ meetingUrl
→ slot remains blocked
```

PR #15 tests should connect the **customer confirmation view** to that persisted final state rather than recreating the lifecycle test.

### Browser tests

Add a focused Playwright file:

```text
tests/browser/booking-success.spec.ts
```

Prefer real deterministic PostgreSQL fixture rows over adding a production test-only HTTP endpoint.

The browser test process may establish/clean deterministic database rows using existing repository test patterns.

#### Confirmed booking

Seed a correlated booking such as:

```text
name: Sarah Jenkins
startAt: 2026-09-24T13:00:00.000Z
endAt: 2026-09-24T13:55:00.000Z
timezone: Europe/London
status: CONFIRMED
stripeCheckoutSessionId: cs_test_confirmation
stripePaymentIntentId: pi_test_confirmation
calendarEventId: rec...
meetingUrl: https://meet.google.com/abc-defg-hij
```

Navigate to:

```text
/booking/success?booking_id=<id>&session_id=cs_test_confirmation
```

Assert visible:

```text
Sarah Jenkins
Thursday, 24 September 2026
14:00
14:55
Europe/London
55-minute session
£55 paid
Join Google Meet
```

Assert the Meet action points to:

```text
https://meet.google.com/abc-defg-hij
```

Do not assert hardcoded `BST` unless it has been correctly derived from that date.

#### Session mismatch

Navigate using the real booking ID but a different Checkout Session ID.

Assert:

- generic invalid state is visible;
- client name is absent;
- date is absent;
- Meet URL is absent.

#### PAID → CONFIRMED transition

1. Seed the booking as `PAID`.
2. Open `/booking/success`.
3. Assert finalisation state.
4. From the test process, update the same row to `CONFIRMED` and add:
   - `calendarEventId`;
   - `meetingUrl`.
5. Assert that the browser automatically transitions to the confirmed screen without `page.reload()`.

This proves the actual asynchronous customer journey.

#### Mobile

Render the confirmed state at a deterministic mobile viewport.

Assert:

- required content remains visible;
- no horizontal overflow;
- Meet CTA is usable.

### Visual regression tests

Capture deterministic screenshots for:

```text
booking-success-confirmed-desktop
booking-success-confirmed-mobile
```

Optionally include:

```text
booking-success-finalising
```

if the intermediate state has meaningful custom presentation.

The existing `BookingConfirmationPage.tsx` should be the visual baseline for intent, but the production screenshot must not include:

```text
URL Test Mode
fake Stripe ID
unsupported reminders
unsupported rescheduling claims
prototype-only Calendar controls
```

---

## Manual acceptance test

Use a real test booking through the browser.

### Preconditions

- Stripe test mode is configured.
- Stripe webhook forwarding/deployment endpoint is working.
- Practitioner Google Calendar is connected.
- Calendar connection has the scope required by PR #13.
- Use a client email address whose inbox/calendar can be checked.

### Steps

1. Open the booking UI.
2. Select an available session.
3. Enter the client's real test name and email.
4. Click the single Book & Pay action.
5. Complete the £55 Stripe test Checkout.
6. Observe the browser return.

Expected initial URL:

```text
/booking/success?booking_id=...&session_id=...
```

7. If the webhook has not completed yet, verify the page briefly shows a payment/finalisation state.
8. Do not manually reload.
9. Wait for the page to transition to confirmed.

### Confirmed page acceptance

Verify the page shows the persisted:

```text
client name
date
start time
end time
timezone
55-minute session
£55 paid
Google Meet link
```

Verify the Meet link opens the Google-generated meeting.

### Database acceptance

Inspect the corresponding booking row.

Expected:

```text
status = CONFIRMED
stripeCheckoutSessionId != null
stripePaymentIntentId != null
calendarEventId != null
meetingUrl = displayed Google Meet URL
```

### Google Calendar acceptance

Verify exactly one event exists in the practitioner's configured calendar.

Verify:

- its time matches the booking;
- the client email is an attendee;
- the event contains the Google Meet conference;
- the Meet URL matches the booking row and success page.

### Client invitation acceptance

Check the client email/calendar.

Verify Google's Calendar invitation reaches the client and contains:

- the correct date/time;
- the Calendar event;
- the Google Meet conference link.

Actual email delivery is a manual integration check; automated tests should verify the application sent the correct Calendar API request.

### Refresh acceptance

Refresh `/booking/success`.

Verify:

- confirmation remains correct;
- no second charge is made;
- no second Calendar event is created;
- no second Meet conference is created;
- no duplicate booking is created.

### Tampering acceptance

Change only the `session_id` in the URL.

Verify:

- the client's booking details disappear;
- the Meet link is not exposed;
- the page returns a generic unverifiable-booking state.

---

## Verification commands

Codex must run the repository's established commands.

```bash
# Install dependencies
npm ci

# Apply migrations when using a clean local test database
npm run db:migrate:deploy

# Validate Prisma
npm run db:validate

# Type checking
npm run lint

# Full Node test suite
npm test

# Targeted booking confirmation tests
node --conditions=react-server --experimental-test-module-mocks --test tests/booking-success.test.mjs

# Relevant Stripe regression
node --conditions=react-server --experimental-test-module-mocks --test tests/stripe-checkout.test.mjs

# Relevant Calendar invitation regression
node --conditions=react-server --experimental-test-module-mocks --test tests/google-calendar-event.test.mjs

# Production build
npm run build

# Focused Playwright coverage
npm run test:browser -- tests/browser/booking-success.spec.ts

# Full browser suite
npm run test:browser
```

If a new Node test filename differs from the suggested one, run the actual file instead.

Do not invent a separate `typecheck` command; the repository currently uses:

```text
npm run lint
```

for `tsc --noEmit`.

Visual snapshots may be intentionally generated/updated while implementing the new route, but final verification must run them normally without blindly accepting changes.

If a command cannot run in the available environment, document:

1. the exact command;
2. why it could not run;
3. what was verified instead.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- new `/booking/success` route;
- server-side booking/session correlation;
- asynchronous `HOLD` / `PAID` / `CONFIRMED` presentation;
- confirmed booking rendering;
- Stripe Checkout success URL change;
- reuse/refactor of the existing confirmation design;
- backwards compatibility handling for `/payment`;
- Calendar invitation regression protection.

### Tests

List:

- booking-success domain tests added;
- Stripe Checkout tests updated;
- Calendar invitation tests added/updated if necessary;
- Playwright functional coverage;
- visual snapshots;
- all verification commands run;
- results.

### External configuration

Expected:

```text
None
```

PR #15 should reuse the existing Stripe and Google Calendar configuration.

### Deviations

Describe any meaningful deviation from this specification and why it was necessary.

Use:

```text
None
```

when there were no deviations.

### Remaining issues

Do not list the following as completed by this PR unless separately implemented:

- 24-hour reminders;
- rescheduling;
- separate confirmation emails;
- cancellation;
- refunds;
- manual `.ics` downloads.

Use:

```text
None
```

if the defined PR #15 scope is fully complete.
