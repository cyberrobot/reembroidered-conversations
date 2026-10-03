# PR #41 — Default-on statistical Google Analytics, analytics opt-out, and Privacy Notice update

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
- Existing PR #41 analytics implementation
- No new npm package is required
- Production GA4 configuration must satisfy the restricted statistical-analytics requirements in this specification before default-on analytics is enabled

### Read first

Before making changes, read:

- `AGENTS.md`
- `.codex/tasks/TEMPLATE.md`
- `.codex/tasks/025-legal-documents-company-privacy-disclosure-ui.md`
- `.codex/tasks/041-google-analytics-consent.md`
- `package.json`
- `.env.example`
- `README.md`
- `playwright.config.ts`
- `.github/workflows/ci.yml`
- `src/app/page.tsx`
- `src/components/AnalyticsConsent.tsx`
- `src/components/AnalyticsSettingsButton.tsx`
- `src/components/Footer.tsx`
- `src/lib/analytics.ts`
- `src/data/legal.ts`
- `tests/analytics-consent.test.mjs`
- `tests/legal-content.test.mjs`
- `tests/browser/analytics-consent.spec.ts`
- `tests/browser/legal.spec.ts`

There is currently no more narrowly scoped `AGENTS.md`.

## Primary change area

Public homepage statistical analytics, analytics opt-out/settings UI and the Privacy Notice.

The implementation must change PR #41 from an **opt-in consent model** to a **default-on statistical analytics model with a simple persistent opt-out**.

Analytics must remain excluded from private booking-management, payment-return, booking-success, admin, API and visual-fixture surfaces.

## Regulatory model

This implementation is intended to rely on the UK PECR **statistical purposes exception**, rather than prior analytics consent.

The product configuration and implementation must therefore remain narrowly limited to aggregate statistical information used to understand and improve the public website.

This PR must not expand analytics into:

- individual visitor tracking;
- profiling;
- advertising;
- remarketing;
- audience creation;
- conversion measurement;
- cross-service tracking;
- booking-funnel analytics;
- user-level business decisions.

Users must receive clear information about analytics and a simple, free way to object.

Where the analytics processing involves personal data, the Privacy Notice must state the applicable UK GDPR lawful basis. For this implementation, use legitimate interests only if the business has completed and retained an appropriate legitimate-interests assessment covering the restricted analytics configuration.

Default-on production analytics must not be enabled until the external GA4 configuration requirements in this specification have been confirmed.

This specification does not establish that the same default-on approach is appropriate for every non-UK jurisdiction. Do not add geographic detection in this PR. If the service intentionally targets jurisdictions requiring prior analytics consent, that requires separate legal/product review.

---

## Canonical implementation examples

Use these as the preferred implementation references:

- `src/app/page.tsx`
  - public homepage composition
  - ownership boundary for homepage-only analytics
- `src/app/layout.tsx`
  - inspect but do not mount GA globally
- `src/components/AnalyticsConsent.tsx`
  - current analytics preference implementation
  - rename to a more accurate `AnalyticsPreference`, `AnalyticsNotice` or equivalent if doing so remains a small coherent change
- `src/components/AnalyticsSettingsButton.tsx`
  - persistent visitor control
- `src/components/Footer.tsx`
  - existing persistent settings surface
- `src/components/LegalLink.tsx`
  - canonical legal-document launcher
- `src/components/LegalModal.tsx`
  - accessible Privacy Notice presentation
- `src/data/legal.ts`
  - canonical legal content
- `src/lib/analytics.ts`
  - analytics preference parsing and Measurement ID validation
- `tests/browser/analytics-consent.spec.ts`
  - analytics behaviour and visual coverage

Do not introduce a general analytics framework.

## Expected change surface

Expected changes include:

```text
.codex/tasks/041-google-analytics-consent.md
README.md
src/app/page.tsx
src/components/AnalyticsConsent.tsx
src/components/AnalyticsSettingsButton.tsx
src/components/Footer.tsx
src/data/legal.ts
src/lib/analytics.ts
tests/analytics-consent.test.mjs
tests/legal-content.test.mjs
tests/browser/analytics-consent.spec.ts
tests/browser/legal.spec.ts
```

