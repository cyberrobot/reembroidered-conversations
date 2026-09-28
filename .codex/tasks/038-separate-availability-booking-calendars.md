# PR #38 — Separate availability and booking calendars

## Repository state

**Expected branch:**  
`feat/038-separate-availability-booking-calendars`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**  

- Existing Google Calendar OAuth integration
- Existing Google FreeBusy availability integration
- Existing Google Calendar event + Google Meet integration
- Existing booking conflict persistence
- Existing cancellation, rescheduling and reconciliation flows
- No new package dependency expected
- No Prisma migration expected

### Read first

Before making changes, read the repository guidance relevant to this task:

- `AGENTS.md`
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/004-connect-google-calendar.md`
- `.codex/tasks/005-google-calendar-busy-time-integration.md`
- `.codex/tasks/013-google-calendar-event-google-meet.md`
- `.codex/tasks/032-stage-level-google-calendar-availability-diagnostics.md`
- `README.md`
- `.env.example`
- `prisma/schema.prisma`
- `package.json`

There is currently no more narrowly scoped `AGENTS.md` below the repository root.

### Primary change area

Google Calendar integration, specifically the distinction between:

- the calendar queried for practitioner availability; and
- the calendar used for customer booking events and Google Meet creation.

### Canonical implementation examples

Use the existing Google Calendar integration boundaries and dependency-injection patterns:

- `src/lib/calendar/busy-periods.mjs`
- `src/lib/calendar/booking-event.mjs`
- `src/lib/google-calendar/config.ts`
- `src/lib/google-calendar/connection.ts`
- `src/lib/google-calendar/google-api.mjs`
- `src/lib/google-calendar/flow.mjs`
- `src/lib/google-calendar/constants.mjs`
- `src/lib/availability/booking-conflicts.mjs`

Relevant tests:

- `tests/google-calendar-busy-periods.test.mjs`
- `tests/google-calendar-event.test.mjs`
- `tests/google-calendar-connection.test.mjs`
- `tests/google-calendar-flow.test.mjs`
- `tests/google-calendar-oauth.test.mjs`

### Relevant symbols

Inspect before editing:

- `getBusyPeriods`
- `queryGoogleFreeBusy`
- `getGoogleCalendarCredentials`
- `getGoogleOAuthConfig`
- `completeGoogleOAuth`
- `discoverPrimaryCalendar`
- `saveGoogleCalendarConnection`
- `reconcileBookingCalendarEvent`
- `cancelBookingCalendarEvent`
- `rescheduleBookingCalendarEvent`
- `getManagementAccess`
- `GOOGLE_FREEBUSY_SCOPE`
- `GOOGLE_EVENTS_OWNED_SCOPE`
- `GOOGLE_OAUTH_SCOPES`
- `GOOGLE_CONNECTION_ID`
- `GoogleCalendarConnection.calendarId`
- `getActiveBookingConflicts`
- `toBookingOccupancyIntervals`

### Expected change surface

Expected changes:

```text
.env.example
README.md

src/lib/google-calendar/config.ts
src/lib/calendar/busy-periods.mjs

