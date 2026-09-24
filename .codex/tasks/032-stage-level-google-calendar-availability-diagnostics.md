# PR #32 — Stage-Level Google Calendar Availability Diagnostics

## Summary

Improve server-side diagnostics for Google Calendar availability failures so production logs identify which internal stage caused a `CalendarAvailabilityError`.

The production availability endpoint currently fails with:

```text
errorName: CalendarAvailabilityError
errorCode: provider_unavailable
```

PR #31 added the `CalendarAvailabilityError.code` to the availability failure log, which narrowed the production failure to `provider_unavailable`.

However, `provider_unavailable` still represents several materially different failures:

- loading/decrypting the stored Google Calendar credentials
- loading Google OAuth configuration
- refreshing the Google access token
- calling the Google Calendar FreeBusy API

PR #32 should distinguish these stages in server-side logs without exposing credentials or changing the public API.

## Current production state

The following have already been confirmed:

- the `google_calendar_connections` production row exists
- its ID is the primary connection
- the expected Google account has been connected
- `https://www.googleapis.com/auth/calendar.freebusy` is present in `grantedScopes`
- `/api/availability` returns `availability_unavailable`
- the underlying error is:
  - `CalendarAvailabilityError`
  - `provider_unavailable`

The remaining failure needs to be isolated safely.

## Goals

1. Identify which Google Calendar availability stage fails in production.
2. Preserve the existing `CalendarAvailabilityError` classifications.
3. Preserve the existing public `/api/availability` response.
4. Keep all additional diagnostic information server-side.
5. Never log OAuth credentials, tokens or encryption material.

## Non-goals

This PR must not:

- fix or change the underlying production Google Calendar configuration
- reconnect Google Calendar
- change OAuth scopes
- change OAuth authorization behaviour
- change token encryption or decryption
- change database persistence
- change the `google_calendar_connections` schema
- change availability calculations
- change booking conflict calculations
- change the busy-period cache
- expose internal diagnostic information through the API
- add a public/admin diagnostics endpoint

## Primary implementation area

Update:

```text
src/lib/calendar/busy-periods.mjs
```

Update the corresponding automated tests.

PR #31's logging in:

```text
src/lib/availability/availability-handler.ts
```

should remain intact unless a minimal test-related adjustment is required.

## Required diagnostic stages

Use these exact stage identifiers:

```text
credentials
config
token_refresh
freebusy
```

Each represents a distinct operation in `getBusyPeriods()`.

## 1. Credentials stage

The credentials stage includes:

```js
dependencies.getCredentials();
```

This operation can fail while:

- accessing the database
- retrieving `google_calendar_connections`
- decrypting `refreshTokenEncrypted`
- validating the token-encryption configuration

Wrap this operation independently.

If it throws, write a safe server-side diagnostic:

```js
console.error("Google availability failed.", {
  stage: "credentials",
});
```

Then throw:

```js
new CalendarAvailabilityError("provider_unavailable");
```

### Preserve `not_connected`

If `getCredentials()` succeeds but returns no connection:

```js
null;
```

preserve the existing behaviour:

```text
CalendarAvailabilityError("not_connected")
```

Do not classify that case as `provider_unavailable`.

### Preserve scope validation

The existing check for:

```text
https://www.googleapis.com/auth/calendar.freebusy
```

must remain unchanged.

If the stored connection does not contain that required scope, continue to produce:

```text
CalendarAvailabilityError("reauthorization_required")
```

## 2. OAuth configuration stage

Wrap:

```js
dependencies.getOAuthConfig();
```

independently.

This stage may fail because required production configuration such as the Google OAuth client configuration is unavailable or invalid.

If it throws, log:

```js
console.error("Google availability failed.", {
  stage: "config",
});
```

Then throw:

```text
CalendarAvailabilityError("provider_unavailable")
```

Do not log environment-variable values.

## 3. Token refresh stage

Wrap:

```js
dependencies.refreshAccessToken(...)
```

independently.

On failure, log:

```js
console.error("Google availability failed.", {
  stage: "token_refresh",
  category: error instanceof GoogleApiError ? error.category : undefined,
});
```

Preserve the existing classification rules.

### Authorization failure

If the refresh operation throws:

```text
GoogleApiError("authorization")
```

continue to map it to:

```text
CalendarAvailabilityError("reauthorization_required")
```

### Other token-refresh failures

Other failures should continue to map to:

```text
CalendarAvailabilityError("provider_unavailable")
```

Examples include network/provider failures that are not classified as authorization failures.

## 4. FreeBusy stage

Wrap:

```js
dependencies.queryFreeBusy(...)
```

independently.

On failure, log:

```js
console.error("Google availability failed.", {
  stage: "freebusy",
  category: error instanceof GoogleApiError ? error.category : undefined,
});
```

Preserve the current classifications.

### Authorization failure

```text
GoogleApiError("authorization")
```

must map to:

```text
CalendarAvailabilityError("reauthorization_required")
```

### Invalid Google response

```text
GoogleApiError("invalid_response")
```

must map to:

```text
CalendarAvailabilityError("invalid_provider_response")
```

### Other Google/provider failures

Other failures must continue to map to:

```text
CalendarAvailabilityError("provider_unavailable")
```

## Logging requirements

Logs must be useful for determining where the production failure occurred while remaining safe for production.

Expected examples:

```text
Google availability failed. {
  stage: 'credentials'
}
```

