# PR #6 — Unified availability engine

## Repository state

**Expected branch:**  
`feat/006-unified-availability-engine`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  

- PR #2 — Booking domain + database schema
- PR #3 — Provider availability configuration
- PR #4 — Connect Google Calendar
- PR #5 — Google Calendar busy-time integration

PR #5 is merged and provides the server-only Google Calendar `getBusyPeriods(from, to)` boundary.

### Read first

Before making changes, read:

- `AGENTS.md`
- `.codex/tasks/002-booking-domain-database-schema.md`
- `.codex/tasks/003-provider-availability-configuration.md`
- `.codex/tasks/005-google-calendar-busy-time-integration.md`
- `package.json`
- `prisma/schema.prisma`
- `src/lib/db.ts`
- `src/lib/availability/provider-config.mjs`
- `src/lib/availability/candidate-slots.mjs`
- `src/lib/calendar/busy-periods.mjs`
- `src/lib/booking-date.mjs`
- `src/components/BookingSection.tsx`
- `src/components/FullCalendarModal.tsx`
- `src/types.ts`
- `tests/provider-availability.test.mjs`
- `tests/google-calendar-busy-periods.test.mjs`
- relevant existing browser tests

### Primary change area

Unified server-side booking availability.

This layer answers:

> Which configured session slots are genuinely bookable after considering provider rules, existing bookings, and Google Calendar conflicts?

Conceptually:

```text
provider configuration
        ↓
candidate slots
        +
active booking conflicts
        +
Google Calendar busy periods
        ↓
available slots
        ↓
customer availability API
        ↓
booking UI
```

The browser must receive **available slots**, not Google Calendar busy periods, calendar events, booking records, or other private scheduling data.

### Canonical implementation examples

Use:

- `src/lib/availability/candidate-slots.mjs` for provider-owned candidate generation and occupancy intervals.
- `src/lib/availability/provider-config.mjs` for canonical scheduling rules.
- `src/lib/calendar/busy-periods.mjs` as the Google Calendar availability boundary.
- `src/lib/db.ts` for server-side Prisma access.
- `prisma/schema.prisma` for authoritative booking status semantics.
- existing route-handler conventions under `src/app/api`.
- existing Node test patterns under `tests/`.

Do not duplicate candidate generation inside the unified engine.

Do not query Google Calendar directly from the API route or UI when `getBusyPeriods()` already provides the required boundary.

### Relevant symbols

Inspect and reuse where appropriate:

- `PROVIDER_AVAILABILITY_CONFIG`
- `ProviderAvailabilityConfig`
- `ProviderCandidateSlot`
- `getProviderCandidateSlotsForDate`
- `validateProviderAvailabilityConfig`
- `getBusyPeriods`
- `CalendarAvailabilityError`
- `BookingStatus`
- `Booking`
- `db`
- `BOOKING_TIME_ZONE`
- `BookingSection`
- `FullCalendarModal`
- `DayAvailability`
- `TimeSlot`

Introduce a server-owned orchestration boundary equivalent to:

```text
getAvailableSlots(dateRange)
```

Exact naming and input shape may follow repository conventions.

### Expected change surface

Expected additions or changes include:

```text
src/lib/availability/
  available-slots.*
  booking-conflicts.*

src/app/api/availability/
  route.ts

src/components/BookingSection.tsx
src/components/FullCalendarModal.tsx
src/types.ts

tests/
  unified-availability.test.mjs
  availability-route.test.mjs

tests/browser/
  relevant booking availability coverage
```

Supporting date helpers may be added to `src/lib/booking-date.mjs` where genuinely reusable.

### Excluded areas

Do not include:

- Apple Calendar or iCloud integration;
- new calendar providers;
- broader Google OAuth scopes;
- Google Calendar event creation;
- Google Meet creation;
- Stripe;
- booking creation;
- booking HOLD creation;
- payment flows;
- lifecycle transitions;
- cancellation/refund implementation;
- provider/admin scheduling UI;
- persistence of provider availability configuration;
- changes to session price;
- database schema changes unless an implementation blocker is discovered and documented;
- unrelated booking-form redesign;
- customer timezone redesign;
- unrelated refactors.