tests/google-calendar-busy-periods.test.mjs
tests/google-calendar-event.test.mjs   # regression coverage if necessary
```

Small test-only changes elsewhere in the existing Google Calendar suites are acceptable where required.

No change should normally be required to:

```text
prisma/schema.prisma
src/lib/google-calendar/connection.ts
src/lib/google-calendar/flow.mjs
src/lib/google-calendar/oauth.mjs
src/lib/calendar/booking-event.mjs
src/lib/google-calendar/google-api.mjs
```

unless repository inspection establishes that a small adjustment is necessary to preserve the intended boundaries.

### Excluded areas

Do not implement as part of this PR:

- a second Google OAuth connection
- a second `GoogleCalendarConnection` database row
- a database schema change
- a calendar-selection admin UI
- multi-calendar availability configuration
- changes to Stripe
- changes to booking state transitions
- changes to Google Meet creation
- changes to cancellation or refund behaviour
- changes to rescheduling semantics
- changes to reconciliation semantics
- new OAuth scopes
- changes to token encryption
- customer-facing UI changes
- booking-page redesign
- unrelated marketing or editorial changes
- replacing the existing REST-based Google integration with another SDK

### Unknowns Codex must verify

Before editing, verify from the current repository:

- every current use of `GoogleCalendarConnection.calendarId`;
- that event creation, lookup, cancellation and rescheduling consistently use the persisted connection calendar;
- that availability is the only flow which must stop using the persisted connection calendar as its FreeBusy target;
- that `HOLD`, `PAID` and `CONFIRMED` bookings already block slots through database booking conflicts independently of Google Calendar;
- that no other availability path bypasses `getBusyPeriods()`;
- that no existing configuration variable already represents an availability-calendar ID;
- that current production/deployment documentation does not define a separate availability calendar.

Do not broaden the implementation if these assumptions remain true.

---

## Objective

Separate the Google Calendar used to determine practitioner availability from the Google Calendar used to create customer bookings.

The intended production model is:

```text
Practitioner's personal Google calendar
        │
        │ shared as free/busy only
        ▼
Dedicated booking Google account
        │
        ├── FreeBusy reads personal availability calendar
        │
        └── Own primary calendar
              │
              ├── customer booking events
              ├── Google Meet conferences
              ├── cancellations
              └── reschedules
```

The dedicated booking Google account must use the intended public/stage/business identity.

Its primary calendar remains the calendar persisted in:

```text
GoogleCalendarConnection.calendarId
```

and remains the target for all booking-event operations.

Introduce a separate server-only configuration value identifying the calendar whose FreeBusy information determines practitioner availability.

The application must therefore treat these concepts independently:

```text
availabilityCalendarId
    → FreeBusy only

GoogleCalendarConnection.calendarId
    → booking/event calendar
```

The personal availability calendar must never be used by application booking-event creation, update or deletion.

The dedicated booking calendar must never replace the practitioner's personal calendar as the source of personal availability.

The purpose is to prevent customer Calendar invitations from being created using the practitioner's personal Google account identity while retaining personal-calendar conflicts in website availability.

Existing booking behaviour, payment behaviour, Meet creation, cancellation, rescheduling and recovery behaviour must otherwise remain unchanged.

---

## Current architecture

The application currently stores one Google Calendar connection:

```text
GoogleCalendarConnection
```

with:

```text
googleSubject
googleEmail
calendarId
calendarSummary
calendarTimeZone
refreshTokenEncrypted
grantedScopes
```

The OAuth callback authenticates one allowlisted Google account, discovers that account's **primary calendar**, and persists the primary calendar ID as:

```text
GoogleCalendarConnection.calendarId
```

The same persisted calendar ID currently has two responsibilities.

### Availability

`getBusyPeriods()`:

```text
load connected Google credentials
        ↓
refresh access token
        ↓
queryGoogleFreeBusy({
  calendarId: credentials.calendarId
})
```

### Booking events

`reconcileBookingCalendarEvent()` and the booking-management operations use:

```text
credentials.calendarId
```

for:

- event insertion;
- deterministic-event reconciliation;
- event retrieval;
- cancellation;
- rescheduling.

This means the account/calendar providing personal availability is also the account/calendar creating customer invitations.

### Booking conflicts

Application-created bookings do not rely solely on Google Calendar to remain unavailable.

The existing booking conflict layer already treats relevant persisted:

```text
HOLD
PAID
CONFIRMED
```

bookings as slot-owning conflicts.

This PR must preserve that behaviour.

Therefore the booking calendar does not need to be added to the Google FreeBusy request merely to prevent existing application bookings from being offered again.

---

## External integrations affected

### Google Calendar

This PR changes only which calendar is queried by the existing FreeBusy operation.

#### Availability operation

Before:

```text
FreeBusy
    calendarId = GoogleCalendarConnection.calendarId
