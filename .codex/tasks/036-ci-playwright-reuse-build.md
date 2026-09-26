# PR #36 — Reuse the Existing Production Build for Playwright in CI

## Repository state

**Expected branch:**  
`fix/36-ci-playwright-reuse-build`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  
PR #35 is already merged.

The failure being addressed was observed on `main` CI run #108 after PR #35 merged. PR #35's own CI run #107 passed, including the browser suite.

No new package, service, migration, or runtime dependency is required.

### Read first

Before making changes, read the repository guidance relevant to this task:

- `AGENTS.md`
- `package.json`
- `.github/workflows/ci.yml`
- `playwright.config.ts`
- `src/app/layout.tsx` only to understand the `next/font/google` failure context

Also inspect any nearer scoped `AGENTS.md` if one exists for a file being changed.

Do not create missing architecture documentation for this task.

### Primary change area

CI and Playwright test infrastructure.

Specifically:

- production build ownership in GitHub Actions
- Playwright `webServer` startup behaviour

### Canonical implementation examples

Treat these as the canonical existing configuration:

```text
.github/workflows/ci.yml
playwright.config.ts
package.json
```

Relevant current behaviour:

- CI runs `npm run build` before browser tests.
- `npm run build` executes `next build --webpack`.
- `npm run test:browser` executes `playwright test`.
- Playwright currently starts its local web server with:
  ```text
  npm run build && next start ...
  ```
- therefore CI performs the production build twice.

### Relevant symbols

Inspect:

```text
playwright.config.ts
  externalBaseUrl
  testPort
  webServer
  webServer.command

process.env.CI
process.env.PLAYWRIGHT_BASE_URL
```

Also inspect the existing CI-level:

```yaml
env:
  CI: true
```

### Expected change surface

Expected primary change:

```text
playwright.config.ts
```

`.github/workflows/ci.yml` should not need functional changes because it already:

1. builds the production application;
2. installs Playwright Chromium;
3. runs the browser suite.

A minimal explanatory comment may be added where useful.

If additional files must change, explain why in the completion report.

### Excluded areas

Do not modify:

- `src/app/layout.tsx`
- the current `next/font/google` font configuration
- Cormorant Garamond configuration
- Plus Jakarta Sans configuration
- PR #35's International Recognition section
- customer-facing UI or copy
- visual styling
- booking behaviour
- Stripe integration
- Google Calendar integration
- Google Meet integration
- email behaviour
- database schema or migrations
- production deployment configuration
- application dependencies
- Playwright screenshots unless an unrelated existing failure is discovered and separately documented

Do not switch to locally hosted fonts as part of PR #36.

That may be considered separately as build-hardening work if required later.

### Unknowns Codex must verify

Before editing, confirm from the current branch that:

- `.github/workflows/ci.yml` still runs `npm run build` before `npm run test:browser`;
- the CI job still sets `CI: true`;
- `playwright.config.ts` still performs `npm run build && next start` when it owns the web server;
- `PLAYWRIGHT_BASE_URL` still disables Playwright's local `webServer`;
- no existing helper or configuration already differentiates local and CI web-server startup.

Do not assume these remain unchanged if `main` has moved.

---

## Objective

Ensure the CI browser-test stage reuses the production build that the CI workflow has already created instead of invoking a second `next build`.

After this PR:

```text
CI
 ↓
npm run build
 ↓
Playwright
 ↓
next start
 ↓
browser tests
```

must replace the current sequence:

```text
CI
 ↓
npm run build
 ↓
Playwright
 ↓
npm run build
 ↓
next start
 ↓
browser tests
```

Local development behaviour must remain convenient:

```bash
npm run test:browser
```

must continue to build the application before starting it when Playwright is responsible for the local web server.

The existing `PLAYWRIGHT_BASE_URL` behaviour must remain unchanged.

Completion means:

- CI performs exactly one application production build;
- Playwright successfully starts that existing build in CI;
- the browser suite remains green;
- local browser-test execution still builds automatically;
- no application runtime or UI behaviour changes.

---

## Current architecture

The GitHub Actions CI job currently runs the relevant stages sequentially:

```text
npm ci
↓
security audit
↓
format check
↓
database migrations
↓
Prisma validation
↓
Node tests
↓
type checking
↓
npm run build
↓
Playwright Chromium installation
↓
npm run test:browser
```

The production build step executes:

```bash
npm run build
```

which maps to:

```bash
next build --webpack
```

However, `playwright.config.ts` currently owns the application web server for normal browser-test execution and uses a command equivalent to:

```bash
npm run build && next start --hostname 0.0.0.0 --port <port>
```

As a result, CI builds the same commit twice.

### Observed failure

On the failing `main` run:

1. the normal CI production build succeeded;
2. Node tests and type checking succeeded;
3. Playwright then attempted its second build;
4. that second build failed inside `next/font/google` while processing `Cormorant_Garamond`;
5. `next start` therefore never started;
6. no browser test itself failed.

The relevant failure was:

```text
An error occurred in `next/font`.

TypeError: Cannot read properties of null (reading '1')
```

from the Next.js Google font loader.

PR #35's own CI run had already passed the same browser suite.

The font configuration in `src/app/layout.tsx` was also unchanged by PR #35.

PR #36 should therefore eliminate the redundant second build rather than modify unrelated application code.

---

## External integrations affected

### GitHub Actions

CI execution behaviour is affected.

The workflow's authoritative production build remains:

```bash
npm run build
```

No GitHub permissions, secrets, actions, authentication, or runner requirements should change.

### Google Fonts / `next/font/google`

No integration change is required.

The application should continue using its existing fonts.

This PR reduces the number of times the build-time font loader is executed during one CI job from two to one.

### Customer-facing external services

None.

No changes to:

- Stripe
- Google Calendar
- Google Meet
- Resend/email
- Mux
- Cloudflare Turnstile

---

## Configuration and data changes

### Environment variables

No new environment variables.

Reuse the existing CI environment:

```yaml
CI: true
```

When converting it to a boolean in TypeScript, do not accidentally treat a value such as:

```text
CI=false
```

as CI merely because a non-empty string is truthy.

Prefer an explicit comparison appropriate to the repository's current value, for example:

```ts
process.env.CI === "true"
```

unless inspection establishes a better existing convention.

`PLAYWRIGHT_BASE_URL` behaviour must remain unchanged.

### Database or schema

None.

### Webhooks

None.

### OAuth and permissions

None.

### Deployment configuration

Production deployment configuration is unchanged.

This task changes only browser-test web-server startup behaviour.

The existing explicit CI production-build step remains authoritative.

### Migration or backfill

None.

---

## Security and privacy considerations

No new customer or privileged data is handled by this change.

Do not introduce new environment-variable logging or expose CI environment contents.

Existing booking, payment, calendar, OAuth, and customer-data boundaries must remain unchanged.

---

## Required implementation

Update Playwright web-server configuration so its command depends on execution context.

### CI behaviour

When all of the following are true:

- Playwright is responsible for starting the web server;
- execution is under the repository's CI environment;

Playwright must start the previously built application directly:

```bash
./node_modules/.bin/next start --hostname 0.0.0.0 --port <port>
```

It must **not** execute:

```bash
npm run build
```

during the browser-test stage.

The `.next` output produced by the earlier CI `npm run build` step is the artifact that must be started.

### Local behaviour

Outside CI, when Playwright owns the web server, preserve the current convenience behaviour:

```bash
npm run build && ./node_modules/.bin/next start --hostname 0.0.0.0 --port <port>
```

A developer should therefore still be able to run:

```bash
npm run test:browser
```

without manually building first.

### External server behaviour

When:

```text
PLAYWRIGHT_BASE_URL
```

is supplied, preserve the current behaviour:

```text
webServer: undefined
```

Playwright must neither build nor start a local Next.js server in that mode.

### CI workflow

Keep the existing explicit production-build step:

```yaml
- name: Build production application
  run: npm run build
```

Do not solve this task by deleting that build and leaving the build hidden inside the Playwright stage.

The CI structure should make production-build failures attributable to the production-build step.

### Build artifact integrity

Nothing between the production-build step and browser-test startup may intentionally modify source files or invalidate the `.next` build.

The current Playwright browser tests must exercise the exact application artifact produced by the CI production build.

### Failure behaviour

If:

```bash
npm run build
```

fails, CI should fail at the production-build step.

If:

```bash
next start
```

fails despite a successful build, the browser-test stage should fail normally and retain the existing Playwright diagnostics behaviour.

Do not automatically rebuild as a fallback in CI.

A fallback build would recreate the duplicated-build behaviour this PR exists to remove.

### Scope discipline

Prefer the smallest coherent implementation.

A likely implementation shape is:

```ts
const isCi = process.env.CI === "true";

const startCommand =
  `./node_modules/.bin/next start --hostname 0.0.0.0 --port ${testPort}`;

const webServerCommand = isCi
  ? startCommand
  : `npm run build && ${startCommand}`;
```

Exact code may differ to fit existing style, but the resulting behaviour must match this specification.

Do not introduce a new dependency or abstraction solely for this conditional.

### External-service failure handling

N/A.

---

## UI implementation requirements

No rendered UI change is permitted or required.

Existing browser and visual-regression tests should continue exercising the same application.