This PR determines and displays availability only.

### Unknowns Codex must verify

Verify before editing:

- whether a scoped `AGENTS.md` applies;
- the current API route-handler conventions;
- the current browser-test fixtures for `BookingSection`;
- how the page currently derives `initialAvailabilityDate`;
- whether shared date-range helpers should live in `booking-date.mjs`;
- generated Prisma enum/type import conventions;
- whether existing browser tests depend on the mocked Tuesday–Saturday schedule;
- whether existing availability-related text contains assumptions that conflict with the canonical Monday–Friday configuration.

Do not preserve mocked scheduling assumptions merely because the existing UI contains them.

---

## Objective

Implement one authoritative server-side availability engine that combines:

- canonical provider working hours;
- configured days off;
- session duration;
- before/after buffers;
- minimum booking notice;
- maximum booking horizon;
- active persisted bookings;
- Google Calendar busy periods.

Expose the resulting **available session slots** through a customer-safe API and use that API as the booking UI's availability source.

After this PR:

- the browser no longer generates fake availability;
- the browser does not receive Google Calendar busy periods;
- the browser does not receive raw booking conflicts;
- the browser does not receive calendar event details;
- working-hours logic remains owned by the provider candidate generator;
- Google Calendar logic remains owned by `getBusyPeriods()`;
- persistence logic remains server-side;
- unavailable slots are removed before data reaches the client;
- Google or database failures never become false availability;
- available slots are deterministic, sorted and duplicate-free.

The server remains authoritative.

Availability displayed to a user is **not** a reservation and must still be revalidated by a later booking/hold workflow immediately before claiming a slot.

---

## Current architecture

### Provider availability

`src/lib/availability/provider-config.mjs` defines the canonical provider configuration, including:

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

`src/lib/availability/candidate-slots.mjs` generates deterministic candidate slots.

Candidate slots already expose both:

```text
startAt
endAt
occupancyStartAt
occupancyEndAt
```

The occupancy interval includes configured before/after buffers.

This PR must consume those values rather than reimplementing buffer calculations.

### Google Calendar

`src/lib/calendar/busy-periods.mjs` provides:

```text
getBusyPeriods(from, to)
```

It returns normalized intervals only:

```text
{
  startAt,
  endAt
}
```

It deliberately hides Google event structures and event metadata.

The unified availability engine should treat this as the calendar-conflict boundary.

### Booking persistence

The existing `Booking` model stores:

```text
startAt
endAt
status
expiresAt
```

The existing domain establishes:

```text
HOLD
PAID
CONFIRMED
```

as slot-owning states, while:

```text
CANCELLED
REFUNDED
```

release the slot.

An expired `HOLD` must not continue blocking availability.

### Booking UI

`BookingSection.tsx` currently generates mocked future dates and slots in browser code.

Those mocked slots are not authoritative and must be replaced by server-derived availability.

`FullCalendarModal` consumes the same availability data and should continue using the existing design rather than introducing a second calendar UI.

---

## External integrations affected

### Google Calendar

Operation:

- read normalized FreeBusy intervals through the existing `getBusyPeriods(from, to)` service.

Ownership:

- remains server-side.

Authentication:

- unchanged.

OAuth scopes:

- unchanged.

No Events scopes may be added.

No Google event titles, descriptions, attendees, IDs or other private event data may enter the availability API.

### Apple/iCloud

None.

There is no Apple/iCloud calendar integration in the current architecture.

Do not add one as part of this PR.

---

## Configuration and data changes

### Environment variables

None.

Use the existing database and Google Calendar configuration.

### Database or schema

No schema migration is expected.

Use the existing `Booking` table.

### Webhooks

None.

### OAuth and permissions

No changes.

Use the Google permissions established by PR #5.

### Deployment configuration

None expected.

### Migration or backfill

None.

---

## Security and privacy considerations

Availability is a public customer-facing capability but depends on private data.

The public client must never receive:

- Google Calendar event objects;
- Google busy intervals;
- calendar IDs;
- Google OAuth credentials;
- access or refresh tokens;
- booking IDs;
- booking statuses;
- customer names;
- customer emails;
- booking notes;
- conflict sources;
- internal occupancy intervals;
- provider-specific error payloads.

The customer-facing response should expose only what is required to render bookable dates and times.

At minimum, individual slots may contain:

```text
startAt
endAt
```

Provider timezone and other non-sensitive presentation metadata may be included where required.

Do not indicate whether a slot disappeared because of:

- another customer booking;
- a private Google Calendar event;
- a provider day off;
- working hours;
- minimum notice.

They are all simply unavailable.

All database and Google operations must remain server-side.

---

## Required implementation

### 1. Add the unified availability service

Introduce one server-owned service equivalent to:

```text
getAvailableSlots({
  fromDate,
  toDate,
  now
})
```

Exact names may follow repository conventions.

`fromDate` and `toDate` should represent unambiguous provider-local calendar dates.

The date range is inclusive.

`now` must be injectable for deterministic tests.

Normal production orchestration may read the current instant once and pass that value through the calculation.

Do not allow different stages of one availability calculation to observe different implicit current times.

### 2. Reuse canonical candidate generation

For every provider-local date in the requested range:

```text
getProviderCandidateSlotsForDate(...)
```

must remain authoritative for:

- weekly working hours;
- days off;
- session duration;
- before/after buffers;
- minimum notice;
- maximum booking horizon;
- provider timezone;
- DST conversion.

Do not duplicate any of these rules in the new service.

If candidate generation produces no candidates, return no slots without making unnecessary Google or database requests.

### 3. Load booking conflicts efficiently

Query persisted bookings for the requested candidate range.

Do not perform one database query per candidate slot.

The implementation should normally use one bounded query covering the requested interval and then perform deterministic overlap filtering in application code.

Slot-owning booking rules:

#### `CONFIRMED`

Always blocks overlapping availability.

#### `PAID`

Always blocks overlapping availability.

#### `HOLD`

Blocks only while:

```text
expiresAt > now
```

An expired HOLD releases the slot.

#### `CANCELLED`

Does not block.

#### `REFUNDED`

Does not block.

Use the existing model rather than introducing new availability-specific persistence.

### 4. Apply buffers to booking conflicts

Existing bookings store customer session start/end timestamps rather than explicit occupancy timestamps.

For conflict calculation, derive provider occupancy for an existing booking using the canonical current availability configuration:

```text
booking occupancy start
=
booking.startAt - bufferBeforeMinutes

booking occupancy end
=
booking.endAt + bufferAfterMinutes
```

Compare candidate occupancy against booking occupancy.

Do not mutate persisted booking timestamps.

### 5. Query Google busy periods once per range

Determine the smallest absolute interval necessary to cover all candidate occupancy intervals.

Call:

```text
getBusyPeriods(from, to)
```

once for that interval.

Do not call Google once per:

- date;
- candidate;
- slot.

Do not bypass the existing calendar service by calling Google APIs directly.

### 6. Define one interval-overlap rule

Treat all conflict intervals as half-open:

```text
[start, end)
```

Two intervals overlap when:

```text
a.start < b.end
&&
a.end > b.start
```

Intervals that only touch at a boundary do not conflict.

Examples:

```text
candidate occupancy: 10:00–11:00
busy period:         11:00–12:00

=> available
```

```text
candidate occupancy: 10:00–11:00
busy period:         10:59–12:00

=> unavailable
```

The same rule must be used consistently for:

- booking conflicts;
- Google busy intervals.

A candidate's **occupancy** interval, not merely its customer session interval, is used for conflict checks.

### 7. Filter candidates

A candidate is available only when:

```text
candidate generated by provider configuration
AND
no active booking occupancy overlaps it
AND
no Google busy interval overlaps it
```

Return available session timestamps only.

Internal buffer/occupancy timestamps must not be exposed by the customer API unless a future requirement explicitly needs them.

Results must be:

