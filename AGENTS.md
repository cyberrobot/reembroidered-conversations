# AGENTS.md

## Purpose

This repository powers **Re-Embroidered Conversations**, a website for booking paid one-to-one listening sessions.

The product is **not therapy**. Do not introduce clinical, diagnostic, therapeutic, medical, or mental-health treatment claims unless explicitly requested and reviewed.

The intended booking product is:

- Session duration: **55 minutes**
- Price: **£55 GBP**
- Booking calendar integration: **Google Calendar**
- Video call: **Google Meet**
- Payments: **Stripe**
- Application framework: **Next.js**

This file defines repository-wide instructions for Codex and other coding agents. More narrowly scoped `AGENTS.md` files may override these instructions for their directory subtree.

---

## Core principles

1. **Inspect before editing.** Do not infer repository structure, scripts, routing, data ownership, or integration patterns when they can be established from the codebase.
2. **Prefer the smallest coherent change.** Do not combine unrelated refactors, dependency upgrades, visual redesigns, or architecture migrations with feature work.
3. **Preserve existing conventions.** Extend the patterns already used by the repository unless the task explicitly requires changing them.
4. **Keep privileged work server-side.** Stripe secrets, Google credentials, OAuth tokens, webhook signing secrets, booking orchestration, and other privileged integration logic must never be exposed to browser code.
5. **Treat payments and bookings as transactional workflows.** Explicitly handle retries, duplicates, partial failures, and timeouts.
6. **Automate verification.** For material UI changes, browser-based functional and visual regression tests are preferred over manual inspection.
7. **Do not invent commands.** Read `package.json`, lockfiles, test configuration, and CI before choosing install, test, lint, typecheck, or build commands.

---

## Start every task by inspecting the repository

Before making changes, inspect the files relevant to the task.

At minimum, check when present:

- `AGENTS.md`
- nearest scoped `AGENTS.md`
- `package.json`
- lockfile
- `tsconfig.json`
- `next.config.*`
- lint configuration
- formatting configuration
- environment examples such as `.env.example`
- test configuration
- Playwright configuration
- relevant route, component, server, and integration modules
- relevant existing tests

When architecture ownership or cross-feature boundaries are unclear, inspect any architecture documentation before editing.

Do not create architecture documents only because a task template mentions them.

---

## Next.js architecture

Next.js is the target application framework.

Follow the router and directory conventions already established by the repository. Do not introduce a parallel Pages Router/App Router structure unless migration between them is an explicit task.

### Server and client boundaries

Prefer server execution for:

- Stripe API calls
- Stripe Checkout Session or PaymentIntent creation
- Stripe webhook handling
- Google Calendar API calls
- Google OAuth token handling
- Google Meet conference creation
- availability computation that depends on privileged calendar data
- booking creation and mutation
- access to secret environment variables
- persistence writes
- privileged validation and authorization

Use Client Components only when browser interactivity requires them.

Do not add `"use client"` to large component trees simply to solve a local interaction problem. Keep client boundaries as narrow as practical.

Never import server-only modules into code that may be bundled for the browser.

### Route handlers and server actions

Follow the mechanism already used by the repository.

Whichever mechanism is used:

- validate untrusted input on the server;
- return intentional, stable error shapes;
- do not expose raw third-party errors to users;
- do not return credentials, tokens, internal identifiers, or unnecessary personal data;
- keep side effects explicit;
- design mutating operations for safe retries where practical.

### Caching

Booking availability, payment state, and user-specific integration data are time-sensitive.

Do not allow framework caching to make booking availability or payment status stale.

When adding or changing data fetching, explicitly determine whether the result may be cached, revalidated, or must always be dynamic.

---

## Booking domain rules

The booking flow is commercially and operationally important. Treat it as domain logic rather than incidental UI state.

Unless a task explicitly changes these rules:

- a session is **55 minutes**;
- a session costs **£55 GBP**;
- the user should never be able to confirm an unavailable slot;
- the server must revalidate slot availability before final confirmation;
- duplicate submissions must not create duplicate confirmed bookings;
- booking state must not become ambiguous after a partial failure.