```

After:

```text
FreeBusy
    calendarId = GOOGLE_AVAILABILITY_CALENDAR_ID
```

The OAuth credentials used to make the request remain those from the single connected Google account.

The configured availability calendar must therefore be visible to that account with sufficient FreeBusy permission.

Do not fetch event titles, descriptions, attendees or other personal-calendar event details.

#### Booking-event operations

No behavioural change.

The following must continue using:

```text
GoogleCalendarConnection.calendarId
```

as the booking calendar:

- `Events.insert`
- `Events.get`
- `Events.patch`
- `Events.delete`
- Google Meet conference creation
- deterministic event reconciliation

The persisted calendar is expected to be the primary calendar owned by the dedicated booking Google account.

### Google Meet

No change.

Meet conferences continue to be created through Google Calendar `conferenceData`.

### Stripe

No change.

### Resend

No change.

### Railway

One new environment variable is required on the production web service.

No service topology change is required.

---

## Configuration and data changes

### Environment variables

Add:

```env
GOOGLE_AVAILABILITY_CALENDAR_ID="personal-calendar@example.com"
```

Requirements:

- server-only;
- required;
- must not use a `NEXT_PUBLIC_` prefix;
- identifies the calendar whose FreeBusy periods block practitioner availability;
- must be accessible to the connected dedicated booking Google account.

Update `.env.example`.

Update the production environment-variable table in `README.md`.

Update the Google Calendar setup instructions in `README.md`.

Do not add a separate:

```text
GOOGLE_BOOKING_CALENDAR_ID
```

in this PR.

The existing persisted:

```text
GoogleCalendarConnection.calendarId
```

already fulfils that responsibility and should remain the booking calendar.

### Existing `GOOGLE_ADMIN_EMAIL`

`GOOGLE_ADMIN_EMAIL` remains unchanged technically, but production setup changes its intended value.

It should identify the **dedicated booking Google account**, not the practitioner's personal Google account.

The OAuth login hint and identity allowlist should continue using it unchanged.

### Database or schema

None.

Do not modify:

```text
GoogleCalendarConnection
```

and do not add an `availabilityCalendarId` database column.

No Prisma migration is required.

### Webhooks

None.

### OAuth and permissions

No new OAuth scope is required.

Preserve the existing exact scope set, including:

```text
openid
email
calendar.calendarlist.readonly
calendar.freebusy
calendar.events.owned
```

Do not broaden permissions.

The one stored refresh token belongs to the dedicated booking Google account.

That account receives FreeBusy visibility of the personal calendar through Google Calendar sharing rather than through a second OAuth connection.

### Deployment configuration

Add to the Railway web service:

```text
GOOGLE_AVAILABILITY_CALENDAR_ID
```

Production also requires the operational change described below:

```text
GOOGLE_ADMIN_EMAIL=<dedicated booking account>
```

The existing Google OAuth connection must then be reconnected using that dedicated booking account.

### Migration or backfill

No database migration or backfill.

The existing singleton Google connection row will be replaced naturally when the administrator completes the existing Google Calendar OAuth connection flow using the dedicated booking account.

---

## Security and privacy considerations

This change exists primarily to improve the Google identity/privacy boundary.

The target architecture must ensure:

```text
Personal Google account
    → availability only
    → FreeBusy information only

Dedicated booking Google account
    → customer Calendar organiser
    → Google Meet owner/creator
    → booking event management