- chronological;
- duplicate-free;
- valid UTC/RFC3339 timestamps.

### 8. Fail closed

A failure to determine conflicts must never be interpreted as an empty conflict list.

Examples:

- database unavailable;
- Google Calendar unavailable;
- Google token revoked;
- reauthorization required;
- malformed Google response;
- unexpected availability dependency failure.

These cases must produce an availability failure.

They must **not** make every candidate appear free.

A legitimate day with no slots is different from an inability to calculate availability.

### 9. Add the customer availability API

Add a public read-only availability route using existing Next.js route-handler conventions.

For example:

```text
GET /api/availability
```

with a bounded date-range input where needed.

The API must invoke the unified availability engine.

Do not expose `getBusyPeriods()` directly.

A successful response should contain customer-safe availability such as:

```json
{
  "timezone": "Europe/London",
  "days": [
    {
      "date": "2026-09-16",
      "slots": [
        {
          "startAt": "2026-09-16T09:00:00.000Z",
          "endAt": "2026-09-16T09:55:00.000Z"
        }
      ]
    }
  ]
}
```

Exact response structure may follow repository conventions.

Do not include unavailable/conflicting slots merely with:

```text
available: false
```

when doing so would reveal unnecessary scheduling information.

Prefer returning the slots that are actually bookable.

### 10. Validate API input

Reject malformed or abusive date ranges before database or Google work.

Requirements:

- valid ISO provider-local dates;
- start must not follow end;
- range must be bounded by the configured booking horizon;
- no arbitrary multi-year availability query;
- client-supplied timezone must not redefine provider scheduling rules.

Return a stable `400` response for invalid input.

Do not expose stack traces or raw provider errors.

### 11. Prevent stale availability responses

Availability is time-sensitive.

The availability route must not be statically cached or served from an inappropriate framework cache.

Use the repository's established dynamic/no-store mechanism.

Do not add an application cache in this PR.

### 12. Replace browser-generated mock availability

Update `BookingSection.tsx` so dates and times originate from the availability API rather than the existing `useMemo` mock generator.

Remove scheduling assumptions such as:

- fake Tuesday–Saturday availability;
- hard-coded mock time slots;
- artificial Saturday slot removal;
- browser-generated future availability.

Preserve the current visual language.

Transform the API response into presentation data on the client where necessary.

Formatting is presentation logic; determining whether a slot exists is server logic.

### 13. Preserve explicit timezone handling

Server timestamps remain absolute instants.

Format displayed dates/times explicitly using the provider timezone currently used by the product.

Do not depend on the browser machine timezone when deciding which provider date a slot belongs to.

Do not implement a customer-timezone selection redesign in this PR.

### 14. Handle availability UI states

The booking UI must distinguish:

- loading;
- available;
- no availability;
- recoverable availability-service error.

Do not silently fall back to mocked availability when the API fails.

If availability cannot be calculated, the UI must not offer selectable times.

Existing date/slot styling should be preserved wherever possible.

### 15. Keep date selection valid when data changes

When availability data loads or refreshes:

- selected date must correspond to an available date;
- selected slot must correspond to an available slot for that date;
- if the currently selected slot disappears, choose a valid available slot or clear the selection;
- never submit a slot that is no longer present in the current client availability state.

This client-side validation does not replace later server-side revalidation during booking creation.

### 16. Update the full-calendar modal

`FullCalendarModal` must use real availability.

Remove or change hard-coded descriptive copy that contradicts the canonical provider schedule.

Dates with no returned slots must not appear selectable.

Do not expose the reason a date is unavailable.

---

## External-service failure handling

### Google unavailable

If `getBusyPeriods()` cannot reliably determine Google availability:

```text
availability calculation fails
```

Do not return provider candidates as available.

### Google reauthorization required

Treat this as an availability-service failure.

Do not expose OAuth details to the customer.

The public response may use a generic stable error such as:

```text
availability_unavailable
```

while server-side handling retains enough information for diagnostics.

### Database unavailable

Fail the availability request.

Do not assume there are no bookings.

### No Google connection