Do not duplicate duration or price constants across multiple client and server modules. Prefer one canonical server-owned definition with typed/shared read-only values where appropriate.

### Booking state

If the application persists booking state, prefer explicit states rather than inferring state from the presence of unrelated fields.

Typical states may include concepts such as:

- pending
- awaiting payment
- paid
- calendar pending
- confirmed
- failed
- cancelled
- refunded

Use the states already present in the repository if they exist. Do not introduce this exact state model blindly.

Every task that changes the booking lifecycle must identify:

- the state before the operation;
- the successful state;
- recoverable failure state;
- unrecoverable failure state;
- retry behaviour;
- whether the operation is idempotent.

### Availability and concurrency

Availability displayed in the browser is not a reservation.

Immediately before committing a booking, re-check the relevant availability on the server.

Account for race conditions in which two clients select the same slot.

Do not rely on disabled buttons or client state as concurrency protection.

If the repository has a persistence layer, use appropriate uniqueness/locking/transaction mechanisms to prevent double booking.

### Date and time handling

Do not perform booking calculations using ambiguous local-date strings.

Use explicit time zones and well-defined date-time representations.

The provider calendar's time zone and the customer's displayed time zone must not be conflated.

Test daylight-saving transitions when date logic is materially changed.

Do not depend on the machine or CI runner's local time zone.

---

## Google Calendar integration

Google Calendar access is privileged server-side functionality.

Before modifying the integration, determine from the repository:

- authentication model;
- target calendar;
- ownership of OAuth credentials;
- token persistence;
- scopes currently requested;
- availability-query implementation;
- event-creation implementation;
- retry/error handling.

Request the minimum Google OAuth scopes required by the implemented behaviour.

Do not broaden scopes for convenience.

### Calendar availability

When Google Calendar is used to determine provider availability:

- treat remote calendar data as authoritative for conflicts covered by the configured calendar set;
- account for all calendars the implementation intentionally considers;
- use explicit time ranges and time zones;
- do not expose private calendar event details to the customer;
- return only the information required to render availability.

Busy calendar entries should normally be reduced to availability/conflict information rather than returned with titles, attendees, descriptions, or other private content.

### Calendar event creation

A confirmed booking's calendar event should use deterministic booking data.

Avoid putting sensitive customer information into the event unnecessarily.

Where an internal booking ID exists, use it to correlate the booking and event rather than relying on event titles.

Store the Google event identifier when the application has persistence and needs later cancellation, update, or reconciliation.

Do not create a second event when retrying an operation whose first request may already have succeeded.

---

## Google Meet

Prefer creating Google Meet through the Google Calendar event conference-data flow unless the existing architecture intentionally uses another supported mechanism.

When creating a Calendar event with Meet:

- request conference creation in the same logical booking workflow;
- use a unique request identifier/idempotency strategy;
- persist the resulting conference/event identifiers when persistence exists;
- do not assume the Meet URL exists until Google confirms conference creation;
- handle delayed or failed conference creation explicitly.

Do not fabricate Meet URLs.

The customer must receive the Meet link only after the booking has reached the state in which the application considers that link valid.

---

## Stripe

Stripe operations must run server-side.

Never expose:

- Stripe secret keys;
- webhook signing secrets;
- privileged customer/payment data;
- unfiltered Stripe objects containing unnecessary information.

It is acceptable to expose Stripe publishable configuration where Stripe's client integration requires it.

### Currency and amount

The intended product price is **£55 GBP**.

Represent monetary amounts in integer minor units when interacting with Stripe.

For this product, £55.00 is `5500` pence.

Do not use floating-point arithmetic for money.

Prefer one canonical source for product price and currency rather than hard-coding `55`, `5500`, or `GBP` independently throughout the application.

### Payment authority

Do not treat a browser redirect alone as proof of successful payment.

Where Stripe webhooks are used, verified Stripe webhook events should be the authoritative server-side signal for asynchronous payment completion.

Verify webhook signatures using the raw request body as required by Stripe's SDK/API.

Webhook handlers must tolerate duplicate delivery.

### Idempotency