```

The application must not:

- create customer events on the personal availability calendar;
- update customer events on the personal availability calendar;
- delete events from the personal availability calendar;
- expose personal-calendar event titles;
- expose personal-calendar descriptions;
- expose personal-calendar attendees;
- expose personal-calendar event IDs;
- log personal-calendar event contents;
- expose the configured availability calendar ID to browser code unnecessarily.

The dedicated booking account should use a non-personal customer-safe Google identity, including the intended stage/business display name.

The application's encrypted OAuth token storage remains unchanged.

The personal calendar should be shared with the dedicated booking account using the minimum permission needed for availability, preferably Google's free/busy-only sharing permission.

Do not expand OAuth scopes merely to make the shared calendar easier to access.

---

## Required implementation

### 1. Add explicit availability-calendar configuration

Add a server-side configuration reader for:

```text
GOOGLE_AVAILABILITY_CALENDAR_ID
```

Follow the existing configuration conventions in:

```text
src/lib/google-calendar/config.ts
```

Blank or missing values must fail clearly as a server configuration error.

Do not expose the value through client-side configuration.

Prefer a narrowly named helper rather than changing the meaning of the existing persisted `calendarId`.

For example, the implementation may introduce a concept such as:

```text
getGoogleAvailabilityCalendarId()
```

The exact symbol may follow existing repository conventions.

### 2. Availability must use the configured availability calendar

Change `getBusyPeriods()` so the FreeBusy request uses the configured availability calendar ID rather than:

```text
credentials.calendarId
```

Conceptually:

```text
credentials
    ↓
OAuth token refresh

GOOGLE_AVAILABILITY_CALENDAR_ID
    ↓
