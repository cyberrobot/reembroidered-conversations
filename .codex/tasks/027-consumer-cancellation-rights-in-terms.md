# PR #27 — Consumer cancellation rights in Terms

## Objective

Update the existing **Terms and Conditions only** so that they clearly describe the consumer cancellation rights applicable to the online purchase of the 55-minute Re-Embroidered Conversations service.

The current Terms explain the contractual **24-hour automatic refund policy**, but they do not set out the statutory cooling-off right itself, how it is exercised, what happens when a session is scheduled within that period, or provide a model cancellation form.

This PR is a **legal-content update only**. It must not change checkout wording, booking behaviour, cancellation/refund logic, persistence, email behaviour or the booking-management UI.

## Current implementation

The canonical legal content is in `src/data/legal.ts`.

The current Terms are Version 1.0, effective 22 September 2026.

The existing `Cancellation and refunds` section currently states that:

- a future confirmed booking can be cancelled through its private management link;
- cancellation at least 24 hours before the session receives an automatic full refund;
- cancellation within 24 hours cancels the booking but does not receive an automatic refund;
- statutory consumer rights are preserved generically.

The backend matches that description. `src/lib/booking/cancellation-policy.mjs` uses a fixed 24-hour contractual refund cutoff. `src/lib/booking/booking-cancellation.mjs` allows cancellation of future confirmed bookings, marks bookings cancelled authoritatively, automatically refunds only when the 24-hour policy says the booking is eligible, and does not independently determine whether a consumer is exercising a statutory cooling-off right.

Do not change this behaviour in PR #27.

## Legal basis reflected by the Terms

Treat the online booking as a distance service contract for the purposes of the Terms.

The Terms must explain the consumer cancellation regime under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013.

For a service contract, the normal statutory cancellation period ends **14 days after the day on which the contract is entered into**. A consumer may exercise that right without giving a reason.

The Terms must also reflect the rules applying where a consumer wants the service to take place before the 14-day period has expired:

- supply of the service during the cancellation period requires an express request from the consumer;
- where the service has started at the consumer's express request but has not been fully performed, statutory cancellation can still be exercised, subject to any lawful proportionate charge for service already supplied;
- once the service has been fully performed, the statutory cancellation right can be lost where performance began following the required request and the consumer acknowledged that the right would be lost once full performance occurred;
- the consumer must not be charged for service supplied during the cancellation period where the legal prerequisites for such a charge have not been satisfied.

Nothing in the Terms should suggest that the contractual 24-hour refund policy overrides these statutory rights.

## Contract formation

Clarify when the contract is concluded so that the start of the statutory cancellation period is identifiable.

For these Terms, state that the contract is concluded when:

1. payment has been successfully processed; and
2. the booking is confirmed by Re-Embroidered Conversations.

Do not treat merely opening Stripe Checkout or returning from Stripe as conclusion of the contract. Keep this consistent with the existing booking/payment wording and authoritative confirmation lifecycle.

## Required Terms changes

### 1. Version the revised Terms independently

Update the Terms to:

- **Version:** `1.1`
- **Effective date:** `23 September 2026`

The Privacy Notice remains:

- **Version:** `1.0`
- **Effective date:** `22 September 2026`

Update the `LegalDocument` typing as necessary so the two documents can have independent version and effective-date metadata. Do not make a substantive Privacy Notice change merely to accommodate the type change.

### 2. Replace the current generic consumer-rights wording

The Terms introduction may continue to say that statutory rights are not limited, but the detailed cancellation provisions must no longer rely only on that generic statement. The document must explain the actual statutory cancellation right.

### 3. Distinguish two separate cancellation regimes

The Terms must make a clear distinction between the contractual 24-hour policy and the statutory 14-day cancellation right.

Under the contractual policy, cancellation at least 24 hours before the scheduled session qualifies for the application's automatic full refund; cancellation less than 24 hours before the scheduled session does not qualify for an automatic refund under that policy; and future sessions can still be cancelled through the private booking-management link.

Separately explain that, where the statutory right applies, the consumer may cancel within 14 days after the day the contract is concluded; no reason is required; exercising the statutory right is not restricted by the contractual 24-hour cutoff; and the 24-hour rule is not the consumer's only entitlement to a refund.