Do not update visual snapshots merely because this PR changes test infrastructure.

Any unexpected visual difference should be investigated rather than accepted automatically.

---

## Acceptance criteria

### Behaviour

- [ ] CI still contains one explicit `npm run build` production-build step.
- [ ] CI performs only **one** `next build --webpack` invocation during the complete test job.
- [ ] The Playwright browser-test stage does not invoke `npm run build` when `CI=true`.
- [ ] In CI, Playwright starts the `.next` artifact produced by the preceding production-build step.
- [ ] The full browser suite executes after `next start` succeeds.
- [ ] A production-build failure still fails the dedicated production-build step.
- [ ] Playwright does not silently rebuild as a CI fallback.
- [ ] Local `npm run test:browser` still builds the application before starting Next.js when no external base URL is configured.
- [ ] `PLAYWRIGHT_BASE_URL` continues to disable Playwright's local web server.
- [ ] Existing behaviour outside test/build infrastructure remains unchanged.

### Regression addressed

- [ ] The failure mode from `main` CI run #108 cannot occur as a **second redundant build**, because that second build no longer exists.
- [ ] PR #36 does not attempt to fix this by modifying the application's Google font configuration.
- [ ] CI logs clearly show one production build followed later by `next start` for the browser suite.

### External integrations

- [ ] No new external-service configuration is introduced.
- [ ] No GitHub Actions permissions or secrets change.
- [ ] No customer-facing external integration changes.

### UI

- [ ] No customer-facing UI is changed.
- [ ] Existing browser tests continue to pass.
- [ ] Existing visual snapshots remain unchanged unless a pre-existing unrelated issue is separately demonstrated.

### Code quality

- [ ] The implementation follows existing repository conventions.
- [ ] No unnecessary dependencies are introduced.
- [ ] No unrelated refactors are included.
- [ ] Type safety is preserved.
- [ ] Formatting passes.
- [ ] Repository type checking passes.
- [ ] Node tests pass.
- [ ] Production build passes.
- [ ] Browser tests pass.

---

## Tests to add or update

The primary verification for this change is the existing production build plus the existing Playwright browser suite.

No application-level test should be added solely to test a configuration string.

If a small deterministic configuration test can be implemented using an existing repository testing pattern without introducing brittle source-text assertions or new tooling, it may be added, but it is not required.

### Unit tests

N/A unless an existing clean pattern for testing Playwright configuration is discovered.

Do not add brittle tests that simply search `playwright.config.ts` source text.

### Integration tests

N/A.

### Browser tests

Do not add new feature assertions.

Run the existing browser suite in CI mode against an already-created production build.

The important infrastructure assertion is:

```text
npm run build
↓
CI=true npm run test:browser
```

where the second command starts `next start` without invoking another build.

Also verify local behaviour without CI mode:

```text
npm run test:browser
```

must retain its build-before-start behaviour.

### Visual regression tests

No snapshot changes are expected.

Run existing visual coverage as part of the normal browser suite where already configured.

Do not regenerate baselines for this PR unless an independently justified visual change exists, which would be outside this task's expected scope.

---

## Verification commands

Use the repository's actual configured commands.

```bash
# Install dependencies when required
npm ci

# Formatting
npm run format:check

# Repository type checking
npm run lint

# Unit/integration tests
npm test

# Production build
npm run build

# CI-mode browser verification.
# This must reuse the build created immediately above.
CI=true npm run test:browser
```

Inspect the output of the CI-mode browser command and confirm there is no second:

```text
next build --webpack
```

before `next start`.

Also verify local browser-test behaviour where the environment permits:

```bash
npm run test:browser
```

When running this local-mode verification from a clean build state, confirm Playwright still performs the build before starting the application.

The GitHub Actions PR run is the final end-to-end proof:

```text
Build production application  → success
Run browser tests             → success
```

and the job log must contain only one production build invocation.

If a verification command cannot run in the available environment, document:

1. the command;
2. why it could not run;
3. what was verified instead.

---

## Completion report

When implementation is complete, provide a concise summary containing:

### Changed

State:

- how `playwright.config.ts` now distinguishes CI from local execution;
- that CI reuses its existing `.next` build;
- that local browser-test behaviour remains build-and-start.

### Tests

List:

- tests run;
- production build result;
- browser-suite result;
- confirmation that the CI path did not perform a second build.

### External configuration

`None`

### Deviations

Describe any meaningful deviation from this task specification and why it was necessary.

Use `None` when there were no deviations.

### Remaining issues

Do not classify the existing use of `next/font/google` as unresolved work for PR #36.

If the application later needs to remove build-time network dependence on Google Fonts entirely, treat that as a separate hardening task.

Use `None` when PR #36 fully satisfies this specification.