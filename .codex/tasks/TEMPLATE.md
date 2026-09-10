# Task title

## Repository state

**Expected branch:**  
`<branch-name>`

**Base branch:**  
`<base-branch>`

**Worktree:**  
`<path or N/A>`

**Dependencies:**  
`<related PRs, packages, services, migrations, or N/A>`

### Read first

Before making changes, read the repository guidance relevant to this task:

- `AGENTS.md`
- Nearest scoped `AGENTS.md` for the primary change area, when one exists
- `docs/architecture/repository-map.md` when ownership or cross-application context is relevant
- `docs/architecture/dependency-rules.md` when dependency or architectural boundaries are affected

Do not create missing architecture documentation solely to satisfy this section unless the task explicitly requires it.

### Primary change area

Describe the main application, package, route, feature, or subsystem affected.

Examples:

- Booking flow
- Availability API
- Stripe checkout
- Google Calendar integration
- Video-call creation
- Authentication
- Marketing site
- Next.js migration
- Shared UI components

### Canonical implementation examples

List existing files, components, routes, tests, or patterns that should be treated as the preferred implementation reference.

Use `N/A` when no meaningful precedent exists.

### Relevant symbols

List important components, functions, hooks, routes, server actions, schemas, types, services, or tests Codex should inspect before editing.

### Expected change surface

List the files, directories, packages, routes, APIs, tests, configuration, or infrastructure that are expected to change.

This is guidance rather than an absolute restriction. If additional changes are required, Codex must explain why they are necessary.

### Excluded areas

List areas that should not be modified as part of this task.

Examples:

- Unrelated marketing content
- Existing visual design outside the affected flow
- Authentication architecture
- Deployment infrastructure
- Unrelated dependencies
- Book content or editorial copy

Use `None` if there are no explicit exclusions.

### Unknowns Codex must verify

List assumptions that must be confirmed from the repository or existing implementation before making changes.

Do not guess when the answer can be established from the codebase.

Examples:

- Existing routing conventions
- Server vs client ownership
- Current booking data model
- Existing API boundaries
- Current Stripe integration pattern
- Google Calendar authentication model
- Existing test infrastructure
- Environment variable naming
- Existing error-handling conventions

---

## Objective

Describe the exact result required.

Focus on the observable outcome rather than implementation activity.

The objective should make clear:

- What the user should be able to do
- What the system should do
- What must remain unchanged
- What constitutes completion

---

## Current architecture

Summarise only the architecture relevant to this task.

Include, where applicable:

- Relevant Next.js routes and layouts
- Server Components and Client Components
- Route handlers or server actions
- Shared packages or services
- Persistence/data ownership
- Authentication boundaries
- Booking lifecycle
- External service boundaries
- Existing test structure

Do not produce a general repository overview unless it is necessary to understand the task.

---

## External integrations affected

List every external service affected by this change.

Examples:

- Google Calendar
- Stripe
- Video-call provider
- Email provider
- Hosting/deployment provider

For each affected integration, identify:

- What operation is performed
- Where the integration is owned
- Whether authentication or authorization changes
- Whether new API scopes or permissions are required
- Whether webhook behaviour changes
- Whether retry, timeout, or failure behaviour changes

Use `None` when the change has no external integrations.

---

## Configuration and data changes

Document all configuration or persisted-data changes.

### Environment variables

List new, changed, or removed environment variables.

For each variable, state whether it is:

- Server-only
- Public/client-visible
- Required
- Optional

Never expose secrets through `NEXT_PUBLIC_*` variables or client bundles.

Use `None` when unchanged.

### Database or schema

Describe:

- Schema changes
- New fields
- New tables or collections
- Constraints
- Indexes
- Migration requirements

Use `None` when unchanged.

### Webhooks

Describe:

- New or changed webhook endpoints
- Events consumed
- Signature verification
- Idempotency behaviour
- Retry behaviour

Use `None` when unchanged.

### OAuth and permissions

Describe:

- OAuth providers affected
- New scopes
- Changed permissions
- Token storage or refresh behaviour

Use `None` when unchanged.

### Deployment configuration

Describe any changes required in:

- Hosting
- Environment configuration
- Redirects
- Cron jobs
- Domains
- Build configuration
- Runtime configuration

Use `None` when unchanged.

### Migration or backfill

State whether existing data requires migration or backfilling.

Use `None` when not applicable.

---

## Security and privacy considerations

Identify any customer, booking, calendar, authentication, or payment data handled by this change.

Codex must:

- Keep credentials, API keys, signing secrets, access tokens, refresh tokens, and privileged integration logic server-side.
- Avoid exposing server-only configuration in browser bundles.
- Verify authentication and authorization boundaries where applicable.
- Validate untrusted input at server boundaries.
- Verify webhook signatures where supported by the provider.
- Avoid logging credentials, tokens, payment information, or unnecessary personal information.
- Avoid storing payment-card information directly.
- Request only the external-service permissions required for the feature.
- Avoid returning sensitive external-service errors directly to users.
- Preserve existing privacy boundaries for booking and calendar data.

Document any new security or privacy implications introduced by the task.

Use `None` when there are genuinely no relevant considerations.

---

## Required implementation

Describe the required behaviour precisely.

Include:

- User-visible behaviour
- Server-side behaviour
- State transitions
- API behaviour
- Validation
- Error handling
- Loading behaviour
- Retry or recovery behaviour
- Idempotency requirements where applicable
- Authorization behaviour
- Responsive behaviour where applicable
- Accessibility expectations where applicable

Prefer implementing the smallest coherent change that satisfies the objective.

Do not introduce unrelated architectural changes, abstractions, dependencies, or visual redesigns unless required by the task.

### External-service failure handling

For flows involving external services, define what happens when any individual operation fails.

The implementation must avoid ambiguous or inconsistent states.

Examples include:

- Payment succeeds but booking creation fails.
- Booking is created but Google Calendar creation fails.
- Calendar creation succeeds but video-call creation fails.
- A webhook is delivered more than once.
- An API request times out after the remote operation may already have succeeded.
- A user refreshes or retries during payment or booking creation.
- An authorization token has expired or been revoked.

Where applicable, use deterministic state transitions and idempotency to prevent duplicate bookings, charges, calendar events, or video calls.

---

## UI implementation requirements

Apply this section when the task materially changes rendered UI.

- Preserve the existing Re-Embroidered Conversations visual language unless redesign is explicitly part of the task.
- Prefer extending existing components and design patterns over introducing parallel UI systems.
- Maintain accessible semantic markup and keyboard interaction.
- Provide meaningful loading, empty, error, disabled, and success states where applicable.
- Maintain responsive behaviour across relevant viewport sizes.
- Avoid layout shifts caused by uncontrolled asynchronous content where practical.

For material UI changes:

- Prefer automated browser-based visual verification over manual Codex visual inspection.
- Use Playwright visual regression screenshots for routes, components, or states whose rendered appearance is part of the requirement.
- Combine screenshot assertions with functional assertions so visual tests do not become the sole proof of correct behaviour.
- Cover relevant loading, empty, error, success, authorization, and responsive states where applicable.
- Keep visual tests deterministic by controlling data, viewport, animations, fonts, asynchronous loading, and time-dependent content where necessary.
- Manual visual review may supplement automated tests for genuinely new or substantially redesigned interfaces, but it must not be the primary acceptance criterion.

Do not add visual-regression testing to backend-only changes where rendered output is unaffected.

---

## Acceptance criteria

Replace or extend these criteria with task-specific, measurable requirements.

### Behaviour

- [ ] The objective described above is satisfied through observable application behaviour.
- [ ] Expected API and/or UI behaviour is explicitly covered.
- [ ] Invalid input is handled predictably.
- [ ] Relevant loading, empty, error, success, and authorization states are handled.
- [ ] Failure and edge-case behaviour is defined and tested.
- [ ] Existing behaviour outside the stated change surface remains unchanged.

### External integrations

When applicable:

- [ ] External-service failures are handled explicitly.
- [ ] A partial external-service failure does not leave the booking in an ambiguous state.
- [ ] Retried requests do not create unintended duplicate bookings, payments, calendar events, or video calls.
- [ ] Required webhook signature verification is implemented.
- [ ] Required environment variables and external configuration changes are documented.
- [ ] Secrets and privileged API operations remain server-side.