If the analytics component is renamed, update its imports/tests accordingly.

Existing reviewed visual snapshots may change only where the analytics notice or Privacy Notice intentionally changes.

Do not regenerate unrelated snapshots.

## Excluded areas

Do not change:

- booking lifecycle or availability;
- booking form submission;
- Stripe behaviour;
- Google Calendar or Meet behaviour;
- confirmation email behaviour;
- database schema or migrations;
- cancellation or rescheduling;
- Mux configuration;
- Turnstile behaviour;
- Terms and Conditions except shared legal metadata types;
- customer identity persistence;
- Google Ads;
- Google Tag Manager;
- advertising conversion tracking;
- remarketing;
- audiences;
- cross-domain measurement;
- Google Signals / advertising functionality;
- enhanced conversions;
- User-ID;
- user-provided-data features;
- custom booking-funnel events;
- conversion events;
- a third-party CMP;
- unrelated homepage redesign.

---

## Objective

Change the existing GA4 implementation so limited statistical analytics is enabled by default on the public homepage after the application has checked that the visitor has not previously opted out.

Do **not** treat this as implied consent.

The application is relying on a statistical-analytics exception and giving visitors an objection/opt-out mechanism.

### First visit with no existing preference

After hydration and after checking stored analytics preferences:

- initialise GA automatically;
- load the Google tag;
- collect only the restricted statistical measurements allowed by this specification;
- display a compact analytics notice explaining that limited analytics is used;
- provide the existing Analytics settings control, where disabling takes effect immediately through the existing switch;
- provide a **Privacy Notice** link;
- preserve the existing acknowledgement control and its label to dismiss the notice.

Do not change the existing acknowledgement label as part of this behaviour-only update. Its action must only acknowledge/dismiss the notice; analytics is already on by default and is not enabled on the basis of that action. Do not introduce new consent-oriented labels such as:

```text
Allow analytics
I consent
Agree
```

because analytics is not being activated on the basis of that action.

### Visitor disables analytics

Immediately:

- persist the disabled preference;
- set application analytics to disabled;
- stop subsequent analytics collection;
- clear accessible first-party `_ga` / `_ga_*` cookies created by this integration;
- ensure subsequent reloads do not load the Google tag.

### Visitor keeps analytics enabled

Acknowledge/dismiss the notice and persist that analytics remains enabled.

Subsequent visits:

- analytics loads after the saved preference has been read;
- the first-visit notice is not repeatedly shown.

### Persistent controls

Keep **Analytics settings** in the homepage footer.

It must allow:

- enabled → disabled;
- disabled → enabled.

The current status must be clearly shown.

---

## Preference migration

The current PR #41 implementation uses:

```text
reembroidered.analytics-consent.v1
```

with:

```text
granted
denied
```

Do not silently discard an existing visitor's rejection.

Introduce a new semantic preference key, for example:

```text
reembroidered.analytics-preference.v2
```

Preferred values:

```text
enabled
disabled
```

Do not use `granted` to describe the new default-on model.

On first read of the new preference:

### Existing `v2=disabled`

- keep analytics off;
- do not load Google;
- do not show the first-visit notice unless the visitor explicitly opens Analytics settings.

### Existing `v2=enabled`

- enable analytics;
- do not show the first-visit notice.

### No v2 value + old `v1=denied`

- migrate to `v2=disabled`;
- preserve the visitor's previous rejection;
- do not load analytics.

### No v2 value + old `v1=granted`

- migrate to `v2=enabled`;
- analytics may load.

### No previous preference

- default to analytics enabled;
- show the first-visit information/opt-out notice.

### Corrupt/unknown preference

- treat as no valid current preference;
- use the new default-on behaviour;
- show the notice so the visitor has a clear opportunity to object.

After a successful migration, remove the obsolete v1 preference where appropriate.

Do not load the Google tag before this preference/migration check completes. This prevents a previously opted-out visitor from generating a transient analytics request before their stored choice is applied.

---

## External integration — Google Analytics 4

### Operation

Load GA4 on the public homepage by default unless the visitor has opted out.

