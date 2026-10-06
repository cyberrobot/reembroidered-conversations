# PR #43 — Add Dependabot dependency update automation

## Repository state

**Expected branch:**  
`chore/043-dependabot`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**

- GitHub Dependabot
- Existing npm dependency management through `package.json` and `package-lock.json`
- Existing CI workflow at `.github/workflows/ci.yml`
- Existing scheduled dependency audit at `.github/workflows/dependency-audit.yml`
- GitHub repository Dependabot/security settings

### Read first

Before making changes, read the repository guidance relevant to this task:

- `AGENTS.md`
- Nearest scoped `AGENTS.md` for the primary change area, when one exists
- `.github/workflows/ci.yml`
- `.github/workflows/dependency-audit.yml`
- `package.json`
- `package-lock.json`
- Relevant dependency/security documentation in `README.md`

`docs/architecture/repository-map.md` and `docs/architecture/dependency-rules.md` are not currently present. Do not create them for this task.

### Primary change area

Repository dependency-maintenance automation.

The task should add Dependabot configuration for:

- npm dependencies
- GitHub Actions dependencies

This is repository configuration only. It must not change application runtime behaviour.

### Canonical implementation examples

Use the existing repository maintenance and CI configuration as the implementation reference:

- `.github/workflows/ci.yml`
- `.github/workflows/dependency-audit.yml`
- `package.json`
- `package-lock.json`
- `README.md`

The existing CI workflow is the authoritative validation pipeline for dependency pull requests.

### Relevant symbols

No application symbols are directly affected.

Codex should inspect:

- npm dependencies and dev dependencies in `package.json`
- npm `overrides` in `package.json`
- the root `package-lock.json`
- GitHub Actions referenced from `.github/workflows/*.yml`
- current CI triggers for pull requests targeting `main`
- existing dependency-security documentation in `README.md`

### Expected change surface

Expected changes:

```text
.github/dependabot.yml
README.md
```

Potentially:

```text
.codex/tasks/043-dependabot.md
```

if this specification is stored in the repository.

No application source, database schema, browser UI, or runtime integration files are expected to change.

If additional files are required, Codex must explain why.

### Excluded areas

Do not modify:

- `src/**`
- `prisma/**`
- booking behaviour
- Stripe integration
- Google Calendar or Google Meet integration
- email delivery
- analytics behaviour
- UI/layout/styling
- environment variables
- database migrations
- existing dependency versions merely as part of introducing Dependabot
- existing `deepmerge-ts` or `mysql2` security overrides
- existing CI behaviour unless a change is strictly necessary for Dependabot compatibility
- `.github/workflows/dependency-audit.yml` unless a concrete incompatibility is found

Do not add automatic merging of Dependabot pull requests.

### Unknowns Codex must verify

Before editing, verify:

- `.github/dependabot.yml` is still absent.
- The repository continues to use npm with `package.json` and `package-lock.json` at the repository root.
- There are no additional npm workspaces or nested package manifests requiring separate Dependabot entries.
- Existing GitHub Actions are all under `.github/workflows`.
- Pull requests targeting `main` continue to trigger the normal CI workflow.
- No existing repository automation already auto-merges dependency pull requests.
- The existing `deepmerge-ts` and `mysql2` overrides remain intentional temporary security pins.
- Whether Dependabot alerts and Dependabot security updates are already enabled in GitHub repository settings.

Do not infer repository-level GitHub security settings solely from files in the repository.

---

## Objective

Introduce Dependabot so routine dependency maintenance is automated without weakening the repository's existing security and CI controls.

After this change:

- Dependabot monitors the root npm dependency graph.
- Dependabot monitors GitHub Actions used by the repository.
- Routine version-update checks run weekly.
- npm minor and patch version updates are grouped to reduce pull-request noise.
- npm major version updates remain separate pull requests so they receive explicit review.
- GitHub Actions version updates are grouped into a single maintenance pull request where possible.
- Dependabot-generated pull requests target `main` and pass through the existing CI pipeline.
- Dependabot pull requests are never automatically merged by this task.
- Security-related Dependabot functionality is verified at repository level and enabled where required.
- The existing scheduled `npm audit` remains in place as an independent security check.
- Existing application behaviour remains unchanged.

Completion means the configuration is valid, documented, merged to the default branch, and GitHub recognises both configured package ecosystems.

---

