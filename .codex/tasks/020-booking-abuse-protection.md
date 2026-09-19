# PR #20 — Protect booking availability from automated exhaustion

## Repository state

**Expected branch:**  
`fix/020-booking-abuse-protection`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**

- Existing public availability API
- Existing temporary booking `HOLD` lifecycle
- Existing automatic Stripe Checkout transition
- Existing Stripe webhook processing
- Existing PostgreSQL booking persistence
- Existing Google Calendar FreeBusy integration
- Existing Playwright infrastructure
- A production-safe shared rate-limit/abuse-protection store or deployment-native equivalent
- Cloudflare Turnstile configuration for production

PR #19 — Reliability + E2E tests is not a hard functional dependency.

If PR #19 lands first, its reliability guarantees must remain valid, especially:

- fresh availability revalidation when a HOLD is created;
- provider Calendar changes between display and HOLD submission;
- ordinary versus Checkout-backed hold expiry;
- duplicate Stripe webhook handling.

### Read first

Before making changes, read:

- `AGENTS.md`
- nearest scoped `AGENTS.md`, when one exists
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/006-unified-availability-engine.md`
- `.codex/tasks/008-stripe-checkout.md`
- `.codex/tasks/019-booking-reliability-e2e.md`
- `package.json`
- `.env.example`
- `.github/workflows/ci.yml`
- `prisma/schema.prisma`
- relevant Prisma migrations
- `src/app/api/availability/route.ts`
- `src/app/api/bookings/hold/route.ts`
- `src/app/api/bookings/checkout/route.ts`
- `src/hooks/useAvailability.ts`
- `src/components/BookingSection.tsx`
- `src/lib/availability/availability-handler.ts`
- `src/lib/availability/available-slots.mjs`
- `src/lib/availability/booking-conflicts.mjs`
- `src/lib/booking/booking-hold.mjs`
- `src/lib/booking/booking-hold-handler.ts`
- `src/lib/booking/stripe-checkout.mjs`
- `src/lib/booking/stripe-checkout-handler.ts`
- `src/lib/booking/stripe-webhook.mjs`
- `src/lib/calendar/busy-periods.mjs`
- existing availability, hold, Checkout, webhook, database, and browser tests

### Primary change area

Abuse protection for the public booking flow:

```text
GET /api/availability
        ↓
POST /api/bookings/hold
        ↓
POST /api/bookings/checkout
```

The goal is to prevent an automated client from deliberately exhausting booking capacity or turning public routes into amplifiers for Google Calendar or Stripe API traffic.

### Canonical implementation examples

Follow the repository's existing patterns for:

- thin Next.js route modules;
- separately testable route handlers;
- dependency injection around external services;
- stable customer-safe API error responses;
- server-only privileged logic;
- deterministic Node tests;
- real PostgreSQL tests where persistence guarantees are involved.

Relevant examples:

```text
src/lib/booking/booking-hold-handler.ts
src/lib/booking/booking-hold.mjs
src/lib/booking/stripe-checkout-handler.ts
src/lib/booking/stripe-checkout.mjs
src/lib/availability/availability-handler.ts
src/lib/calendar/busy-periods.mjs

tests/booking-hold-route.test.mjs
tests/booking-hold-database.test.mjs
tests/stripe-checkout-route.test.mjs
tests/availability-route.test.mjs
tests/browser/migration-smoke.spec.ts
```

### Relevant symbols

Inspect and preserve the behaviour of:

```text
createBookingHold
createHoldPersistence
BOOKING_HOLD_MINUTES
SlotUnavailableError
HoldAvailabilityError

createBookingCheckout
createCheckoutPersistence
STRIPE_CHECKOUT_MINUTES

processStripeWebhookEvent
createStripeWebhookPersistence

getAvailableSlots
getActiveBookingConflicts
createAvailabilityHandler

getBusyPeriods
refreshGoogleAccessToken
queryGoogleFreeBusy

useAvailability
BookingSection
```

### Expected change surface

Expected primary areas include:

```text
.env.example
package.json                         # only if a genuinely required dependency is added
package-lock.json