Continue using the existing public Measurement ID:

```text
NEXT_PUBLIC_GOOGLE_ANALYTICS_ID
```

The Measurement ID is not a secret.

### Route scope

Analytics must remain homepage-only.

Do not load it on:

```text
/booking/manage/[capability]
/booking/success
/payment
/confirmation
/admin/**
/api/**
/visual-fixtures/**
```

Do not move analytics into `RootLayout`.

### Basic measurement

Retain the existing narrow configuration:

- one homepage `page_view`;
- page title;
- homepage location;
- host-only analytics cookies using:

```text
cookie_domain: "none"
```

Advertising-related consent/settings must remain denied.

Do not add custom booking events.

---

## Required external GA4 configuration

Default-on analytics is conditional on this configuration.

Before production enablement, verify and record the following.

### Enhanced Measurement

Maintain or confirm this restricted configuration:

```text
Page views: ON
  Advanced settings:
    Page changes based on browser history events: OFF
Scrolls: ON

Outbound clicks: OFF
Site search: OFF
Form interactions: OFF
Video engagement: OFF
File downloads: OFF
```

Do not enable additional Enhanced Measurement categories without separately reviewing whether they remain within the statistical-purpose scope.

`Form interactions: OFF` has been confirmed externally. Do not claim that the
other Enhanced Measurement settings have been externally verified unless the
production owner confirms them. The browser-history page-view restriction is
required because the application uses browser history for legal-document
navigation while emitting one explicit homepage `page_view`.

### Advertising and identity features

Confirm:

```text
Google Ads linkage: none
Remarketing: off
Advertising audiences: off
User-ID: not implemented
User-provided data: off
Enhanced conversions: off
Cross-domain measurement: off
Custom booking/customer dimensions: none
```

Do not send:

- name;
- email;
- booking identifiers;
- payment identifiers;
- booking-management capability;
- Calendar IDs;
- Meet URLs;
- form values;
- free-form customer information.

### Google data sharing — verified externally

The production owner has verified that all optional Analytics account
data-sharing settings are off:

```text
Google products & services: OFF
Modelling contributions & business insights: OFF
Technical support: OFF
Recommendations for your business: OFF
```

Do not allow Analytics data from this property to be reused for Google's independent product-development, advertising or other separate purposes.

### Google Ads linkage — verified externally

```text
Google Ads linkage: none
```

### Data retention

The verified production retention configuration is:

```text
Event data retention: 2 months
User data retention: 14 months
Reset on new user activity: OFF
```

The production owner records this justification:

> Event-level data is retained for 2 months. User-level data is retained for up to 14 months to permit analysis across an annual usage cycle where user-level Analytics exploration is genuinely required. Reset on new user activity is disabled, so subsequent activity does not continually extend the retention period. Analytics is not used for advertising, profiling, booking identification, marketing audiences or individual decision-making. Standard aggregated Analytics reports may be retained independently of these user/event retention controls.

Do not describe 14 months as legally required or necessary merely because it is a GA default. Completion and retention of a legitimate-interests assessment covering this configuration remains a production prerequisite.

If the production owner cannot reasonably justify the provider's individual-level retention for the statistical aggregation process, retain the existing opt-in model instead of enabling default-on analytics.

Standard aggregate reports may be retained independently of the raw/user-level retention setting.

---

## Security and privacy considerations

### Analytics must remain statistical

Analytics is permitted only to understand aggregate use of the public website and make improvements to it.

Examples within scope include:

- page-view totals;
- aggregate scroll behaviour;
- general device/browser categories;
- aggregate performance or navigation patterns where provided by the permitted basic measurement.

Do not use analytics to:

- identify a visitor;
- reconstruct an individual's browsing history;
- profile visitors;
- segment people for targeting;
- target site content to particular people;
- measure advertising;
- create marketing audiences;
- connect a visitor identifier to a booking;
- determine whether a particular customer booked;
- make decisions about an individual.

### Existing booking privacy boundary

Never intentionally send any of the following to GA:

- customer name;
- email;
- booking ID;
- Stripe identifiers;
- booking-management capability;
- form field values;
- Calendar event IDs;
- Meet URLs;
- private booking state;
- free-form customer information.

