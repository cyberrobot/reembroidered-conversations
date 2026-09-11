# PR #2 — Booking domain + database schema

## Repository state

**Expected branch:**  
`feat/002-booking-domain-database-schema`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  
`PR #1 — Migrate existing React app to Next.js. The migration is already present on main and provides the Next.js App Router baseline this task builds on.`

### Read first

Before making changes, read the repository guidance and current booking-related code relevant to this task:

- `AGENTS.md`
- `.codex/tasks/001-nextjs-migration.md`
- `package.json`
- `package-lock.json`
- `.env.example`
- `README.md`
- `src/types.ts`
- `src/lib/booking-date.mjs`
- `src/components/BookingSection.tsx`
- `src/components/BookingConfirmationPage.tsx`
- `src/app/page.tsx`
- `src/app/confirmation/page.tsx`
- `tests/booking-date.test.mjs`
- `playwright.config.ts`

The current repository has no persistence layer, ORM, database schema, booking API, Stripe integration, Google Calendar integration, or Google Meet integration.

Do not infer a persistence pattern from the prototype UI. Establish the database foundation deliberately and keep it server-side.

### Primary change area

Booking-domain persistence and database foundation, including:

- canonical persisted `Booking` model
- booking status enum and lifecycle semantics
- PostgreSQL schema and initial migration
- Prisma ORM/client configuration
- server-only database client ownership
- database environment configuration
- constraints and indexes required for future booking concurrency and provider correlation
- deterministic schema verification

This is a backend/domain foundation PR. It should not materially change rendered UI.

### Canonical implementation examples

There is no existing database or ORM implementation in the repository.

Use these existing files as behavioural/context references only:

- `AGENTS.md` — authoritative booking, concurrency, time-zone, security, payment, and provider-boundary rules
- `src/types.ts` — current prototype booking form/confirmation types; these are not the persisted domain model
- `src/lib/booking-date.mjs` — existing explicit `Europe/London` booking-time-zone handling and avoidance of machine-local date assumptions
- `package.json` — current npm scripts and verification commands
- `.env.example` — current environment-variable documentation style

Do not make the persisted database model depend on client-only prototype types.

### Relevant symbols

Codex should inspect these before editing:

- `BookingFormData`
- `BookingConfirmation`
- `SessionFormat`
- `BOOKING_TIME_ZONE`
- `getCalendarDateInTimeZone`
- `getTomorrowCalendarDateInTimeZone`

The new persisted model must introduce these domain concepts:

- `Booking`
- `BookingStatus`
- `HOLD`
- `PAID`
- `CONFIRMED`
- `CANCELLED`
- `REFUNDED`

### Expected change surface

Expected changes include:

- `package.json`
- `package-lock.json`
- `.env.example`
- `README.md` when local database setup or migration commands need documentation
- `prisma/schema.prisma`
- initial Prisma migration under `prisma/migrations/`
- server-only database client module, preferably a narrowly owned module such as `src/lib/db.ts` unless repository inspection establishes a better local convention
- a small booking-domain module only if required to keep status semantics/constants independent from provider-specific ORM details
- targeted schema/domain tests or verification helpers where appropriate

If Prisma requires generated-client configuration or another support file for the installed version, include only the files required by the official Prisma setup used by this repository.

If additional files must change, Codex must explain why they are necessary.

### Excluded areas

Do not include any of the following in this PR:

- wiring the booking form to the database
- booking route handlers or server actions for customer submissions
- real availability calculation
- Google Calendar API calls
- Google OAuth
- Google Meet creation
- Stripe Checkout creation
- Stripe PaymentIntent creation
- Stripe webhooks
- payment verification
- cancellation/refund orchestration
- hold-expiry jobs, cron jobs, or background workers
- confirmation-page data fetching
- email delivery
- authentication or user accounts
- admin/provider UI
- changes to the existing booking UI
- changes to the £55 price
- changes to the 55-minute session duration
- Apple Calendar integration
- persistence of prototype-only fields such as phone number, optional note, session format, or confirmed-boundaries flag unless a separate requirement explicitly adds them
- unrelated dependency upgrades
- unrelated refactors
- visual redesign
- editorial copy changes

This PR creates the persistence foundation only. Later PRs will use it for availability, payments, Calendar, Meet, and confirmation orchestration.

### Unknowns Codex must verify

Before making changes, verify from the repository and selected Prisma version:

- The current supported Prisma setup for the repository's Node.js, Next.js, TypeScript, and ESM versions.
- Whether the selected Prisma version requires an explicit generated-client output path or adapter package.
- The appropriate server-only Prisma client singleton pattern for Next.js development hot reload and production runtime.
- Whether the target runtime remains a normal Node.js runtime; do not introduce Edge-runtime assumptions for database access.
- Whether Prisma can represent each required database constraint declaratively. When it cannot, implement the constraint in migration SQL and document it clearly.
- The exact Prisma CLI commands supported by the installed version for validation, generation, and applying committed migrations.
- Whether any existing repository or deployment documentation establishes a different relational database requirement. If none does, use PostgreSQL as specified below.

Do not choose SQLite merely because it is simpler for local development. This schema is the production booking foundation and requires relational/concurrency behaviour suitable for later payment and calendar orchestration.

---

## Objective

Add the canonical persisted booking domain and database schema for Re-Embroidered Conversations.

After this PR:

- The application has a PostgreSQL persistence foundation managed through Prisma.
- A canonical `Booking` model exists with exactly the required booking fields for this phase.
- Booking lifecycle state is represented explicitly by a `BookingStatus` enum rather than inferred from nullable provider fields.
- New bookings default to `HOLD`.
- Booking timestamps use unambiguous database timestamp types and are treated as instants, not machine-local date strings.
- The customer's IANA time-zone identifier is stored separately in `timezone` for display and reconstruction of the customer's intended local context.
- The schema preserves a fixed 55-minute session invariant.
- The database prevents two active bookings from owning the same start time.
- Stripe Checkout Session IDs, Stripe PaymentIntent IDs, and Google Calendar event IDs can each correlate to at most one booking when present.
- Expiring holds can be queried efficiently by status and expiry time.
- A reusable server-only database client is available for later PRs.
- Database configuration is documented without exposing credentials to the browser.
- A fresh database can apply the committed migration successfully.
- Prisma schema validation and client generation succeed.
- Existing prototype UI and behaviour remain unchanged.
- No external provider is called by this PR.

Completion means later booking-flow PRs can create, query, transition, and correlate bookings without first redesigning the persistence foundation.

---

## Current architecture

The repository is a Next.js App Router application.

The current booking experience remains a client-side prototype:

- `src/components/BookingSection.tsx` owns interactive booking-form behaviour.
- `src/types.ts` contains UI/prototype types such as `BookingFormData` and `BookingConfirmation`.
- `src/components/BookingConfirmationPage.tsx` renders prototype confirmation behaviour.
- There is no route handler or server action that creates a real booking.
- There is no database client or schema.
- There is no ORM dependency.
- There is no real Stripe, Google Calendar, or Google Meet integration.

`src/lib/booking-date.mjs` already establishes `Europe/London` as the provider booking time zone for calendar-date calculations and deliberately avoids depending on the machine's local time zone.

The repository uses:

- npm
- TypeScript
- Next.js App Router
- Node's built-in test runner for current deterministic unit tests
- Playwright for browser verification

This PR adds a server-side persistence boundary without changing the client-side booking flow.

---

## External integrations affected

None.

This PR stores nullable correlation fields that later integrations will populate:

- Stripe Checkout Session ID
- Stripe PaymentIntent ID
- Google Calendar event ID
- meeting URL

Do not call Stripe, Google Calendar, Google Meet, or any other external provider in this PR.

Do not add Stripe or Google SDK dependencies in this PR.

---

## Configuration and data changes

### Environment variables

Add:

#### `DATABASE_URL`

- Server-only: **Yes**
- Public/client-visible: **No**
- Required: **Yes for database runtime, migration, and database-backed verification**
- Purpose: PostgreSQL connection string used by Prisma

Requirements:

- Document it in `.env.example` using a placeholder only.
- Never prefix it with `NEXT_PUBLIC_`.
- Never commit a real database credential.
- Ensure client-side modules do not import database configuration or the Prisma client.

Do not add extra database environment variables unless the selected deployment/database setup genuinely requires them. If an additional direct/migration URL is required by the selected Prisma/provider setup, document why it is required and keep it server-only.

### Database or schema

Introduce PostgreSQL through Prisma.

Use the following canonical domain model:

```text
Booking {
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
}
```

Introduce the exact status values:

```text
HOLD
PAID
CONFIRMED
CANCELLED
REFUNDED
```

#### Field requirements

##### `id`

- Required.
- Primary key.
- Stable opaque UUID generated by the application/database ORM layer.
- Must be safe to use as the internal correlation identifier in later Stripe/Calendar workflows.