Any Stripe operation that could be retried and cause a duplicate side effect should use an appropriate idempotency strategy.

Correlate Stripe objects with the internal booking identifier when an internal identifier exists.

Do not create multiple charges or Checkout Sessions merely because the browser retried a request.

### Metadata

Use Stripe metadata for stable internal correlation where useful.

Do not store secrets or unnecessary personal information in Stripe metadata.

### Redirects

Success pages must query or derive authoritative booking/payment state rather than assuming success because the user arrived at a success URL.

Cancellation pages must not accidentally cancel a payment or booking that has already completed unless that behaviour is explicitly implemented.

---

## Booking, payment, calendar, and Meet orchestration

This flow crosses multiple systems and cannot be treated as one atomic database transaction.

Every implementation touching this workflow must explicitly consider at least these cases:

1. Slot is available when shown but unavailable when submitted.
2. User submits the booking request twice.
3. Stripe object creation succeeds but the client times out.
4. Payment succeeds but the client never returns to the site.
5. Stripe sends the same webhook more than once.
6. Payment succeeds but Calendar event creation fails.
7. Calendar event creation succeeds but the application times out before saving the event ID.
8. Calendar event exists but Meet conference creation is not ready or fails.
9. Google authentication is expired, revoked, or temporarily unavailable.
10. Customer refreshes or revisits confirmation pages.
11. A cancellation/refund operation partially succeeds.

Do not hide these cases behind generic `try/catch` blocks.

Prefer:

- explicit states;
- idempotent operations;
- stable correlation IDs;
- retryable operations;
- reconciliation using provider IDs;
- actionable logs that exclude secrets and unnecessary personal data.

A successful payment must not silently disappear because a downstream Google operation failed.

If automatic recovery is unavailable, persist or surface a state that allows the failure to be reconciled safely.

---

## Webhooks

Webhook endpoints are public network boundaries.

For every webhook:

- verify provider signatures;
- validate the expected event type;
- make processing idempotent;
- tolerate duplicate delivery;
- tolerate out-of-order events where the provider may deliver them;
- avoid long-running synchronous work when the existing architecture supports a safer deferred/retry mechanism;
- return status codes intentionally;
- log provider event IDs for correlation;
- never log secrets or full sensitive payloads unnecessarily.

Do not weaken signature validation to make local testing easier.

Use provider-supported local testing mechanisms or deterministic fixtures instead.

---

## Environment variables

Before adding an environment variable:

1. confirm there is not already an equivalent variable;
2. choose a name consistent with existing conventions;
3. determine whether it is server-only or safe for the browser;
4. update the repository's environment documentation/example file when one exists.

Typical server-only categories include:

- Stripe secret key
- Stripe webhook secret
- Google client secret
- Google service credentials
- Google refresh/access tokens
- encryption keys
- database credentials

Never commit real credentials.

Never place server secrets in variables prefixed for public Next.js exposure.

Code should fail with a clear configuration error when a required server variable is absent rather than failing later with a misleading third-party API error.

---

## Security and privacy

The application may handle:

- customer names;
- customer email addresses;
- appointment dates/times;
- booking subjects or notes;
- calendar information;
- Google OAuth tokens;
- Stripe identifiers and payment status.

Treat this data conservatively.

### Required practices

- Validate untrusted request data server-side.
- Keep secrets and OAuth tokens off the client.
- Avoid logging booking subjects, free-form personal disclosures, tokens, or payment details unless strictly required.
- Do not store card details directly.
- Minimize third-party data copied into application storage.
- Minimize personal data copied into Calendar or Stripe metadata.
- Do not leak private provider calendar details through availability APIs.
- Escape/render user-entered text safely.
- Preserve CSRF/origin protections used by the existing architecture.
- Preserve authentication and authorization checks around administrative/provider functionality.

If adding persistence for OAuth tokens or other high-value secrets, use the repository's established encryption/secret-storage mechanism. If none exists, do not invent insecure storage.

---

## Product language

Re-Embroidered Conversations offers paid one-to-one listening sessions.

Unless explicitly instructed otherwise:

- do not describe the service as therapy;
- do not imply diagnosis or treatment;
- do not make medical or mental-health outcome claims;
- do not change established brand/editorial copy as part of technical feature work;
- preserve the existing tone and visual identity.

Technical error copy should be calm, clear, and actionable without exposing implementation details.

---

## UI and UX

Preserve the current Re-Embroidered Conversations visual language unless redesign is explicitly part of the task.

Prefer reusing existing:

- typography;
- spacing;
- layout primitives;
- form controls;
- buttons;
- cards;
- feedback patterns;
- responsive breakpoints.

Avoid introducing a second design system for one feature.

### Booking UI

The booking UI should distinguish clearly between:

- unavailable dates/times;
- available slots;
- selected slot;
- loading state;
- submitting state;
- payment handoff;
- booking confirmation;
- recoverable failure;
- unrecoverable failure.

Do not display a time slot as confirmed before server-side confirmation.

Disable duplicate submissions while a request is in progress, but do not rely on this as server-side idempotency protection.

### Accessibility

For material UI work:

- use semantic elements;
- associate labels and inputs correctly;
- preserve visible keyboard focus;
- ensure interactive controls are keyboard reachable;
- use buttons for actions and links for navigation;
- expose validation errors accessibly;
- avoid using colour as the only state indicator;
- respect reduced-motion preferences where animations are introduced;
- verify dialogs/popovers/calendar controls have appropriate focus behaviour.

---

## Testing strategy

Match tests to risk.

Booking, payment, Calendar, Meet, and webhook changes require stronger verification than static marketing-page edits.

Use the test tools and locations already configured in the repository.

Do not introduce a new test framework when the existing framework can cover the requirement.

### Unit tests

Prefer unit tests for deterministic domain logic such as:

- session duration;
- price/currency conversion;
- availability interval calculations;
- date/time normalization;
- validation;
- booking-state transitions;
- third-party response mapping;
- error normalization;
- idempotency/correlation helpers.

### Integration tests

Use integration tests for important boundaries such as:

- route handlers;
- server actions;
- persistence;
- booking orchestration;
- Stripe Checkout/PaymentIntent creation;
- Stripe webhook processing;
- Google availability queries;
- Calendar event creation;
- Meet conference creation;
- authorization.

Mock external APIs or use deterministic test doubles unless the repository deliberately defines a safe external-integration test environment.

Tests must not depend on a developer's real Google Calendar or Stripe account.

### Browser tests

For material changes to user flows, add or update Playwright coverage when Playwright exists or is the repository's chosen browser-test tool.

Important booking cases include:

- choosing a date;
- choosing a time;
- unavailable date/time;
- no availability;
- input validation;
- successful progression through booking steps;
- API failure;
- duplicate-click protection;
- payment handoff;
- successful confirmation;
- cancelled/failed payment;
- refresh/revisit of confirmation state;
- responsive layout.

Use functional assertions for behaviour.

### Visual regression

For material visible UI changes, use automated screenshot regression where the repository supports it.

Visual coverage is appropriate for changes to:

- layout;
- typography;
- spacing;
- responsive behaviour;
- calendar/slot rendering;
- error states;
- loading states;
- success states;
- component styling.

Combine screenshot assertions with functional assertions.

Manual Codex visual review may supplement automated tests, but it must not be the primary acceptance criterion when deterministic browser verification is possible.

### Deterministic browser tests

Control sources of nondeterminism where relevant:

- current date/time;
- time zone;
- test data;
- API responses;
- animations/transitions;
- viewport;
- fonts;
- asynchronous loading;
- random identifiers displayed in UI.

Do not blindly regenerate visual snapshots to make tests pass. Confirm that every snapshot change is intentional.

---

## Dependency policy

Before adding a dependency:

- check whether the repository already has a library that solves the problem;
- prefer official provider SDKs for Stripe and Google integrations where appropriate;
- avoid large UI/date libraries for small problems already covered by the existing stack;
- do not add duplicate libraries with overlapping responsibilities;
- consider client bundle impact;
- confirm server-only dependencies are not pulled into client bundles.