Because the current product intentionally uses Google Calendar as an availability source, failure to establish its busy state must not silently produce bookable slots.

### Legitimately empty availability

Return a successful empty result when availability was calculated successfully and no slots remain.

This is distinct from an infrastructure/integration error.

---

## UI implementation requirements

Preserve the current booking design.

This PR should change the **source and states of availability**, not redesign the booking section.

Requirements:

- existing date-strip interaction remains recognizable;
- existing full-calendar modal remains recognizable;
- available times remain keyboard accessible;
- loading state prevents premature slot interaction;
- error state is accessible and understandable;
- empty state clearly indicates that no times are currently available;
- no private calendar information appears in DOM content, API payloads or browser logs;
- responsive behaviour remains intact.

Do not add a second calendar component unless the current component cannot reasonably consume real availability.

---

## Acceptance criteria

### Unified engine

- [ ] A canonical server-side `getAvailableSlots(...)`-style service exists.
- [ ] It reuses provider candidate generation rather than duplicating scheduling rules.
- [ ] Working hours are respected.
- [ ] Configured days off are respected.
- [ ] Minimum notice is respected.
- [ ] Maximum booking horizon is respected.
- [ ] Session duration is respected.
- [ ] Before/after buffers are respected.
- [ ] Active persisted bookings remove conflicting candidates.
- [ ] Expired HOLD bookings do not block availability.
- [ ] CANCELLED bookings do not block availability.
- [ ] REFUNDED bookings do not block availability.
- [ ] PAID bookings block availability.
- [ ] CONFIRMED bookings block availability.
- [ ] Google busy periods remove conflicting candidates.
- [ ] Boundary-touching half-open intervals do not falsely conflict.
- [ ] Results are sorted and duplicate-free.

### Efficiency

- [ ] The implementation does not query the database once per candidate.
- [ ] The implementation does not query Google once per candidate.
- [ ] A normal range calculation uses one bounded booking query and one Google FreeBusy query where candidates exist.
- [ ] No Google/database work occurs when provider rules produce no candidates.

### Privacy

- [ ] The browser receives available slots rather than Google busy intervals.
- [ ] The browser never receives Google event data.
- [ ] The browser never receives booking records.
- [ ] The browser never receives conflict-source information.
- [ ] Google credentials and tokens remain server-side.
- [ ] Internal occupancy intervals are not exposed unnecessarily.

### API

- [ ] A customer-safe availability endpoint exists.
- [ ] Invalid date ranges return a stable client error.
- [ ] Successful empty availability is distinguishable from a calculation failure.
- [ ] Google failures do not become false availability.
- [ ] Database failures do not become false availability.
- [ ] Availability responses are not incorrectly cached.

### UI

- [ ] `BookingSection` no longer generates mock scheduling availability.
- [ ] Dates shown as available contain at least one available slot.
- [ ] Times shown to the user come from unified server availability.
- [ ] Loading state is handled.
- [ ] Empty state is handled.
- [ ] Availability error state is handled.
- [ ] The full-calendar modal reflects real availability.
- [ ] Existing visual design is preserved.
- [ ] Hard-coded scheduling copy that conflicts with canonical configuration is removed.
- [ ] A failed availability request never falls back to fake slots.

### Architecture

- [ ] Google API details remain behind `getBusyPeriods()`.
- [ ] Candidate scheduling remains behind the provider availability layer.
- [ ] Database access remains server-side.
- [ ] UI code contains no Google Calendar integration logic.
- [ ] No Apple/iCloud integration is introduced.
- [ ] No new OAuth scopes are introduced.
- [ ] No database migration is introduced unless explicitly justified.

### Code quality

- [ ] Existing repository conventions are followed.
- [ ] Type safety is preserved.
- [ ] No unnecessary dependency is introduced.
- [ ] No unrelated refactor is included.
- [ ] Lint/type checking passes.
- [ ] Tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### Unit tests

Add focused unified availability tests, preferably in:

```text
tests/unified-availability.test.mjs
```

Cover at minimum:

#### No conflicts