##### `name`

- Required string.
- Customer display/name value for the booking.
- Do not impose uniqueness.

##### `email`

- Required string.
- Do not impose uniqueness because repeat customers must be possible.
- Email validation/normalization at customer input boundaries belongs to the later booking-creation PR; this schema must store the canonical value supplied by that layer.

##### `startAt`

- Required timestamp representing an absolute instant.
- Persist using PostgreSQL `timestamptz` or the Prisma equivalent.
- Never store an ambiguous local date/time string.

##### `endAt`

- Required timestamp representing an absolute instant.
- Persist using PostgreSQL `timestamptz` or the Prisma equivalent.
- Enforce that `endAt` is exactly 55 minutes after `startAt`.
- If Prisma cannot express this invariant, add an explicit database `CHECK` constraint in the migration SQL.

##### `timezone`

- Required string containing the customer's IANA time-zone identifier, e.g. `Europe/London`.
- Do not use this field instead of `startAt`/`endAt`; it records display/local-context information while timestamps remain authoritative instants.

##### `status`

- Required `BookingStatus` enum.
- Default: `HOLD`.
- Must not be inferred from Stripe, Calendar, meeting, or expiry fields.

##### `stripeCheckoutSessionId`

- Nullable string.
- Unique when present.
- Reserved for later Stripe Checkout correlation.

##### `stripePaymentIntentId`

- Nullable string.
- Unique when present.
- Reserved for later authoritative payment correlation.

##### `calendarEventId`

- Nullable string.
- Unique when present.
- Reserved for later Google Calendar event correlation.

##### `meetingUrl`

- Nullable string.
- Reserved for the provider-confirmed video-call URL.
- Do not fabricate or derive a Google Meet URL in this PR.

##### `expiresAt`

- Required timestamp using PostgreSQL `timestamptz` or equivalent.
- Records the expiry deadline associated with the booking's original hold.
- Must be later than `createdAt` at insertion time.
- Later PRs are responsible for turning expired `HOLD` rows into an inactive state before the slot is reused.

##### `createdAt`

- Required timestamp using PostgreSQL `timestamptz` or equivalent.
- Defaults to the database/ORM current time on creation.
- Immutable in normal application behaviour.

Do not add persisted fields such as `updatedAt`, phone, note, format, price, currency, consent flags, Google attendee data, or raw provider payloads unless technically required by the ORM itself. If an additional persisted field is truly necessary, Codex must explain the deviation before considering the task complete.

#### Status semantics

The status values mean:

- `HOLD` — a temporary booking record owns the selected slot while payment/finalisation is pending; the hold has an `expiresAt` deadline.
- `PAID` — payment has been authoritatively confirmed, but downstream Calendar/Meet confirmation is not yet complete.
- `CONFIRMED` — the booking has completed the required downstream confirmation workflow and is the final active appointment state.
- `CANCELLED` — the booking is no longer active because it was cancelled or abandoned through an explicit lifecycle operation.
- `REFUNDED` — captured payment has been refunded and the booking is no longer active.

For this schema, the active slot-owning statuses are:

```text
HOLD
PAID
CONFIRMED
```

The inactive/releasable statuses are:

```text
CANCELLED
REFUNDED
```

This PR does not implement customer/provider status-transition operations, but the domain semantics above are canonical for later PRs.

#### Concurrency and uniqueness

The database must prevent two active bookings from owning the same `startAt` slot.

Implement a PostgreSQL partial unique index equivalent to:

```sql
CREATE UNIQUE INDEX ...
ON bookings ("startAt")
WHERE status IN ('HOLD', 'PAID', 'CONFIRMED');
```

Exact identifier/table quoting may follow Prisma's generated schema/migration conventions.

This constraint is deliberate:

- two simultaneous `HOLD` rows for the same slot must not be possible;
- a `PAID`/`CONFIRMED` booking must continue to own its slot;
- a `CANCELLED` or `REFUNDED` booking must not permanently prevent that slot from being used again;
- later booking creation can rely on a database constraint as the final concurrency guard rather than client-side state.

If Prisma cannot represent the partial index directly in the schema, add it as reviewed migration SQL. Do not weaken the rule to a normal non-unique index.

Because all sessions are exactly 55 minutes, uniqueness of active `startAt` values is sufficient for the current product slot model. Do not introduce arbitrary-duration overlap/exclusion logic unless the product duration rule changes in a separate task.

