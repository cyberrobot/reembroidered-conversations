# PR #4 — Connect Google Calendar

## Repository state

**Expected branch:**  
`feat/004-connect-google-calendar`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  
`PR #2 — Booking domain + database schema` is required and is already merged.

`PR #3 — Provider availability configuration` is not a dependency. Google OAuth and credential persistence must remain independent from candidate availability generation.

### Read first

Before making changes, read:

- `AGENTS.md`
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/002-booking-domain-database-schema.md`
- `package.json`
- `tsconfig.json`
- `.env.example`
- `prisma/schema.prisma`
- `prisma/migrations/`
- `src/lib/db.ts`
- existing tests under `tests/`

If PR #3 has merged by implementation time, inspect it only to confirm that Google OAuth concerns remain outside the provider-availability layer.

### Primary change area

Secure server-side connection of the single practitioner/admin Google account to Google Calendar.

This PR establishes:

```text
Google OAuth authorization-code flow
        ↓
practitioner identity validation
        ↓
primary-calendar discovery
        ↓
encrypted refresh-token persistence
        ↓
minimal authenticated admin session
```

It does not consume calendar availability or create calendar events.

### Canonical implementation examples

Use:

- `AGENTS.md` — authoritative server/client, Google Calendar and security rules.
- `src/lib/db.ts` — canonical server-only Prisma boundary.
- `prisma/schema.prisma` — canonical persistence model.
- existing Prisma migrations — canonical migration structure.
- `tests/booking-schema.test.mjs` — existing database/integration-test style.
- `package.json` — authoritative verification commands.

There is currently no Google integration or general-purpose authentication implementation to copy.

### Relevant symbols

Inspect existing:

- `db`
- `Booking`
- App Router route conventions
- environment-variable conventions

Introduce concepts equivalent to:

- `GoogleCalendarConnection`
- Google OAuth configuration
- OAuth state
- PKCE verifier/challenge
- practitioner Google identity
- refresh-token encryption
- Google Calendar client
- minimal admin session

Exact names may follow repository conventions.

### Expected change surface

Expected changes include narrowly owned files such as:

```text
.codex/tasks/004-connect-google-calendar.md

prisma/schema.prisma
prisma/migrations/<timestamp>_google_calendar_connection/migration.sql

src/lib/google-calendar/
  oauth.ts
  connection.ts
  token-encryption.ts

src/lib/admin/
  session.ts

src/app/api/admin/google-calendar/connect/route.ts
src/app/api/admin/google-calendar/callback/route.ts

src/app/admin/google-calendar/result/page.tsx

.env.example