## Current architecture

The repository is a single root npm application.

Dependency management currently uses:

```text
package.json
package-lock.json
```

The root package contains production and development npm dependencies, including Next.js, React, Prisma, Stripe, Playwright and supporting packages.

`package.json` also contains temporary security overrides for:

```text
deepmerge-ts
mysql2
```

These must remain intact.

There is currently no:

```text
.github/dependabot.yml
```

### Existing CI

`.github/workflows/ci.yml` runs for pull requests targeting `main` and for pushes to `main`.

It currently performs:

1. Repository checkout.
2. Node.js 22 setup.
3. `npm ci`.
4. `npm run security:audit`.
5. Formatting verification.
6. Database migrations.
7. Prisma schema validation.
8. Node tests.
9. TypeScript checking.
10. Production build.
11. Playwright Chromium installation.
12. Browser tests.

Dependabot pull requests targeting `main` should therefore automatically exercise the existing full CI pipeline.

### Existing dependency audit

`.github/workflows/dependency-audit.yml` also runs a scheduled dependency audit.

It currently:

- runs daily;
- installs dependencies with `npm ci`;
- executes `npm run security:audit`;
- fails for high or critical npm audit findings.

This detects vulnerable dependency states but does not automatically open routine dependency update pull requests.

Dependabot must complement this workflow rather than replace it.

---

## External integrations affected

### GitHub Dependabot

**Operation**

GitHub scans configured dependency ecosystems on the configured schedule and opens pull requests when supported dependency updates are available.

**Ownership**

Configuration is owned by:

```text
.github/dependabot.yml
```

Repository-level security features are owned by GitHub repository settings.

**Authentication or authorization changes**

None in application code.

No repository secrets should be introduced.

**New scopes or permissions**

None in application runtime code.

The repository uses public npm packages, so no private registry credentials are expected.

**Webhook behaviour**

None.

**Retry, timeout or failure behaviour**

Dependabot execution is owned by GitHub.

Configuration errors must be visible through GitHub's Dependabot/dependency graph status rather than being hidden by custom automation.

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

Add:

```text
.github/dependabot.yml
```

The configuration must use Dependabot configuration version 2.

Configure two package ecosystems.

#### npm

Use:

```yaml
package-ecosystem: "npm"
directory: "/"
```

Schedule routine version checks weekly.

Use an explicit schedule suitable for routine maintenance:

```yaml
schedule:
  interval: "weekly"
  day: "monday"
  time: "06:00"
  timezone: "Europe/London"
```

Set a reasonable version-update pull-request limit:

```yaml
open-pull-requests-limit: 5
```

Group routine npm **minor and patch version updates** together:

```yaml
groups:
  npm-minor-and-patch:
    applies-to: version-updates
    patterns:
      - "*"
    update-types:
      - "minor"
      - "patch"
```

Do not include `major` in this group.

Major npm upgrades must therefore continue to produce dedicated pull requests requiring explicit review.

Use an identifiable dependency-maintenance commit prefix such as:

```yaml
commit-message:
  prefix: "chore(deps)"
```

Do not configure a non-default `target-branch`. Updates should naturally target the repository default branch, `main`.

Do not add broad ignore rules merely to reduce update volume.

Do not remove or modify the existing npm `overrides`.

#### GitHub Actions

Configure:

```yaml
package-ecosystem: "github-actions"
directory: "/"
```

Schedule weekly checks.

Use:

```yaml
schedule:
  interval: "weekly"
  day: "monday"
  time: "06:30"
  timezone: "Europe/London"
```

Set:

```yaml
open-pull-requests-limit: 5
```

Group GitHub Actions version updates:

```yaml
groups:
  github-actions:
    applies-to: version-updates
    patterns:
      - "*"
```

Use an identifiable CI dependency prefix such as:

```yaml
commit-message:
  prefix: "ci(deps)"
```

Do not configure automatic merging.

### Repository-level GitHub settings

Codex cannot assume repository-level Dependabot security settings from repository files.

Verify and document the current state of:

- Dependency graph
- Dependabot alerts
- Dependabot security updates

If alerts or security updates are disabled, document that they must be enabled in the repository's GitHub security settings.

Routine Dependabot version updates are configured through the committed `.github/dependabot.yml`.

Security update pull requests should remain independent of the weekly routine version-update grouping unless there is a specific reason to group them.