### Opt-out

Opt-out must be:

- immediately available;
- free;
- understandable;
- available without requiring a Google account;
- available without browser-settings instructions;
- available persistently through the site's own footer.

### Cookie removal

Continue using host-only GA cookies:

```text
cookie_domain: "none"
```

When analytics is disabled:

- set `ga-disable-<measurement-id>` appropriately;
- queue/update analytics storage as denied where applicable;
- clear accessible `_ga` / `_ga_*` cookies;
- persist `disabled`.

---

## Required implementation

### 1. Change from opt-in to default-on after preference check

Current behaviour waits for:

```text
Allow analytics
```

before loading GA.

Replace it with:

```text
read preference
→ preserve/migrate any previous opt-out
→ if not disabled, start analytics
→ show first-visit information/opt-out notice when no current preference exists
```

Do not insert GA server-side or before stored preference state has been resolved.

### 2. Replace consent language

The public UI must not describe the new mechanism as obtaining analytics consent.

Use language such as:

> We use limited Google Analytics statistics to understand how this public website is used and improve it. You can disable analytics at any time.

Keep the current popup controls and labels unchanged. The existing
acknowledgement action is only an acknowledgement/dismiss action, not consent.
Analytics is already enabled by default and the action must not change that
state.

When settings are reopened:

```text
Analytics is currently on.
```

or:

```text
Analytics is currently off.
```

Provide:

```text
Enable analytics
Disable analytics
```

as appropriate.

### 3. Keep the UI non-modal

The first-visit notice remains:

- compact;
- fixed;
- non-blocking;
- responsive;
- keyboard accessible;
- outside normal page flow;
- non-modal;
- directly actionable.

Do not make disabling less prominent or materially harder than continuing.

### 4. Keep legal modal integration

The notice's Privacy Notice link must continue to use the existing `LegalLink`/`LegalModal`.

Keep the analytics component within `#site-content` so the legal dialog's existing `inert` handling applies to it.

### 5. External failure handling

If Google Analytics is:

- blocked;
- unavailable;
- slow;
- rejected by an extension;
- subject to DNS/network failure;

the homepage and booking flow must continue normally.

No user-facing analytics failure is required.

---

## Privacy Notice

The current Version 1.1 describes analytics as opt-in.

That wording becomes inaccurate once analytics is default-on.

Update:

```text
Privacy Notice Version 1.1
Effective 1 October 2026
```

to:

```text
Privacy Notice Version 1.2
Effective 2 October 2026
```

Keep Terms at:

```text
Version 1.2
Effective 24 September 2026
```

### Analytics description

Explain that:

- limited GA statistics operate by default on the public homepage;
- they are used solely to understand website usage and make improvements;
- analytics is not used for advertising, profiling or booking/customer identification;
- visitors may disable analytics at any time.

Do not say analytics is activated only after `Allow analytics`.

### PECR model

Explain that the site relies on the statistical-purpose exception for the storage/access used by this restricted analytics configuration.

Explain the user's ability to object using:

```text
Analytics settings
```

Do not describe this objection mechanism as withdrawal of consent.

### UK GDPR basis

Where this processing involves personal data, state the lawful basis accurately
without claiming that supporting documentation is complete:

> Where this processing involves personal data, our UK GDPR lawful basis is legitimate interests: producing limited statistics needed to understand and improve the public website.

Completion and retention of an appropriate legitimate-interests assessment
remains a production prerequisite. Do not claim in the Privacy Notice that the
assessment has already been completed or retained.

### Provider disclosure

Continue to identify Google Analytics separately from Google Calendar and Google Meet.

Explain that Google acts as the analytics service provider for this restricted implementation.

Do not state or imply that Google receives booking form contents or customer booking identifiers.

### Cookies and storage

Explain:

- GA may create host-only first-party `_ga` / `_ga_*` cookies while analytics is enabled;
- analytics operates by default under the statistical-purpose model;
- the visitor can disable it through Analytics settings;
- disabling removes accessible GA cookies and prevents subsequent application analytics;
- a small first-party preference records whether analytics is enabled or disabled.