tests/google-calendar-*.test.mjs
```

Exact file decomposition may vary when a smaller structure fits the repository better.

### Excluded areas

Do not include:

- provider availability configuration;
- Google FreeBusy queries;
- filtering candidate slots using Google Calendar;
- reading Calendar event details;
- Calendar event creation;
- booking-to-calendar synchronization;
- Google Meet creation;
- Stripe;
- booking creation or lifecycle changes;
- public booking-flow changes;
- general-purpose user authentication;
- multi-user authentication;
- multi-practitioner support;
- calendar-selection UI;
- settings screen;
- reconnect;
- disconnect;
- token revocation UI;
- Google permission scopes intended only for later PRs;
- unrelated refactors;
- public-site redesign.

This PR establishes the secure Google Calendar connection only.

### Unknowns Codex must verify

Verify before editing:

- whether any scoped `AGENTS.md` applies;
- whether the repository has gained relevant auth/integration infrastructure;
- current Google OAuth Web Application requirements;
- current Google PKCE requirements/support for the chosen server-side flow;
- current Google token response and ID-token validation requirements;
- current `calendarList.list` behaviour;
- whether the application already has a canonical public origin configuration;
- environment-variable naming conventions;
- whether a Google SDK is justified or native `fetch` is sufficient.

Do not guess when the answer can be established from the repository or current Google documentation.

---

## Objective

Implement a secure Google OAuth authorization-code flow for the single practitioner/admin account and persist a reusable Google Calendar connection.

After this PR:

- the practitioner can initiate Google authorization;
- Google authorization uses the authorization-code flow;
- OAuth state protects the callback;
- PKCE protects authorization-code exchange;
- only the configured `GOOGLE_ADMIN_EMAIL` may establish a connection;
- the application obtains offline authorization;
- the practitioner identity is verified server-side;
- the practitioner's primary Google Calendar is discovered;
- the Google account and primary-calendar metadata are persisted;
- the refresh token is encrypted before database persistence;
- plaintext refresh tokens are never stored;
- a minimal authenticated admin session is established after successful authorization;
- successful connection redirects to a minimal success result;
- failed connection redirects to a minimal sanitized error result;
- no settings/management interface is introduced;
- public booking behaviour remains unchanged.

The resulting server-side connection must be reusable by future Google Calendar PRs.

---

## Current architecture

The application is a Next.js App Router application with Prisma/PostgreSQL persistence.

### Server boundary

Google OAuth must be implemented through server-side route handlers.

The browser must never receive:

- Google OAuth client secret;
- refresh token;
- access token;
- token-encryption key;
- admin-session signing secret.

### Persistence

`src/lib/db.ts` owns the server-side Prisma client.

The current Prisma schema contains booking persistence but no Google Calendar connection.

This PR introduces one narrowly scoped connection model.

### Authentication

The repository does not currently justify a complete user/account/RBAC system.

Do not add one.

The successfully authenticated Google practitioner identity should establish the minimum admin session required for later protected admin features.

### Availability

Provider availability and Google Calendar connectivity remain separate architectural boundaries.

This PR must not import or alter candidate-slot generation.

---

## External integrations affected

### Google OAuth 2.0 / OpenID Connect

Use the Google authorization-code flow.

Required identity scopes:

```text
openid
email
```

These are used to identify and validate the practitioner account.

### Google Calendar API

Request exactly:

```text
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

The complete requested scope set for this PR is therefore:

```text
openid
email
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

Do not request:

```text
https://www.googleapis.com/auth/calendar
https://www.googleapis.com/auth/calendar.readonly
https://www.googleapis.com/auth/calendar.freebusy
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.events.readonly
https://www.googleapis.com/auth/calendar.events.freebusy
https://www.googleapis.com/auth/calendar.events.owned
https://www.googleapis.com/auth/calendar.calendars
https://www.googleapis.com/auth/calendar.calendars.readonly
```

Do not request broader permissions merely because later PRs will need them.

If current Google documentation demonstrates that the required CalendarList operation cannot be performed with `calendar.calendarlist.readonly`, treat any proposed scope change as a specification deviation and document it explicitly.

### Webhooks

None.

---

## Configuration and data changes

### Environment variables

Add server-only configuration equivalent to:

```text
APP_URL

GOOGLE_OAUTH_CLIENT_ID
GOOGLE_OAUTH_CLIENT_SECRET

GOOGLE_ADMIN_EMAIL