### Migration or backfill

None.

Existing dependency versions must not be proactively changed in this PR solely to initialise Dependabot.

Any updates subsequently proposed by Dependabot belong in separate dependency-update pull requests.

---

## Security and privacy considerations

This change does not handle customer, booking, payment, Calendar or authentication data.

No credentials or application secrets are required.

Requirements:

- Do not commit npm tokens, GitHub tokens, registry credentials or other secrets.
- Do not add private-registry configuration unless the repository actually contains private dependencies.
- Preserve the existing `npm run security:audit` checks.
- Preserve the existing temporary security overrides.
- Do not automatically merge dependency updates.
- Every Dependabot update must remain subject to the repository's normal CI validation and human merge decision.
- Do not weaken CI, audit thresholds or branch protections to make automated update PRs easier to merge.

The dependency automation itself must not introduce privileged runtime access.

---

## Required implementation

Create:

```text
.github/dependabot.yml
```

with Dependabot configuration version 2.

### npm version updates

Configure Dependabot to:

- inspect the root npm manifest and lockfile;
- check weekly;
- run on Monday morning using the `Europe/London` timezone;
- group minor and patch routine version updates;
- leave major updates as dedicated pull requests;
- limit concurrent routine version-update pull requests to a reasonable number;
- use dependency-specific commit/PR naming;
- target the default branch;
- preserve existing package overrides;
- avoid unrelated dependency changes in this setup PR.

Dependabot's normal behaviour for direct dependency version updates is sufficient for routine maintenance.

Do not add proactive non-security lockfile churn merely to update unrelated indirect dependencies.

Security remediation of vulnerable transitive dependencies should continue to be covered by Dependabot security updates and the existing `npm audit` controls.

### GitHub Actions version updates

Configure Dependabot to:

- monitor GitHub Actions references in `.github/workflows`;
- check weekly;
- group routine GitHub Actions updates into a single update PR where possible;
- use a CI/dependency-specific commit prefix;
- target `main` through the repository's default-branch behaviour.

### Pull request safety

Dependabot pull requests must:

- use the existing GitHub pull-request workflow;
- run the existing CI pipeline;
- require normal human review/merge;
- not bypass security auditing;
- not bypass application tests;
- not bypass browser tests;
- not trigger an automatically configured merge.

Do not introduce a workflow using `pull_request_target` merely to accommodate Dependabot.

Do not grant Dependabot PRs access to application secrets unless a future task establishes a concrete requirement.

### Existing dependency audit

Keep:

```text
.github/workflows/dependency-audit.yml
```

The scheduled audit and Dependabot solve related but different problems:

- the audit detects unsafe installed dependency states;
- Dependabot proposes dependency updates.

Do not remove the scheduled audit as part of this task.

### Documentation

Update `README.md` with a concise dependency-maintenance section documenting:

- Dependabot monitors npm and GitHub Actions.
- Routine update checks run weekly.
- npm minor/patch updates are grouped.
- npm major upgrades receive dedicated PRs.
- Dependabot PRs go through normal CI.
- Dependabot PRs are not automatically merged.
- the scheduled dependency audit remains enabled;
- Dependabot alerts/security updates must be enabled at repository level for automatic vulnerability remediation.

Keep the existing explanation of the `deepmerge-ts` and `mysql2` overrides.

---

### External-service failure handling

No runtime external service calls are introduced.

Relevant configuration failure cases are:

#### Invalid Dependabot YAML

GitHub may reject or ignore the configuration.

The file must:

- be valid YAML;
- use `version: 2`;
- use supported package ecosystems;
- use valid directory and schedule values.

#### GitHub accepts the file but repository security updates are disabled

Routine version updates may operate while automated vulnerability remediation remains unavailable.

Repository-level Dependabot alert/security-update settings must therefore be explicitly verified and documented.

#### Dependabot update PR fails CI

Do not weaken CI.

The update PR remains open or is closed until the dependency update can pass normal repository checks.

#### Dependency update causes application incompatibility

Do not automatically merge.

Review and remediate the dependency update independently from this configuration PR.

---

## UI implementation requirements

N/A.

This task must not modify rendered application UI.

No Playwright visual-regression updates are required.

---

## Acceptance criteria

### Behaviour