Do not describe that preference as a consent record.

### Retention

Do not make unsupported guarantees.

State the verified configuration accurately: event-level data is retained for
2 months, user-level data for up to 14 months, and reset on new user activity is
disabled. Explain that aggregate reports may be retained independently. Do not
imply that 14 months is legally required.

### International transfers

Recheck the existing international-transfer wording after the legal-basis change and make the minimum accurate amendment if necessary.

---

## Acceptance criteria

### Behaviour

- [ ] PR #41 spec reflects default-on statistical analytics rather than opt-in analytics.
- [ ] Homepage remains statically renderable.
- [ ] Analytics remains scoped to the public homepage.
- [ ] Analytics preference is read before GA is loaded.
- [ ] A previous v1 `denied` preference is preserved and prevents GA loading.
- [ ] With no previous preference, GA loads automatically after preference resolution.
- [ ] First-time visitors see clear analytics information; the existing Settings control opens the switch, which disables analytics immediately when turned off.
- [ ] The existing acknowledgement action only dismisses the notice and does not describe analytics as consent.
- [ ] The existing acknowledgement dismisses the initial notice and records `enabled`.
- [ ] The existing acknowledgement from Analytics settings closes the panel without changing the existing preference.
- [ ] Disable analytics records `disabled`.
- [ ] Disabled state survives reload.
- [ ] Disabled state blocks all subsequent GA tag requests.
- [ ] Re-enabling through Analytics settings works.
- [ ] Disabling through Analytics settings works.
- [ ] The expanded Minimal Analytics switch immediately applies and persists either preference.
- [ ] Status text always reflects the effective analytics state.
- [ ] Withdrawal clears accessible `_ga` / `_ga_*` cookies.
- [ ] A first-party preference cookie persists the choice when localStorage is unavailable.
- [ ] A disabled preference cookie prevents GA loading before interaction.
- [ ] Host-only `cookie_domain: "none"` remains configured.
- [ ] Missing/malformed Measurement ID fails closed.
- [ ] GA failure does not affect the site.
- [ ] Sensitive routes never load GA.
- [ ] No custom booking or conversion event is introduced.

### External GA4 configuration

- [x] Google products & services data sharing disabled.
- [x] Modelling contributions & business insights disabled.
- [x] Technical support data sharing disabled.
- [x] Recommendations for your business disabled.
- [x] No Google Ads linkage.
- [x] Form interactions disabled externally.
- [x] Event data retention is 2 months.
- [x] User data retention is 14 months.
- [x] Reset on new user activity is off.
- [ ] Page views enabled.
- [ ] Page changes based on browser history events disabled.
- [ ] Scrolls enabled.
- [ ] Outbound clicks disabled.
- [ ] Site search disabled.
- [ ] Video engagement disabled.
- [ ] File downloads disabled.
- [ ] No remarketing.
- [ ] No advertising audiences.
- [ ] No User-ID.
- [ ] No enhanced conversions.
- [ ] No user-provided-data collection.
- [ ] No custom booking/customer dimensions.
- [ ] Remaining restricted-statistics settings confirmed by the production owner.
- [ ] Retention justification and legitimate-interests assessment completed and retained before default-on production enablement.

### Privacy Notice

- [ ] Privacy Notice is Version 1.2, effective 2 October 2026.
- [ ] Terms remain Version 1.2, effective 24 September 2026.
- [ ] Old opt-in wording is removed.
- [ ] Default-on statistical analytics is disclosed.
- [ ] Statistical-purpose model is explained.
- [ ] The applicable UK GDPR lawful basis is accurately stated.
- [ ] The notice does not claim that a legitimate-interests assessment has been completed or retained.
- [ ] Visitor objection/opt-out is explained.
- [ ] Google Analytics provider role is disclosed.
- [ ] GA cookie/storage behaviour is described.
- [ ] Analytics preference storage is described as a preference, not a consent record.
- [ ] The notice distinguishes the site's preference storage from GA cookies.
- [ ] The notice states event retention of 2 months, user retention up to 14 months, reset disabled, and aggregate report retention independently.
- [ ] No statement suggests booking form/customer identity is intentionally sent to GA.
- [ ] No unsupported retention promise is added.

