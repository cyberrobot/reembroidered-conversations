# PR #24 — Align booking UI with the Google Meet-only v1 product

## Repository state

**Expected branch:** `fix/024-booking-ui-product-alignment`  
**Base branch:** `main`  
**Dependencies:** Existing 55-minute / £55 booking product, temporary `HOLD`
flow, Stripe Checkout, Turnstile, Google Calendar + Google Meet, confirmation
email, booking management, and Playwright infrastructure. PR #23 reconciliation
recovery is already present in the base and must remain compatible.

## Objective

Make every customer-facing booking surface accurately represent the single v1
product:

```text
55-minute private video conversation
£55 GBP
Google Meet
```

The customer may provide only date/time, name, email, mandatory boundaries
consent, and Turnstile verification. The three-step funnel remains:

1. Date & Time
2. Your Details
3. Consent & Security

## Scope

### Booking UI

- Remove session-format state and selection controls.
- Remove Audio-Only Call, phone-call, Zoom, and `Google Meet or Zoom` copy.
- Replace format cards with quiet informational copy:
  `55-minute private video conversation via Google Meet`.
- Remove phone state/input and reflection-note state/textarea/copy.
- Keep Name and Email as the only customer-entry fields in Step 2.
- Keep the boundaries checkbox mandatory in Step 3.
- Keep Turnstile after consent and before the booking CTA.
- Preserve duplicate-submit protection and existing error states.

### Consent persistence

Add the nullable server-owned field:

```prisma
boundariesAcceptedAt DateTime? @db.Timestamptz(3)
```

Create a normal Prisma migration. Do not backfill historical rows.

The public HOLD request includes `acceptedBoundaries: true` alongside the
existing name, email, start time, and Turnstile token. The booking domain must
accept only literal boolean `true`; missing, false, string, numeric, object, and
other truthy values are invalid and must be rejected before availability or
persistence work.

When accepted, persist `boundariesAcceptedAt` using the existing authoritative
HOLD `now` value. Never accept a client-provided timestamp or other server-owned
booking fields. Do not expose the timestamp in the public response.

The timestamp remains unchanged through payment, Calendar/Meet finalisation,
confirmation, cancellation, refund, rescheduling, reconciliation, and retries.

### Confirmation and management

- Continue describing the booking as a private video meeting via Google Meet.
- Retain the persisted Google Meet join link on confirmation.
- Keep the branded email Google Meet-only with the session details and link.
- Keep management Google Meet-only with no format-changing controls.
- Preserve cancellation, refund, rescheduling, capability-token, lifecycle,
  and reconciliation behavior.

### Visual cleanup

Preserve the warm editorial visual language (`#FAF8F5`, `#282524`, `#A35048`,
`#E8DFD5`) while removing format cards, reducing redundant duration/price
badges, flattening decorative nested borders and shadows, and retaining clear
containers for meaningful warnings, errors, destructive actions, loading, and
status states.

Production customer routes must not render preset switchers, simulation buttons,
scenario controls, test toolbars, or developer panels. Test-only visual fixture
routes may remain gated by `BOOKING_MANAGEMENT_VISUAL_FIXTURES`.

## Explicit non-goals

Do not add audio, telephone, Zoom, alternative video providers, customer
accounts, phone persistence, reflection-note persistence or delivery, Stripe
changes, Google OAuth changes, availability/buffer changes, webhook changes, or
policy changes. Do not add `sessionFormat` merely with a constant v1 value.

## Security and privacy

- Validate consent and all existing booking input server-side.
- Do not log or persist removed phone/note values.
- Keep Turnstile tokens transient and out of booking persistence.
- Do not add IP, fingerprint, user-agent, or behavioral tracking.
- Keep Stripe and Google privileged operations server-side.
- Preserve customer-safe error responses and response minimization.

## Required tests

Update the existing hold, route, database, schema, confirmation-email, browser,
and visual tests. Cover:

- valid literal consent succeeds;
- missing, false, string, numeric, and object consent fail before availability
  and persistence;
- persistence receives `boundariesAcceptedAt === now`;
- client values cannot override server-owned fields;
- public responses do not expose the consent timestamp or unnecessary customer
  details;
- the timestamp is stored, nullable for historical rows, and survives lifecycle
  transitions;
- email, confirmation, and management contain Google Meet copy and no
  Audio-Only, phone-call, or Zoom choices;
- booking UI has all three steps, only Name and Email inputs, mandatory consent,
  consent → Turnstile → submit order, and the expected HOLD payload;
- unchecked consent prevents HOLD creation;
- ordinary success and management routes contain no debug controls or fixture
  identifiers;
- responsive layouts have no horizontal overflow and retain keyboard/focus and
  accessible error behavior.

Update reviewed desktop, tablet, mobile, confirmation, management, and affected
rescheduling/cancellation snapshots for both supported rendering platforms.

## Verification

Use the repository-established commands:

```bash
npm ci
npm run format
npm run format:check
npm run db:migrate:deploy
npm run db:validate
npm test
npm run lint
npm run build
npx playwright install --with-deps chromium
npm run test:browser
git diff --check
```

Database-backed tests require the isolated PostgreSQL configuration used by CI:
`DATABASE_URL` and `DATABASE_SCHEMA_TEST_URL`.

## External configuration

None. Existing Turnstile, Stripe, Google Calendar/Meet, email, and deployment
configuration remains unchanged.

## Completion report

Report the changed UI, consent validation and migration, type cleanup, visual
updates, tests and commands run, external configuration, deviations, and
remaining issues.
