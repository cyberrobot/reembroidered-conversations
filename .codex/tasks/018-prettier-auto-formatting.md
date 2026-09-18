# PR #18 — Add automatic Prettier formatting

## Repository state

**Expected branch:**  
`chore/018-prettier-auto-formatting`

**Base branch:**  
`main`

**Worktree:**  
N/A

**Dependencies:**  

- Existing npm-based dependency management via `package-lock.json`
- Existing GitHub Actions CI workflow at `.github/workflows/ci.yml`
- Existing repository-wide Codex guidance in `AGENTS.md`

### Read first

Before making changes, read:

- `AGENTS.md`
- `.codex/tasks/TEMPLATE.md`
- `package.json`
- `package-lock.json`
- `.gitignore`
- `.github/workflows/ci.yml`

### Primary change area

Repository developer tooling and Codex verification workflow.

This PR establishes Prettier as the repository's authoritative code formatter and ensures formatting is:

1. automatically applied by Codex during implementation tasks;
2. independently checkable through npm;
3. enforced by CI.

### Canonical implementation examples

Current repository conventions to preserve:

- npm scripts in `package.json`
- dependency locking through `package-lock.json`
- verification through `.github/workflows/ci.yml`
- Codex repository-wide instructions through `AGENTS.md`

There is currently no existing Prettier configuration or formatter implementation to extend.

### Relevant symbols

N/A — this change is repository tooling/configuration rather than application logic.

### Expected change surface

Expected files include:

```text
package.json
package-lock.json
AGENTS.md
.github/workflows/ci.yml
.prettierignore
prettier.config.mjs
```

Prettier may also make formatting-only changes to existing supported source/configuration files when establishing the initial formatting baseline.

Those changes must contain no intentional application behaviour changes.

### Excluded areas

Do not change:

- application behaviour;
- booking behaviour;
- Stripe integration;
- Google Calendar integration;
- Google Meet integration;
- database schema or migrations;
- visual design;
- application copy;
- unrelated dependencies;
- ESLint/type-checking behaviour;
- Playwright behaviour.

Do not combine unrelated cleanup or refactoring with the initial Prettier formatting pass.

### Unknowns Codex must verify

Before editing, verify:

- the exact installed Node/npm environment expected by CI;
- which repository files Prettier supports;
- which files/directories are generated and must not be formatted;
- whether any additional generated or build-output directories exist beyond those already identified in `.gitignore`;
- that the proposed Prettier configuration does not conflict with existing TypeScript, Next.js, CSS, Prisma, test, or GitHub Actions files.

---

## Objective

Add Prettier as the repository's standard automatic formatter.

After this PR:

- Codex must run Prettier automatically after modifying repository files;
- developers can explicitly format the repository using `npm run format`;
- developers and CI can verify formatting without modifying files using `npm run format:check`;
- CI fails when committed files do not conform to Prettier;
- generated/build output is excluded;
- the repository starts from a clean formatting baseline where `npm run format:check` passes.

Formatting must not alter application behaviour.

---

## Current architecture

The project is a Next.js application managed with npm.

`package.json` currently provides scripts for:

```text
dev
build
start
clean
lint
test
test:browser
db:generate
db:validate
db:migrate:dev
db:migrate:deploy
postinstall
```

There is currently:

- no Prettier dependency;
- no `format` command;
- no `format:check` command;
- no Prettier configuration;
- no Prettier ignore file.

`AGENTS.md` currently instructs Codex to include formatting in verification **when formatting is configured**, but does not prescribe an actual formatting command.

CI is defined in:

```text
.github/workflows/ci.yml
```

It currently performs:

```text
npm ci
database migrations
Prisma validation
npm test
npm run lint
npm run build
Playwright installation
npm run test:browser
```

There is currently no formatting check in CI.

---

## External integrations affected

None.

No Stripe, Google Calendar, Google Meet, email, OAuth, payment, or external API behaviour changes.

---

## Configuration and data changes

### Environment variables

None.

### Database or schema

None.

### Webhooks

None.

### OAuth and permissions

None.

### Deployment configuration

GitHub Actions CI is updated to enforce formatting.

No hosting or runtime deployment configuration changes are required.

### Migration or backfill

No data migration.

A one-time source-formatting baseline may be required so that the repository passes the new `format:check` command immediately after this PR is merged.

---

## Security and privacy considerations

No new customer, booking, payment, calendar, OAuth, or personal data handling is introduced.

Prettier must not be configured to process:

- generated build output;
- dependency directories;
- test reports;
- coverage output;
- generated Prisma client output;
- environment files or secrets;
- other generated artifacts that should not be source-controlled formatting targets.

---

## Required implementation

### 1. Add Prettier

Add Prettier as a development dependency using npm.

Do not add an alternative formatter.

Update both:

```text
package.json
package-lock.json
```

Do not manually edit dependency-lock contents beyond changes generated by npm.

---

### 2. Add formatting scripts

Add:

```json
"format": "prettier --write .",
"format:check": "prettier --check ."
```

to `package.json`.

`npm run format` is the authoritative automatic formatting command.

`npm run format:check` is the authoritative non-mutating formatting verification command.

---

### 3. Add Prettier configuration

Add a repository-level Prettier configuration.

Prefer:

```text
prettier.config.mjs
```

Keep configuration intentionally minimal.

Use Prettier defaults unless the existing source clearly establishes a repository-wide convention that requires an explicit override.

Do not introduce subjective formatting customisation merely to preserve incidental existing formatting.

---

### 4. Add `.prettierignore`