GOOGLE_TOKEN_ENCRYPTION_KEY
ADMIN_SESSION_SECRET
```

Exact names may follow existing repository conventions if one exists.

### `APP_URL`

Canonical external application origin.

Used to construct the OAuth callback URL.

Do not derive the authoritative production redirect URI from arbitrary request host headers.

### `GOOGLE_OAUTH_CLIENT_ID`

Required Google OAuth Web Application client ID.

Keep server-owned for this implementation.

### `GOOGLE_OAUTH_CLIENT_SECRET`

Required and server-only.

Never expose through `NEXT_PUBLIC_*`.

### `GOOGLE_ADMIN_EMAIL`

Required and server-only.

Defines the only Google account permitted to establish the practitioner/admin connection.

This is an authorization allowlist.

Do not trust `login_hint`, query parameters or browser-provided values as authorization.

### `GOOGLE_TOKEN_ENCRYPTION_KEY`

Required server-only cryptographic secret used exclusively to encrypt persisted refresh tokens.

Do not reuse:

- database password;
- Google client secret;
- admin-session secret.

Reject invalid encryption-key configuration rather than silently weakening encryption.

### `ADMIN_SESSION_SECRET`

Required server-only secret used to authenticate the minimal admin session.

Do not reuse the refresh-token encryption key.

### `.env.example`

Document every required variable with safe placeholders.

Do not commit real credentials.

---

## Database or schema

Add a connection model equivalent to:

```prisma
model GoogleCalendarConnection {
  id                    String   @id
  googleSubject         String
  googleEmail           String
  calendarId            String
  calendarSummary       String
  calendarTimeZone      String?
  refreshTokenEncrypted String   @db.Text
  grantedScopes         String[]
  connectedAt           DateTime @default(now()) @db.Timestamptz(3)
  updatedAt             DateTime @updatedAt @db.Timestamptz(3)

  @@map("google_calendar_connections")
}
```

Exact names may follow repository conventions.

### Singleton semantics

The product currently has one practitioner.

Use a fixed application-owned connection identity such as:

```text
primary
```

for reads/upserts.

Do not introduce:

- provider tables;
- account tables;
- user foreign keys;
- tenant IDs;
- multi-provider abstractions.

### Google account metadata

Persist:

```text
googleSubject
googleEmail
```

`googleSubject` should use Google's stable account identifier from the verified identity token/response.

Do not treat email as Google's immutable account identifier.

### Calendar metadata

Persist the primary CalendarList entry's:

```text
calendarId
calendarSummary
calendarTimeZone
```

when available.

Do not fetch or persist event data.

### Granted scopes

Persist Google's returned granted scopes when available.

This lets later integration code determine whether additional authorization is required.

### Refresh token

Persist only an authenticated encrypted representation of the refresh token.

Do not create a separate plaintext token column.

The encrypted envelope must contain everything required to decrypt/authenticate the value, except the encryption key itself.

A versioned representation such as:

```text
v1.<nonce>.<auth-tag>.<ciphertext>
```

is acceptable.

### Migration

Create a new normal Prisma migration.

Do not modify existing booking-domain migrations.

No existing booking data requires backfill.

---

## OAuth and permissions

### Authorization request

Create a server-side route equivalent to:

```text
GET /api/admin/google-calendar/connect
```

It must:

1. generate cryptographically secure OAuth state;
2. generate a PKCE verifier;
3. derive an S256 PKCE challenge;
4. securely retain state and verifier for the callback;
5. create the Google authorization URL;
6. request the exact scope set defined above;
7. request offline access;
8. redirect the browser to Google.

The authorization request should use the current Google-supported equivalent of:

```text
response_type=code
access_type=offline
code_challenge_method=S256
```

Use `prompt=consent` where required to reliably obtain the initial refresh token.

Do not persist anything to the database before successful callback completion.

### OAuth state

State must:

- be generated using cryptographically secure randomness;
- have sufficient entropy;
- be bound to the browser that started the flow;
- be stored only temporarily;
- be unavailable to client JavaScript where practical;
- expire after a short period;
- be validated before token exchange;
- be consumed once.

Missing, expired or mismatched state must stop the flow.

### PKCE

Generate a unique high-entropy `code_verifier` for each authorization request.

Use:

```text
code_challenge = BASE64URL(SHA256(code_verifier))
code_challenge_method = S256
```

The verifier must:

- be retained only until callback completion;
- remain server-controlled/HttpOnly;
- be included during code exchange;
- never be logged;
- be removed after success or failure.

Do not use the `plain` PKCE method.

### Callback

Create a route equivalent to:

```text
GET /api/admin/google-calendar/callback
```

The callback must:

1. validate OAuth state;
2. load and validate the PKCE verifier;
3. handle Google authorization errors;
4. require an authorization code;
5. exchange the code server-side;
6. validate the returned Google identity;
7. verify the practitioner email;
8. require a usable refresh token;
9. discover the primary calendar;
10. encrypt the refresh token;
11. persist the complete connection;
12. establish the minimal admin session;
13. clear temporary OAuth state;
14. redirect to the result page.

Transient OAuth state must also be cleared after failures.

### Practitioner validation

After token exchange, use a trusted Google identity result.

Validate at minimum:

```text
sub
email
email_verified
```

when these claims are available from the selected Google OpenID Connect flow.

Requirements:

- validate the identity token rather than decoding it without verification;
- verify issuer;
- verify audience;
- verify expiry;
- verify email verification state;
- compare the normalized verified email against `GOOGLE_ADMIN_EMAIL`;
- reject every other Google account.

Persist Google's stable `sub` as `googleSubject`.

`login_hint` may be used for UX but must never replace server-side identity validation.

### Missing refresh token

A successful code exchange without a refresh token is not sufficient for this PR.

If no refresh token is returned:

- do not create the connection;
- do not persist an access-token-only connection;
- redirect to a sanitized recoverable error result.

---

## Primary-calendar discovery

After successful practitioner validation, use the temporary access token to call Google Calendar.

Use only CalendarList operations authorized by:

```text
calendar.calendarlist.readonly
```

Find the CalendarList entry whose `primary` field is true.

Requirements:

- handle CalendarList pagination correctly;
- do not assume the primary calendar is the first result;
- do not accept a client-provided calendar ID;
- fail safely if no primary calendar can be identified.

Persist only:

```text
id
summary
timeZone
```

as the connection's calendar metadata.

Do not fetch:

- events;
- attendees;
- event descriptions;
- free/busy information;
- ACL information.

---

## Refresh-token encryption

Refresh-token encryption must be isolated behind a server-only module.

Use authenticated encryption.

Prefer an established runtime primitive such as AES-256-GCM unless the repository already has an appropriate encryption abstraction.

Requirements:

- unique cryptographically random nonce/IV for every encryption;
- authenticated ciphertext;
- tampering causes decryption failure;
- encryption-key material remains outside the database;
- plaintext exists only transiently in server memory;
- plaintext is never logged;
- ciphertext format is versionable;
- malformed encrypted values fail closed.

Encoding is not encryption.

Base64 alone is not acceptable.

---

## Minimal admin session

After a successful connection is persisted, establish a small authenticated admin session.

Do not introduce:

- user tables;
- account management;
- password login;
- roles/permissions framework;
- authentication library solely for this one session.

The session should contain only enough information to establish that the configured practitioner successfully authenticated.

Use an authenticated/signed `HttpOnly` cookie.

Requirements:

- `HttpOnly`;
- `Secure` in production;
- appropriate `SameSite` protection;
- finite expiry;
- server-side validation;
- no Google tokens in the session;
- no encryption keys in the session.

A failed or unauthorized OAuth flow must not create an admin session.

Later PRs may use this session to protect settings operations.

---

## Success/error result

No settings screen is required.

Add only the smallest result surface necessary to complete the OAuth redirect.

For example:

```text
/admin/google-calendar/result?status=connected
```

or:

```text
/admin/google-calendar/result?error=<safe-code>
```

Exact routing may follow repository conventions.

### Success

Display only a minimal confirmation equivalent to:

```text
Google Calendar connected successfully.
```

No management controls are required.

### Error

Display a sanitized error equivalent to:

```text
Google Calendar could not be connected.
Please try again.
```

Safe specific messages may be used for cases such as:

- wrong Google account;
- authorization cancelled;
- authorization expired.

Do not expose:

- Google response bodies;
- token endpoint errors;
- authorization codes;
- tokens;
- stack traces;
- database errors;
- cryptographic errors.

Do not build a settings interface around this result page.

---

## Security and privacy considerations

This PR introduces a privileged long-lived Google credential.

Requirements:

- Google OAuth client secret remains server-side;
- access tokens remain server-side;
- refresh tokens remain server-side;
- persisted refresh tokens are encrypted;
- OAuth codes are never logged;
- OAuth state is never logged unnecessarily;
- PKCE verifier is never logged;
- Google token responses are never logged;
- encryption keys are never persisted;
- admin-session secret is never persisted;
- no Google event information is requested;
- no customer personal data is sent to Google;
- no connection metadata is exposed on public booking routes.

Safe operational logs may include:

- operation name;
- success/failure category;
- request correlation identifier.

Do not log credential material.

---

## Required implementation

### 1. Canonical Google OAuth configuration

Create one server-owned configuration boundary containing:

- client ID;
- client secret;
- callback URI;
- exact scope list;
- expected practitioner email.

Scope strings must have one canonical definition.

Tests must detect accidental scope broadening.

### 2. Connect endpoint

Implement the server-side authorization-start route.

Generate and retain:

```text
state
codeVerifier
```

Generate:

```text
codeChallenge
```

Redirect to Google's authorization endpoint.

No database mutation occurs here.

### 3. Callback endpoint

Implement the complete callback orchestration.

The callback owns:

```text
state validation
PKCE validation
code exchange
identity validation
admin-email authorization
primary-calendar discovery
refresh-token encryption
database persistence
admin-session creation
result redirect
```

Do not move token handling into Client Components.

### 4. Persist atomically

The application's connection must either be complete or absent.

Do not persist a connection lacking:

- verified Google identity;
- primary calendar;
- encrypted refresh token.

If an operation fails before persistence, no partial connection row should remain.

### 5. Protect an existing connection

Although reconnect is out of scope, repeated execution of the connect flow must not leave the application in a partially updated state.

If a connection already exists, a failed new authorization attempt must not destroy the existing persisted connection.

A successful authorization may replace/upsert the singleton connection atomically.

Do not add a reconnect UI or lifecycle workflow.

### 6. Keep calendar operations isolated

Expose a narrow server-side connection boundary that future PRs can consume without directly reading encryption/database internals.

Conceptually:

```text
getGoogleCalendarConnection()
getGoogleCalendarCredentials()
```

Exact names may vary.

The decrypted refresh token must never escape into client code.

### 7. Preserve existing application behaviour

Do not change:

- booking slot generation;
- public calendar UI;
- booking confirmation;
- booking database lifecycle;
- public navigation;
- marketing sections.

Google Calendar integration has no customer-visible effect yet.

---

## External-service failure handling

### Authorization denied

- Persist nothing.
- Create no admin session.
- Clear temporary OAuth state.
- Redirect to a safe error result.

### Invalid or missing state

- Stop before token exchange.
- Persist nothing.
- Create no session.
- Clear temporary OAuth state.

### PKCE validation/exchange failure

- Persist nothing.
- Create no session.
- Return a safe error result.

### Token exchange failure

- Persist nothing.
- Do not expose Google's raw response.

### Wrong Google account

- Persist nothing.
- Create no admin session.
- Redirect to a safe unauthorized-account result.

### Invalid Google identity token

- Persist nothing.
- Create no session.

### Missing refresh token

- Persist nothing.
- Redirect to a recoverable error.

### CalendarList failure

- Persist nothing.
- Redirect to a safe error.

### Primary calendar missing

- Persist nothing.
- Do not choose an arbitrary secondary calendar.

### Encryption failure

- Never persist plaintext.
- Persist nothing.

### Database failure

- Do not leave a partial connection.
- Do not create an admin session.
- Redirect to a sanitized error result.

---

## UI implementation requirements

This PR does not introduce a settings UI.

The result page is intentionally minimal.

Requirements:

- preserve existing visual conventions where practical;
- semantic heading/message;
- accessible error/success text;
- responsive enough for desktop and mobile;
- no new design system;
- no dashboard shell;
- no Google-account management controls.

Visual-regression testing is not required solely for this minimal result page unless implementation materially changes shared UI.

---

## Acceptance criteria

### OAuth

- [ ] The practitioner can initiate Google OAuth.
- [ ] Authorization uses the authorization-code flow.
- [ ] OAuth state is generated and validated.
- [ ] PKCE uses a unique verifier and S256 challenge.
- [ ] The authorization code is exchanged only server-side.
- [ ] Offline access is requested.
- [ ] A usable refresh token is required before connection persistence.
- [ ] Temporary state/PKCE data is cleared after callback completion.

### Scopes

- [ ] The requested scopes are exactly:

```text
openid
email
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