### UI

For material UI changes:

- [ ] The affected page or component behaves correctly at supported viewport sizes.
- [ ] Keyboard and basic accessibility behaviour remain functional.
- [ ] Automated browser coverage exists for the affected route, interaction, or state.
- [ ] Visual regression coverage exists where layout, styling, typography, spacing, or responsive rendering materially changed.
- [ ] Functional assertions accompany screenshot assertions.
- [ ] Visual tests are deterministic and suitable for CI.
- [ ] Manual Codex visual inspection is not the primary evidence that rendering is correct.

### Code quality

- [ ] The implementation follows existing repository conventions.
- [ ] No unnecessary dependencies are introduced.
- [ ] No unrelated refactors are included.
- [ ] Type safety is preserved.
- [ ] Linting passes.
- [ ] Required tests pass.
- [ ] Production build passes when the task affects build-time or runtime application code.

---

## Tests to add or update

List the exact expected test files or test locations where known.

Examples:

```text
tests/
app/**/__tests__/
components/**/__tests__/
e2e/
tests/e2e/
```

Describe the important cases that must be covered.

### Unit tests

Add or update unit tests for isolated behaviour such as:

- Validation
- Date calculations
- Availability calculation
- Price calculations
- State transitions
- Mapping external API responses
- Error normalization
- Idempotency helpers

Use `N/A` when unit coverage is not appropriate.

### Integration tests

Add or update integration tests for boundaries such as:

- Route handlers
- Server actions
- Persistence
- Stripe operations
- Google Calendar operations
- Booking orchestration
- Webhooks
- Authorization boundaries

External APIs should normally be mocked or replaced with deterministic test doubles unless the existing repository has a deliberate integration-test environment.

Use `N/A` when integration coverage is not appropriate.

### Browser tests

For material UI or user-flow changes, add or update Playwright coverage for the affected routes, interactions, and states.

Important flows may include:

- Selecting a booking date
- Selecting an available time
- Navigating between booking steps
- Validation errors
- Loading availability
- No availability
- Recoverable API errors
- Checkout initiation
- Successful booking confirmation
- Payment cancellation or failure
- Responsive booking behaviour

Use functional assertions to verify behaviour.

### Visual regression tests

Add or update Playwright visual regression snapshots when the change materially affects:

- Layout
- Styling
- Typography
- Spacing
- Component composition
- Responsive behaviour
- Loading states
- Empty states
- Error states
- Success states

Keep screenshots deterministic by controlling:

- Test data
- Current date/time
- Viewport
- Animations and transitions
- Fonts
- Network behaviour
- Asynchronous loading
- External service responses

Do not update snapshots blindly. Snapshot changes must correspond to intentional UI changes.

---

## Verification commands

Codex must run the relevant repository commands before considering the task complete.

Replace placeholders below with the actual commands established from the repository.

```bash
# Install dependencies when required
<install-command>

# Type checking
<typecheck-command>

# Lint
<lint-command>

# Unit/integration tests
<test-command>

# Relevant targeted tests
<targeted-test-command>

# Playwright browser tests for material UI changes
<playwright-command>

# Playwright visual regression tests when rendered output materially changes
<playwright-visual-command>

# Production build when applicable
<build-command>
```

Do not invent commands without checking the repository configuration.

If a command cannot be run in the available environment, document:

1. The command that should have been run.
2. Why it could not be run.
3. What verification was performed instead.

---

## Completion report

When implementation is complete, provide a concise summary containing:

### Changed

Summarise the implemented behaviour and the significant files or subsystems changed.

### Tests

List:

- Tests added or updated
- Verification commands run
- Their results

### External configuration

List any required actions outside the repository, such as:

- Environment variables
- Stripe webhook configuration
- Google OAuth configuration
- API credentials
- Deployment settings

Use `None` when no external configuration is required.

### Deviations

Describe any meaningful deviation from this task specification and why it was necessary.

Use `None` when there were no deviations.

### Remaining issues

List unresolved issues, limitations, or follow-up work.

Use `None` when the task is fully complete.