Add a repository-level `.prettierignore`.

At minimum, exclude generated or disposable content such as:

```text
node_modules
.next
out
build
coverage
playwright-report
test-results
src/generated/prisma
```

Also exclude other generated artifacts discovered during implementation.

Do not use `.prettierignore` to hide ordinary source files that fail formatting.

Files controlled by another generator or package manager, such as generated dependency metadata, may be excluded where formatting them would create unnecessary churn.

---

### 5. Make formatting automatic for Codex

Update `AGENTS.md` so formatting is a mandatory Codex implementation step once Prettier is installed.

The repository instructions must explicitly require Codex to:

```text
After making implementation changes:
1. run npm run format;
2. run the relevant repository verification;
3. run npm run format:check before considering the task complete.
```

The wording does not need to be identical, but the required behaviour must be unambiguous.

Codex must not rely on remembering to invoke Prettier manually or on a task specification repeating the requirement.

The root `AGENTS.md` must make automatic formatting the repository-wide default for subsequent Codex work.

---

### 6. Enforce formatting in CI

Update:

```text
.github/workflows/ci.yml
```

to run:

```bash
npm run format:check
```

after dependencies are installed and before expensive application/test steps.

Formatting verification must be non-mutating in CI.

CI must fail when tracked source/configuration files do not conform to Prettier.

CI must never run:

```bash
npm run format
```

because CI should detect formatting problems rather than silently rewrite them.

---

### 7. Establish the formatting baseline

Run:

```bash
npm run format
```

after configuration is complete.

Commit the formatting changes required for:

```bash
npm run format:check
```

to pass from a clean checkout.

Formatting-only changes are allowed as part of this PR where necessary to establish the baseline.

Do not combine those changes with semantic cleanup, renaming, refactoring, component restructuring, import redesign, or application behaviour changes.

If the initial Prettier pass changes a large number of files, Codex must distinguish the formatter-generated baseline changes from the tooling/configuration changes in the completion report.

---

### 8. Preserve existing verification

Do not replace any existing CI check.

The existing:

```text
Prisma validation
Node tests
TypeScript checking
production build
Playwright tests
```

must continue running.

Formatting is an additional verification layer.

---

## External-service failure handling

N/A.

---

## UI implementation requirements

N/A.

No rendered UI changes are intended.

Formatting may modify whitespace/layout in source files but must not intentionally alter rendered output.

---

## Acceptance criteria

### Formatting

- [ ] Prettier is installed as a development dependency.
- [ ] `package-lock.json` reflects the dependency change.
- [ ] A repository-level Prettier configuration exists.
- [ ] A repository-level `.prettierignore` exists.
- [ ] Generated/build/test-output directories are excluded.
- [ ] `npm run format` formats repository source files.
- [ ] `npm run format:check` verifies formatting without modifying files.
- [ ] A clean checkout passes `npm run format:check`.

### Codex automation

- [ ] `AGENTS.md` explicitly requires Codex to run `npm run format` after making implementation changes.
- [ ] `AGENTS.md` requires `npm run format:check` before a task is considered complete.
- [ ] Future task specifications do not need to repeat the basic Prettier requirement for Codex to follow it.

### CI

- [ ] `.github/workflows/ci.yml` runs `npm run format:check`.
- [ ] Formatting is checked after dependency installation.
- [ ] Formatting failure causes CI to fail.
- [ ] CI does not automatically modify files.
- [ ] Existing CI checks remain intact.

### Baseline

- [ ] Existing applicable repository files have been formatted so the new CI check passes immediately.
- [ ] Formatter-generated changes contain no intentional application behaviour changes.
- [ ] Generated files are not reformatted unnecessarily.
- [ ] No unrelated refactoring is included.

### Code quality

- [ ] Existing TypeScript checking still passes.
- [ ] Existing Node tests still pass.
- [ ] Existing Playwright tests still pass.
- [ ] Production build still passes.
- [ ] No unnecessary formatter/linter dependencies are introduced.

---

## Tests to add or update

No new application unit, integration, or browser tests are required solely for Prettier.

The tooling itself is verified through the formatting commands and existing CI suite.

### Required formatter verification

Verify that:

```bash
npm run format
npm run format:check
```

both succeed.

After `npm run format` has completed, running it again should produce no formatting changes.

### CI verification

The existing CI workflow must successfully execute the new:

```bash
npm run format:check
```

step alongside the existing verification suite.

### Unit tests

N/A.

### Integration tests

N/A.

### Browser tests

No new browser tests required.

Existing Playwright tests must continue passing.

### Visual regression tests

N/A.

No intentional UI changes.

---

## Verification commands

Run from a clean working tree/environment as appropriate:

```bash
npm ci

npm run format

npm run format:check

npm run db:validate

npm test

npm run lint

npm run build

npm run test:browser
```

After the final `npm run format`, verify that:

```bash
npm run format:check
```

passes without changing files.

Before completion, check the Git diff and confirm that all broad source changes are formatter-only.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- Prettier dependency/configuration;
- formatting scripts;
- `.prettierignore`;
- `AGENTS.md` automatic Codex formatting requirement;
- CI formatting enforcement;
- any one-time formatting baseline changes.

### Tests

Report the result of:

```text
npm run format
npm run format:check
npm run db:validate
npm test
npm run lint
npm run build
npm run test:browser
```

### External configuration

None.

### Deviations

Describe any deviation from this specification.

Use `None` when there are none.

### Remaining issues

List any files intentionally excluded from Prettier and why.

Use `None` when there are no outstanding issues.