```text
Google availability failed. {
  stage: 'token_refresh',
  category: 'unavailable'
}
```

```text
Google availability failed. {
  stage: 'freebusy',
  category: 'authorization'
}
```

Do not log raw caught error objects unless they have first been explicitly sanitised.

## Sensitive-data requirements

The implementation must never log:

- Google refresh tokens
- Google access tokens
- ID tokens
- OAuth authorization codes
- OAuth client secrets
- `GOOGLE_TOKEN_ENCRYPTION_KEY`
- decrypted credential contents
- Authorization headers
- cookie values
- OAuth state values
- PKCE verifiers
- complete Google token endpoint responses

The stage identifier and existing `GoogleApiError.category` are sufficient diagnostics for this PR.

## Public API behaviour

Do not change the `/api/availability` response contract.

For these internal Google Calendar failures, clients must continue receiving the existing safe response:

```json
{
  "error": {
    "code": "availability_unavailable",
    "message": "Availability is temporarily unavailable."
  }
}
```

No values such as these should be exposed to the browser:

```text
provider_unavailable
reauthorization_required
credentials
config
token_refresh
freebusy
GoogleApiError categories
```

The additional detail is for server-side operational logs only.

## Error-classification behaviour

After this PR, the existing semantic classifications must remain intact:

| Condition                                       | `CalendarAvailabilityError.code` |
| ----------------------------------------------- | -------------------------------- |
| No stored Google Calendar connection            | `not_connected`                  |
| Missing required FreeBusy scope                 | `reauthorization_required`       |
| Google refresh token rejected for authorization | `reauthorization_required`       |
| Google FreeBusy authorization rejected          | `reauthorization_required`       |
| Invalid FreeBusy response                       | `invalid_provider_response`      |
| Credentials/database/decryption failure         | `provider_unavailable`           |
| OAuth config failure                            | `provider_unavailable`           |
| Non-authorization token-refresh failure         | `provider_unavailable`           |
| FreeBusy network/provider failure               | `provider_unavailable`           |

PR #32 adds observability around these classifications; it should not redefine them.

## Automated tests

Add or update focused tests for `getBusyPeriods()`.

At minimum cover the following.

### Credentials

Verify that:

- a thrown `getCredentials()` dependency logs:
  ```text
  stage: credentials
  ```
- the resulting error is:
  ```text
  CalendarAvailabilityError("provider_unavailable")
  ```
- a successful `null` credentials result still produces:
  ```text
  not_connected
  ```

### Config

Verify that a thrown `getOAuthConfig()`:

- logs:
  ```text
  stage: config
  ```
- produces:
  ```text
  provider_unavailable
  ```

### Token refresh

Verify:

- `GoogleApiError("authorization")`
  - logs `stage: token_refresh`
  - logs `category: authorization`
  - maps to `reauthorization_required`
- `GoogleApiError("unavailable")`
  - logs `stage: token_refresh`
  - maps to `provider_unavailable`
- an unexpected non-`GoogleApiError`
  - logs the stage safely
  - maps to `provider_unavailable`

### FreeBusy

Verify:

- `GoogleApiError("authorization")`
  - logs `stage: freebusy`
  - maps to `reauthorization_required`
- `GoogleApiError("invalid_response")`
  - logs `stage: freebusy`
  - maps to `invalid_provider_response`
- `GoogleApiError("unavailable")`
  - logs `stage: freebusy`
  - maps to `provider_unavailable`

### Successful flow

Verify that a successful availability lookup:

- returns the same busy-period result as before
- does not emit failure diagnostics

### Sensitive-data regression

Where practical, ensure diagnostic logging receives only the expected safe metadata and does not include test token or credential values.

## Testability

Prefer dependency-injected failure tests using the existing `getBusyPeriods()` dependency mechanism.

Do not require live Google API access.

Do not require production credentials.

Do not introduce environment-specific integration tests for this diagnostic change.

## Acceptance criteria

PR #32 is complete when:

1. A production credentials/decryption failure produces:

   ```text
   stage: credentials
   ```

2. A production OAuth configuration failure produces:

   ```text
   stage: config
   ```

3. A Google token-refresh failure produces:

   ```text
   stage: token_refresh
   ```

   and includes the safe `GoogleApiError.category` when available.

4. A Google FreeBusy failure produces:

   ```text
   stage: freebusy
   ```

   and includes the safe `GoogleApiError.category` when available.

5. Existing `CalendarAvailabilityError` mappings remain unchanged.

6. `/api/availability` continues exposing only the generic safe failure response.

7. No token, secret or encryption material is logged.

8. Existing availability and Google Calendar tests remain green.

9. Formatting, type checking and production build pass.

## Validation

Run the repository's normal validation suite, including:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Run the configured formatting check as well.

If browser/E2E CI fails for an unrelated existing infrastructure issue, document the failure separately rather than modifying unrelated code in this PR.

## Production verification

After deployment:

1. Trigger `/api/availability`.
2. Inspect Railway logs.
3. Confirm that the existing outer diagnostic still reports:

   ```text
   errorName: CalendarAvailabilityError
   errorCode: provider_unavailable
   ```

4. Confirm that an additional internal diagnostic identifies exactly which stage failed:

   ```text
   credentials
   config
   token_refresh
   ```

   or:

   ```text
   freebusy
   ```

The stage identified by that log will determine the subsequent production fix. PR #32 itself is diagnostic only.