### UI

- [ ] First-visit analytics notice works at desktop and mobile widths.
- [ ] The existing Settings control immediately exposes the current analytics preference switch; changing it disables analytics at once.
- [ ] The existing acknowledgement control and its visual label are unchanged.
- [ ] Privacy Notice is keyboard accessible.
- [ ] Analytics settings remains available in the footer.
- [ ] Legal modal correctly makes the analytics notice inert while open.
- [ ] Existing legal focus restoration continues working.

### Code quality

- [ ] No unnecessary dependency added.
- [ ] No RootLayout analytics injection.
- [ ] No unrelated refactor.
- [ ] Client boundaries remain narrow.
- [ ] Type checking passes.
- [ ] Formatting passes.
- [ ] Node tests pass.
- [ ] Browser tests pass.
- [ ] Production build passes.
- [ ] Security audit passes.
- [ ] `git diff --check` passes.

---

## Tests to add/update

### Unit tests

Update `tests/analytics-consent.test.mjs`.

Cover preference parsing/migration for:

```text
v2 enabled
v2 disabled
v1 granted → v2 enabled
v1 denied → v2 disabled
no preference
corrupt preference
```

Ensure an old explicit denial always wins over the new default.

Continue testing Measurement ID validation.

Test preference-cookie parsing and serialization for valid `enabled` and
`disabled` values, missing/corrupt cookies, localStorage precedence, cookie
fallback and legacy migration.

### Legal-content tests

Update `tests/legal-content.test.mjs`.

Verify:

- Privacy Notice Version 1.2;
- effective date 2 October 2026;
- Terms unchanged;
- old `Allow analytics` / prior-consent language is absent;
- default statistical analytics is disclosed;
- Analytics settings opt-out is disclosed;
- applicable lawful-basis language is present;
- Google Analytics is disclosed distinctly;
- booking form contents/identifiers are not described as being intentionally sent;
- existing provider disclosures remain accurate.
- event-level retention is 2 months;
- user-level retention is up to 14 months;
- reset on new activity is disabled;
- aggregate reports may be retained independently;
- no completed/retained legitimate-interests assessment is claimed;
- the first-party preference is not described as a consent record.

### Browser tests

Update `tests/browser/analytics-consent.spec.ts`.

Use only the deterministic CI Measurement ID and intercept Google endpoints.

Cover:

1. **First visit / no preference**
   - preference read completes;
   - GA tag loads automatically;
   - analytics notice is visible;
   - the existing Settings control is visible and opens the analytics preference switch;
   - the existing acknowledgement control is visible;
   - Privacy Notice link is visible.

2. **Existing acknowledgement control**
   - stores `enabled`;
   - closes notice;
   - reload keeps analytics enabled;
   - notice does not repeatedly appear.

3. **Immediate disable**
   - stores `disabled`;
   - clears `_ga*`;
   - reload does not request the Google tag.

4. **Existing v1 denied**
   - no Google request occurs;
   - migrates to v2 disabled.

5. **Existing v1 granted**
   - migrates to enabled;
   - GA loads.

6. **Corrupt preference**
   - falls back to default-on;
   - notice is visible so objection is immediately available.

7. **Analytics settings**
   - switch immediately applies and persists enabled → disabled;
   - disabled status is accurate and accessible GA cookies are removed;
   - reload keeps the visitor disabled and makes no Google request;
   - switch immediately applies and persists disabled → enabled;
   - status reflects the effective state;
   - the existing acknowledgement control from settings closes without changing a disabled preference.

8. **Cookie configuration**
   - queued `config` contains:

```text
cookie_domain: "none"
```

9. **Privacy Notice**
   - canonical legal modal opens;
   - analytics notice is within inert background;
   - controls work after close.

10. **Sensitive routes**
    - even an enabled preference does not load GA outside the homepage.

11. **Script failure**
    - homepage/booking UI remains usable.

12. **Unavailable localStorage**
    - disabling analytics writes the first-party preference cookie;
    - reload remains disabled with no Google request;
    - a pre-existing disabled cookie blocks Analytics before interaction.

