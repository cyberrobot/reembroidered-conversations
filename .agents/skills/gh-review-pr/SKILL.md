---
name: gh-review-pr
description: Review a GitHub pull request against its governing specification, gather objective evidence, measure implementation progress, identify blocking gaps, and determine approvability. Use when the user requests a PR review, implementation audit, specification compliance review, completion percentage, missing requirements, or an approvability decision.
---

# GitHub PR Specification Review

## Purpose

Gather objective evidence that enables a human engineer to decide whether a pull request is ready to merge.

Do not attempt to prove the implementation is correct.

Attempt to disprove that it satisfies the governing specification.

Review only observable behaviour and evidence you directly inspect.

Never assume another reviewer, author, CI job, or tool has already validated any aspect of the pull request.

---

## Repository context

This skill is suitable for the Re-Embroidered Conversations repository and similar projects where PRs are implemented from explicit task specifications.

For Re-Embroidered Conversations, pay particular attention when a PR affects:

- Next.js server/client boundaries
- booking availability or booking lifecycle
- date, time, or time-zone handling
- Google Calendar
- Google Meet
- Stripe
- webhooks
- external-service retries or idempotency
- payment, booking, or calendar data integrity
- material UI behaviour or rendering
- security or privacy boundaries

Do not add project requirements that are not present in the governing specification or applicable repository instructions.

---

# Review workflow

## 1. Resolve the review inputs

Resolve:

- the pull request;
- the governing specification;
- the applicable repository instructions;
- any approved specification amendments.

If the pull request cannot be resolved, stop and state what is unavailable.

If no authoritative specification exists, state that specification compliance cannot be measured. You may still report observable implementation risks, but do not manufacture a requirement ledger from the implementation.

### Specification authority

For Re-Embroidered Conversations, resolve authority in this order:

1. The numbered task specification explicitly associated with the PR.
2. Approved amendments recorded in the task or PR after implementation began.
3. Applicable root and scoped `AGENTS.md` files as repository constraints.
4. Architecture or integration documentation when explicitly referenced by the governing task or applicable agent instructions.

Treat `AGENTS.md` as repository constraints, not as a source of arbitrary product requirements.

Do not treat implementation choices, commit messages, inferred intentions, or undocumented PR behaviour as requirements.

If the PR description conflicts with the numbered task specification, report the conflict rather than silently choosing one unless the PR clearly records an approved specification amendment.

If multiple candidate specifications exist and authority cannot be resolved from repository evidence, state the ambiguity and do not pretend compliance can be measured precisely.

---

## 2. Establish the evidence

Inspect, where applicable:

- governing task specification;
- root `AGENTS.md`;
- nearest applicable scoped `AGENTS.md`;
- complete PR diff;
- affected implementation;
- affected domain logic;
- tests;
- Playwright or other browser coverage;
- visual regression snapshots;
- migrations;
- environment and configuration changes;
- external integration boundaries;
- documentation;
- CI status;
- review threads where relevant.

Only use evidence you directly observe.

Treat missing evidence as unverified.

Do not infer successful behaviour merely because code exists for it.

Do not infer successful behaviour merely because CI is green.

Do not infer successful behaviour merely because tests exist.

Distinguish between:

- **Implementation gap** — required behaviour is absent, incomplete, or contradicted.
- **Verification gap** — implementation may exist, but required evidence is missing or insufficient.

When evidence is unavailable because of access or tooling limitations, state that explicitly.

---

## 3. Build a requirement ledger

Decompose the governing specification into independently verifiable requirements.

Include requirements that describe observable implementation outcomes.

Exclude:

- explanatory prose;
- implementation suggestions that are not mandatory;
- duplicated requirements;
- reviewer preferences;
- requirements invented from the implementation;
- non-applicable repository guidance.

Assign exactly one status to every requirement:

- **Complete**
- **Partial**
- **Missing**
- **Not Applicable**

### Status definitions

**Complete**

The requirement is fully implemented and the required evidence is present.

**Partial**

Some required behaviour or evidence is present, but one or more material parts remain incomplete.

**Missing**

The required behaviour is absent, contradicted, or lacks the minimum evidence required by the specification.

**Not Applicable**

The requirement is explicitly conditional and the condition does not apply to this PR.

Do not use `Not Applicable` merely because implementation is inconvenient or evidence is unavailable.

Each ledger status must cite concrete evidence.

Prefer precise file and line references when available.

---

## 4. Calculate completion

Exclude `Not Applicable` requirements from the denominator.

Score:

- Complete = 1
- Partial = 0.5
- Missing = 0

Calculate:

`Completion = earned points / applicable requirements`

Show the calculation using whole requirement counts.

Example:

`8 complete + 2×0.5 partial = 9 earned points / 12 applicable requirements = 75%`

Completion is a progress metric only.

It must never influence approvability.

A PR can have a high completion percentage and still be unapprovable because one blocking requirement is missing.

---

## 5. Attempt to invalidate the implementation

Actively look for evidence that the implementation fails the governing requirements.

Review behaviour, not code style preferences.

Look for:

- missing behaviour;
- regressions;
- specification violations;
- contradictory behaviour;
- incorrect state transitions;
- data integrity issues;
- compatibility issues;
- migration issues;
- missing configuration;
- missing failure handling;
- missing tests;
- weak tests that do not prove the required behaviour;
- missing browser coverage;
- missing visual regression evidence;
- stale or misleading documentation;
- incomplete CI evidence.

### Booking and payment integrity

When the governing requirements touch booking or payment behaviour, examine relevant evidence for:

- duplicate booking prevention;
- duplicate payment prevention;
- slot revalidation;
- retry behaviour;
- idempotency;
- state consistency;
- partial success;
- payment success without downstream booking completion;
- booking completion without expected payment authority;
- refresh or retry behaviour.

Do not introduce these as requirements when they are genuinely outside the task and repository constraints, but treat violations of applicable integrity rules as blockers.

### Google Calendar and Google Meet

When applicable, examine evidence for:

- server-side credential handling;
- required OAuth scopes;
- time-zone correctness;
- calendar conflict handling;
- duplicate event prevention;
- stable correlation identifiers;
- event creation retries;
- Meet conference creation;
- partial Calendar/Meet failures;
- accidental exposure of private calendar details.

### Stripe

When applicable, examine evidence for:

- secret keys remaining server-side;
- authoritative payment state;
- webhook signature verification;
- duplicate webhook delivery;
- idempotent side effects;
- integer minor-unit amounts;
- expected currency;
- stable internal/provider correlation;
- failure and retry behaviour.

### Next.js boundaries

When applicable, examine evidence for:

- privileged code remaining server-side;
- unnecessary `"use client"` boundaries;
- browser-only code used during server rendering;
- accidental exposure of server environment variables;
- stale caching of time-sensitive booking/payment data;
- App Router conventions required by the specification.

### Material UI changes

When rendered output or interaction is part of the requirement, inspect:

- functional browser assertions;
- required loading, empty, error, success, and authorization states;
- responsive coverage;
- Playwright coverage when required by the specification;
- visual regression snapshots when appearance is materially specified;
- determinism of visual tests.

Do not treat manual visual inspection as sufficient when the governing specification requires automated browser or visual-regression evidence.

---

## 6. Review security and privacy evidence

Do not perform a general security audit unless it is part of the assigned scope.

However, when a changed area crosses a security or privacy boundary, identify directly observable blocking problems.

Examples include:

- secrets exposed to client code;
- Stripe secret keys exposed in browser-visible configuration;
- Google OAuth tokens exposed to the client without a valid requirement;
- unverified Stripe webhook signatures;
- sensitive provider errors returned directly to users;
- private calendar event details exposed through availability responses;
- obvious duplicate-charge or duplicate-booking paths;
- required authorization removed or bypassed;
- sensitive personal data newly logged without justification.

A blocking security, data-integrity, payment-integrity, booking-integrity, or specification violation results in `Approvable: No` regardless of completion percentage.

Do not speculate about vulnerabilities that cannot be supported by the observed evidence.

---

## 7. Separate findings by evidence type

Report implementation findings separately from verification findings when that distinction matters.

### Implementation finding

Use when required behaviour is actually absent, wrong, contradictory, or unsafe.

### Verification finding

Use when implementation may be present, but the required test, CI, browser, visual, migration, or other verification evidence is absent or insufficient.

Do not call unverified behaviour broken unless the evidence shows it is broken.

Do not call unverified behaviour complete.

---

## 8. Determine approvability

Return exactly one of:

- **Yes**
- **Conditional**
- **No**

### Yes

Return **Yes** only when:

- every applicable required implementation requirement is complete;
- required verification evidence exists;
- required CI evidence is satisfactory;
- no blocking issue remains.

### Conditional

Return **Conditional** only when:

- implementation is otherwise complete;
- required local evidence is present;
- approval depends solely on a clearly identified external condition that is not yet resolved.

Examples:

- required CI is still running;
- an explicitly required external deployment check is pending;
- an explicitly required approval outside the repository is pending.

Do not use `Conditional` for missing implementation.

Do not use `Conditional` for missing required tests.

Do not use `Conditional` merely because you are uncertain.

### No

Return **No** when:

- any required implementation requirement is missing or partial in a blocking way;
- required verification evidence is missing;
- required migration/configuration is incomplete;
- a blocking regression exists;
- a blocking security, privacy, payment-integrity, booking-integrity, or data-integrity issue exists;
- specification compliance cannot be established well enough to approve.

Never use completion percentage to justify approval.

---

# Findings format

Report findings before the review summary.

Order findings by severity, highest first.

Each finding must contain:

- **Severity**
- **Type** — Implementation gap or Verification gap
- **Requirement**
- **Description**
- **Evidence**
- **Impact**
- **Recommendation**

Use precise file and line references where available.

Recommended severity levels:

- **Critical** — credible risk of severe security, privacy, payment, booking, or data-integrity harm.
- **High** — blocks a core required workflow or violates a mandatory requirement.
- **Medium** — material requirement gap or significant verification weakness.
- **Low** — limited-impact requirement or evidence gap that still needs resolution.

Do not inflate severity to make a review sound more decisive.

If there are no findings, state:

`No blocking or material findings identified from the available evidence.`

---

# Review summary

Always end with the following structure:

```markdown
## Review summary

- Spec completion: NN% (C complete + P×0.5 partial out of T applicable requirements; N not applicable)
- Incomplete requirements: <total> (<missing> missing, <partial> partial)
- Approvable: Yes | No | Conditional — <reason>

### Missing or partial requirements

None

or

1. [Missing|Partial] <requirement> — <remaining work>

### Requirement ledger

| #   | Requirement | Status | Evidence |
| --- | ----------- | ------ | -------- |

### Approval blockers

None

or

- <blocking issue>

### Verification

**Verified**

- <behaviour positively verified>

**Not verified**

- <behaviour that could not be verified>

**Assumptions**

- <assumptions required during review>

**Confidence**

High | Medium | Low
```

Use the completion formula exactly as defined by this skill.

Do not omit incomplete requirements from the summary merely because they already appeared in findings.

---

# Confidence

Confidence reflects only the quality and completeness of available evidence.

It is not a measure of implementation quality.

Use:

- **High** — authoritative specification resolved; complete diff and relevant implementation inspected; required tests and CI evidence available.
- **Medium** — core evidence is available but one or more non-critical evidence sources are incomplete.
- **Low** — specification authority is ambiguous, important implementation cannot be inspected, CI/test evidence is unavailable, or access limitations materially constrain the review.

Do not increase confidence because the implementation appears conventional or well written.

---

# Review principles

- Be evidence-driven.
- Validate behaviour, not intentions.
- Prefer verification over opinion.
- Attempt to falsify compliance rather than confirm it.
- Never speculate.
- Unknown is preferable to incorrect.
- Treat missing evidence as unverified.
- Do not invent requirements from implementation.
- Do not reward extra implementation that was not required.
- Do not penalize implementation style unless it creates an observable requirement violation.
- Do not rely on another reviewer's conclusions.
- Do not use completion percentage to determine approvability.
- Keep implementation gaps separate from verification gaps.
- Review only your assigned responsibility.
- Do not modify code, submit GitHub reviews, comment on PRs, resolve threads, rerun CI, merge, or otherwise mutate repository state unless the user explicitly requests that action.

---

# Repository mutation policy

This skill is read-only by default.

A request to "review", "audit", "check", "assess", or "determine approvability" does not authorize repository mutations.

Do not:

- edit files;
- push commits;
- submit reviews;
- post comments;
- resolve or unresolve review threads;
- rerun workflows;
- change labels;
- merge or close the PR.

Only perform a mutation when the user explicitly requests that specific action.

---

# Final quality check

Before returning a review, verify that:

- the authoritative specification was resolved or its absence was stated;
- applicable `AGENTS.md` instructions were inspected;
- the complete PR diff was inspected;
- every applicable specification requirement appears exactly once in the ledger;
- every ledger status is backed by observed evidence;
- `Not Applicable` requirements are excluded from completion;
- the completion arithmetic is correct;
- findings appear before the summary;
- implementation gaps and verification gaps are distinguished;
- approvability follows the rules above rather than the percentage;
- blocking integrity or security issues force `No`;
- verified and unverified evidence are separated;
- confidence reflects evidence quality only;
- no repository mutation was performed unless explicitly requested.