Do not upgrade unrelated dependencies as part of feature work unless necessary for correctness or security.

Explain any material new dependency in the completion summary.

---

## TypeScript

Prefer precise types over `any`.

Validate runtime input at trust boundaries even when TypeScript types exist.

Do not cast third-party API responses to desired application types merely to silence compiler errors.

Keep provider-specific types near integration boundaries and map them into application/domain types rather than letting Stripe or Google response shapes leak throughout the UI.

---

## Error handling

Distinguish between:

- user-correctable validation errors;
- unavailable booking slots;
- authorization/authentication failures;
- payment failures;
- provider outages;
- configuration errors;
- unexpected internal errors.

Do not show raw stack traces or provider payloads to users.

Server logs should contain enough correlation information to investigate failures without exposing secrets or unnecessary personal data.

Use stable internal/provider identifiers for correlation where available.

---

## Logging

Useful identifiers may include:

- internal booking ID;
- Stripe Checkout Session/PaymentIntent/Event ID;
- Google Calendar event ID;
- Google conference request ID.

Avoid logging:

- secret keys;
- webhook secrets;
- access/refresh tokens;
- full payment payloads;
- card data;
- customer free-form disclosures;
- complete Google Calendar event contents unless essential and sanitized.

---

## Repository change discipline

Before editing, identify:

- primary change area;
- expected files/directories;
- relevant existing examples;
- relevant symbols;
- excluded areas;
- unknowns that must be verified.

If implementation requires expanding beyond the expected change surface, do so only when technically necessary and explain why.

Do not opportunistically:

- redesign unrelated UI;
- rename unrelated files;
- reformat large untouched areas;
- move modules without need;
- replace established abstractions;
- upgrade the whole dependency tree;
- introduce a new state-management system;
- migrate unrelated routes.

Keep diffs reviewable.

---

## Generated code and AI-created code

Treat generated code as untrusted until reviewed.

Before keeping generated integration code, verify:

- API names are current;
- types match installed SDK versions;
- environment-variable names match the repository;
- server/client boundaries are correct;
- security-sensitive defaults are appropriate;
- failure paths are implemented;
- retry behaviour cannot duplicate side effects;
- tests cover the important behaviour.

Do not leave placeholder fake integrations in production paths.

---

## Verification

Determine exact commands from `package.json`, lockfiles, test configuration, and CI.

For an implementation task, run all relevant checks that exist in the repository, typically covering:

- formatting when configured;
- linting;
- type checking;
- targeted unit/integration tests;
- broader test suite when warranted;
- Playwright tests for affected UI flows;
- visual regression tests for material rendered changes;
- production build for application/runtime changes.

Do not claim a command passed unless it was actually run.

If a required command cannot be run in the available environment, report:

1. the command;
2. why it could not run;
3. what was verified instead.

---

## Completion report

At the end of a task, report concisely:

### Changed

- implemented behaviour;
- major files/subsystems changed.

### Verified

- tests added/updated;
- commands run;
- results.

### External configuration

Call out any required action outside the repository, including:

- environment variables;
- Stripe webhook registration;
- Stripe dashboard configuration;
- Google Cloud OAuth configuration;
- Google Calendar permissions;
- Google API enablement;
- deployment configuration.

State `None` when no external action is required.

### Deviations

Explain meaningful deviations from the task specification.

State `None` when there were none.

### Remaining issues

List unresolved limitations or follow-up work.

State `None` when complete.

---

## Never do these without explicit task requirements

- Change the £55 session price.
- Change the 55-minute session duration.
- Add Apple Calendar integration.
- Replace Google Calendar as the intended booking calendar integration.
- Replace Google Meet as the intended video-call integration.
- Replace Stripe as the payment provider.
- Expose provider secrets or OAuth tokens to the browser.
- Treat a client-side payment redirect as authoritative payment confirmation.
- Create duplicate charges, bookings, Calendar events, or Meet conferences on retries.
- Expose private Google Calendar event details through availability APIs.
- Introduce clinical/therapy claims into product copy.
- Depend primarily on manual visual inspection for a material UI change that can be verified with automated browser tests.