Use headings or paragraphs that make the difference obvious to a non-lawyer.

### 4. Explain how statutory cancellation is exercised

State that the consumer exercises the statutory right by giving the company a **clear statement that they wish to cancel** before the cancellation period expires. A particular form is not compulsory.

Identify the existing registered-office contact:

PEACE IS THE SONG C.I.C.  
82a James Carter Road  
Mildenhall, Mildenhall  
Suffolk  
IP28 7DE

Do not invent an email address, telephone number or other contact channel that has not been approved. Explain that the statutory model cancellation form included later in the Terms may be used but is optional.

Where the existing private booking-management link is mentioned, do not claim that its automatic-refund calculation determines or exhausts statutory rights.

### 5. Explain reimbursement after statutory cancellation

Where the consumer validly exercises the statutory cancellation right before the service has been supplied, payments due to be reimbursed must be reimbursed without undue delay and within the legally required period.

For this service, state that reimbursement will ordinarily be made no later than 14 days after the company is informed of the statutory cancellation, using the same payment method used for the original transaction unless another method is expressly agreed, and without a reimbursement fee to the consumer.

Do not change the application's Stripe refund implementation in this PR.

### 6. Cover sessions taking place inside the 14-day cooling-off period

Add wording substantially equivalent to:

> If you select a session that is due to take place before the end of your statutory 14-day cancellation period and complete the booking subject to these Terms, you expressly request that we provide the service on the selected date even though the cancellation period has not yet expired.

Also explain that until the service has been fully performed, the statutory right may continue subject to the applicable rules; if a consumer cancels after performance has begun following their express request, they may be required to pay a proportionate amount for the service already supplied where the law permits this; and once the 55-minute session has been fully performed following the required express request and acknowledgement, the statutory cancellation right is lost.

Include an acknowledgement substantially equivalent to:

> You acknowledge that, where the session is fully performed during the statutory cancellation period following your request for early performance, you will lose the statutory right to cancel once the service has been fully performed.

These provisions belong **inside the Terms only** for this PR. Do not add another checkbox, checkout disclaimer or separate booking-form acknowledgement.

### 7. Explain cancellation before the session has started

Make it clear that merely reserving the appointment, processing payment, creating a Google Calendar event or generating a Google Meet link does not mean that the 55-minute listening service has been fully performed.

Do not imply that the statutory cancellation right disappears merely because the booking has been confirmed, payment has been captured, Calendar/Meet resources have been created, or the appointment is less than 24 hours away.

### 8. Add a model cancellation form

Add a final Terms section with the stable section ID `model-cancellation-form` and title `Model cancellation form`. Explain that use of the form is optional.

Provide a printable/copyable form substantially containing:

> **To:** PEACE IS THE SONG C.I.C., 82a James Carter Road, Mildenhall, Mildenhall, Suffolk, IP28 7DE  
> I give notice that I cancel my contract for a Re-Embroidered Conversations one-to-one session.  
> Booking/contract date: ______  
> Scheduled session date: ______  
> Name of consumer: ______  
> Address of consumer: ______  
> Booking email or reference, if available: ______  
> Signature, only if this form is sent on paper: ______  
> Date: ______

The model form is informational content inside the Terms. Do not build an interactive form or new cancellation endpoint. The existing legal modal's print functionality should make this content printable without further UI work.

### 9. Update document-version wording

Update the Terms' `Changes and document version` section to identify Version 1.1 and its effective date. Keep the principle that the version applicable to a transaction is the Terms made available for that transaction. Do not retroactively claim Version 1.1 governed bookings entered into under Version 1.0.

## Legal document structure

Keep the existing canonical structured data model and legal modal. Prefer extending the existing Terms sections rather than introducing another legal-document system.

Suitable section structure is:

- About us
- The service
- Booking and payment
- Availability
- Rescheduling
- Cancellation and refunds
- Statutory right to cancel
- Starting the service during the cancellation period
- Model cancellation form
- Session privacy and recording
- Third-party services
- Customer responsibilities
- No guaranteed outcome
- Intellectual property
- Liability and mandatory rights
- Complaints and contact
- Governing law
- Changes and document version

