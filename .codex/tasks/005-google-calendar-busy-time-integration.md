# PR #5 — Google Calendar busy-time integration

## Repository state

**Expected branch:** `feat/005-google-calendar-busy-time-integration`  
**Base branch:** `main`  
**Dependencies:** PR #4 — Connect Google Calendar (merged)

## Objective

Provide a server-only, application-owned `getBusyPeriods(from, to)` boundary backed by
the connected practitioner's primary Google Calendar. Refresh the stored credential,
query Google FreeBusy with the narrow `calendar.freebusy` permission, and return only
sorted `{ startAt, endAt }` UTC timestamps.

Provider candidate-slot generation, booking conflict composition, public APIs, UI,
database schema, event creation, Google Meet, and Stripe are outside this task.

## Acceptance summary

- Validate the absolute `[from, to)` interval locally before external work.
- Load the calendar ID, granted scopes, and decrypted refresh token through the existing
  Google connection boundary.
- Fail explicitly for no connection and for connections missing `calendar.freebusy`.
- Exchange the refresh token through Google's token endpoint without persisting the
  access token.
- Query only the persisted primary calendar through `POST /calendar/v3/freeBusy`, with
  UTC request semantics and `cache: 'no-store'`.
- Validate the complete requested-calendar response and every busy interval.
- Normalize authentication, provider, and malformed-response failures behind stable
  calendar-domain error codes; never turn failures into an empty calendar.
- Request exactly the PR #4 scopes plus `calendar.freebusy`, without Events scopes.
- Preserve the existing availability, booking, persistence, and UI boundaries.

## Verification

Run `npm run lint`, `npm test`, the focused Google Calendar tests, `npm run db:validate`,
and `npm run build`. Existing connections must be reauthorized after deployment, and
the Google OAuth consent configuration must permit
`https://www.googleapis.com/auth/calendar.freebusy`.