- [ ] No broad Calendar scope is requested.
- [ ] No event scope is requested.
- [ ] No FreeBusy scope is requested.
- [ ] No write scope is requested.

### Authorization

- [ ] The returned Google identity is cryptographically validated.
- [ ] The Google account's verified email must match `GOOGLE_ADMIN_EMAIL`.
- [ ] Other Google accounts are rejected.
- [ ] Unauthorized accounts create no admin session.
- [ ] Successful authorization creates the minimal admin session.

### Calendar discovery

- [ ] CalendarList is read server-side.
- [ ] Pagination is handled.
- [ ] The `primary` calendar is discovered.
- [ ] No calendar ID is trusted from client input.
- [ ] No event data is requested.

### Persistence

- [ ] A Prisma model exists for the singleton Google Calendar connection.
- [ ] A new migration creates the required persistence.
- [ ] Google subject/email are persisted.
- [ ] Primary calendar ID/summary/timezone are persisted.
- [ ] Granted scopes are persisted when available.
- [ ] Existing booking persistence remains unchanged.

### Token security

- [ ] Refresh tokens never reach browser code.
- [ ] Access tokens never reach browser code.
- [ ] Plaintext refresh tokens are never stored in PostgreSQL.
- [ ] Refresh tokens use authenticated encryption before persistence.
- [ ] Encryption uses a unique nonce/IV.
- [ ] Tampered ciphertext fails authentication.
- [ ] Encryption key remains server-only.
- [ ] OAuth client secret remains server-only.
- [ ] Credential material is absent from application logs.