FreeBusy target
```

The access token still comes from the existing Google Calendar connection.

The final FreeBusy call should therefore behave conceptually as:

```js
queryFreeBusy({
  accessToken,
  calendarId: availabilityCalendarId,
  from,
  to,
});
```

### 3. Preserve PR #32 diagnostic semantics

Loading the availability-calendar configuration is part of the existing configuration stage.

Do not introduce another public or internal failure taxonomy solely for this variable.

A missing or invalid server configuration should continue to result in the existing safe availability failure path, with the existing server-side:

```text
stage: "config"
```

diagnostic where applicable.

The browser must continue receiving only:

```json
{
  "error": {
    "code": "availability_unavailable",
    "message": "Availability is temporarily unavailable."
  }
}
```

Do not fall back silently to:

```text
credentials.calendarId
```

when the availability-calendar configuration is missing or inaccessible.

A fallback could incorrectly expose free slots despite personal calendar conflicts.

Availability must fail closed instead.

### 4. Preserve booking calendar behaviour

Do not change the semantics of:

```text
GoogleCalendarConnection.calendarId
```

for booking-event operations.

It remains the primary calendar discovered during OAuth and owned by the connected booking account.

The following must still target that persisted value:

```text
reconcileBookingCalendarEvent
cancelBookingCalendarEvent
rescheduleBookingCalendarEvent
Events.insert
Events.get
Events.patch
Events.delete
```

No event operation should use `GOOGLE_AVAILABILITY_CALENDAR_ID`.

### 5. Preserve Google Meet behaviour

Meet creation remains attached to the booking event on:

```text
GoogleCalendarConnection.calendarId
```

No separate Meet integration should be introduced.

### 6. Preserve booking conflict behaviour

Do not change the existing database-based slot ownership rules.

Existing:

```text
HOLD
PAID
CONFIRMED
```

bookings must continue preventing double booking independently of whether the dedicated booking calendar is included in the FreeBusy request.

Do not add multi-calendar FreeBusy solely to duplicate the conflict protection already provided by persisted bookings.

### 7. Keep booking calendar application-owned

The dedicated booking calendar is expected to represent application-created customer bookings.

Manual blocking of time should be performed through the configured availability/personal calendar rather than by manually creating arbitrary events on the booking calendar.

Supporting arbitrary manual busy events on both calendars is outside this PR.

### 8. Documentation

Update `.env.example`.

Update `README.md` so production setup describes the intended architecture.

The Google Calendar setup instructions should explain:

1. Create or choose a dedicated Google account for Re-Embroidered Conversations bookings.
2. Configure that Google account with the intended stage/business identity.
3. Use an email address suitable for exposure through customer Calendar interactions.
4. Share the practitioner's personal calendar with the dedicated booking account using free/busy-only visibility.
5. Obtain the personal calendar's Calendar ID.
6. Configure:

   ```env
   GOOGLE_ADMIN_EMAIL=<dedicated-booking-account-email>
   GOOGLE_AVAILABILITY_CALENDAR_ID=<personal-calendar-id>
   ```

7. Keep the existing OAuth client ID, client secret and token-encryption configuration.
8. Deploy.
9. Reconnect the existing Google Calendar integration while signed into the dedicated booking account.
10. Verify availability against the personal calendar.
11. Verify a customer booking is created on the dedicated account's primary calendar.

Documentation must make clear that:

```text
GOOGLE_AVAILABILITY_CALENDAR_ID
```

is **not** the calendar on which customer events are created.

---

### External-service failure handling

#### Availability calendar is not configured

Availability fails closed using the existing safe availability-unavailable response.

No fallback to the booking calendar.

#### Availability calendar is not shared with the booking account

The Google FreeBusy operation fails through the existing `CalendarAvailabilityError` handling.

No slots should be returned based on an empty assumption.

#### Google access token is revoked

Preserve existing:

```text
reauthorization_required
```

internal classification.

#### Booking calendar operation fails

No change to current behaviour.

Paid bookings remain recoverable according to the existing booking/reconciliation flow.

#### FreeBusy succeeds but booking calendar later fails

No change.

Availability lookup and booking finalisation remain independent external operations.

#### Booking calendar succeeds but application persistence fails

No change.

Existing deterministic event/reconciliation semantics remain authoritative.

---

## UI implementation requirements

No material rendered UI change is required.

Do not introduce:

- calendar-selection UI;
- Google account-selection UI beyond Google's existing OAuth flow;
- customer-visible calendar identity settings;
- new booking states;
- new booking-page messaging.

Browser and visual regression coverage is not required solely for this backend/configuration change.

Existing UI behaviour must remain unchanged.

---

## Acceptance criteria

### Behaviour

- [ ] Availability FreeBusy requests no longer use `GoogleCalendarConnection.calendarId` as their target calendar.
- [ ] Availability FreeBusy requests use the configured `GOOGLE_AVAILABILITY_CALENDAR_ID`.
- [ ] The existing connected Google credentials are still used to authenticate FreeBusy requests.
- [ ] Booking event creation continues targeting `GoogleCalendarConnection.calendarId`.
- [ ] Booking event reconciliation continues targeting `GoogleCalendarConnection.calendarId`.
- [ ] Cancellation continues targeting `GoogleCalendarConnection.calendarId`.
- [ ] Rescheduling continues targeting `GoogleCalendarConnection.calendarId`.
- [ ] Google Meet continues being created on the booking event.
- [ ] Existing database booking conflicts continue preventing double booking.
- [ ] No customer-facing API contract changes.
- [ ] Existing behaviour outside the stated calendar separation remains unchanged.

### Configuration

- [ ] `GOOGLE_AVAILABILITY_CALENDAR_ID` is required and server-only.
- [ ] `.env.example` documents it.
- [ ] `README.md` production configuration documents it.
- [ ] Missing availability-calendar configuration fails closed.
- [ ] Missing configuration does not silently fall back to the booking calendar.
- [ ] No `NEXT_PUBLIC_*` calendar configuration is introduced.

### Google Calendar identity boundary

- [ ] The intended production OAuth connection is the dedicated booking Google account.
- [ ] The dedicated account's primary calendar remains the persisted booking calendar.
- [ ] Customer events are not created on the personal availability calendar.
- [ ] Personal-calendar access is required only for availability.
- [ ] Personal-calendar event details are not fetched or exposed.
- [ ] The dedicated booking account can query the personal calendar through its configured sharing permission.
- [ ] A production verification booking shows the dedicated stage/business Google identity rather than the practitioner's personal identity.

### OAuth

- [ ] Existing OAuth scopes remain unchanged.
- [ ] No second OAuth connection is introduced.
- [ ] No second refresh token is stored.
- [ ] Existing encrypted token storage remains unchanged.
- [ ] Existing OAuth connection/reconnection flow remains usable.
- [ ] `GOOGLE_ADMIN_EMAIL` continues acting as the connected-account allowlist.

### Failure handling

- [ ] An inaccessible availability calendar fails availability closed.
- [ ] Existing `CalendarAvailabilityError` classifications remain intact.
- [ ] Existing stage-level diagnostics remain safe.
- [ ] Availability configuration failures use the existing `config` diagnostic stage where applicable.
- [ ] Public availability errors continue hiding internal Google/configuration details.
- [ ] Booking-event failure handling remains unchanged.

### Database

- [ ] No Prisma schema change.
- [ ] No migration.
- [ ] Existing Google connection row shape remains unchanged.
- [ ] Existing booking persistence remains unchanged.

### Code quality

- [ ] The implementation follows existing repository conventions.
- [ ] The smallest coherent change is used.
- [ ] No unnecessary abstraction is introduced.
- [ ] No unnecessary dependency is introduced.
- [ ] Type safety is preserved.
- [ ] Formatting passes.
- [ ] Type checking passes.
- [ ] Tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### Unit tests

Update:

```text
tests/google-calendar-busy-periods.test.mjs
```

Add or adjust coverage proving that the two calendar concepts are independent.

#### Availability target

Given credentials containing:

```text
calendarId = booking-calendar@example.com
```

and configured availability calendar:

```text
availability-calendar@example.com
```

verify that the FreeBusy request receives:

```text
calendarId = availability-calendar@example.com
```

and **not**:

```text
booking-calendar@example.com
```

This is the primary regression test for PR #38.

#### Credentials remain shared

Verify that:

- the refresh token still comes from the existing connection;
- the existing OAuth client ID/secret flow is unchanged;
- the refreshed access token is used for the availability-calendar FreeBusy request.

#### Missing availability configuration

Verify a configuration-load failure:

- logs only the existing safe `config` stage diagnostic;
- maps to the existing availability failure classification;
- does not call FreeBusy;
- does not fall back to `credentials.calendarId`.

#### Existing failures

Preserve existing coverage for:

- no connection;
- missing FreeBusy scope;
- revoked refresh token;
- provider outage;
- FreeBusy authorization failure;
- malformed FreeBusy response;
- safe logging.

### Integration tests

Existing Google API FreeBusy tests should continue proving that:

```text
queryGoogleFreeBusy()
```

queries exactly the calendar ID supplied by its caller.

Do not teach the low-level Google API helper about "booking" versus "availability" calendars. That distinction belongs at the service/configuration layer.

### Booking-event regression tests

Use:

```text
tests/google-calendar-event.test.mjs
```

to preserve or strengthen the existing assertion that booking operations use:

```text
credentials.calendarId
```

even when a separate availability-calendar configuration exists.

At minimum, existing coverage must continue proving that:

```text
Events.insert
Events.get
Events.patch
Events.delete
```

target the persisted booking calendar where applicable.

Do not rewrite unrelated event tests.

### OAuth tests

Existing:

```text
tests/google-calendar-oauth.test.mjs
tests/google-calendar-flow.test.mjs
```

should remain green.

No OAuth-scope snapshot should change.

The existing primary-calendar discovery behaviour must remain intact.

### Database tests

No new database test is required because no persisted schema or connection representation changes.

Existing:

```text
tests/google-calendar-connection.test.mjs
```

must remain green.

### Browser tests

N/A.

There is no material UI change.

### Visual regression tests

N/A.

---

## Verification commands

Run the repository's established checks:

```bash
npm ci