#### Additional indexes

Add indexes that support expected near-term booking operations without speculative over-indexing:

- index `startAt` for booking/date lookup when not already covered sufficiently by the active partial unique index;
- composite index on `(status, expiresAt)` for finding expired/pending holds efficiently.

Provider correlation fields already receive indexes through their unique constraints.

Do not add a unique index to `email` or `name`.

#### Migration requirements

Commit an initial database migration that creates:

- `BookingStatus` enum
- `bookings` table (or Prisma's clearly documented equivalent mapping)
- primary key
- field nullability/defaults
- provider-ID uniqueness constraints
- 55-minute duration check
- `expiresAt > createdAt` check
- active-slot partial unique index
- required supporting indexes

The committed migration must be applicable to a fresh PostgreSQL database.

Do not rely on `prisma db push` as the production migration strategy for this task.

### Webhooks

None.

### OAuth and permissions

None.

### Deployment configuration

No hosting-specific deployment change is required by this task beyond supplying the server-only database connection string in environments that run the application or migrations.

Do not add deployment-provider-specific configuration unless the repository already requires it for PostgreSQL connectivity.

### Migration or backfill

No application-data backfill is required because the repository currently has no real persisted bookings.

The initial migration must create the schema from an empty database.

---

## Security and privacy considerations

This PR introduces persistence of customer personal data:

- name
- email address
- appointment start/end times
- customer time zone
- booking lifecycle state
- provider correlation identifiers
- meeting URL when later populated

Requirements:

- Keep the Prisma/database client server-only.
- Do not import database code into Client Components.
- Keep `DATABASE_URL` server-only.
- Do not log the full database connection string.
- Do not add query logging that prints customer names/emails in production by default.
- Do not store payment-card information.
- Do not store raw Stripe objects or raw Google Calendar event payloads.
- Do not store OAuth credentials/tokens in the `Booking` model.
- Treat `meetingUrl` as booking-sensitive information even though it is represented as a URL.
- Do not expose persisted booking records through a new public route in this PR.
- Do not expose internal booking/provider identifiers to the browser merely because they exist in the database.
- Preserve the repository rule that provider-specific types/data remain near provider boundaries in later PRs.

The database module must fail clearly when required database configuration is unavailable rather than silently falling back to an in-memory or local database.

---

## Required implementation

### 1. Add PostgreSQL + Prisma persistence

Add the minimum Prisma dependencies and configuration required for the repository's current Node.js/Next.js/TypeScript environment.

Use PostgreSQL as the datasource.

Do not add a second ORM, query builder, or database abstraction.

Do not add a hosted database vendor SDK unless the selected runtime genuinely requires it; Prisma should remain the application persistence boundary for this PR.

### 2. Define the canonical schema

Implement the `BookingStatus` enum and `Booking` model described above.

Use database-native timestamp types that preserve instants.

Use UUID booking IDs.

Ensure provider correlation IDs are nullable and unique when present.

Do not copy the existing `BookingFormData` interface directly into persistence; it contains prototype/form concerns that are explicitly outside this PR's persisted model.

### 3. Add database-level invariants

The migration must enforce:

- primary-key uniqueness
- unique non-null Stripe Checkout Session IDs
- unique non-null Stripe PaymentIntent IDs
- unique non-null Google Calendar event IDs
- exactly 55 minutes between `startAt` and `endAt`
- `expiresAt` later than `createdAt`
- at most one active booking for a given `startAt` across `HOLD`, `PAID`, and `CONFIRMED`

Do not rely solely on TypeScript checks for invariants that can and should be enforced by PostgreSQL.

### 4. Add a server-only database client

Provide one canonical reusable Prisma client entry point for later server-side code.

Requirements:

- server-only ownership;
- safe Next.js development hot-reload behaviour without creating an unbounded number of clients/connections;
- normal production client behaviour;
- no import into current Client Components;
- no accidental browser bundling;
- no embedded credentials.

Do not add booking repositories/services merely as abstraction for abstraction's sake. A small database-client module is sufficient unless additional domain code is required for the acceptance criteria.

### 5. Document status semantics

Make status semantics discoverable in code and/or schema documentation so later PRs do not reinterpret the enum differently.

Do not implement a broad workflow/state-machine framework in this PR.

If a small typed helper is introduced for active/inactive statuses, keep it deterministic and provider-independent.

### 6. Add database scripts/documentation

Update `package.json` with clear Prisma/database scripts appropriate to the installed version, including equivalents for:

- generating the Prisma client;
- validating the Prisma schema;
- applying committed migrations in deployment/test environments.

A development migration command may also be documented where useful.

Do not replace existing application scripts.

Update README/database setup documentation only as much as necessary so a developer can:

1. provide `DATABASE_URL`;
2. install dependencies;
3. generate the Prisma client if the installed setup requires it;
4. apply committed migrations;
5. run existing application verification.

A clean install/build must not depend on an undocumented manual generation step.

### 7. Preserve existing application behaviour

Do not connect `BookingSection` or the confirmation page to the database in this PR.

The existing homepage, prototype booking interactions, and confirmation UI must remain unchanged.

No new customer-facing loading, error, or success state is required because no database-backed user flow is introduced yet.

### External-service failure handling

Not applicable in this PR because no external service is called.

Database failures should remain server-side and should not be exposed through a new public API in this task.

---

## UI implementation requirements

No material UI changes are required.

- Preserve all current rendered booking and marketing UI.
- Do not redesign the booking section.
- Do not add database status labels or internal identifiers to the interface.
- Do not add visual-regression snapshots solely because Prisma/database files were added.

Existing browser tests should continue to pass as regression evidence.

---

## Acceptance criteria

### Behaviour and domain

- [ ] A canonical persisted `Booking` model exists with these fields: `id`, `name`, `email`, `startAt`, `endAt`, `timezone`, `status`, `stripeCheckoutSessionId`, `stripePaymentIntentId`, `calendarEventId`, `meetingUrl`, `expiresAt`, `createdAt`.
- [ ] `BookingStatus` contains exactly `HOLD`, `PAID`, `CONFIRMED`, `CANCELLED`, and `REFUNDED`.
- [ ] New bookings default to `HOLD`.
- [ ] `startAt`, `endAt`, `expiresAt`, and `createdAt` are stored as unambiguous timestamp-with-time-zone instants or the Prisma/PostgreSQL equivalent.
- [ ] `timezone` stores a separate IANA time-zone identifier.
- [ ] The database enforces `endAt = startAt + 55 minutes`.
- [ ] The database enforces `expiresAt > createdAt`.
- [ ] Two active bookings cannot share the same `startAt` while either row is `HOLD`, `PAID`, or `CONFIRMED`.
- [ ] `CANCELLED` and `REFUNDED` rows do not permanently reserve the start slot through the active-slot uniqueness rule.
- [ ] `stripeCheckoutSessionId` is nullable and unique when present.
- [ ] `stripePaymentIntentId` is nullable and unique when present.
- [ ] `calendarEventId` is nullable and unique when present.
- [ ] `meetingUrl` is nullable.
- [ ] Repeat bookings from the same email address are permitted.
- [ ] No additional customer/form fields are persisted outside the requested model without an explicitly documented technical necessity.

### Persistence

- [ ] PostgreSQL is configured as the database provider.
- [ ] Prisma is the single ORM/persistence library introduced by this PR.
- [ ] A committed migration creates the complete schema from an empty database.
- [ ] The committed migration contains any raw SQL required for unsupported partial indexes/check constraints.
- [ ] An index supports querying holds by `status` and `expiresAt`.
- [ ] The database client is owned by a server-only module.
- [ ] Development hot reload does not create an unbounded number of Prisma clients.
- [ ] No database module is imported into a Client Component.

### Configuration

- [ ] `DATABASE_URL` is documented as a required server-only variable for database use.
- [ ] No real credentials are committed.
- [ ] No `NEXT_PUBLIC_*` database variable exists.
- [ ] Package scripts/documentation cover schema validation, client generation, and application of committed migrations using commands supported by the installed Prisma version.
- [ ] A clean install/build does not require an undocumented Prisma-generation step.

### External integrations

- [ ] No Stripe API call is added.
- [ ] No Google API call is added.
- [ ] No Stripe or Google provider SDK is added solely for this PR.
- [ ] Provider identifiers are only persisted as nullable correlation fields for future work.

### UI/regression

- [ ] Existing prototype booking UI behaviour remains unchanged.
- [ ] Existing confirmation UI behaviour remains unchanged.
- [ ] No new customer-facing database-backed flow is introduced.
- [ ] Existing browser regression tests still pass.

### Code quality

- [ ] The implementation follows `AGENTS.md` and existing repository conventions.
- [ ] No unnecessary persistence abstraction or dependency is introduced.
- [ ] No unrelated refactors are included.
- [ ] Type safety is preserved.
- [ ] Existing lint/type checking passes.
- [ ] Existing unit tests pass.
- [ ] Prisma schema validation succeeds.
- [ ] Prisma client generation succeeds.
- [ ] The committed migration applies successfully to a fresh PostgreSQL database.
- [ ] Production build passes.

---

## Tests to add or update

This is a backend/schema task; do not introduce a new general-purpose test framework solely for this PR.

Use the repository's existing Node test runner where deterministic domain helpers are added.

### Unit tests

If a provider-independent booking-domain helper is introduced, add focused coverage for its behaviour, including as applicable:

- active statuses are exactly `HOLD`, `PAID`, `CONFIRMED`;
- inactive statuses are exactly `CANCELLED`, `REFUNDED`;
- status values remain aligned with the Prisma enum;
- any duration helper uses 55 minutes and does not depend on machine local time.

If no executable domain helper is introduced and the enum is represented only in the Prisma schema, do not add a brittle test that merely string-matches the schema file. Use Prisma validation plus database migration verification instead.

### Integration/schema verification

Verification must demonstrate the actual database invariants against a disposable/test PostgreSQL database when the environment allows database execution.

Cover at least:

1. A valid `HOLD` booking can be inserted.
2. A second active booking with the same `startAt` is rejected.
3. A booking with the same `startAt` can be inserted after the previous booking is made `CANCELLED` or `REFUNDED`.
4. A booking whose `endAt` is not exactly 55 minutes after `startAt` is rejected by the database.
5. A booking whose `expiresAt <= createdAt` is rejected by the database.
6. Multiple rows may have null provider IDs.
7. Reusing a non-null Stripe Checkout Session ID is rejected.
8. Reusing a non-null Stripe PaymentIntent ID is rejected.
9. Reusing a non-null Calendar event ID is rejected.
10. Repeat customer email addresses are accepted.

Do not run destructive schema verification against a shared or production database.

If the available coding environment cannot provision/connect to a disposable PostgreSQL database, Codex must still:

- run Prisma schema validation;
- generate the client;
- inspect the generated migration SQL against every required constraint/index;
- document the exact database-backed verification that could not be executed and why.

### Browser tests

No new browser test is required because the rendered product behaviour does not change.

Run the existing browser suite as regression verification unless the environment prevents it.

### Visual regression tests

N/A — no material rendered UI change is required.

---

## Verification commands

Codex must verify the exact Prisma CLI command names against the installed version and use the corresponding supported commands.

At minimum, run:

```bash
# Install dependencies
npm install

# Generate Prisma client
npm run db:generate

# Validate Prisma schema
npm run db:validate

# Apply committed migration to a disposable/test PostgreSQL database
npm run db:migrate:deploy

# Existing unit tests
npm test

# Type checking / repository lint command
npm run lint

# Existing browser regression suite
npm run test:browser

# Production build
npm run build
```

If package scripts use different names after verifying the installed Prisma version, replace the three `db:*` placeholders above with the exact committed scripts and document them in the completion report.

For database invariant verification, run the targeted database test/verification command added by this PR when one exists.

Do not point migration or destructive verification commands at production.

If a command cannot be run in the available environment, document:

1. The command that should have been run.
2. Why it could not be run.
3. What verification was performed instead.

---

## Completion report

When implementation is complete, provide a concise summary containing:

### Changed

Summarise:

- Prisma/PostgreSQL setup
- `Booking` schema
- `BookingStatus` enum
- migration constraints/indexes
- database-client module
- environment/package-script documentation

### Tests

List:

- tests or schema verification added
- Prisma validation/generation result
- fresh-database migration result
- database invariant verification result
- `npm test` result
- `npm run lint` result
- `npm run test:browser` result
- `npm run build` result

### External configuration

Expected external configuration for this PR:

- PostgreSQL database
- server-only `DATABASE_URL`

No Stripe or Google configuration is required yet.

### Deviations

Describe any meaningful deviation from this specification, especially:

- database provider changes
- ORM changes
- additional persisted fields
- omitted constraints
- changes to the active-slot concurrency rule

Use `None` when there were no deviations.

### Remaining issues

Expected follow-up work includes later PRs for:

- real availability and slot selection
- creation/expiry of booking holds
- Stripe Checkout/payment lifecycle
- Stripe webhook processing
- Google Calendar event creation
- Google Meet creation
- booking confirmation/reconciliation
- cancellation/refund orchestration

Do not implement those follow-ups in this PR.
