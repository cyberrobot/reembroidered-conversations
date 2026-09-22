# PR #25 — Legal documents and company/privacy disclosure UI

## Objective

Add versioned Terms and Privacy content, accessible URL-backed legal-document
presentation, privacy-at-collection copy, complete company disclosure, qualified
session-privacy wording and Mux storage hardening without changing booking,
payment, cancellation, refund, Calendar, email or persistence behaviour.

## Product and legal metadata

- Product: one 55-minute private Google Meet listening conversation for £55 GBP.
- Contracting entity: PEACE IS THE SONG C.I.C., trading as Re-Embroidered
  Conversations.
- Company number: 16883201.
- Registered in England and Wales.
- Private company limited by guarantee without share capital; Community Interest
  Company (CIC).
- Registered office: 82a James Carter Road, Mildenhall, Mildenhall, Suffolk,
  IP28 7DE.
- Initial legal version: 1.0, effective 22 September 2026.

## Required behavior

- Keep one structured canonical source for Terms, Privacy and public company data.
- Support `/?legal=terms`, `/?legal=privacy` and stable `legalSection` links.
- Provide an accessible modal with focus management, Escape, inert background,
  URL history, search with match navigation/live announcements and print output.
- Show a just-in-time Privacy Notice link beside name/email collection.
- Show Terms and Privacy links before booking/payment submission.
- Add footer legal links and complete visible company disclosure.
- Remove absolute confidentiality claims and stale telephone wording.
- Configure Mux with `disableCookies`, `noVolumePref` and `noMutedPref`, without
  disabling cookie-less Mux Data analytics.
- Describe current providers and retention honestly; do not promise an automated
  deletion mechanism.

## Non-goals

No schema or persistence changes, Terms/privacy acceptance fields, data deletion,
retention job, refund/cancellation/rescheduling changes, statutory cooling-off
automation, provider configuration changes, cookie banner or wider redesign.

## Verification

Run formatting, legal-content and full Node tests, type checking, production
build, full Playwright tests and `git diff --check`. Review platform-specific
visual baselines rather than weakening screenshot thresholds.

## Production review

Before production sign-off, confirm the public contact emails and current
Companies House details, and obtain legal review of the consumer, liability,
confidentiality and privacy wording. Railway is the confirmed production
application and PostgreSQL database host.
