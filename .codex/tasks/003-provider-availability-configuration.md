# PR #3 — Provider availability configuration

## Repository state

**Expected branch:**  
`feat/003-provider-availability-configuration`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  
`PR #2 — Booking domain + database schema. The booking-domain persistence foundation is already present on main and must remain unchanged by this task.`

### Read first

Before making changes, read:

- `AGENTS.md`
- `.codex/tasks/002-booking-domain-database-schema.md`
- `package.json`
- `tsconfig.json`
- `src/lib/booking-date.mjs`
- `src/lib/db.ts`
- `src/types.ts`
- `src/components/BookingSection.tsx`
- `src/components/FullCalendarModal.tsx`
- `prisma/schema.prisma`
- `tests/booking-date.test.mjs`
- `tests/booking-schema.test.mjs`

The current booking UI generates prototype availability in the browser.

Do not treat the existing mocked slots as the canonical provider schedule. This PR replaces those implicit scheduling assumptions with an explicit provider-availability domain configuration, but does **not** wire it into the customer UI yet.

The repository has Prisma/PostgreSQL persistence for bookings but no real availability API or Google Calendar availability integration.

### Primary change area

Provider-owned availability rules and deterministic candidate-slot generation.

This layer answers:

> When is the provider willing to offer a session, before considering existing bookings or external calendar conflicts?

It must support independently configurable:

- `sessionDurationMinutes`
- `bufferBeforeMinutes`
- `bufferAfterMinutes`
- `minimumNoticeMinutes`
- `maximumBookingHorizonDays`
- `weeklyWorkingHours`
- `daysOff`

The provider timezone must also be explicit.

Calendar conflicts and existing-booking conflicts are separate concerns and must not be implemented in this PR.

### Canonical implementation examples

Use:

- `AGENTS.md` — authoritative booking, availability, timezone and architecture rules.
- `src/lib/booking-date.mjs` — explicit `Europe/London` date handling.
- `tests/booking-date.test.mjs` — deterministic Node test pattern.
- `package.json` — authoritative verification commands.

The availability generation currently inside `BookingSection.tsx` is prototype UI behaviour only.

### Relevant symbols

Inspect:

- `BOOKING_TIME_ZONE`
- `getCalendarDateInTimeZone`
- `getTomorrowCalendarDateInTimeZone`
- `DayAvailability`
- `TimeSlot`
- `BookingSection`

Introduce clear domain concepts for:

- `ProviderAvailabilityConfig`
- `WorkingHours`
- `WorkingWindow`
- `sessionDurationMinutes`
- `bufferBeforeMinutes`
- `bufferAfterMinutes`
- `minimumNoticeMinutes`
- `maximumBookingHorizonDays`
- `daysOff`
- candidate provider slots

Exact symbol names may follow local conventions.

### Expected change surface

Expected changes include narrowly owned modules such as:

```text
src/lib/availability/provider-config.mjs
src/lib/availability/candidate-slots.mjs
tests/provider-availability.test.mjs
```

`src/lib/booking-date.mjs` may be extended when reusable timezone/date primitives are required.

Prefer the existing `.mjs` + `// @ts-check` pattern for pure booking/date logic where practical.

Possible supporting changes:

- `package.json` / `package-lock.json` only if a small timezone/date dependency is genuinely required.
- `README.md` only if developer-facing availability configuration needs documentation.

### Excluded areas

Do not include:

- Google Calendar API calls;
- Google OAuth;
- Google FreeBusy queries;
- calendar-conflict filtering;
- existing-booking conflict filtering;
- database queries for occupied slots;
- changes to the `Booking` Prisma model;
- Prisma migrations;
- booking holds;
- booking creation;
- Stripe;
- Google Meet;
- customer availability API routes;
- wiring real availability into `BookingSection`;
- provider/admin configuration UI;
- database persistence of provider availability;
- multiple-provider scheduling;
- customer timezone changes;
- caching infrastructure;
- unrelated refactors;
- visual redesign.

This PR defines configured **candidate availability only**.

### Unknowns Codex must verify

Verify:

- whether scoped `AGENTS.md` files apply;
- whether existing date helpers should be extended rather than duplicated;
- whether IANA wall-clock-to-instant conversion can be implemented cleanly using existing runtime APIs;
- whether a timezone dependency is necessary;
- whether `BOOKING_TIME_ZONE` should remain canonical or move to the availability configuration with a backwards-compatible re-export;
- whether current browser tests make assumptions about prototype availability.

Do not infer calendar-conflict rules from mocked unavailable slots.

---

## Objective

Add a canonical provider-availability configuration and deterministic candidate-slot generator.

After this PR:

- Provider scheduling rules have one canonical definition.
- Provider timezone is explicit and IANA-based.
- Session duration is independently configurable.
- Buffer before a session is independently configurable.
- Buffer after a session is independently configurable.
- Minimum booking notice is independently configurable.
- Maximum booking horizon is independently configurable.
- Weekly working hours are independently configurable.
- Date-specific days off are independently configurable.
- The configured working week is Monday through Friday.
- Candidate slots are derived from session duration and buffers rather than from a separate slot interval.
- Candidate slots are generated deterministically in the provider timezone.
- Slot timestamps become unambiguous instants before leaving the availability-domain layer.
- Daylight-saving behaviour does not depend on the machine timezone.
- Candidate generation does not consult Google Calendar.
- Candidate generation does not consult persisted bookings.
- Candidate generation performs no database I/O.
- Existing customer-facing prototype behaviour remains unchanged.

Future calendar-conflict logic must be able to consume these candidates without redefining provider scheduling rules.

Conceptually:

```text
provider configuration
        ↓
candidate slots
```

A later PR will compose:

```text
candidate slots
        +
active booking conflicts
        +
Google Calendar busy intervals
        ↓
customer-visible bookable slots
```

---

## Current architecture

The application is a Next.js App Router application.

Relevant architecture:

### `src/components/BookingSection.tsx`

- Client Component.
- Generates mocked dates and slots.
- Does not call a real availability endpoint.
- Does not query persisted bookings.
- Does not query Google Calendar.

### `src/lib/booking-date.mjs`

- Defines the existing `Europe/London` booking timezone.
- Provides provider-calendar-date helpers.
- Avoids machine-local timezone assumptions.

### `prisma/schema.prisma`

- Defines persisted bookings.
- Stores `startAt` and `endAt` as timezone-aware timestamps.
- Does not contain provider availability configuration.

### `src/lib/db.ts`

- Owns the server-side Prisma client.
- Must not be required by pure candidate-slot generation.

### `tests/*.test.mjs`

- Use Node's built-in test runner for deterministic domain tests.

Provider availability is currently incidental UI mock data. This PR creates an explicit availability-domain layer without replacing the prototype UI.

---

## External integrations affected

None.

This task must not call:

- Google Calendar;
- Google Meet;
- Stripe;
- an email provider;
- another scheduling service.

No OAuth scopes, credentials, provider-specific retry logic, or webhook behaviour should change.

---

## Configuration and data changes

### Provider availability configuration

Introduce one canonical provider configuration.

The configuration must independently expose:

```text
timezone

sessionDurationMinutes

bufferBeforeMinutes

bufferAfterMinutes

minimumNoticeMinutes

maximumBookingHorizonDays

weeklyWorkingHours

daysOff
```

There must be **no `slotIntervalMinutes` configuration**.

### Initial configuration

Use:

```text
timezone: Europe/London

sessionDurationMinutes: 55

bufferBeforeMinutes: 0

bufferAfterMinutes: 0

minimumNoticeMinutes: 1440

maximumBookingHorizonDays: 56

weeklyWorkingHours:
  Monday:
    10:00–12:30
    14:00–18:00

  Tuesday:
    10:00–12:30
    14:00–18:00

  Wednesday:
    10:00–12:30
    14:00–18:00

  Thursday:
    10:00–12:30
    14:00–18:00

  Friday:
    10:00–12:30
    14:00–18:00

  Saturday:
    unavailable

  Sunday:
    unavailable

daysOff: []
```

All of these values must be independently editable in the canonical configuration.

Changing one must not require changing another.

### Slot spacing

There is no independent slot interval.

Candidate spacing is derived from:

```text
sessionDurationMinutes
+ bufferAfterMinutes
+ bufferBeforeMinutes
```

For consecutive sessions:

```text
first session
10:00–10:55

bufferAfterMinutes: 5
bufferBeforeMinutes: 0

next session
11:00–11:55
```

This gives starts every 60 minutes.

For 55-minute sessions every 75 minutes:

```text
sessionDurationMinutes: 55
bufferBeforeMinutes: 10
bufferAfterMinutes: 10
```

or another configuration where the combined buffers total 20 minutes.

The resulting starts are:

```text
10:00
11:15
12:30
...
```

For starts every 90 minutes, the combined buffers total 35 minutes.

The generator must not contain hard-coded 60-, 75-, or 90-minute scheduling logic.

### `timezone`

- IANA timezone identifier.
- Initial value: `Europe/London`.
- Weekly working hours and `daysOff` are interpreted in this timezone.
- Must not depend on runtime machine timezone.

### `sessionDurationMinutes`

- Positive whole number.
- Initial value: `55`.
- Defines the actual client session.
- Independently configurable.

### `bufferBeforeMinutes`

- Non-negative whole number.
- Independently configurable.
- Represents provider time reserved immediately before each session.

### `bufferAfterMinutes`

- Non-negative whole number.
- Independently configurable.
- Represents provider time reserved immediately after each session.

### Buffer semantics

For:

```text
session start: 10:00
session duration: 55
buffer before: 10
buffer after: 15
```

the customer session is:

```text
10:00–10:55
```

while provider occupancy is:

```text
09:50–11:10
```

The next candidate session must leave sufficient room for:

- the previous session's after-buffer; and
- its own before-buffer.

Therefore candidate starts naturally advance by:

```text
sessionDurationMinutes
+ bufferAfterMinutes
+ bufferBeforeMinutes
```

Example:

```text
session duration: 55
buffer before: 10
buffer after: 10
```

produces a natural 75-minute distance between consecutive starts:

```text
10:00
11:15
12:30
```

Buffers are scheduling rules, not calendar conflicts.

### `minimumNoticeMinutes`

- Non-negative whole number.
- Initial value: `1440`.
- Independently configurable.
- A candidate session start must be at least this many elapsed minutes after the supplied current instant.
- A slot exactly at the notice boundary is eligible.

Use actual instants rather than approximate date arithmetic.

### `maximumBookingHorizonDays`

- Non-negative whole number.
- Initial value: `56`.
- Independently configurable.
- Interpreted using provider-local calendar days.
- The final horizon date is inclusive.

Do not implement this as a fixed millisecond duration because DST can produce 23- or 25-hour local days.

### `weeklyWorkingHours`

- Independently configurable.
- Monday through Friday are configured working days.
- Saturday and Sunday are unavailable by default.
- Each weekday supports zero or more independent working windows.

Each working window contains:

```text
start: HH:mm
end: HH:mm
```

Rules:

- interpret times in provider timezone;
- `start` must precede `end`;
- windows on the same day must not overlap;
- adjacent windows are allowed;
- empty windows mean unavailable;
- candidate generation restarts at the beginning of each independent window;
- provider occupancy including buffers must fit inside the working window.

For a non-zero `bufferBeforeMinutes`, the first customer session start may therefore be later than the start of the working window.

Example:

```text
working window:
10:00–13:00

bufferBeforeMinutes:
10

sessionDurationMinutes:
55

bufferAfterMinutes:
5
```

The first possible customer session begins at:

```text
10:10
```

because its provider occupancy begins at `10:00`.

### `daysOff`

- Independently configurable.
- Collection of ISO provider-local dates in `YYYY-MM-DD` format.
- A configured day off overrides normal weekly working hours.
- Invalid dates must be rejected.
- Duplicate dates must not produce inconsistent behaviour.

Example:

```text
weeklyWorkingHours:
Tuesday: working

daysOff:
2026-12-22
```

means no candidate slots are produced on Tuesday, 22 December 2026.

A day off must not require creating a fake Google Calendar event.

### Configuration validation

Reject invalid configuration including:

- invalid IANA timezone;
- duration less than or equal to zero;
- negative buffer before;
- negative buffer after;
- negative minimum notice;
- negative booking horizon;
- malformed `HH:mm`;
- working-window start greater than or equal to end;
- overlapping working windows;
- malformed or impossible `daysOff` dates.

Do not silently normalize invalid business configuration.

### Environment variables

None.

These are application scheduling rules, not secrets.

### Database or schema

None.

Do not modify:

- `Booking`;
- `BookingStatus`;
- booking constraints;
- Prisma migrations.

Provider availability remains code-owned in this phase.

### Webhooks

None.

### OAuth and permissions

None.

### Deployment configuration

None.

### Migration or backfill

None.

---

## Security and privacy considerations

This task handles no customer personal data and performs no privileged external-service operation.

Requirements:

- Keep canonical provider scheduling rules out of mutable browser state.
- Do not make browser-provided provider configuration authoritative.
- Do not query Prisma from the pure availability layer.
- Do not introduce Google credentials or tokens.
- Do not expose private calendar information.

---

## Required implementation

### 1. Create one canonical provider configuration

Create a narrowly owned availability configuration containing:

```text
timezone
sessionDurationMinutes
bufferBeforeMinutes
bufferAfterMinutes
minimumNoticeMinutes
maximumBookingHorizonDays
weeklyWorkingHours
daysOff
```

Each property must be independently configurable.

Do not introduce `slotIntervalMinutes`.

### 2. Generate consecutive candidates from duration and buffers

Candidate progression within a working window must be based on:

```text
sessionDurationMinutes
+ bufferBeforeMinutes
+ bufferAfterMinutes
```

The implementation must support, for example:

#### Hourly starts

```text
duration: 55
buffer before: 0
buffer after: 5

start spacing: 60 minutes
```

#### 75-minute starts

```text
duration: 55
buffer before: 10
buffer after: 10

start spacing: 75 minutes
```

#### 90-minute starts

```text
duration: 55
buffer before: 15
buffer after: 20

start spacing: 90 minutes
```

These are examples demonstrating configurability, not additional hard-coded modes.

### 3. Generate candidate slots deterministically

Add pure deterministic logic equivalent to:

```text
getProviderCandidateSlotsForDate({
  date,
  now,
  config
})
```

Exact naming may follow repository conventions.

Requirements:

- `date` is a provider-local ISO calendar date;
- `now` is explicitly supplied;
- core logic must not read `Date.now()` implicitly;
- provider timezone determines weekday and wall-clock interpretation;
- non-working days produce no candidates;
- `daysOff` produce no candidates;
- minimum notice is applied;
- maximum horizon is applied;
- all candidates fit inside working windows including buffers;
- results are chronological;
- results contain no duplicates.

### 4. Distinguish session time from provider occupancy

For every candidate, distinguish:

```text
customer session:
startAt → endAt
```

from:

```text
provider occupancy:
startAt - bufferBeforeMinutes
→
endAt + bufferAfterMinutes
```

Provide a pure helper if useful.

Future calendar-conflict logic should use provider occupancy when determining whether a candidate conflicts with another commitment.

### 5. Use unambiguous instants

Working hours are provider-local wall-clock values.

Once resolved, candidate session boundaries must become unambiguous instants, for example:

```text
{
  startAt: "2026-10-13T09:00:00.000Z",
  endAt: "2026-10-13T09:55:00.000Z"
}
```

Do not use ambiguous local datetime strings as the only representation.

### 6. Handle IANA timezone and DST correctly

For `Europe/London`, `10:00` provider-local must continue to mean `10:00 Europe/London` across GMT/BST transitions.

Its UTC representation will change as the timezone offset changes.

Do not:

- append `Z` to local working times;
- rely on machine timezone;
- hard-code GMT/BST offsets;
- treat provider-local dates as UTC dates.

Use a small established timezone library only if required for correctness.

### 7. Apply minimum notice using elapsed time

For:

```text
minimumNoticeMinutes: 1440
```

a candidate must begin at least 24 elapsed hours after `now`.

Do not reduce this rule to:

```text
must be tomorrow or later
```

### 8. Apply maximum horizon using provider calendar dates

Determine today's provider-local calendar date.

For:

```text
maximumBookingHorizonDays: 56
```

the date exactly 56 calendar days later remains eligible.

The following date does not.

### 9. Apply `daysOff` before slot generation

A date contained in `daysOff` must produce:

```text
[]
```

regardless of its weekday working hours.

### 10. Keep calendar conflicts separate

The candidate generator must know nothing about:

- Google Calendar;
- Google FreeBusy;
- Google event IDs;
- Google event structures;
- persisted booking rows;
- `BookingStatus`;
- existing holds;
- occupied booking slots.

Do not accept inputs such as:

```text
googleBusyEvents
calendarEvents
existingBookings
```

This PR generates **configured candidates**, not final bookable availability.

### 11. Do not wire the engine into the customer UI yet

`BookingSection.tsx` may continue using the prototype availability in this PR.

Do not expose configured candidate slots as authoritative customer availability until internal-booking and Google Calendar conflicts are composed with them.

---

## UI implementation requirements

No material UI change.

Do not:

- redesign the booking calendar;
- change customer-facing dates or slots;
- alter layout or typography;
- partially replace mocked availability.

No new visual regression coverage is required.

---

## Acceptance criteria

### Configuration

- [ ] One canonical provider availability configuration exists.
- [ ] `sessionDurationMinutes` is independently configurable.
- [ ] `bufferBeforeMinutes` is independently configurable.
- [ ] `bufferAfterMinutes` is independently configurable.
- [ ] `minimumNoticeMinutes` is independently configurable.
- [ ] `maximumBookingHorizonDays` is independently configurable.
- [ ] `weeklyWorkingHours` is independently configurable.
- [ ] `daysOff` is independently configurable.
- [ ] Provider timezone is explicit.
- [ ] Initial timezone is `Europe/London`.
- [ ] Initial session duration is `55` minutes.
- [ ] Monday through Friday are configured working days.
- [ ] Saturday and Sunday are unavailable by default.
- [ ] There is no `slotIntervalMinutes` setting.

### Candidate generation

- [ ] Consecutive slot spacing is derived from session duration and buffers.
- [ ] No separate cadence value is required.
- [ ] 55-minute duration plus five total buffer minutes can produce starts 60 minutes apart.
- [ ] 55-minute duration plus twenty total buffer minutes can produce starts 75 minutes apart.
- [ ] 55-minute duration plus thirty-five total buffer minutes can produce starts 90 minutes apart.
- [ ] Changing buffers does not require changing candidate-generation code.
- [ ] Changing session duration does not require changing candidate-generation code.
- [ ] Provider occupancy includes both before and after buffers.
- [ ] Candidate provider occupancy always fits within its working window.
- [ ] Non-working weekdays produce no candidates.
- [ ] A configured day off produces no candidates.
- [ ] Candidate slots before the minimum-notice boundary are excluded.
- [ ] A candidate exactly on the minimum-notice boundary is eligible.
- [ ] Dates beyond the maximum horizon produce no candidates.
- [ ] The inclusive horizon date remains eligible.
- [ ] Results are chronological.
- [ ] Results contain no duplicates.

### Timezone behaviour

- [ ] Working-hour interpretation uses provider timezone.
- [ ] Provider-local dates are not treated as UTC.
- [ ] Candidate session boundaries become unambiguous instants.
- [ ] Provider occupancy boundaries become unambiguous instants.
- [ ] Tests cover London GMT/BST behaviour.
- [ ] Core calculations do not depend on machine timezone.
- [ ] `now` is injectable.

### Separation of concerns

- [ ] No Google Calendar request is made.
- [ ] No Google SDK is imported.
- [ ] No Prisma/database query occurs.
- [ ] Persisted bookings are not inspected.
- [ ] Provider configuration contains no Google-specific fields.
- [ ] Provider configuration contains no Stripe-specific fields.
- [ ] Calendar conflicts remain deferred.
- [ ] Existing-booking conflicts remain deferred.

### Existing behaviour

- [ ] Booking UI remains visually unchanged.
- [ ] Prototype availability remains in place.
- [ ] Booking schema remains unchanged.
- [ ] Existing booking-date tests pass.
- [ ] Existing booking-schema tests pass when database test configuration is available.

