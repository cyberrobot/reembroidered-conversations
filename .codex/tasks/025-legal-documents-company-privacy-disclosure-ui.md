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
- Beside the Step 2 name/email fields, show concise just-in-time information that
  the name and email are used to reserve and manage the session, process payment,
  create the Google Calendar/Meet invitation and send booking emails. This panel
  does not need an inline Privacy Notice link; the full notice remains available
  in Step 3 and the footer.
- Keep the mandatory Step 3 checkbox as one combined service-boundaries and
  pre-contract acknowledgement. Its label states that the service is a private
  listening session, is not therapy, counselling, psychiatric treatment or
  crisis support, and that booking/payment enters into a contract subject to the
  Terms. It includes links to both the Terms and Privacy Notice.
- Continue submitting only `acceptedBoundaries: true` and persist only the
  existing server-generated `boundariesAcceptedAt`. The legal links do not add
  separate Terms or Privacy acceptance persistence, versions or timestamps.
- Use `Continue to secure checkout £55` as the idle booking CTA and `Securing
your time…` while processing. The simplified final CTA layout is approved and
  does not require the removed auxiliary price/payment/rescheduling block or a
  separate legal paragraph outside the checkbox. The form continues to show the
  55-minute, Google Meet and £55 product information elsewhere.
- Add footer legal links and complete visible company disclosure.
- Remove absolute confidentiality claims and stale telephone wording.
- Configure Mux with `disableCookies`, `noVolumePref` and `noMutedPref`, without
  disabling cookie-less Mux Data analytics.
- Describe current providers and retention honestly; do not promise an automated
  deletion mechanism.

## Non-goals

No schema or persistence changes, `termsAcceptedAt`, `privacyAcceptedAt`, accepted
document-version fields or equivalent Terms/privacy acceptance persistence, data
deletion, retention job, refund/cancellation/rescheduling changes, statutory
cooling-off automation, provider configuration changes, cookie banner or wider
redesign.

## Verification

Run formatting, legal-content and full Node tests, type checking, production
build, full Playwright tests and `git diff --check`. Review platform-specific
visual baselines rather than weakening screenshot thresholds.

## Production review

Before production sign-off, confirm the public contact emails and current
Companies House details, and obtain legal review of the consumer, liability,
confidentiality and privacy wording. Railway is the confirmed production
application and PostgreSQL database host.