13. **Missing/invalid Measurement ID**
    - fail closed through existing unit coverage or a clean browser fixture;
    - do not introduce test-only query parameters into the production homepage.

### Existing unrelated browser tests

Because analytics is now enabled by default, tests unrelated to analytics should pre-seed:

```text
reembroidered.analytics-preference.v2=disabled
```

before homepage navigation unless that test specifically exercises analytics.

This keeps unrelated browser tests and screenshots deterministic and prevents CI from generating Google requests.

Pre-seed the v2 disabled preference cookie alongside localStorage where those
tests use fresh browser contexts.

Update at minimum:

```text
tests/browser/homepage-booking-picker.spec.ts
tests/browser/legal.spec.ts
tests/browser/migration-smoke.spec.ts
```

### Visual regression

Preserve existing analytics screenshots. Do not regenerate baselines for
behavioral/state-management changes. If an unavoidable copy change causes a
visible difference, update only directly affected analytics snapshots after
reviewing actual/diff images; keep layout, spacing and styling unchanged.

Maintain reviewed:

```text
desktop macOS
mobile macOS
desktop Linux
mobile Linux
```

baselines.

Update Privacy Notice snapshots only if changed legal wording causes a direct
visual difference. Do not regenerate Terms or unrelated snapshots.

Do not change Terms snapshots unless a shared rendering change genuinely requires it.

---

## Verification

Run:

```bash
npm run format

node --conditions=react-server --experimental-test-module-mocks --test \
  tests/analytics-consent.test.mjs \
  tests/legal-content.test.mjs

npx playwright test \
  tests/browser/analytics-consent.spec.ts \
  tests/browser/legal.spec.ts

npm run security:audit
npm run format:check
npm run lint
npm test
npm run build
npm run test:browser
git diff --check
```

All commands must pass.

The production build should continue to report the homepage as statically rendered.

Browser tests must never send traffic to the real production GA property.

---

## Completion report

### Spec changes

Report:

- event retention changed from the old two-month user/event requirement to 2-month event and 14-month user retention;
- Reset on new user activity is OFF;
- browser-history page-view restriction is documented;
- verified data-sharing and Google Ads settings are recorded;
- LIA completion and retention remain a production prerequisite.

### Implementation changes

Report:

- active preference model uses `enabled` / `disabled`;
- existing settings switch immediately changes effective preference;
- the acknowledgement action from settings does not change a disabled preference;
- first-party preference-cookie fallback and localStorage-failure behaviour;
- Privacy Notice retention and storage wording corrected.

### UI preservation

Record:

```text
Analytics UI layout/styling changed: yes/no
Analytics UI copy changed: yes/no
Analytics visual snapshots regenerated: yes/no
```

Expected: layout/styling unchanged and snapshots unchanged. Explain any necessary
copy or snapshot change.

### Tests

Report migration unit tests, immediate-switch behaviour, acknowledgement behaviour,
storage fallback, cookie clearing, focused Playwright result, full Playwright
count, Node test result, production build result, security audit result, and
`git diff --check` result.

### External configuration

Verified externally:

```text
Google products & services: OFF
Modelling contributions & business insights: OFF
Technical support: OFF
Recommendations for your business: OFF
Google Ads linkage: none
Form interactions: OFF
Event retention: 2 months
User retention: 14 months
Reset on new user activity: OFF
```

Do not claim other Enhanced Measurement settings as externally verified
without confirmation.

### Remaining production prerequisites

List every item still awaiting manual confirmation, especially:

```text
LIA completed and retained: <confirm before production enablement>
Page views → Page changes based on browser history events: OFF
Remaining Enhanced Measurement restrictions confirmed
User-ID / user-provided data / enhanced conversions absent
Any other outstanding restricted-statistics prerequisites
```

Use `None` only if each prerequisite has actually been confirmed.

### Deviations and remaining issues

Explain meaningful deviations and unresolved in-scope issues. Keep booking-funnel
analytics, conversion measurement, advertising, audiences, cross-service
tracking, server-side analytics, EEA-specific consent handling, and a full CMP
outside this PR. Use `None` when no additional issue remains.