### Result handling

- [ ] Successful connection redirects to a minimal success result.
- [ ] Failure redirects to a sanitized error result.
- [ ] Raw Google/provider/internal errors are not exposed.
- [ ] No settings screen is introduced.
- [ ] No reconnect functionality is introduced.
- [ ] No disconnect functionality is introduced.

### Existing behaviour

- [ ] Customer booking behaviour is unchanged.
- [ ] Provider candidate availability is unchanged.
- [ ] No FreeBusy calls occur.
- [ ] No Calendar events are created.
- [ ] No Google Meet links are created.

### Code quality

- [ ] Google integration code remains server-only.
- [ ] OAuth scopes have one canonical definition.
- [ ] No unnecessary authentication framework is introduced.
- [ ] No unnecessary dependency is introduced.
- [ ] No unrelated refactor is included.
- [ ] Prisma validation passes.
- [ ] Type checking passes.
- [ ] Tests pass.
- [ ] Production build passes.

---

## Tests to add or update

### Unit tests

Add focused tests for security-sensitive pure behaviour.

#### OAuth scopes

Assert the canonical scope list is exactly:

```text
openid
email
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

The test must fail if broader Calendar permissions are added accidentally.

#### OAuth state

Cover:

- state creation;
- valid matching state;
- mismatched state;
- missing state;
- expired state where expiry is represented explicitly.

#### PKCE

Cover:

- verifier generation;
- verifier length/format;
- deterministic S256 challenge from a known verifier;
- different verifiers generate different challenges.

#### Refresh-token encryption

Cover:

- round trip;
- same plaintext encrypted twice produces different ciphertext;
- plaintext does not appear in ciphertext;
- wrong key fails;
- modified ciphertext fails;
- malformed envelope fails;
- invalid encryption-key configuration fails.

#### Admin identity

Cover:

- configured email accepted;
- casing normalization where applicable;
- different email rejected;
- unverified email rejected.

#### Result/error normalization

Verify raw provider/internal error details are converted into safe result codes/messages.

---

## Integration tests

Google HTTP operations must use deterministic mocks/test doubles.

CI must not require live Google credentials.

### Connect route

Assert:

- redirects to Google;
- includes `response_type=code`;
- contains the exact scope set;
- requests offline access;
- contains OAuth state;
- contains PKCE S256 challenge;
- persists nothing.

### Successful callback

Mock:

- successful token exchange;
- valid Google identity;
- matching practitioner email;
- refresh token;
- paginated CalendarList response;
- primary calendar.

Assert:

- connection persisted;
- refresh token persisted only as ciphertext;
- correct Google account metadata stored;
- correct calendar metadata stored;
- admin session created;
- successful result redirect.

### Invalid state

Assert:

- token endpoint is not called;
- database is not modified;
- session is not created.

### PKCE/token-exchange failure

Assert:

- no connection persisted;
- no session created.

### Wrong Google account

Assert:

- connection not persisted;
- session not established.

### Missing refresh token

Assert:

- connection not persisted.

### CalendarList failure

Assert:

- no partial connection persisted.

### No primary calendar

Assert:

- no arbitrary calendar is persisted.

### Database failure

Assert:

- session is not established;
- error result is sanitized.

### Existing connection

Start with a valid existing connection.

Assert a failed new OAuth flow leaves it unchanged.

---

## Database tests

Extend the existing PostgreSQL schema-test approach where appropriate.

Verify:

- migration applies cleanly;
- required columns are non-null where intended;
- encrypted token storage supports the chosen envelope representation;
- singleton access pattern behaves as intended;
- existing booking constraints still pass.

Never put a real Google token into fixtures.

---

## Browser tests

No new end-to-end live Google OAuth test is required.

Do not automate Google's hosted consent UI.

If browser coverage is added for the minimal result route, keep it limited to deterministic local states such as:

```text
connected
authorization-error
unauthorized-account
```

The primary verification for this PR is backend/unit/integration coverage.

---

## Verification commands

Use existing repository commands:

```bash
# Install exact dependencies
npm ci