npm run format:check

npm run lint

npm test

node --conditions=react-server --experimental-test-module-mocks --test \
  tests/google-calendar-busy-periods.test.mjs \
  tests/google-calendar-event.test.mjs \
  tests/google-calendar-connection.test.mjs \
  tests/google-calendar-flow.test.mjs \
  tests/google-calendar-oauth.test.mjs

npm run build
```

Browser/visual tests are not required solely for this backend configuration change unless implementation unexpectedly affects rendered behaviour.

If the normal test suite requires the repository's database schema-test environment, use the established safe test database configuration rather than production data.

---

## Production configuration and verification

After deployment, configure the Google accounts before accepting production bookings.

### Google account setup

The intended setup is:

```text
Personal practitioner Google account
        │
        │ Free/busy sharing
        ▼
Dedicated booking Google account
        │
        └── owns customer booking events + Meet
```

The dedicated booking account must:

- use the intended stage/business display identity;
- use a customer-safe email identity;
- have access to the personal calendar's free/busy information.

The personal calendar should not grant more detail visibility than needed.

### Environment

Set:

```env
GOOGLE_ADMIN_EMAIL=<dedicated-booking-account-email>
GOOGLE_AVAILABILITY_CALENDAR_ID=<personal-calendar-id>
```

Keep the existing:

```env
GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET
GOOGLE_TOKEN_ENCRYPTION_KEY
ADMIN_SESSION_SECRET
```

configuration.

### Reconnect Google Calendar

Use the existing Google Calendar connect flow.

Authenticate as the dedicated booking Google account matching:

```text
GOOGLE_ADMIN_EMAIL
```

The connection should persist that account's primary calendar as:

```text
GoogleCalendarConnection.calendarId
```

No manual database edit should be required.

### Availability verification

Create a temporary busy period on the practitioner's personal calendar.

Verify that the corresponding website slots disappear.

Remove the busy period.

Verify that the slots return, subject to normal booking rules.

This proves that:

```text
GOOGLE_AVAILABILITY_CALENDAR_ID
```

is actually controlling FreeBusy availability.

### Booking verification

Complete a controlled booking and verify:

- booking reaches `CONFIRMED`;
- event exists on the dedicated booking account's primary calendar;
- event does not appear as an application-created event on the personal availability calendar;
- Meet URL is created;
- customer receives the Google Calendar invitation;
- invitation exposes the intended dedicated stage/business Google identity rather than the practitioner's personal identity;
- branded confirmation email remains unchanged.

### Cancellation/rescheduling verification

For the controlled booking, verify that existing cancellation/rescheduling operations continue modifying the event on the dedicated booking calendar.

The personal availability calendar must remain untouched.

---

## Completion report

When implementation is complete, provide a concise summary containing:

### Changed

Summarise:

- new explicit availability-calendar configuration;
- FreeBusy target separation;
- preservation of the persisted booking calendar;
- documentation changes;
- production account-sharing model.

### Tests

List:

- tests added or updated;
- targeted Google Calendar tests;
- full test command;
- formatting/type-check results;
- production build result.

### External configuration

State explicitly that production requires:

1. a dedicated booking Google account using the intended public/stage identity;
2. the personal practitioner calendar shared to that account with free/busy-only visibility;
3. `GOOGLE_ADMIN_EMAIL` set to the dedicated booking account;
4. `GOOGLE_AVAILABILITY_CALENDAR_ID` set to the personal availability calendar ID;
5. the existing Google Calendar integration reconnected using the dedicated booking account;
6. an end-to-end booking used to verify the customer-visible Google identity.

### Deviations

Describe any meaningful deviation from this specification and why it was necessary.

Use `None` when there were no deviations.

### Remaining issues

Document any remaining limitation.

In particular, this PR deliberately does **not** make arbitrary manually created events on the dedicated booking calendar part of Google FreeBusy availability.

Application-created bookings remain protected through the existing persisted booking-conflict system.

If future requirements need both the personal availability calendar and arbitrary booking-calendar events to participate in FreeBusy, implement multi-calendar FreeBusy as a separate change rather than expanding PR #38.