src/app/api/availability/**
src/app/api/bookings/hold/**
src/app/api/bookings/checkout/**

src/lib/security/**                  # or equivalent existing server-only location
src/lib/availability/**
src/lib/booking/**
src/lib/calendar/**

src/components/BookingSection.tsx
src/types.ts

tests/availability-route.test.mjs
tests/booking-hold-route.test.mjs
tests/booking-hold.test.mjs
tests/booking-hold-database.test.mjs
tests/stripe-checkout-route.test.mjs
tests/stripe-checkout.test.mjs
tests/stripe-webhook.test.mjs
tests/unified-availability.test.mjs

tests/browser/migration-smoke.spec.ts
```

A focused new abuse-protection test file is expected where useful, for example:

```text
tests/booking-abuse-protection.test.mjs
```

A small Google busy-time cache test file may also be appropriate.

### Excluded areas

Do not use this PR to:

- redesign the booking flow;
- introduce customer accounts;
- require email verification before every booking;
- change session price or duration;
- change the 15-minute ordinary HOLD lifetime;
- change the 31-minute Stripe Checkout lifetime;
- modify Google Calendar OAuth scopes;
- alter payment authority;
- alter cancellation or refund policy;
- alter rescheduling semantics;
- replace Stripe Checkout;
- replace Google Calendar;
- add speculative device fingerprinting;
- block Tor/VPN users solely because of network classification;
- create a general-purpose application authentication system;
- add an unrelated CDN/WAF migration.

### Unknowns Codex must verify

Before implementation, establish:

1. Which hosting/deployment platform is authoritative in production.
2. Which request header from that platform can be trusted as the client network address.
3. Whether the deployment already provides a shared rate-limit or key-value service.
4. Whether an existing deployment-native abuse-control mechanism can satisfy the requirements without adding another provider.
5. Whether the selected shared rate-limit store supports atomic counters/leases with TTL.
6. Whether production traffic passes through a proxy/CDN which normalizes forwarding headers.
7. Whether the current Privacy Notice requires an update for the selected bot-challenge integration.

Do not use a process-local JavaScript `Map` as the sole production rate limiter.

---

## Objective

Prevent automated clients from deliberately consuming all customer-visible booking availability or repeatedly triggering expensive Google Calendar and Stripe operations through the public booking APIs.

The system must ensure that:

- one client cannot create an unlimited number of simultaneous unpaid booking holds;
- scripted HOLD creation is gated by lightweight human/bot verification;
- `/api/bookings/hold` has a substantially stricter request policy than ordinary read traffic;
- `/api/bookings/checkout` cannot be used to produce unrestricted Stripe API traffic;
- `/api/availability` remains public but has a more generous rate limit;
- repeated availability reads do not unnecessarily perform identical Google token refresh + FreeBusy requests;
- rate-limit and challenge checks happen before expensive third-party operations;
- private provider Calendar information remains private;
- legitimate booking retries remain usable;
- the existing database uniqueness protection against two customers owning one slot remains unchanged;
- hold-time Calendar validation remains fresh and authoritative.

Completion means a single automated client can no longer continuously enumerate the booking horizon, reserve every slot with disposable identities, allow those holds to expire, and immediately repeat the process without encountering independent abuse controls.

---

## Current architecture and vulnerability

### Public HOLD creation

`POST /api/bookings/hold` is currently unauthenticated.

`createBookingHold` validates only:

```text
name
email syntax
startAt
```

It then calls the unified availability engine.

If the selected slot is available it persists a blocking `HOLD` for:

```text
15 minutes
```

The existing PostgreSQL partial unique index:

```text
bookings_active_start_at_key
```

correctly prevents two active booking rows from owning the same `startAt`.

That protects booking consistency.

It does **not** protect booking capacity from deliberate exhaustion.

An automated client can currently:

```text
GET /api/availability
        ↓
collect every available startAt
        ↓
POST /api/bookings/hold repeatedly
        ↓
create fake 15-minute HOLDs
        ↓
wait for expiry
        ↓
repeat
```

Changing names or syntactically valid email addresses is sufficient.

There is currently no:

- per-client request limit;
- active-HOLD quota;
- human/bot verification;
- account verification;
- proof-of-work;
- equivalent admission control.

### Availability amplification

The booking UI currently requests:

```text
GET /api/availability
```

without a date range.

The server expands that to the complete configured booking horizon.

`getAvailableSlots()` then calls Google busy-time lookup.

The Google path currently:

1. loads stored Google credentials;
2. loads OAuth configuration;
3. refreshes an access token;
4. calls Google Calendar FreeBusy.

This occurs for each uncached availability calculation.

Therefore repeated public availability requests can generate repeated third-party Google API traffic even when the resulting calendar information has not changed.

### Checkout amplification

`POST /api/bookings/checkout` is also public.

The booking UUID provides correlation and Stripe idempotency already prevents duplicate Checkout creation for the same booking.

However repeated requests may still trigger Stripe operations such as:

```text
checkout.sessions.create
checkout.sessions.retrieve
checkout.sessions.expire
```

The endpoint therefore also needs request controls even though its payment idempotency is already correct.

---

## Security rationale

This task addresses two related OWASP API Security risks:

### API4:2023 — Unrestricted Resource Consumption

The public APIs can cause application, database, Google, and Stripe work.

Controls must therefore limit how often expensive operations can be requested.

### API6:2023 — Unrestricted Access to Sensitive Business Flows

The booking reservation flow itself is commercially sensitive.

Automating reservation of all available slots can deny legitimate customers access even when the application remains technically healthy.

Rate limiting alone is not sufficient protection for this case.

Use defense in depth.

---

## Required protection model

Implement these layers together:

```text
                 ┌────────────────────┐
request ────────▶│ client rate limit  │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
HOLD only ──────▶│ bot verification   │
                 └─────────┬──────────┘
                           │
                           ▼
                 ┌────────────────────┐
HOLD only ──────▶│ active-HOLD quota  │
                 └─────────┬──────────┘
                           │
                           ▼
                 existing booking logic
                           │
                           ▼
               Google / PostgreSQL / Stripe
```

A failure at an earlier protection layer must prevent unnecessary execution of later expensive layers.

---

## 1. Shared request rate limiting

Introduce one server-only abuse-protection abstraction rather than implementing unrelated counters independently inside each route.

The abstraction must be dependency-injectable for tests.

Example conceptual operations:

```text
consumeRateLimit(policy, clientKey)
acquireActiveHoldPermit(clientKey)
releaseActiveHoldPermit(...)
extendActiveHoldPermit(...)
```

Exact names may follow repository conventions.

### Production requirement

Rate-limit state must be shared between application instances.

Do not rely solely on:

```js
new Map();
```

or another process-local memory cache for enforcement.

A process-local cache may still be used as an optimization where correctness and abuse protection do not depend on it.

If the deployment platform already provides an appropriate shared limiter, prefer it.

Otherwise use the smallest production-appropriate shared store supported by the deployment.

### Client identity

Rate limiting must be based on a server-derived network/client identity.

Codex must first verify which forwarding/client-IP header is authoritative for the production hosting platform.

Do not blindly trust arbitrary caller-supplied forwarding headers.

Do not use:

- customer name;
- arbitrary request body IDs;
- a caller-supplied `clientId`

as the sole network rate-limit identity.

If the identity is persisted or sent to a third-party rate-limit store, use a keyed digest/HMAC rather than storing the raw IP address where practical.

Do not log raw client IP addresses merely for this feature.

### Initial policies

Implement these initial server-side defaults:

| Operation                   | Limit                                 |
| --------------------------- | ------------------------------------- |
| Availability                | 60 requests per 5 minutes per client  |
| Create HOLD                 | 10 attempts per 15 minutes per client |
| Checkout                    | 10 attempts per 15 minutes per client |
| Checkout for one booking ID | 4 attempts per 5 minutes              |

Keep policies centralized.

Do not scatter numeric thresholds through route handlers.

Changing these values later must require editing one server-owned configuration location.

### Limit response

When a request exceeds its limit, return:

```http
429 Too Many Requests
```

with:

```text
Retry-After
```

and a stable customer-safe error body.

Example semantic error:

```json
{
  "error": {
    "code": "rate_limited",
    "message": "Too many requests. Please try again shortly."
  }
}
```

The precise message may follow existing repository tone.

Do not expose:

- hashed client keys;
- rate-limit store keys;
- internal counters;
- provider errors.

---

## 2. Maximum active unpaid HOLDs per client

Rate limiting only limits request frequency.

It does not prevent a slow script from creating one HOLD at a time until every future slot is unavailable.

Add an independent active-HOLD quota.

### Required policy

One client may own at most:

```text
2 unresolved public booking HOLDs
```

at one time.

This applies only to ordinary customer booking holds created through the public booking flow.

Do not count:

- `PAID`
- `CONFIRMED`
- `CANCELLED`
- `REFUNDED`

bookings.

Do not accidentally apply this quota to the linked internal rescheduling HOLD flow.

### What counts as an unresolved HOLD

Count:

#### Ordinary HOLD

```text
status = HOLD
stripeCheckoutSessionId = null
rescheduleSourceBookingId = null
expiresAt > now
```

#### Checkout-backed HOLD

A Checkout-backed `HOLD` remains unresolved while Stripe can still authoritatively resolve it.

Its active-HOLD admission record must therefore remain active until the corresponding Checkout outcome resolves or its admission lease safely expires according to the Checkout lifecycle.

Do not release the abuse-control quota merely because the original 15-minute HOLD timestamp elapsed after Checkout had already been attached.

This must remain consistent with the existing booking ownership rules.

### Atomicity

Quota acquisition must be atomic.

Two simultaneous requests from one client must not both observe:

```text
active holds = 1
```

and then create two additional holds when the maximum is 2.

The abuse-control store must provide an atomic permit/lease operation or an equivalent safe mechanism.

### Failure safety

A failure while acquiring or committing the active-HOLD permit must not leave an untracked blocking HOLD behind.

If the protection store cannot establish the admission state safely:

- do not persist the HOLD; or
- compensate immediately so the newly created HOLD does not remain active.

Return a safe service-unavailable response.

---

## 3. Lightweight bot verification before creating a HOLD

Use Cloudflare Turnstile in managed mode as the bot challenge for the public booking form.

The challenge should protect:

```text
POST /api/bookings/hold
```

It does not need to protect ordinary browsing of:

```text
GET /api/availability
```

### Client behaviour

The booking form must obtain a challenge token before attempting HOLD creation.

Send the token with the HOLD request.

Example conceptual input:

```json
{
  "name": "Sarah",
  "email": "sarah@example.com",
  "startAt": "2026-10-01T09:00:00.000Z",
  "challengeToken": "..."
}
```

Do not persist the challenge token.

Do not include it in logs.

Do not send it to Stripe or Google.

### Server validation

The challenge must be validated server-side before:

- Calendar FreeBusy lookup;
- HOLD persistence.

Validate the expected Turnstile action, for example:

```text
booking_hold
```

and validate the expected production hostname where supported.

A client-side widget success callback alone is not sufficient.

### Order of operations

The HOLD route should conceptually execute:

```text
parse request
    ↓
client rate limit
    ↓
Turnstile validation
    ↓
active-HOLD permit
    ↓
existing createBookingHold()
    ↓
fresh availability / Google check
    ↓
PostgreSQL HOLD
```

The client rate limit must occur **before** Turnstile server verification so that Turnstile itself does not become another unrestricted third-party amplification endpoint.

### Verification failure

An invalid, expired, duplicate, wrong-hostname, or wrong-action challenge must:

- create no HOLD;
- call no Google FreeBusy operation;
- return a stable customer-safe error;
- cause the browser challenge to reset so the customer can retry.

Use an intentional error such as:

```text
verification_failed
```

Do not expose raw Turnstile error details.

### Provider failure

If challenge verification is temporarily unavailable:

- fail closed for HOLD creation;
- create no HOLD;
- call no Google Calendar API;
- return a safe `503` response.

Do not silently bypass verification because the challenge provider is unavailable.

### Testability

Unit and route tests must inject a deterministic challenge verifier.

Automated tests must not require a live challenge to solve.

Do not introduce a production environment variable that globally disables verification.

---

## 4. Availability endpoint protection

`GET /api/availability` must remain publicly accessible.

It should not require Turnstile.

Apply the more generous availability rate limit defined above.

The limit must be checked before invoking the availability service.

A limited request must therefore cause:

```text
0 Google token refreshes
0 Google FreeBusy calls
```

---

## 5. Cache repeated Google busy-time reads

Reduce Google Calendar amplification independently from request rate limiting.

### Cache only the expensive Calendar boundary

Do not blindly cache the complete customer availability response.

The availability result also depends on current PostgreSQL booking conflicts, including newly created HOLDs.

Instead, cache the Google Calendar busy-period result used for public availability browsing.

Conceptually:

```text
candidate slots
       +
current PostgreSQL booking conflicts   ← always fresh
       +
short-lived cached Google busy periods
       ↓
customer availability
```

### Cache lifetime

Use an initial TTL of:

```text
30 seconds
```

Keep the TTL in one server-owned configuration location.

### Cache key

The cache key must distinguish the requested absolute Calendar range and any provider/calendar identity required for correctness.

Do not allow arbitrary unbounded user strings to become unlimited cache keys.

The existing server-side date-range validation remains authoritative.

### Single-flight behaviour

Concurrent public requests for the same uncached Calendar range must be coalesced where practical.

Example:

```text
request A ─┐
request B ─┼─ same range ──▶ one Google FreeBusy operation
request C ─┘
```

The callers may await the same in-flight result.

Do not perform three identical Google token refresh + FreeBusy operations merely because the requests arrived simultaneously.

### Cache successful results only

Do not retain long-lived cached results for:

- Google authorization failure;
- revoked credentials;
- malformed provider responses;
- unexpected provider errors.

A cache implementation may briefly coalesce the same failing in-flight request, but it must not hide recovery after Google access is repaired.

---

## 6. HOLD creation must bypass browse-time Calendar caching

This is a critical correctness requirement.

The existing HOLD workflow performs server-side availability revalidation immediately before reserving the slot.

That revalidation must continue to use a **fresh Google Calendar busy-time lookup**.

Do not allow the 30-second public availability cache to be reused as authoritative proof when creating a HOLD.

Required scenario:

```text
customer GET /api/availability
        ↓
10 seconds pass
        ↓
provider adds Google Calendar event
        ↓
customer POST /api/bookings/hold
        ↓
fresh Google FreeBusy lookup
        ↓
slot rejected
```

The HOLD request must fail with the existing slot-unavailable behaviour.

No HOLD may be persisted.

This requirement preserves the stale-calendar race protection required by PR #19.

---

## 7. Local booking conflicts must remain immediately visible

The Google cache must not cache PostgreSQL booking ownership.

Scenario:

```text
request A reads availability
        ↓
customer creates HOLD
        ↓
request B reads availability within Google cache TTL
```

Request B must immediately observe the new database HOLD as blocking.

It may reuse the cached Google busy periods.

It must not reuse stale database booking conflicts.

---

## 8. Checkout endpoint protection

Apply rate limiting to:

```text
POST /api/bookings/checkout
```

before invoking Stripe.

Use both:

```text
per-client limit
per-booking-ID limit
```

This protects against repeated Stripe Session create/retrieve operations.

### Preserve existing Stripe behaviour

Do not change:

- existing booking UUID validation;
- `booking-checkout:<booking.id>` Stripe idempotency;
- reuse of an existing open Checkout Session;
- payment amount;
- currency;
- webhook payment authority;
- Checkout expiry behaviour.

Rate limiting is an admission control in front of the existing Checkout implementation.

### Limited Checkout request

A limited request must cause:

```text
0 Stripe API calls
```

and must not:

- cancel the existing HOLD;
- change booking status;
- create a second Checkout Session.

The UI should preserve the customer's existing HOLD and allow retry after the limit resets.

---

## 9. Active-HOLD lifecycle integration

The abuse-control lease associated with a successful HOLD must track the meaningful unpaid lifecycle.

### Ordinary HOLD

For an ordinary HOLD:

```text
HOLD created
    ↓
15-minute expiry
    ↓
permit naturally expires/releases
```

### Checkout-backed HOLD

When a Stripe Checkout Session is successfully attached:

```text
HOLD
    ↓
Checkout Session attached
    ↓
extend admission lease to cover Checkout expiry
```

The current Checkout lifetime is approximately 31 minutes.

### Successful payment

Once the booking has authoritatively left `HOLD` and become:

```text
PAID
```

the active-HOLD permit may be released.

A customer who has paid must not continue consuming the unpaid-HOLD quota.

### Checkout expiry

After authoritative:

```text
checkout.session.expired
```

transitions the booking out of `HOLD`, release the corresponding active-HOLD permit.

### Abuse-store cleanup failure

Failure to release an abuse-control permit after the booking has authoritatively transitioned must not undo payment or booking state.

Permit release may be retried or allowed to expire naturally.

Do not make Stripe webhook success depend on a non-critical quota cleanup operation.

---

## 10. Protection-layer failure behaviour

Explicitly distinguish business-system failure from protection-system failure.

### Rate-limit store unavailable

For:

```text
POST /api/bookings/hold
POST /api/bookings/checkout
```

fail closed.

Do not continue to Turnstile, Google, or Stripe.

Return a safe `503`.

For:

```text
GET /api/availability
```

do not bypass the limiter and generate unrestricted Google traffic.

Return a safe `503` unless the selected implementation can safely answer entirely from an already-valid protected cache without causing new expensive external work.

### Turnstile unavailable

Return a safe `503`.

Do not create a HOLD.

### Google busy cache unavailable

The cache is an optimization rather than the security boundary.

If:

- the rate-limit check passed; and
- the cache itself fails;

the availability calculation may fall back to the existing fresh Google Calendar path.

Log the cache-layer failure safely.

### Rate limit exceeded

Return `429`.

Do not convert it to a generic `500`.

---

## API response behaviour

Add stable protection errors.

Expected semantic categories:

```text
rate_limited
verification_failed
verification_unavailable
abuse_protection_unavailable
active_hold_limit
```

Exact naming may follow existing conventions.

### HOLD

Existing responses remain valid:

```text
201 success
400 invalid_hold_request
409 slot_unavailable
503 hold_unavailable
500 hold_failed
```

Add intentional protection responses rather than collapsing them into existing persistence errors.

### Checkout

Existing responses remain valid:

```text
200 success
400 invalid_checkout_request
409 hold_unavailable
503 checkout_unavailable
```

Add `429` without changing existing payment semantics.

### Availability

Existing:

```text
200
400 invalid_date_range
503 availability_unavailable
```

Add `429`.

All responses must remain customer-safe.

---

## External integrations affected

### Google Calendar

Operation affected:

```text
FreeBusy availability lookup
```

Change:

- public browse-time calls may reuse a short-lived cached busy-period result;
- HOLD-time revalidation must continue to bypass that cache.

Authentication:

- unchanged.

OAuth scopes:

- unchanged.

Token storage:

- unchanged.

Event creation:

- unchanged.

### Stripe

Operation affected:

```text
Checkout Session create/retrieve
```

Change:

- request admission is rate limited before Stripe is called.

Payment amount:

```text
£55 GBP
```

unchanged.

Webhook authority:

- unchanged.

Idempotency:

- unchanged.

### Cloudflare Turnstile

New integration.

Purpose:

- lightweight bot/human verification before public HOLD creation.

Client:

- obtains challenge token.

Server:

- performs authoritative token validation.

The secret must remain server-side.

No challenge token may be persisted with the booking.

---

## Configuration and data changes

### Environment variables

Expected new configuration:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
```

#### `NEXT_PUBLIC_TURNSTILE_SITE_KEY`

- public/client-visible;
- required in production;
- contains only the public widget site key.

#### `TURNSTILE_SECRET_KEY`

- server-only;
- required in production;
- must never be exposed through `NEXT_PUBLIC_*`.

If a keyed digest is required for anonymising rate-limit identities, add a dedicated high-entropy server-only secret rather than reusing unrelated booking, Google, or admin secrets.

If a shared rate-limit provider requires credentials, use provider-specific **server-only** environment variables and document them in `.env.example`.

Do not invent deployment-provider credentials until the production deployment architecture has been verified.

### Database or schema

No change to the `Booking` business model is expected merely to implement request throttling.

Prefer keeping abuse-control state outside permanent booking/customer data.

If the selected production-safe shared limiter requires a database-backed table because no suitable deployment-native/shared store exists, Codex must document why before adding a migration.

Do not store raw client IP addresses on `Booking`.

### Webhooks

Stripe event types remain:

```text
checkout.session.completed
checkout.session.expired
```

No new Stripe webhook event is required.

It is acceptable to add best-effort active-HOLD permit cleanup after the booking has authoritatively left `HOLD`.

Quota cleanup failure must not invalidate successful Stripe reconciliation.

### OAuth and permissions

None.

Do not broaden Google Calendar OAuth scopes.

### Deployment configuration

Production requires:

- Turnstile widget/site configuration;
- Turnstile secret configuration;
- confirmation of the authoritative trusted client-IP header;
- shared rate-limit/lease storage where the deployment does not already provide it.

### Migration or backfill

No booking-data backfill is expected.

---

## Security and privacy considerations

This feature processes or derives information from:

- customer name;
- customer email;
- booking time;
- client network identity;
- Turnstile challenge tokens;
- Google Calendar availability;
- Stripe booking correlation.

Requirements:

- never log Turnstile tokens;
- never persist Turnstile tokens;
- do not send name/email to the bot-challenge provider unless technically necessary;
- do not expose Turnstile secret keys;
- do not log raw IP addresses solely for abuse-control debugging;
- use keyed/pseudonymous rate-limit identifiers where practical;
- keep all rate-limit and verification enforcement server-side;
- do not rely on hidden form fields as security controls;
- do not expose Google event details through availability responses;
- preserve the existing Stripe and Google secret boundaries;
- avoid storing long-lived device fingerprints;
- apply reasonable TTLs to temporary abuse-control identifiers.

Review whether the production Privacy Notice needs to identify the new challenge provider.

---

## UI implementation requirements

Preserve the existing booking design.

Do not redesign the three-step booking form.

### Challenge UX

The challenge should appear or execute as close as practical to:

```text
Book & pay £55
```

Prefer a managed/interaction-only challenge so legitimate users normally encounter minimal friction.

The submit button must not create a HOLD until a usable challenge token exists.

### Challenge expiry/failure

If the challenge:

- expires;
- is rejected;
- has already been used;
- encounters a recoverable client failure;

reset it and allow the customer to retry.

Preserve:

- entered name;
- entered email;
- selected date;
- selected time;
- accepted boundaries

where safe.

Do not clear the selected booking slot merely because bot verification failed.

### Rate-limit UX

For HOLD rate limiting:

- keep the customer's form input and selected slot;
- explain that they need to wait before retrying;
- do not automatically retry in a tight loop.

For Checkout rate limiting:

- preserve the existing HOLD;
- do not imply the hold was lost;
- allow retry once appropriate.

### Availability rate limiting

The availability component may show the existing recoverable availability error state.

Do not continuously auto-retry a `429`.

### Accessibility

Any visible challenge/error integration must:

- preserve keyboard access;
- expose errors using the existing accessible alert patterns;
- not make challenge completion dependent on colour alone;
- preserve visible focus.

---

## Acceptance criteria

### HOLD abuse protection

- [ ] `POST /api/bookings/hold` is rate limited per server-derived client identity.
- [ ] A limited HOLD request returns `429`.
- [ ] `Retry-After` is included.
- [ ] A limited HOLD request performs no Google FreeBusy call.
- [ ] A limited HOLD request creates no booking row.
- [ ] A valid Turnstile result is required before HOLD creation.
- [ ] Turnstile validation happens server-side.
- [ ] Rate limiting occurs before Turnstile Siteverify.
- [ ] Failed verification creates no HOLD.
- [ ] Failed verification performs no Google FreeBusy call.
- [ ] Turnstile provider failure fails closed.
- [ ] Challenge tokens are neither persisted nor logged.

### Active-HOLD quota

- [ ] One client can own at most 2 unresolved public booking HOLDs.
- [ ] A third simultaneous HOLD attempt is rejected before it can block another slot.
- [ ] Quota acquisition is atomic under concurrent requests.
- [ ] Rescheduling HOLDs are not accidentally counted as ordinary public HOLDs.
- [ ] `PAID`, `CONFIRMED`, `CANCELLED`, and `REFUNDED` do not consume the unpaid-HOLD quota.
- [ ] An ordinary expired HOLD stops consuming quota.
- [ ] A Checkout-backed unresolved HOLD remains covered for the relevant Checkout lifecycle.
- [ ] Successful payment releases the unpaid-HOLD quota.
- [ ] Authoritative Checkout expiry releases the unpaid-HOLD quota.
- [ ] Protection-store failure cannot leave an untracked blocking HOLD.

### Availability resource protection

- [ ] `GET /api/availability` has the more generous availability rate limit.
- [ ] A limited availability request performs no Google API operation.
- [ ] Identical browse-time Google busy lookups may be reused for 30 seconds.
- [ ] Concurrent identical cache misses are coalesced where supported.
- [ ] A repeated cached availability request does not unnecessarily refresh a Google access token.
- [ ] A repeated cached availability request does not unnecessarily call FreeBusy.
- [ ] PostgreSQL booking conflicts are recalculated on every availability request.
- [ ] A newly created HOLD becomes unavailable immediately even while Google busy data remains cached.
- [ ] Google authorization failures are not hidden behind a long-lived cache entry.

### Fresh HOLD validation

- [ ] `POST /api/bookings/hold` does not trust browse-time cached Google availability.
- [ ] HOLD creation performs fresh authoritative availability validation.
- [ ] A provider Calendar event added after the customer's GET but before their POST causes HOLD creation to fail.
- [ ] No booking row is persisted for that newly busy slot.
- [ ] The existing lost-slot UX remains functional.

### Checkout protection

- [ ] `POST /api/bookings/checkout` is limited per client.
- [ ] It is also limited per booking ID.
- [ ] A limited Checkout request performs no Stripe API operation.
- [ ] A limited Checkout request does not cancel the HOLD.
- [ ] Existing Stripe Checkout idempotency remains unchanged.
- [ ] Existing open Checkout Session reuse remains unchanged.
- [ ] Rate limiting cannot create duplicate Checkout Sessions.
- [ ] Payment remains authoritative only through verified Stripe webhook processing.

### Failure behaviour

- [ ] Rate-limit storage failure does not silently disable protection.
- [ ] HOLD and Checkout fail closed if the protection layer required for admission is unavailable.
- [ ] Protection errors use stable customer-safe responses.
- [ ] Raw third-party error details are not returned.
- [ ] Abuse-control cleanup failure cannot roll a paid booking back to `HOLD`.
- [ ] No protection failure fabricates booking/payment success.

### Privacy

- [ ] Raw IP addresses are not added to the `Booking` model.
- [ ] Turnstile tokens are not persisted.
- [ ] Turnstile tokens are not logged.
- [ ] Rate-limit identifiers are minimized and expire.
- [ ] Secrets remain server-side.

### UI

- [ ] Existing booking layout and styling remain substantially unchanged.
- [ ] A legitimate customer can complete challenge → HOLD → Checkout in one booking action.
- [ ] Double submission remains prevented.
- [ ] Verification failure leaves the form recoverable.
- [ ] HOLD rate limiting leaves entered details intact.
- [ ] Checkout rate limiting preserves the active HOLD.
- [ ] No tight automatic retry loop is introduced for `429` or `503`.

### Code quality

- [ ] Protection policies are defined centrally.
- [ ] External boundaries are dependency-injectable.
- [ ] No process-local-only limiter is used as the production security boundary.
- [ ] Existing booking uniqueness protections remain intact.
- [ ] No unnecessary dependency is introduced.
- [ ] No unrelated refactor is included.
- [ ] Formatting passes.
- [ ] Type checking passes.
- [ ] Node tests pass.
- [ ] Relevant PostgreSQL tests pass.
- [ ] Browser tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### Abuse-protection unit tests

Add focused deterministic tests for the new protection layer.

Suggested location:

```text
tests/booking-abuse-protection.test.mjs
```

Cover:

```text
availability policy
HOLD policy
Checkout policy
per-booking Checkout policy
Retry-After calculation
atomic active-HOLD permits
permit expiry
permit extension
permit release
protection-store failure
```

Use a controlled clock.

Do not make rate-limit tests sleep in real time.

---

## HOLD route tests

Extend:

```text
tests/booking-hold-route.test.mjs
```

Prove:

### Rate limited

```text
request
  ↓
rate limiter rejects
  ↓
429
```

Assertions:

```text
Turnstile verifier calls = 0
booking service calls = 0
```

### Invalid challenge

```text
rate limit passes
  ↓
Turnstile rejects
  ↓
verification error
```

Assertions:

```text
booking service calls = 0
```

### Challenge provider unavailable

Assert:

```text
503
booking service calls = 0
```

### Successful protection

Assert:

```text
rate limit passes
challenge passes
active permit acquired
existing booking service called once
201
```

### Active-HOLD limit

Assert that a client at the maximum receives the stable limit response without invoking Calendar/booking creation.

---

## Active-HOLD integration tests

Use real PostgreSQL where the selected implementation touches booking persistence.

At minimum prove the observable policy:

```text
client A creates slot 1 HOLD
client A creates slot 2 HOLD
client A requests slot 3 HOLD
```

Expected:

```text
slot 1 = HOLD
slot 2 = HOLD
slot 3 = still available
third request rejected
```

Also cover:

```text
ordinary HOLD expires
        ↓
capacity permit becomes available again
```

and:

```text
HOLD
 ↓
Checkout attached
 ↓
original 15-minute time passes
 ↓
quota still recognizes unresolved Checkout lifecycle
```

If abuse-control state is intentionally outside PostgreSQL, test the shared-store abstraction deterministically instead of inventing booking-table fields.

---

## Availability cache tests

Add or extend tests around the Google busy-period caching wrapper.

Prove:

### Repeated request

```text
GET availability
GET availability
```

inside 30 seconds results in:

```text
Google token refresh = 1
Google FreeBusy = 1
```

while local booking-conflict lookup occurs for each request.

### TTL expiry

Advance the controlled clock beyond the TTL.

A later request must trigger a new Google lookup.

### Different range

A different valid absolute range must not receive unrelated cached data.

### Concurrent miss

Start several requests for the same range before the first Google response completes.

Release one deterministic test gate.

Assert only one Google request occurred.

Do not use arbitrary `setTimeout` sleeps to prove coalescing.

---

## Fresh HOLD revalidation test

This is mandatory.

Test:

```text
public availability call
        ↓
cached result says slot free
        ↓
Google provider state changes
        ↓
HOLD request
```

The HOLD path must bypass the public cache.

The fresh Google response marks the interval busy.

Assert:

```text
SlotUnavailableError
no HOLD persisted
```

This test protects against accidentally weakening PR #19's stale-Calendar race handling.

---

## Availability route tests

Extend:

```text
tests/availability-route.test.mjs
```

Add:

- rate-limited request returns `429`;
- `Retry-After` exists;
- service is not invoked after rate-limit denial;
- existing date validation still works;
- existing customer-safe response shape remains unchanged;
- external response continues to use `Cache-Control: no-store`.

The internal Google cache does not require public/browser caching headers.

---

## Checkout route tests

Extend:

```text
tests/stripe-checkout-route.test.mjs
```

Cover:

### Per-client rejection

```text
429
checkout service calls = 0
```

### Per-booking rejection

```text
429
checkout service calls = 0
```

### Allowed request

Existing Checkout behaviour remains unchanged.

---

## Checkout integration tests

Extend:

```text
tests/stripe-checkout.test.mjs
```

where necessary to prove that protection integration does not change:

- Stripe idempotency key;
- existing open Session reuse;
- Session expiry;
- booking correlation;
- HOLD ownership.

If active-HOLD admission leases are extended when Checkout is attached, test the extension using deterministic abuse-store doubles.

---

## Stripe webhook tests

Extend:

```text
tests/stripe-webhook.test.mjs
```

only where the active-HOLD permit is explicitly released during webhook reconciliation.

Prove:

### Completed

```text
HOLD
 ↓
checkout.session.completed
 ↓
PAID
 ↓
unpaid-HOLD permit released
```

### Expired

```text
HOLD
 ↓
checkout.session.expired
 ↓
CANCELLED
 ↓
permit released
```

### Quota cleanup failure

A failure in abuse-control cleanup must not undo the authoritative booking transition.

---

## Browser tests

Extend:

```text
tests/browser/migration-smoke.spec.ts
```

The browser test must not depend on a real Cloudflare challenge.

Stub the challenge wrapper or browser Turnstile API deterministically.

Continue mocking:

```text
/api/availability
/api/bookings/hold
/api/bookings/checkout
```

where appropriate.

### Successful booking

Prove one customer action still produces:

```text
challenge success
        ↓
POST hold including challenge token
        ↓
POST checkout
        ↓
redirect
```

Assert exactly one HOLD request after a double click.

### Verification retry

Simulate:

```text
challenge rejected
```

Assert:

- no Checkout request;
- customer's date/time/details remain;
- challenge is reset;
- user can subsequently retry successfully.

### HOLD rate limited

Return `429` from `/api/bookings/hold`.

Assert:

- no Checkout request;
- selected date/time remains;
- customer sees actionable retry feedback.

### Checkout rate limited

Return:

```text
201 HOLD
429 Checkout
```

Assert:

- HOLD remains in browser state;
- customer is not told the HOLD disappeared;
- no automatic repeated Checkout loop occurs.

No visual-regression snapshots are required unless challenge integration intentionally changes rendered layout.

---

## Test doubles

All new external/protection boundaries must be deterministic.

Provide injectable doubles for:

```text
rate limiter
active-HOLD admission store
Turnstile verifier
Google busy cache
clock
```

where relevant.

Tests must be able to assert exact call counts.

Do not use a real:

- Google Calendar account;
- Stripe account;
- Turnstile production secret;
- external rate-limit provider

for the Node/unit suite.

---

## Verification commands

Use the existing repository commands.

```bash
# Install exact dependencies
npm ci

# Check formatting
npm run format:check

# Apply database migrations when this implementation adds one
npm run db:migrate:deploy

# Validate Prisma
npm run db:validate

# Targeted abuse-protection and affected route tests
node --conditions=react-server --experimental-test-module-mocks --test \
  tests/booking-abuse-protection.test.mjs \
  tests/availability-route.test.mjs \
  tests/booking-hold-route.test.mjs \
  tests/stripe-checkout-route.test.mjs

# Add other changed targeted files to the command when appropriate.

# Full Node/unit/integration suite
npm test

# Type checking
npm run lint

# Targeted booking browser coverage
npm run test:browser -- tests/browser/migration-smoke.spec.ts

# Full browser suite
npm run test:browser

# Production build
npm run build
```

If `tests/booking-abuse-protection.test.mjs` is not created because the tests fit more naturally into existing suites, replace that path with the actual changed test files.

If PostgreSQL-backed abuse-control persistence is introduced, its integration tests must run against:

```text
DATABASE_SCHEMA_TEST_URL
```

Do not claim PostgreSQL coverage passed when it was skipped.

If any command cannot run, report:

1. the command;
2. why it could not run;
3. what verification was performed instead.

---

## Manual acceptance checks

After automated verification, perform a small production-like test using non-production Stripe and Turnstile configuration.

### Normal booking

Confirm:

```text
open homepage
select available slot
complete bot challenge if prompted
Book & pay £55
Stripe Checkout opens
```

### Multiple holds

From one client identity, create enough unpaid holds to reach the configured maximum.

Confirm additional slots cannot be reserved by that client until capacity releases.

### Availability refresh

Refresh availability several times.

Confirm functionality remains responsive and legitimate use does not encounter the normal HOLD limit.

### Protection response

Trigger or temporarily configure a very small test rate threshold.

Confirm:

```text
429
Retry-After
safe user message
```

Do not test production abuse limits by generating uncontrolled traffic.

---

## Operational checks before launch

Confirm the production deployment has:

- Turnstile production site key;
- Turnstile production secret;
- allowed production hostname configured;
- trusted client-IP/header handling confirmed;
- production-safe shared rate-limit state;
- rate-limit thresholds configured as specified;
- monitoring for elevated `429` responses;
- monitoring for challenge failures;
- Google API quota/billing alerts where available;
- Stripe operational alerts where appropriate.

Review these thresholds after real traffic data exists.

Do not weaken the active-HOLD quota merely because availability traffic itself is low.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- request rate limiting;
- active-HOLD quota;
- bot verification;
- Google busy-time caching;
- Checkout protection;
- affected UI behaviour.

### Protection matrix

Report evidence for:

| Threat                                 | Protection                                  |
| -------------------------------------- | ------------------------------------------- |
| Rapid availability scraping            | Availability rate limit                     |
| Repeated Google FreeBusy amplification | Rate limit + 30-second cache                |
| Fake HOLDs across all slots            | Turnstile + rate limit + max 2 active HOLDs |
| Slow HOLD exhaustion                   | Max active-HOLD quota                       |
| Repeated Checkout requests             | Client + booking-ID limits                  |
| Stripe duplicate Session creation      | Existing Stripe idempotency                 |
| Stale cached Calendar during booking   | Fresh HOLD-time Google validation           |
| Limiter/provider outage                | Fail-closed mutation behaviour              |

### Tests

List:

- tests added;
- tests modified;
- targeted commands;
- full commands;
- pass/fail results;
- any skipped tests and why.

### External configuration

Document:

```text
Turnstile site key
Turnstile secret
Turnstile hostname/action configuration
trusted client-IP source
shared rate-limit store/configuration
```

State any privacy-notice action separately.

### Deviations

Document any meaningful deviation from:

```text
60 / 5 minutes availability
10 / 15 minutes HOLD
2 active unpaid HOLDs
10 / 15 minutes Checkout
4 / 5 minutes per booking Checkout
30-second Google busy cache
```

and explain the evidence for changing it.

### Remaining issues

Call out explicitly that rate limiting and bot challenges raise the cost of automated abuse but are not absolute protection against a distributed attacker with many network identities and solved challenges.

Do not claim the booking flow is impossible to abuse.

Use `None` only if there are no implementation-specific remaining issues.