# Generate Prisma client
npm run db:generate

# Validate Prisma schema
npm run db:validate

# Type checking
npm run lint

# Unit/integration/schema tests
npm test

# Existing browser regression suite
npm run test:browser

# Production build
npm run build
```

Where database-backed tests are required:

```bash
DATABASE_SCHEMA_TEST_URL=<disposable-test-database-url> npm test
```

Verify the new migration against a disposable PostgreSQL database using the repository's existing Prisma migration commands.

Do not use live Google credentials in automated tests.

If a verification command cannot run, document:

1. the command;
2. why it could not run;
3. what verification was performed instead.

---

## External configuration

Implementation requires Google Cloud configuration outside the repository:

- enable Google Calendar API;
- configure OAuth consent/branding;
- create a Google OAuth Web Application client;
- configure the development callback URI;
- configure the production callback URI;
- configure the required OAuth scopes;
- configure test users/audience where applicable;
- configure required production environment variables;
- generate a strong token-encryption key;
- generate a strong admin-session secret;
- apply the Prisma migration.

Do not commit Google credential JSON or production secrets.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- OAuth authorization-code flow;
- state;
- PKCE;
- Google identity validation;
- practitioner authorization;
- primary-calendar discovery;
- token encryption;
- database persistence;
- admin session;
- result redirect.

### Tests

List:

- unit tests added;
- integration tests added;
- database tests added;
- verification commands run;
- results.

### OAuth scopes

Report the exact final scope list.

Expected:

```text
openid
email
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

Any deviation must be explicitly justified.

### External configuration

List all required Google Cloud and deployment environment changes.

### Security verification

Confirm:

- no plaintext refresh token is persisted;
- no Google token reaches browser code;
- only `GOOGLE_ADMIN_EMAIL` can establish the connection;
- no broader Calendar scope was requested;
- no credential material appears in logs.

### Deviations

Describe meaningful deviations from this specification.

Use:

```text
None
```

when there were none.

### Remaining issues

Do not implement these as part of PR #4.

Expected future work includes:

```text
Google Calendar connection settings
reconnect
disconnect / token revocation
Google FreeBusy availability filtering
Calendar event creation
Google Meet creation
```

Use:

```text
None
```

for unresolved issues within PR #4 itself.