- [ ] `.github/dependabot.yml` exists.
- [ ] The file uses Dependabot configuration `version: 2`.
- [ ] npm dependency version updates are configured for the repository root.
- [ ] GitHub Actions version updates are configured.
- [ ] Both ecosystems check for routine updates weekly.
- [ ] The configured timezone is explicit.
- [ ] npm minor and patch version updates are grouped.
- [ ] npm major version updates are not included in the minor/patch group.
- [ ] GitHub Actions routine updates are grouped.
- [ ] Routine update PR volume is bounded with `open-pull-requests-limit`.
- [ ] Dependabot update PRs target the default branch.
- [ ] No auto-merge mechanism is added.
- [ ] No existing dependency versions are unnecessarily changed by this PR.
- [ ] Existing npm overrides remain unchanged.
- [ ] Existing application behaviour remains unchanged.

### External integrations

- [ ] Dependabot version-update configuration is committed under `.github`.
- [ ] Repository Dependabot alerts status is verified.
- [ ] Repository Dependabot security-updates status is verified.
- [ ] Any required GitHub setting that cannot be changed from the repository is documented.
- [ ] No registry or repository secrets are added.
- [ ] Dependabot PRs are covered by the existing `pull_request` CI workflow.
- [ ] The existing scheduled dependency audit remains operational.

### UI

N/A.

### Code quality

- [ ] The implementation follows existing repository conventions.
- [ ] No unnecessary dependency is introduced merely to configure Dependabot.
- [ ] No unrelated refactors are included.
- [ ] `package.json` dependency versions remain unchanged unless a concrete configuration requirement is discovered.
- [ ] `package-lock.json` remains unchanged unless a concrete configuration requirement is discovered.
- [ ] Formatting passes.
- [ ] Existing CI passes.
- [ ] The Dependabot configuration is recognised by GitHub after merge to the default branch.

---

## Tests to add or update

No application-level tests are required.

The change is repository configuration and documentation.

### Unit tests

N/A.

### Integration tests

N/A.

### Browser tests

No new browser tests are required.

The existing browser suite should remain unchanged and must continue to pass through normal CI.

### Visual regression tests

N/A.

No rendered output changes.

### Configuration verification

Verify:

1. `.github/dependabot.yml` parses as valid YAML through the repository formatting tooling.
2. The file remains formatted by the existing Prettier configuration.
3. Existing CI passes.
4. After the configuration reaches `main`, GitHub's Dependabot status recognises:
   - npm at `/`
   - GitHub Actions
5. GitHub does not report a Dependabot configuration error.
6. Repository Dependabot alerts/security-update settings are confirmed.

Do not introduce a new YAML/schema validation dependency solely for this task.

---

## Verification commands

Run the repository's existing checks relevant to configuration and dependency maintenance.

```bash
# Install exact committed dependencies
npm ci

# Dependency security audit
npm run security:audit

# Formatting, including .github/dependabot.yml
npm run format:check

# Existing Node test suite
npm test

# Type checking
npm run lint

# Production build
npm run build

# Existing browser suite / CI parity
npm run test:browser

# Whitespace verification
git diff --check
```

There is no targeted application test command because no application functionality changes.

The normal GitHub CI workflow must pass on the Dependabot implementation PR.

After merge, also verify the repository's GitHub Dependabot status/configuration because local commands cannot validate GitHub's interpretation of the Dependabot configuration.

If that verification cannot be performed in the available environment, report:

1. That GitHub-side Dependabot recognition remains to be checked.
2. The exact repository page/setting requiring verification.
3. The repository-side validation completed instead.

---

## Completion report

When implementation is complete, provide a concise summary containing:

### Changed

Summarise:

- creation of `.github/dependabot.yml`;
- npm update policy;
- GitHub Actions update policy;
- README dependency-maintenance documentation;
- any repository-level GitHub setting confirmed or still required.

### Tests

List:

- verification commands run;
- CI result;
- formatting result;
- Dependabot GitHub-side configuration result when available.

### External configuration

State whether these repository settings are enabled:

- Dependency graph
- Dependabot alerts
- Dependabot security updates

If any require manual action, identify them explicitly.

No application environment variables or provider configuration are required.

### Deviations

Describe any meaningful deviation from this specification and why it was necessary.

Use `None` when there were no deviations.

### Remaining issues

Include any outstanding GitHub-side verification or security-setting enablement.

Use `None` when Dependabot is fully configured and recognised.