### Code quality

- [ ] Availability logic has one clear ownership location.
- [ ] Provider rules are not duplicated unnecessarily.
- [ ] No unnecessary dependency is introduced.
- [ ] No unrelated refactor is included.
- [ ] Type checking passes.
- [ ] `npm test` passes.
- [ ] Production build passes.

---

## Tests to add or update

Add:

```text
tests/provider-availability.test.mjs
```

### Unit tests

Cover:

#### Default configuration

Verify:

- timezone;
- 55-minute duration;
- buffer values;
- notice;
- horizon;
- Monday-Friday working days;
- weekend non-working days.

#### Independent configuration

Verify each of these can change without requiring changes to another:

```text
sessionDurationMinutes
bufferBeforeMinutes
bufferAfterMinutes
minimumNoticeMinutes
maximumBookingHorizonDays
weeklyWorkingHours
daysOff
```

#### Buffer-derived hourly cadence

Test:

```text
sessionDurationMinutes: 55
bufferBeforeMinutes: 0
bufferAfterMinutes: 5
```

Verify candidate starts are 60 minutes apart.

#### Buffer-derived 75-minute cadence

Test a configuration where:

```text
bufferBeforeMinutes + bufferAfterMinutes = 20
```

with a 55-minute session.

Verify candidate starts are 75 minutes apart.

#### Buffer-derived 90-minute cadence

Test a configuration where:

```text
bufferBeforeMinutes + bufferAfterMinutes = 35
```

with a 55-minute session.

Verify candidate starts are 90 minutes apart.

#### Working hours

Verify:

```text
Monday -> candidates
Tuesday -> candidates
Wednesday -> candidates
Thursday -> candidates
Friday -> candidates
Saturday -> []
Sunday -> []
```

using deterministic dates.

#### Working-window boundaries

Test that both session and buffers must fit inside the configured window.

#### Days off

Configure an otherwise-working weekday as a day off.

Verify no candidates.

#### Minimum notice

Test:

- just before boundary;
- exactly at boundary;
- just after boundary.

#### Maximum horizon

Test:

- inside horizon;
- exact inclusive final date;
- first date outside horizon.

#### DST

Test provider-local working times on both GMT and BST dates.

Verify the same local session time maps to the correct differing UTC instants.

#### Invalid configuration

Reject:

- invalid timezone;
- zero/negative duration;
- negative buffers;
- negative notice;
- negative horizon;
- malformed working times;
- invalid working windows;
- overlapping windows;
- invalid day-off dates.

### Integration tests

N/A.

### Browser tests

No new browser tests required.

Existing browser tests must continue to pass.

### Visual regression tests

N/A.

---

## Verification commands

```bash
# Install only if dependencies changed
npm install

# Targeted availability tests
node --test tests/provider-availability.test.mjs

# All unit/schema tests
npm test

# TypeScript checking
npm run lint

# Production build
npm run build
```

No Prisma migration should be created for this task.

`npm run db:validate` may be used as an additional regression check.

If a command cannot run, document:

1. the intended command;
2. why it could not run;
3. what verification was performed instead.

---

## Completion report

### Changed

Summarise:

- provider availability configuration;
- candidate generation;
- buffer-derived slot progression;
- provider occupancy calculation;
- timezone/date helpers;
- configuration validation;
- significant files changed.

### Tests

List tests and verification commands.

Explicitly include coverage for:

- 55-minute duration;
- buffer-derived 60-minute start spacing;
- buffer-derived 75-minute start spacing;
- buffer-derived 90-minute start spacing;
- Monday-Friday working hours;
- days off;
- minimum notice;
- maximum horizon;
- buffers;
- London DST handling.

### External configuration

`None.`

### Deviations

Document:

- changed initial availability values;
- new dependencies;
- different module structure;
- unexpected UI changes.

Use `None` when there are no deviations.

### Remaining issues

This PR intentionally does not make candidate slots authoritative customer availability.

Follow-up work must compose them with:

- active internal booking/hold conflicts;
- Google Calendar busy intervals;
- a server availability API/boundary;
- customer-facing availability rendering;
- final server-side availability revalidation before booking.