A valid candidate remains available when there are:

```text
no booking conflicts
no Google busy periods
```

#### Google conflict

A candidate whose occupancy overlaps Google busy time is removed.

#### Google boundary

A busy interval beginning exactly when candidate occupancy ends does not remove the candidate.

#### Existing CONFIRMED booking

Overlapping slot is removed.

#### Existing PAID booking

Overlapping slot is removed.

#### Active HOLD

A HOLD with:

```text
expiresAt > now
```

removes the conflicting slot.

#### Expired HOLD

A HOLD with:

```text
expiresAt <= now
```

does not block.

#### CANCELLED booking

Does not block.

#### REFUNDED booking

Does not block.

#### Buffers

Verify conflicts during:

```text
buffer-before time
```

and:

```text
buffer-after time
```

remove the affected slot even when the customer-facing session timestamps themselves do not overlap.

#### Multiple conflict sources

A range containing:

```text
provider candidates
bookings
Google busy periods
```

returns only the remaining genuinely available slots.

#### Empty candidate range

No database or Google query is required.

#### Dependency failure

Google or database failure is propagated as an availability failure rather than treated as no conflicts.

#### Ordering

Returned slots are chronological and duplicate-free.

#### DST

Retain deterministic provider-local behaviour across relevant Europe/London DST boundaries.

### Integration tests

Add route-handler coverage, for example:

```text
tests/availability-route.test.mjs
```

Cover:

- valid availability request;
- invalid date syntax;
- reversed range;
- excessive range;
- successful empty availability;
- availability-service failure;
- Google reauthorization failure mapping;
- stable customer-safe error response;
- response contains available slots only;
- response does not contain calendar events;
- response does not contain busy intervals;
- response does not contain booking/customer data;
- response is configured as dynamic/no-store.

Use deterministic mocks/test doubles.

Do not call a developer's real Google account.

### Existing tests

Keep passing:

```text
tests/provider-availability.test.mjs
tests/google-calendar-busy-periods.test.mjs
tests/booking-schema.test.mjs
```

Do not weaken these tests merely to simplify composition.

### Browser tests

Update or add Playwright coverage for the booking availability UI.

Cover:

- availability loading;
- returned dates displayed;
- returned slots displayed;
- date selection;
- slot selection;
- full-calendar modal using real API-shaped data;
- no-availability state;
- API error state;
- unavailable dates cannot be selected;
- responsive behaviour where existing booking tests cover it.

Browser tests should intercept/mock the availability endpoint with deterministic fixtures rather than depend on Google Calendar or PostgreSQL.

No visual redesign is intended. Add or update visual snapshots only where existing snapshot coverage is affected or new loading/error/empty rendering materially warrants it.

---

## Verification commands

Run:

```bash
npm run lint

npm test

node --conditions=react-server --experimental-test-module-mocks --test tests/unified-availability.test.mjs

node --conditions=react-server --experimental-test-module-mocks --test tests/availability-route.test.mjs

npm run db:validate

npm run test:browser

npm run build
```

If a focused test filename differs from this specification because repository conventions require another name, run the actual resulting focused test instead and report it.

If database-backed tests require environment configuration unavailable in the implementation environment, document:

1. the command that should run;
2. why it could not run;
3. the deterministic verification performed instead.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- unified availability orchestration;
- booking-conflict filtering;
- Google busy-period composition;
- availability API;
- removal of client-side mock availability;
- booking UI availability states.

### Tests

List:

- tests added or updated;
- verification commands run;
- results.

### External configuration

Expected:

```text
None.
```

PR #5's Google FreeBusy OAuth configuration must already be operational.

### Deviations

Describe any meaningful deviation from this specification and why it was necessary.

Use:

```text
None.
```

when there were no deviations.

### Remaining issues

Explicitly note that:

- availability displayed in the browser is not yet a reservation;
- the future booking/HOLD workflow must revalidate availability immediately before claiming the slot;
- concurrency/double-booking protection belongs to that booking mutation workflow.

Do not weaken the availability engine to compensate for booking creation not yet being implemented.