Exact ordering can vary slightly if readability improves, but statutory cancellation information must be easy to find from the legal modal's section navigation and search.

## Explicit non-goals

Do **not** change:

- `BookingSection.tsx` checkout or booking copy;
- the Step 3 acknowledgement/disclaimer;
- `acceptedBoundaries` or `boundariesAcceptedAt`;
- Terms-acceptance persistence;
- document-version acceptance persistence;
- Prisma schema or migrations;
- hold creation;
- Stripe Checkout;
- Stripe webhook processing;
- `cancellation-policy.mjs`;
- the 24-hour automatic refund calculation;
- `booking-cancellation.mjs`;
- refund execution or reconciliation;
- booking-management cancellation UI;
- rescheduling behaviour;
- confirmation-email content;
- Privacy Notice substance;
- company disclosure;
- Mux configuration.

In particular, **do not add statutory-cancellation wording to the checkout disclaimer or introduce another checkbox**.

## Tests

### `tests/legal-content.test.mjs`

Update the metadata assertions so they no longer require every legal document to share Version 1.0 and the same effective date. Assert specifically that:

- `TERMS.version === "1.1"`;
- `TERMS.effectiveDate === "23 September 2026"`;
- `PRIVACY_NOTICE.version === "1.0"`;
- `PRIVACY_NOTICE.effectiveDate === "22 September 2026"`.

Add Terms-content assertions covering the 14-day statutory cancellation period, cancellation without giving a reason, contract-conclusion wording, separation from the 24-hour automatic refund policy, early-performance express request, loss of the right only after full performance under the applicable conditions, proportionate payment where legally applicable, reimbursement timing, same-payment-method wording, model cancellation form, and registered-office cancellation address.

Retain assertions proving that statutory rights are not excluded or overridden.

### `tests/browser/legal.spec.ts`

Update Terms-specific version assertions from Version 1.0 to Version 1.1. Do not change Privacy Notice version expectations.

Add or update coverage confirming that direct navigation to the new statutory-cancellation/model-form sections works through `legalSection`. Confirm that Terms search can locate distinctive cancellation wording such as `14 days` or `model cancellation form`.

Keep print coverage and confirm the model cancellation form is present in printed Terms.

### Visual tests

The Terms document will become materially longer, so update the Terms legal-modal visual baseline where required. Do not regenerate unrelated Privacy Notice or footer baselines unless they genuinely changed. Do not weaken screenshot tolerances to hide unintended differences.

## Acceptance criteria

PR #27 is complete when:

1. Terms are Version 1.1, effective 23 September 2026.
2. Privacy remains Version 1.0, effective 22 September 2026.
3. The statutory 14-day cancellation right is clearly described.
4. The Terms explain when the contract is concluded.
5. The statutory right is clearly separated from the existing 24-hour automatic-refund policy.
6. The Terms explain how the statutory right can be exercised.
7. The Terms address sessions scheduled inside the 14-day period.
8. Early performance, proportionate payment and loss of the right after full performance are described without suggesting that merely booking or paying removes the right.
9. Statutory reimbursement timing and method are described.
10. A model cancellation form is included and printable.
11. Existing automatic cancellation/refund behaviour is unchanged.
12. Checkout and Step 3 disclaimer copy are unchanged.
13. There are no schema or persistence changes.
14. Legal-content and browser tests cover the new Terms.
15. Existing legal deep-link, search, accessibility and print behaviour remains intact.

## Verification

Run:

```bash
npm run format
npm run format:check
npm test
npm run lint
npm run build
npm run test:browser
git diff --check
```

Review the Terms visual snapshot deliberately after the content expansion.

## Scope note

This PR intentionally updates the contractual disclosure rather than redesigning the statutory-cancellation workflow.

The existing 24-hour automatic refund mechanism remains a contractual convenience and must not be presented as limiting statutory consumer rights.

Any future decision to persist a specific early-performance acknowledgement, automate determination of statutory refunds, provide another statutory-cancellation channel, or change checkout acknowledgement UI should be handled separately rather than allowed to creep into PR #27.
