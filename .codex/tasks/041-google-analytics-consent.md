# PR #41 — Basic Google Analytics, minimal analytics consent, and Privacy Notice update

## Repository state

**Expected branch:**  
`feature/041-google-analytics-consent`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**

- PR #40 merged into `main`
- A Google Analytics 4 property and production web data stream
- Existing legal-document infrastructure in `src/data/legal.ts`, `LegalLink` and `LegalModal`
- No new npm package is required

### Read first

Before making changes, read the repository guidance relevant to this task:

- `AGENTS.md`
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/025-legal-documents-company-privacy-disclosure-ui.md`
- `package.json`
- `.env.example`
- `README.md`
- `playwright.config.ts`
- `.github/workflows/ci.yml`

There is currently no more narrowly scoped `AGENTS.md`.

### Primary change area

Public homepage analytics, analytics-consent UI and the Privacy Notice.

The implementation must add basic Google Analytics measurement without extending analytics into private booking-management, payment-return, booking-success, admin or API surfaces.

### Canonical implementation examples

Treat these as the preferred implementation references:

- `src/app/page.tsx`
  - public homepage composition
  - appropriate ownership point for homepage-only analytics
- `src/app/layout.tsx`
  - global layout; inspect it, but do **not** mount Google Analytics globally because it also wraps sensitive routes
- `src/components/Footer.tsx`
  - existing persistent legal/settings surface
- `src/components/LegalLink.tsx`
  - canonical way to open legal documents
- `src/components/LegalModal.tsx`
  - existing accessible Privacy Notice presentation
- `src/data/legal.ts`
  - canonical Terms, Privacy Notice and company metadata
- `tests/legal-content.test.mjs`
  - canonical legal-copy regression coverage
- `tests/browser/legal.spec.ts`
  - canonical legal, footer, responsive and visual-regression coverage
- `playwright.config.ts`
  - deterministic public browser-test configuration
- `.github/workflows/ci.yml`
  - authoritative production build used by browser tests in CI

### Relevant symbols

Inspect before editing:

- `RootLayout`
- `Home`
- `Footer`
- `LegalLink`
- `LegalModal`
- `PRIVACY_NOTICE`
- `LEGAL_DOCUMENTS`
- `LegalDocument`
- Playwright homepage/legal test setup

New symbols may include narrowly scoped equivalents of:

- `AnalyticsConsent`
- `AnalyticsSettingsButton`
- `GoogleAnalytics`
- analytics measurement-ID validation
- analytics-consent preference helpers/constants

Do not introduce a general analytics framework for this PR.

### Expected change surface

Expected changes include:

```text
.codex/tasks/041-google-analytics-consent.md
.env.example
README.md
src/app/page.tsx
src/components/AnalyticsConsent.tsx
src/components/AnalyticsSettingsButton.tsx
src/components/Footer.tsx
src/data/legal.ts
tests/legal-content.test.mjs
tests/browser/analytics-consent.spec.ts
tests/browser/legal.spec.ts
tests/browser/homepage-booking-picker.spec.ts
tests/browser/migration-smoke.spec.ts
playwright.config.ts
.github/workflows/ci.yml
```

A small `src/lib/analytics.*` helper may be added if it materially improves validation or testability.

Existing reviewed visual snapshots may change only where this PR intentionally changes the rendered Privacy Notice, footer or analytics-consent component.

If additional files are required, explain why.

### Excluded areas

Do not change:

- booking lifecycle or availability
- booking form data submitted to the server
- Stripe behaviour
- Google Calendar or Google Meet behaviour
- confirmation email behaviour
- database schema or migrations
- booking-management capabilities
- cancellation or rescheduling
- Mux configuration
- existing Turnstile behaviour
- Terms and Conditions, except shared type metadata if required to permit the new Privacy Notice version
- customer identity or booking-data persistence
- Google Ads
- Google Tag Manager
- advertising conversion tracking
- remarketing
- Google Signals
- enhanced conversions
- User-ID
- user-provided-data features
- custom booking-funnel analytics events
- a third-party Consent Management Platform
- a wider cookie-management platform
- unrelated homepage redesign

### Unknowns Codex must verify

Before implementation, verify:

- the exact Google Analytics Measurement ID is **not** already present elsewhere in the repository;
- the final environment-variable naming is consistent with repository conventions;
- Google Analytics is not already injected through hosting or another external mechanism;
- the current GA4 production property/web stream configuration before making precise retention claims in public copy;
- the production property is not configured for advertising, user-provided data or other analytics features outside this PR;
- whether any CSP or security-header configuration added since this spec was written must permit the Google Analytics script/collection hosts;
- which existing homepage browser tests need a deterministic stored analytics preference so that the new banner does not cause unrelated visual baseline churn.

Do not guess these values or behaviours when they can be verified.

---

## Objective

Add basic Google Analytics 4 measurement to the public Re-Embroidered Conversations homepage with a minimal, accessible opt-in analytics preference.

Google Analytics must be **off by default**.

Before a visitor allows analytics:

- do not load the Google Analytics tag;
- do not make requests to Google Analytics or Google Tag Manager hosts for this integration;
- do not create Google Analytics cookies;
- do not send a consent ping to Google.

After the visitor selects **Allow analytics**:

- persist that preference locally;
- load the Google Analytics tag once;
- initialise the configured GA4 measurement;
- collect only the basic site measurement required by this PR.

If the visitor selects **Reject analytics**:

- persist that choice;
- keep Google Analytics completely blocked;
- do not repeatedly ask on every page load.

Provide a persistent **Analytics settings** control in the homepage footer so the visitor can revisit and change the choice.

Update the Privacy Notice to accurately describe:

- Google Analytics;
- the consent-based activation model;
- the analytics information/storage involved;
- Google as a recipient/provider;
- how analytics can be refused or later disabled;
- the small first-party preference stored to remember that choice.

Version the Privacy Notice as **Version 1.1, effective 1 October 2026**.

Keep the existing Terms at Version 1.2.

---

## Current architecture

The application uses the Next.js App Router.

`src/app/layout.tsx` is the root layout and therefore applies to:

- `/`
- `/booking/success`
- `/booking/manage/[capability]`
- `/admin/google-calendar/result`
- redirect/compatibility routes
- visual fixtures and other application routes

This makes the root layout an inappropriate place for indiscriminate analytics loading.

In particular:

- `/booking/manage/[capability]` contains a private capability in the URL path;
- `/booking/success` accepts internal `booking_id` and Stripe `session_id` query parameters;
- administrative routes are not public marketing surfaces.

Google Analytics must therefore **not** be injected globally through `RootLayout`.

The public homepage is assembled in `src/app/page.tsx`. It contains the marketing experience, booking UI, footer and `LegalModal`. The analytics-consent component should remain scoped to this public surface.

Legal documents are structured data in `src/data/legal.ts` and rendered through the existing URL-backed `LegalModal`.

The footer already contains Terms and Privacy Notice links and is the appropriate persistent location for an analytics-settings control.

The repository uses:

- Node's built-in test runner for unit/content tests;
- Playwright for browser behaviour;
- Playwright screenshot assertions for material visual changes.

---

## External integrations affected

### Google Analytics 4

**Operation performed**

After explicit analytics permission, load the Google tag for the configured GA4 web data stream and initialise basic measurement.

**Ownership**

Browser-side, scoped to the public homepage.

**Authentication or authorization**

None.

The GA Measurement ID is intentionally public and is not a credential or secret.

**API scopes or permissions**

None.

**Webhooks**

None.

**Retry behaviour**

Do not implement application-level retries.

If the Google script or collection endpoint is unavailable:

- the homepage must continue functioning normally;
- booking must remain unaffected;
- no user-facing application error is required;
- consent preference must remain intact;
- analytics failure must never block rendering or interaction.

Do not introduce a backend proxy for Google Analytics.

---

## Configuration and data changes

### Environment variables

Add:

```text
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
```

Classification:

- **Public/client-visible:** yes
- **Secret:** no
- **Production:** required to enable analytics
- **Development/test:** optional except where deterministic browser tests explicitly supply a test value

Expected format:

```text
G-...
```

The application must fail closed for analytics if the value is absent or malformed:

- no tag load;
- no Google Analytics requests;
- preferably no analytics-consent prompt when there is no functional analytics integration to consent to.

Document the variable in:

- `.env.example`
- `README.md`
- Railway production environment-variable instructions

Do not place any Google API credential or secret in a `NEXT_PUBLIC_*` variable.

Because `NEXT_PUBLIC_*` values are incorporated into the client build, ensure the deterministic browser-test Measurement ID is present during the authoritative CI **build**, not merely when `next start` runs.

Update `.github/workflows/ci.yml` and `playwright.config.ts` consistently if required so browser tests exercise the same built bundle locally and in CI.

### Database or schema

None.

Do not persist analytics consent to PostgreSQL.

### Webhooks

None.

### OAuth and permissions

None.

### Deployment configuration

Add the production GA4 Measurement ID to the Railway web service:

```text
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-...
```

No cron, domain, redirect or database changes are required.

Configure the GA4 web property conservatively for this PR:

- no Google Ads functionality;
- no remarketing;
- no enhanced conversions;
- no User-ID;
- no user-provided-data collection;
- no custom booking/customer dimensions.

Do not configure analytics to capture booking form field values.

### Migration or backfill

None.

Analytics begins only after deployment and visitor consent. No historical analytics data is created or backfilled.

---

## Security and privacy considerations

Google Analytics introduces a new third-party browser integration.

The implementation must preserve the existing privacy boundary between public website usage and private booking data.

### Analytics must not receive booking identity

Never intentionally send any of the following to Google Analytics:

- customer name;
- email address;
- form field values;
- booking ID;
- Stripe Checkout Session ID;
- Stripe PaymentIntent ID;
- booking-management capability;
- Google Calendar event ID;
- Google Meet URL;
- availability details tied to an individual;
- private booking status;
- free-form customer information;
- authentication/OAuth information.

Do not derive analytics identifiers from any of those values.

### Sensitive routes

Do not mount the Google Analytics integration on:

```text
/booking/manage/[capability]
/booking/success
/payment
/confirmation
/admin/**
/api/**
/visual-fixtures/**
```

The safest implementation for this PR is to mount it only on the public homepage rather than maintain an exclusion list in the global layout.

A previously granted analytics preference must **not** cause Google Analytics to appear on those routes.

### Consent preference storage

Persist only the minimum first-party preference necessary to remember the visitor's decision.

Use a versioned key such as:

```text
reembroidered.analytics-consent.v1
```

Allowed values:

```text
granted
denied
```

Do not store:

- a user identifier;
- IP address;
- analytics client identifier;
- booking identifier;
- email;
- unnecessary timestamps or metadata.

The versioned key allows a future materially different analytics policy to deliberately request a fresh choice instead of silently reusing an incompatible old preference.

### Google Analytics storage

Before consent is granted, there must be no `_ga` or related GA cookies created by this integration.

If a visitor changes an existing choice from granted to denied:

- update the analytics consent state immediately;
- stop further application analytics;
- remove first-party Google Analytics cookies that the integration created, including `_ga` and `_ga_*` cookies where accessible;
- persist `denied`;
- subsequent navigation/page loads must not reload the Google tag.

Do not require the visitor to find browser settings to withdraw analytics permission.

### Analytics feature scope

This PR is for basic site measurement only.

Do not add:

- custom `booking_started`;
- slot selection;
- form completion;
- checkout conversion;
- customer email;
- transaction identity;
- cancellation;
- rescheduling;
- payment-value;
- marketing audience

events or dimensions.

Those require a separate privacy and product decision.

---

## Required implementation

### 1. Add minimal Google Analytics integration

Implement the Google tag without adding an analytics npm dependency unless repository inspection demonstrates one is genuinely necessary.

Prefer the existing Next.js primitives, such as `next/script`, and a narrow Client Component.

When consent is not granted:

- render no Google tag script;
- execute no `gtag` initialisation;
- make no analytics request.

When consent becomes granted:

1. initialise `window.dataLayer`;
2. load the configured `gtag.js` resource once;
3. configure analytics consent appropriately;
4. initialise the configured GA4 Measurement ID;
5. allow the standard basic page measurement required by this PR.

Advertising-related consent/settings must remain denied/not enabled.

Do not initialise the same measurement stream twice after React rerenders or repeated preference interactions.

### 2. Keep analytics off global application routes

Do **not** put unconditional GA scripts in `src/app/layout.tsx`.

Render analytics through the public homepage ownership boundary.

A visitor who previously selected `granted` and later opens a private booking-management URL must not cause the Google tag to load on that route.

### 3. Add the minimal consent component

Create a narrow client-side analytics consent component.

On the first homepage visit where:

- a valid GA Measurement ID exists; and
- no valid saved choice exists;

show a compact, fixed, responsive consent panel.

Suggested content:

> We use optional Google Analytics to understand how this site is used. Analytics stays off unless you allow it.

Include:

- **Allow analytics**
- **Reject analytics**
- a **Privacy Notice** link using the existing `LegalLink` pattern

Both choices must be immediately available. Do not make rejection require an additional settings screen.

The panel must:

- fit the existing Re-Embroidered Conversations visual language;
- not block use of the site;
- not obscure essential mobile controls;
- be keyboard accessible;
- expose a meaningful heading/accessible name;
- retain visible keyboard focus;
- not trap focus because it is not a modal;
- work at the existing desktop and mobile test widths.

Choosing either option closes the panel.

### 4. Persist the choice

Read the versioned first-party preference after hydration.

Behaviour:

**No choice**

- show consent panel;
- analytics remains off.

**`granted`**

- do not show the first-visit panel;
- initialise analytics.

**`denied`**

- do not show the first-visit panel;
- do not initialise analytics.

**Unknown/corrupt value**

- treat it as no valid choice;
- analytics remains off until a valid choice is made.

Do not allow hydration mismatch to flash an enabled Google tag before the stored preference has been read.

### 5. Add persistent analytics settings

Add an **Analytics settings** control to the footer's existing Legal area.

It must be a button/action rather than pretending to navigate to another page.

Activating it reopens the analytics-preference panel and makes the current state clear, for example:

```text
Analytics is currently on.
```

or:

```text
Analytics is currently off.
```

The visitor can then choose either state again.

Changing from allowed to rejected must apply the withdrawal behaviour described above.

Keep the client boundary narrow; do not convert the whole footer or homepage into a Client Component merely for this button.

### 6. Update the Privacy Notice

Update `PRIVACY_NOTICE` from:

```text
Version 1.0
Effective 22 September 2026
```

to:

```text
Version 1.1
Effective 1 October 2026
```

Do not change the Terms version.

Update the legal metadata types as necessary to allow the new version/date.

The updated Privacy Notice must accurately explain at least:

#### Information collected / analytics

State that optional Google Analytics is used to understand use of the public website after the visitor permits analytics.

Describe analytics information at an appropriately high level without implying that customer booking form contents are sent.

#### Purposes and lawful bases

Distinguish Google Analytics from the existing Mux cookie-less video analytics.

Google Analytics must be described as operating only following the visitor's analytics choice/consent.

Do not silently change the existing stated basis for unrelated booking, security or Mux processing.

#### Processors and recipients

Add Google Analytics/Google as an analytics provider distinctly from the existing Google Calendar and Google Meet processing.

#### Cookies and browser storage

Explain:

- the small first-party preference used to remember `granted` or `denied`;
- Google Analytics storage is not created before analytics is allowed;
- when allowed, Google Analytics may use first-party `_ga` and related `_ga_*` cookies;
- the visitor can later change the choice through **Analytics settings**.

Do not claim the entire site is cookie-free.

#### International transfers

Confirm the existing general transfer wording remains sufficient after adding Google Analytics, or make the minimum accurate amendment required.

#### Changes and document version

Update the version paragraph to:

```text
Version 1.1, effective 1 October 2026
```

Do not make unsupported promises about Google's exact processing or retention configuration. If public copy states an exact GA property retention period, verify that setting against the actual production property first.

### 7. Preserve existing legal behaviour

The existing:

- legal deep links;
- modal history;
- search;
- print;
- focus management;
- mobile navigation;
- Terms content

must continue working.

Opening the Privacy Notice from the consent component must use the existing legal-document mechanism rather than creating a second privacy modal.

### 8. No dependency for a simple tag

Do not add `@next/third-parties`, a CMP, analytics wrapper or other dependency merely to insert a Google tag.

A dependency is acceptable only if repository inspection identifies a concrete requirement that cannot reasonably be met with the installed Next.js/React primitives, and the completion report must explain it.

### External-service failure handling

If Google Analytics:

- is blocked by the browser;
- is blocked by an extension;
- fails DNS/network loading;
- returns a script error;
- has an invalid/unavailable remote endpoint;

the website and booking experience must continue normally.

Analytics must remain a non-critical, optional side effect.

Do not surface an application error to the customer because analytics failed.

---

## UI implementation requirements

Preserve the existing Re-Embroidered Conversations visual language.

The consent component should be intentionally small rather than a large generic cookie-management interface.

Requirements:

- compact bottom panel/banner;
- desktop and mobile responsive;
- readable over the existing page;
- no layout reflow from inserting it into normal document flow;
- clear Allow and Reject controls;
- Privacy Notice link;
- visible focus styles;
- semantic heading/region;
- no focus trap;
- no dark-pattern treatment that hides or materially disadvantages rejection;
- respect current typography, spacing, borders and palette.

The footer receives only the small **Analytics settings** addition.

The Privacy Notice modal should retain its existing structure and visual design.

---

## Acceptance criteria

### Behaviour

- [ ] PR number is #41 and the task spec is stored as `.codex/tasks/041-google-analytics-consent.md`.
- [ ] A valid production GA4 Measurement ID can be configured without exposing a secret.
- [ ] Google Analytics is scoped to the public homepage rather than the global root layout.
- [ ] With no saved preference, analytics remains off and the consent component is shown.
- [ ] No Google Analytics/Google tag network request occurs before the visitor allows analytics.
- [ ] No Google Analytics cookie is created by this integration before consent.
- [ ] **Allow analytics** persists `granted` and loads GA once.
- [ ] The granted preference survives a reload.
- [ ] **Reject analytics** persists `denied` and keeps the Google tag blocked.
- [ ] The denied preference survives a reload without repeatedly showing the banner.
- [ ] Invalid/corrupt stored preference fails closed.
- [ ] Missing/invalid Measurement ID fails closed.
- [ ] The footer exposes **Analytics settings**.
- [ ] Analytics settings allow a previously granted choice to be withdrawn.
- [ ] Withdrawal stops analytics and clears accessible first-party `_ga*` cookies created by the integration.
- [ ] A previous grant does not cause analytics to load on private booking-management, booking-success or admin surfaces.
- [ ] Analytics failure never prevents use of the site or booking flow.
- [ ] No custom booking/conversion analytics events are introduced.
- [ ] Existing booking, payment and lifecycle behaviour is unchanged.

### Privacy Notice

- [ ] Privacy Notice is Version 1.1, effective 1 October 2026.
- [ ] Terms remain Version 1.2, effective 24 September 2026.
- [ ] Google Analytics is disclosed.
- [ ] Analytics activation is described as optional and dependent on the visitor's choice.
- [ ] The analytics preference storage is disclosed.
- [ ] GA first-party cookies/storage are described accurately.
- [ ] Google Analytics is included in the relevant provider/recipient disclosure.
- [ ] Visitors are told how to change/withdraw the analytics choice.
- [ ] Existing booking, Stripe, Calendar/Meet, Resend, Turnstile, Mux and Railway disclosures remain accurate.
- [ ] The notice does not claim booking/customer identity is sent to GA.
- [ ] No unsupported retention promise is added.

### External integration

- [ ] Only the configured GA4 Measurement ID is exposed to browser code.
- [ ] No credential or secret is introduced.
- [ ] No GA request occurs from rejected/unresolved consent state.
- [ ] Google Ads, remarketing and user-provided-data features are outside this implementation.
- [ ] Production environment configuration is documented.
- [ ] CI uses a deterministic non-production Measurement ID when exercising consent behaviour.

### UI

- [ ] Consent component works on supported desktop and mobile widths.
- [ ] Allow, Reject, Privacy Notice and Analytics settings are keyboard accessible.
- [ ] Rejection is directly available without opening another settings layer.
- [ ] Legal modal remains accessible when opened from the consent component.
- [ ] Dedicated browser coverage verifies the new interaction.
- [ ] Dedicated visual regression coverage exists for the consent component.
- [ ] Footer and Privacy Notice snapshots change only where expected.
- [ ] Existing unrelated homepage snapshots are protected from banner-induced churn by setting a deterministic test preference.

### Code quality

- [ ] Existing repository conventions are followed.
- [ ] Client boundaries remain narrow.
- [ ] No unnecessary dependency is added.
- [ ] No unrelated refactor is included.
- [ ] Type safety is preserved.
- [ ] Formatting passes.
- [ ] Type checking passes.
- [ ] Node tests pass.
- [ ] Browser tests pass.
- [ ] Production build passes.
- [ ] Dependency audit remains clean.
- [ ] `git diff --check` passes.

---

## Tests to add or update

### Unit/content tests

Update:

```text
tests/legal-content.test.mjs
```

Verify:

- Privacy Notice Version 1.1;
- effective date 1 October 2026;
- Terms remain Version 1.2;
- Privacy Notice names Google Analytics;
- Analytics is described as optional/choice-based;
- analytics preference storage is disclosed;
- Google Analytics cookies/storage are disclosed;
- withdrawal/settings are disclosed;
- booking identity is not described as being intentionally supplied to Analytics;
- existing Mux, Stripe, Google Calendar/Meet, Resend, Cloudflare and Railway assertions remain valid.

If measurement-ID validation or consent-value parsing is extracted into a pure helper, add focused Node tests for:

- valid `G-...` values;
- empty value;
- malformed value;
- `granted`;
- `denied`;
- unknown stored preference.

Do not create abstractions solely to manufacture unit-test targets.

### Integration tests

N/A.

There is no new server route, persistence boundary, webhook or database integration.

### Browser tests

Add:

```text
tests/browser/analytics-consent.spec.ts
```

Use a deterministic fake GA Measurement ID and intercept Google network endpoints. Do not send browser-test traffic to a real Analytics property.

Cover at least:

1. **No prior choice**
   - consent component visible;
   - no Google tag request before interaction.

2. **Allow**
   - click Allow;
   - preference stored as `granted`;
   - Google tag request occurs only afterwards;
   - tag is initialised at most once.

3. **Granted reload**
   - banner stays closed;
   - analytics loads.

4. **Reject**
   - no Google tag request;
   - `denied` is persisted.

5. **Denied reload**
   - banner remains closed;
   - Google tag remains blocked.

6. **Invalid stored value**
   - analytics stays off;
   - visitor is asked for a valid choice.

7. **Analytics settings**
   - footer control reopens preferences;
   - current state is represented;
   - allowed → denied works;
   - `_ga`/`_ga_*` first-party cookies created for the test are removed where applicable.

8. **Privacy Notice**
   - Privacy link opens the canonical existing legal modal;
   - closing it restores usable consent controls.

9. **Missing/invalid analytics configuration**
   - no Google script;
   - no misleading active analytics behaviour.

10. **Sensitive routes**
    - pre-seed `granted`;
    - visit a representative `/booking/manage/[capability]` route and `/booking/success` state;
    - confirm no Google Analytics tag/network request occurs.

11. **Script failure**
    - fail/intercept the Google tag request;
    - confirm the homepage remains usable.

Update existing homepage/browser test setup so tests unrelated to consent pre-seed a deterministic `denied` preference before navigation.

At minimum inspect/update:

```text
tests/browser/homepage-booking-picker.spec.ts
tests/browser/legal.spec.ts
tests/browser/migration-smoke.spec.ts
```

Do not blindly update existing snapshots to include the banner.

### Visual regression tests

Add deterministic screenshots for the consent panel at:

- desktop width;
- mobile width.

Update only intentionally affected existing snapshots:

- Privacy Notice desktop;
- Privacy Notice mobile;
- footer desktop.

Terms snapshots should not change unless an unavoidable shared rendering change is documented.

Keep animations disabled and external GA requests intercepted.

---

## Verification commands

Run formatting first as required by `AGENTS.md`:

```bash
npm run format
```

Run focused legal tests:

```bash
node --conditions=react-server --experimental-test-module-mocks --test tests/legal-content.test.mjs
```

Run focused browser tests:

```bash
npx playwright test tests/browser/analytics-consent.spec.ts tests/browser/legal.spec.ts
```

Then run the complete repository verification:

```bash
npm run security:audit
npm run format:check
npm run lint
npm test
npm run build
npm run test:browser
git diff --check
```

Browser tests must use only the deterministic non-production GA Measurement ID.

Do not send CI traffic into the real production Analytics property.

If any required command cannot run, document:

1. the exact command;
2. why it could not run;
3. what was verified instead.

---

## Completion report

When implementation is complete, provide:

### Changed

Summarise:

- GA4 integration;
- consent behaviour;
- preference persistence;
- footer analytics settings;
- route scoping;
- Privacy Notice Version 1.1;
- environment/CI documentation.

### Tests

List:

- tests added/updated;
- visual snapshots intentionally updated;
- verification commands;
- pass/fail results.

### External configuration

Document:

- the Railway `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`;
- the production GA4 property/web stream;
- any required GA4 property privacy settings;
- confirmation that CI uses a non-production Measurement ID.

### Deviations

Explain any meaningful deviation from this specification and why it was necessary.

Use `None` if there were none.

### Remaining issues

Call out any future work explicitly excluded from this PR, such as:

- booking-funnel custom events;
- conversion measurement;
- aggregated business dashboards;
- server-side analytics;
- additional consent categories;
- a full CMP.

Use `None` if no unresolved issue remains within this PR's scope.
