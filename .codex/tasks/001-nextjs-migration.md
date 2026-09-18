# PR #1 — Migrate existing React app to Next.js

## Repository state

**Expected branch:**  
`feat/001-nextjs-migration`

**Base branch:**  
`main`

**Worktree:**  
`N/A`

**Dependencies:**  
`N/A — this is the foundation PR for later booking, Google Calendar, Google Meet, and Stripe work.`

### Read first

Before making changes, read the repository guidance and current application entry points relevant to this migration:

- `AGENTS.md`
- `package.json`
- `tsconfig.json`
- `vite.config.ts`
- `index.html`
- `.env.example`
- `.gitignore`
- `README.md`
- `src/main.tsx`
- `src/App.tsx`
- `src/index.css`
- `src/types.ts`
- `src/components/Navigation.tsx`
- `src/components/HeroVideo.tsx`
- `src/components/BookingSection.tsx`
- `src/components/FullCalendarModal.tsx`
- `src/components/BookingConfirmationPage.tsx`

There is currently no more narrowly scoped `AGENTS.md` under `src/`, and no `docs/architecture/repository-map.md` or `docs/architecture/dependency-rules.md` is present.

Do not create architecture documents solely for this migration.

### Primary change area

Next.js migration of the existing Re-Embroidered Conversations frontend application, including:

- application entry points
- routing
- build configuration
- environment-variable handling
- fonts
- metadata
- global styles
- static assets
- Server Component and Client Component boundaries

### Canonical implementation examples

The current Vite application is the canonical reference for rendered output and behaviour during this migration:

- `src/App.tsx` — current page composition and confirmation-view switching
- `src/components/Navigation.tsx` — responsive navigation, scrolling, and mobile menu behaviour
- `src/components/HeroVideo.tsx` — Mux player behaviour and optional playback-ID configuration
- `src/components/BookingSection.tsx` — existing prototype booking UI and client-side interactions
- `src/components/FullCalendarModal.tsx` — current calendar modal rendering and interactions
- `src/components/BookingConfirmationPage.tsx` — current confirmation UI and URL-parameter behaviour
- `src/index.css` — Tailwind v4 theme variables and global visual styling
- `index.html` — existing title, metadata, language, body styling, and Google font configuration

There is no existing Next.js implementation in the repository to use as a framework precedent.

### Relevant symbols

Codex should inspect these before editing:

- `App`
- `checkIsConfirmationFromUrl`
- `handleScrollToBooking`
- `handleOpenConfirmation`
- `handleBackToHome`
- `Navigation`
- `HeroVideo`
- `BookingSection`
- `FullCalendarModal`
- `BookingConfirmationPage`
- `BookingConfirmation`
- `DayAvailability`
- `SessionFormat`
- `VITE_MUX_PLAYBACK_ID`
- `DEFAULT_PLAYBACK_ID`

Pay particular attention to current uses of:

- `window`
- `document`
- `navigator`
- `Blob`
- `URL.createObjectURL`
- `window.history`
- DOM refs
- React effects
- browser event listeners
- `import.meta.env`

### Expected change surface

Expected changes include, as required by the final migration design:

- `package.json`
- dependency lockfile/package-manager state
- `tsconfig.json`
- `.env.example`
- `.gitignore`
- `README.md`
- Next.js configuration when required, e.g. `next.config.*`
- Tailwind/PostCSS configuration when required by the Next.js setup
- new App Router files under `src/app/`
- root layout
- homepage route
- confirmation route
- global stylesheet ownership under the Next.js App Router
- existing files under `src/components/`, `src/data/`, and `src/types.ts` where framework adaptation is required
- static images currently under `src/assets/images/` where asset ownership must change
- removal of Vite-only entry/configuration files once no longer required:
  - `vite.config.ts`
  - `index.html`
  - `src/main.tsx`
  - `src/vite-env.d.ts`

If additional files must change, Codex must explain why they are necessary for the Next.js migration.

### Excluded areas

Do not include any of the following in this PR:

- Real booking persistence or a booking backend
- Google Calendar API integration
- Google OAuth
- Google Meet creation
- Stripe Checkout
- Stripe PaymentIntents
- Stripe webhooks
- payment verification
- email delivery
- authentication
- user accounts
- database/schema work
- changes to the £55 price
- changes to the 55-minute duration
- Apple Calendar integration
- new availability/business rules
- redesign of the existing booking UI
- redesign of the marketing site
- editorial rewrites
- unrelated copy changes
- unrelated dependency upgrades
- unrelated refactors

The current booking experience is prototype client-side behaviour.

Preserve it as prototype behaviour. Do not make it more authoritative or production-like in this PR.

### Unknowns Codex must verify

Before making changes, verify from the repository and migration environment:

- Whether `npm` is the intended package manager. The README currently instructs `npm install`, while `bun.lock` exists but is empty.
- Which existing dependencies are actually used.
- Which Vite/scaffold dependencies become obsolete after migration.
- Whether any files beyond `HeroVideo.tsx` use `import.meta.env` or another Vite-only API.
- Whether components beyond the known interactive components rely on browser globals, hooks, DOM event handlers, callback props, or mutable browser state that require a client boundary.
- Whether the existing root URL confirmation query patterns must remain directly addressable in addition to a dedicated Next.js confirmation route.
- Whether current static image imports are best preserved as static imports or moved to `public/`.
- Whether adopting `next/image` would alter current layout, crop, quality, loading behaviour, or visual output.
- Whether the existing AI Studio/Cloud Run assumptions in `README.md` or `.env.example` are still required after migration.
- Whether `GEMINI_API_KEY` is actually referenced anywhere in the repository.
- Whether `APP_URL` is actually referenced anywhere in the repository.
- Whether `/assets/aistudio/` is referenced anywhere and whether the custom Vite media middleware remains necessary.
- Whether the target deployment platform requires Next.js-specific runtime or configuration beyond the normal production build/start scripts.
- Whether CI or repository-level checks exist outside the currently inspected application files.
- Whether the current Mux package versions are compatible with the selected Next.js release and React version.

Remove only dependencies made obsolete by the migration or proven unused in the affected scaffold.

Do not perform opportunistic dependency cleanup.

Do not guess when these questions can be answered from the repository or target environment.

---

## Objective

Convert the existing Vite/React application into a production-buildable Next.js application using the App Router while preserving the current Re-Embroidered Conversations UI and observable behaviour as closely as possible.

After this PR:

- The application runs as a Next.js App Router application.
- The existing homepage content remains in the same order.
- Existing styling remains visually equivalent.
- Existing responsive behaviour remains equivalent.
- Existing navigation behaviour remains equivalent.
- The existing Mux video experience remains functional.
- The prototype booking UI remains functional.
- The full-calendar modal remains functional.
- The prototype confirmation experience remains functional.
- Confirmation navigation uses Next.js-compatible routing rather than the current top-level Vite SPA/history implementation.
- Browser-dependent code executes only inside appropriate Client Components or browser-only helpers.
- Components that do not require browser interactivity remain Server Components where practical.
- `"use client"` is not applied broadly simply to make the migration compile.
- Vite-only entry points and configuration are removed.
- Vite-specific environment-variable access is removed.
- Fonts are configured through appropriate Next.js conventions.
- Metadata is owned by Next.js.
- Global styles are owned by the App Router.
- Static assets use supported Next.js conventions.
- A production Next.js build succeeds.
- The production application can start using the intended runtime.
- No real booking functionality is introduced.
- No Stripe functionality is introduced.
- No Google Calendar API functionality is introduced.
- No Google Meet functionality is introduced.

Completion means the framework migration is complete and verified without turning this PR into a booking implementation PR.

---

## Current architecture

The repository is currently a Vite-powered React 19 single-page application.

`src/main.tsx` mounts `App` into the `#root` element defined by `index.html`.

`src/App.tsx` composes the entire page and owns top-level client state for switching between the homepage and `BookingConfirmationPage`.

There is currently no routing library.

Confirmation navigation is implemented manually using:

- `window.location`
- `URLSearchParams`
- `window.history.pushState`
- `popstate` listeners

The application currently recognises several confirmation indicators, including:

- `/confirmation`
- `confirmation=true`
- `payment_success=true`
- `success=true`
- `session_id`
- `booking_id`
- `id`

Several components are clearly browser-interactive.

### `Navigation`

Uses:

- React state
- React effects
- scroll event listeners
- `window.scrollTo`
- `document.getElementById`
- mobile menu state
- smooth-scroll interactions

### `HeroVideo`

Uses:

- React state
- React effects
- React refs
- Mux Player
- DOM scrolling
- browser playback APIs
- `import.meta.env.VITE_MUX_PLAYBACK_ID`

### `BookingSection`

Uses:

- substantial client state
- current-date calculations
- DOM refs
- resize listeners
- scrolling
- form events
- generated prototype booking IDs
- `Blob`
- `URL.createObjectURL`
- programmatic downloads

### `FullCalendarModal`

Uses:

- React state
- event handlers
- local date calculations
- interactive modal behaviour

### `BookingConfirmationPage`

Uses:

- URL parsing
- history manipulation
- clipboard APIs
- programmatic file downloads
- browser printing/client behaviour
- React state
- React effects

Other content components are primarily presentational, although some receive `onBookClick` callbacks from `App`.

During migration, do not automatically convert every descendant into a Client Component simply because the current Vite composition passes callback props through the component tree.

Where equivalent behaviour can be preserved using normal links, hash navigation, or a narrower client wrapper, prefer the smaller client boundary.

`src/index.css` currently uses Tailwind CSS v4 via:

```css
@import "tailwindcss";
```

It defines the existing:

- typography
- colour tokens
- paper texture
- parchment backgrounds
- design tokens
- scrollbar styling
- embroidery/stitch accents

Vite currently integrates Tailwind using `@tailwindcss/vite`.

`index.html` currently owns:

- document language
- title
- meta description
- Open Graph metadata
- Twitter metadata
- body classes
- Cormorant Garamond font loading
- Plus Jakarta Sans font loading

These responsibilities must move to the Next.js root layout, Metadata API, and font configuration without causing avoidable typography or layout differences.

Local images currently live under:

```text
src/assets/images/
```

The Vite configuration also contains custom AI Studio development middleware for:

```text
/assets/aistudio/
```

No corresponding public asset tree was identified during initial inspection.

Do not port this middleware unless repository usage demonstrates that it is still required.

There are currently no:

- Next.js routes
- route handlers
- server actions
- persistence layer
- database
- configured unit-test framework
- configured integration-test framework
- Playwright configuration
- Stripe integration
- Google Calendar API integration
- Google Meet integration

---

## External integrations affected

### Mux

Existing integration only.

No new Mux capability should be added.

**Operation:**  
Render and play the existing hero video using `@mux/mux-player-react` and optionally accept a configured public playback ID.

**Current ownership:**  
`src/components/HeroVideo.tsx`

**Authentication or authorization changes:**  
None.

**New API scopes or permissions:**  
None.

**Webhook behaviour changes:**  
None.

**Failure behaviour:**  
Preserve the existing fallback to `DEFAULT_PLAYBACK_ID` when a configured override is invalid or playback fails, unless a framework constraint requires a minimal equivalent implementation change.

### Google Calendar links

The existing prototype generates ordinary Google Calendar URLs in client code.

This is not Google Calendar API integration.

Preserve this only as existing prototype/link behaviour in this PR.

### Stripe

None.

Do not add Stripe integration in this PR.

### Google Calendar API

None.

Do not add Google Calendar API integration in this PR.

### Google Meet

None.

Do not add Google Meet integration in this PR.

---

## Configuration and data changes

### Environment variables

Expected migration change:

#### `VITE_MUX_PLAYBACK_ID`

This variable is Vite-specific and currently read from client code.

Replace it with the appropriate Next.js public environment-variable convention, expected to be:

```text
NEXT_PUBLIC_MUX_PLAYBACK_ID
```

unless Codex establishes a better Next.js-compatible server-to-client configuration path that preserves current behaviour.

Properties:

- Server-only: no
- Public/client-visible: yes
- Required: no
- Secret: no
- Purpose: optional Mux playback-ID override

Verify before modifying:

#### `GEMINI_API_KEY`

- Determine whether it is used anywhere in the application.
- It must remain server-only if retained or used.
- It must never become a `NEXT_PUBLIC_*` variable.
- Remove or update its documentation only if repository usage confirms the existing AI Studio configuration is obsolete.

#### `APP_URL`

- Determine whether it is used anywhere in the application.
- Determine whether it remains required by the intended deployment environment.
- Keep it server-only unless a genuine browser requirement exists.

All `import.meta.env` usage must be removed from application code.

Update `.env.example` so it accurately describes post-migration environment-variable names, visibility, and requirements.

Never add real credentials.

### Database or schema

None.

### Webhooks

None.

### OAuth and permissions

None.

### Deployment configuration

Replace Vite production assumptions with normal Next.js production behaviour.

At minimum:

- `dev` must run the Next.js development server.
- `build` must produce a Next.js production build.
- a `start` script must exist when required by the intended deployment runtime.
- Vite preview/build configuration must be removed when no longer applicable.
- `.next/` must be ignored by Git.
- Vite-specific build output such as `dist/` should no longer be treated as the application production artifact.
- README run/build instructions must be updated to reflect the migrated application.
- environment-variable documentation must reflect the migrated application.

Do not introduce provider-specific deployment files unless the current or target deployment environment requires them.

### Migration or backfill

None.

There is no persisted application data to migrate or backfill in this PR.

---

## Security and privacy considerations

This migration must not accidentally move future privileged responsibilities into the browser.

Codex must:

- Do not expose `GEMINI_API_KEY` or any other secret through `NEXT_PUBLIC_*`.
- Do not expose server secrets through props serialized into Client Components.
- Treat the Mux playback ID as public configuration only.
- Do not generalise Mux environment handling to privileged configuration.
- Do not add Stripe credentials.
- Do not add Google OAuth credentials.
- Do not add Google Calendar credentials.
- Do not add Google Meet credentials.
- Do not introduce API routes containing placeholder secret-handling logic.
- Preserve the existing prototype booking behaviour without representing generated confirmation, payment, or calendar state as authoritative production state.
- Do not introduce server logging of names, email addresses, phone numbers, optional notes, booking subjects, URL parameters, or other personal information solely as part of this migration.
- Keep future integration boundaries compatible with the repository-wide requirement that privileged booking, payment, Calendar, and Meet operations remain server-side.

No new persistent customer-data handling is expected.

---

## Required implementation

1. Install and configure Next.js using the App Router and React versions compatible with the selected Next.js release.

   Do not keep Vite as a parallel application runtime.

2. Create the Next.js application structure under `src/app/` unless repository evidence justifies a different standard structure.

   At minimum provide:
   - `src/app/layout.tsx`
   - `src/app/page.tsx`
   - an App Router confirmation route where appropriate

3. Move current document-level responsibilities from `index.html` into Next.js.

   This includes:
   - HTML language
   - page title
   - description
   - Open Graph metadata
   - Twitter metadata
   - body/global classes
   - global stylesheet import
   - font configuration

4. Preserve the existing typography.

   Prefer `next/font/google` for:
   - Cormorant Garamond
   - Plus Jakarta Sans

   when it can reproduce the existing weights and styles without visible regression.

   Map the resulting font variables or classes into the existing Tailwind `font-serif` and `font-sans` usage rather than rewriting typography throughout the component tree.

5. Preserve the current Tailwind CSS v4 theme and global styles.

   Keep the existing design tokens and utility usage.

   Replace `@tailwindcss/vite` with the appropriate Next.js/Tailwind v4 integration.

   Do not redesign:
   - colours
   - typography
   - spacing
   - backgrounds
   - textures
   - component styling

6. Migrate routing away from the current top-level manual SPA switching.

   Prefer a dedicated App Router confirmation route such as:

   ```text
   /confirmation
   ```

   Preserve the current confirmation UI and relevant query-parameter inputs.

7. Determine how to preserve compatibility with existing confirmation entry patterns where practical.

   Existing patterns include:

   ```text
   /confirmation
   ?confirmation=true
   ?payment_success=true
   ?success=true
   ?session_id=...
   ?booking_id=...
   ?id=...
   ```

   Do not silently drop existing prototype entry paths without establishing whether they are still required.

8. Replace route-level `window.history` manipulation with Next.js navigation primitives where routing is intended.

   Prefer appropriate App Router APIs such as:
   - `next/link`
   - `useRouter`
   - `useSearchParams`
   - server `searchParams` where appropriate

   Browser history manipulation that exists solely for a prototype/test interaction may remain only when it is the smallest compatible implementation and does not conflict with App Router state.

9. Identify Client Components precisely.

   Known client candidates include:
   - `Navigation`
   - `HeroVideo`
   - `BookingSection`
   - `FullCalendarModal`
   - `BookingConfirmationPage`

   Audit all other components before deciding their boundary.

10. Do not add `"use client"` to `src/app/layout.tsx`.

11. Do not make the entire homepage a Client Component merely because the current `App` component passes callbacks to descendants.

12. Where practical, replace `onBookClick` callback plumbing with semantically appropriate hash links or narrowly scoped client behaviour.

    Preserve smooth scrolling and current interaction behaviour.

13. Browser-only operations must exist only inside appropriate Client Components and execute only in the browser.

    Audit and handle:
    - `window`
    - `document`
    - `navigator`
    - `navigator.clipboard`
    - `Blob`
    - `URL.createObjectURL`
    - DOM element refs
    - `scrollIntoView`
    - `window.scrollTo`
    - `window.history`
    - browser event listeners
    - media element APIs

14. Replace:

    ```ts
    import.meta.env.VITE_MUX_PLAYBACK_ID;
    ```

    with Next.js-compatible environment handling.

15. Preserve the current optional Mux override and fallback behaviour.

    Do not expose server secrets to the client.

16. Confirm that `@mux/mux-player-react` works correctly within the selected Client Component boundary under Next.js SSR/hydration.

    If it requires client-only loading, use the smallest appropriate boundary rather than disabling SSR for unrelated page content.

17. Handle local static assets using supported Next.js conventions.

    Current assets under `src/assets/images/` may remain imported if compatible, or move to `public/` where appropriate.

18. If moving assets, preserve:
    - image content
    - aspect ratio
    - rendered dimensions
    - object positioning
    - crop
    - responsive behaviour

19. If converting existing `<img>` usage to `next/image`, do so only where it can preserve current output without unnecessary migration scope.

    Do not introduce:
    - layout shifts
    - unexpected cropping
    - unexpected image sizing
    - unexpected optimization behaviour
    - visible quality regression

20. Do not rewrite all images to `next/image` merely because Next.js provides it.

21. Remove obsolete Vite application files when Next.js fully replaces them:
    - `vite.config.ts`
    - `index.html`
    - `src/main.tsx`
    - `src/vite-env.d.ts`

22. Remove dependencies that exist solely for the Vite runtime once they are no longer needed, including where verified:
    - `vite`
    - `@vitejs/plugin-react`
    - `@tailwindcss/vite`

23. Do not remove unrelated packages merely because they appear unused during a superficial scan.

24. Preserve the existing prototype booking flow as closely as possible.

    Preserve:
    - the visible 55-minute session duration
    - the visible £55 price
    - generated prototype availability
    - date selection
    - time-slot selection
    - period filtering
    - session-format selection
    - client details form
    - current validation behaviour
    - boundaries acknowledgement
    - full-calendar modal
    - confirmation UI
    - current Google Calendar-link prototype
    - current `.ics` generation prototype
    - existing development/test affordances unless a framework constraint requires a narrowly documented change

25. Do not replace prototype booking logic with real:
    - Google Calendar availability
    - booking persistence
    - booking state
    - Stripe payments
    - Google Calendar event creation
    - Google Meet creation
    - email delivery
    - server-side booking orchestration

26. Preserve accessibility.

    Do not break:
    - semantic controls
    - labels
    - keyboard access
    - focus behaviour
    - mobile-menu interaction
    - calendar dialog interaction
    - video controls
    - form validation presentation

27. Preserve responsive behaviour across existing breakpoints.

28. Preserve current page section order and editorial structure.

29. Update `README.md` so local-development and production instructions describe the Next.js application rather than the AI Studio/Vite scaffold where those instructions are no longer accurate.

30. Update `.gitignore` for Next.js-generated output where required.

31. Ensure TypeScript configuration is appropriate for Next.js.

    Allow Next.js to establish required compiler options rather than retaining incompatible Vite-specific settings.

32. Do not suppress type errors globally to make the migration pass.

33. Resolve SSR and hydration incompatibilities at their actual component boundary.

34. Do not use a global client-only wrapper or broadly disable SSR as a shortcut.

35. Ensure a successful production build.

36. Verify the production application can start using the intended Next.js runtime.

37. Where deployment access exists, verify deployment compatibility.

    If deployment cannot be performed from the available environment, document the remaining external verification instead of claiming deployment succeeded.

### External-service failure handling

No new external-service workflow is introduced in this PR.

For Mux:

- retain the current graceful fallback behaviour for an invalid configured playback ID
- retain graceful behaviour for playback failure
- do not introduce unrelated retries
- do not add server orchestration

For existing Google Calendar link generation:

- preserve current prototype behaviour
- do not convert it into Calendar API integration

---

## UI implementation requirements

The target visual change for this PR is **none**.

Preserve the existing Re-Embroidered Conversations visual language and page composition.

Specifically preserve:

- homepage section order
- navigation
- hero layout
- hero video
- typography
- colours
- backgrounds
- paper texture
- embroidery/stitch details
- spacing
- borders
- shadows
- responsive breakpoints
- booking UI layout
- horizontal date strip
- full-calendar modal
- time-slot controls
- session-format controls
- booking form
- boundaries acknowledgement
- confirmation page
- existing prototype utility controls
- motion and transitions where practical

Do not use this migration as an opportunity to:

- redesign components
- replace editorial copy
- alter the brand visual language
- introduce a new design system
- restructure content for stylistic reasons

Changes to markup are acceptable where required for:

- App Router
- accessibility
- Server Component / Client Component boundaries
- font loading
- metadata
- routing
- asset handling
- hydration correctness

Rendered output and interaction should remain equivalent.

Avoid hydration-dependent layout shifts or flashes of incorrect typography.

Because the migration changes the complete rendering/runtime model, browser-level parity verification is required where the environment permits it.

A passing Next.js production build alone is not sufficient evidence of UI parity.

---

## Acceptance criteria

### Behaviour

- [ ] The application runs using Next.js and the App Router.
- [ ] Vite is no longer required to run the application.
- [ ] The homepage renders successfully.
- [ ] The homepage contains the same sections in the same order as before migration.
- [ ] Desktop navigation remains functional.
- [ ] Tablet navigation remains functional.
- [ ] Mobile navigation remains functional.
- [ ] Smooth scrolling to page sections remains functional.
- [ ] The Mux hero player renders successfully.
- [ ] The Mux hero video plays successfully.
- [ ] The hero transcript interaction remains functional.
- [ ] The Mux player preserves fallback behaviour for an invalid configured playback ID.
- [ ] The prototype booking date selector remains functional.
- [ ] The prototype time-slot selector remains functional.
- [ ] Time-period filtering remains functional.
- [ ] Session-format selection remains functional.
- [ ] The booking form remains functional.
- [ ] Current booking form validation remains functional.
- [ ] Boundaries acknowledgement remains required by the prototype flow.
- [ ] The full-calendar modal remains functional.
- [ ] The booking prototype can transition to the confirmation experience.
- [ ] Confirmation is represented using Next.js-compatible routing.
- [ ] `/confirmation` renders the confirmation experience.
- [ ] Relevant existing confirmation query parameters continue to populate the prototype confirmation state.
- [ ] Back navigation from confirmation to the homepage works correctly.
- [ ] Client-only browser APIs do not throw during server rendering.
- [ ] Client-only browser APIs do not throw during production build.
- [ ] Normal navigation does not produce hydration errors.
- [ ] Normal booking prototype interaction does not produce hydration errors.
- [ ] No real booking backend is added.
- [ ] No Stripe integration is added.
- [ ] No Google Calendar API integration is added.
- [ ] No Google OAuth integration is added.
- [ ] No Google Meet integration is added.
- [ ] No persistence layer is added.
- [ ] No email integration is added.
- [ ] The session remains 55 minutes.
- [ ] The session price remains £55.
- [ ] Existing behaviour outside framework-specific migration changes remains unchanged.

### External integrations

- [ ] Existing Mux playback continues to work.
- [ ] No secret configuration is exposed to the browser.
- [ ] The optional Mux playback-ID override uses a Next.js-compatible configuration mechanism.
- [ ] Existing prototype Google Calendar URL generation remains prototype-only.
- [ ] No Stripe integration is introduced.
- [ ] No Google Calendar API integration is introduced.
- [ ] No Google OAuth integration is introduced.
- [ ] No Google Meet integration is introduced.

### Configuration

- [ ] `package.json` uses Next.js scripts.
- [ ] `next` is installed as an application dependency.
- [ ] Vite-only runtime dependencies are removed when no longer required.
- [ ] Next.js-required TypeScript configuration is present.
- [ ] `.next/` is ignored by Git.
- [ ] `import.meta.env` is no longer used.
- [ ] `VITE_MUX_PLAYBACK_ID` is replaced with the final Next.js-compatible environment-variable convention.
- [ ] `.env.example` accurately documents environment-variable visibility.
- [ ] Server-only environment variables are not exposed using `NEXT_PUBLIC_*`.
- [ ] `README.md` accurately describes how to install and run the migrated application.

### Routing

- [ ] App Router owns the application routes.
- [ ] No additional Pages Router structure is introduced.
- [ ] Manual top-level SPA route switching in `App.tsx` is removed or replaced.
- [ ] Confirmation navigation uses App Router-compatible behaviour.
- [ ] Existing relevant confirmation query parameters remain supported where required.
- [ ] Direct navigation to the confirmation route works.

### Server/client boundaries

- [ ] The root layout is a Server Component.
- [ ] `"use client"` is not added to the root layout.
- [ ] `"use client"` is used only where browser interactivity requires it.
- [ ] Primarily presentational sections remain Server Components where practical.
- [ ] Browser-only APIs are not evaluated during server rendering.
- [ ] Server-only modules are not imported into Client Components.
- [ ] The application is not wrapped in a broad client-only boundary merely to avoid migration issues.

### UI

- [ ] The existing page remains visually equivalent at a representative desktop viewport.
- [ ] The existing page remains visually equivalent at a representative tablet viewport where practical.
- [ ] The existing page remains visually equivalent at a representative mobile viewport.
- [ ] Cormorant Garamond renders as intended.
- [ ] Plus Jakarta Sans renders as intended.
- [ ] Existing Tailwind design tokens continue to apply.
- [ ] Existing paper/parchment styling remains intact.
- [ ] Local images retain intended dimensions and cropping.
- [ ] Mux video/poster retains intended dimensions and aspect ratio.
- [ ] Booking controls retain their current layout and states.
- [ ] Confirmation UI retains its current layout.
- [ ] Mobile navigation remains keyboard- and pointer-operable.
- [ ] Booking controls remain keyboard-operable.
- [ ] The calendar modal remains keyboard-operable.
- [ ] No migration-induced layout shift is introduced where avoidable.
- [ ] No visible hydration flash is introduced during normal page load.
- [ ] Any unavoidable visible difference caused by the migration is documented in the completion report.

### Code quality

- [ ] Existing repository guidance in `AGENTS.md` is followed.
- [ ] No unnecessary dependencies are introduced.
- [ ] No unrelated dependency upgrades are introduced.
- [ ] No unrelated refactors are included.
- [ ] No unrelated file moves are included.
- [ ] Type safety is preserved.
- [ ] No broad `any` casts are added to bypass migration errors.
- [ ] No hydration warnings are intentionally suppressed instead of fixed.
- [ ] Vite-only entry/configuration files are removed once unused.
- [ ] Obsolete Vite-only dependencies are removed.
- [ ] The configured lint/type-check command passes.
- [ ] The production Next.js build passes.
- [ ] Production startup succeeds where the environment permits verification.
- [ ] README and environment documentation reflect the migrated application accurately.

---

## Tests to add or update

The repository currently has no unit-test, integration-test, or Playwright configuration in the inspected application tree or `package.json`.

Do not introduce a broad new test architecture solely as part of this migration.

Browser-level verification is nevertheless important because the complete rendering/runtime model is changing.

### Unit tests

`N/A` unless the migration extracts deterministic helpers whose behaviour would otherwise be at risk.

Do not add unit tests for unchanged prototype booking business rules merely to increase coverage in this PR.

### Integration tests

`N/A`

This PR must not introduce integration behaviour for:

- persistence
- Stripe
- Google Calendar API
- Google Meet
- booking orchestration
- payment processing
- webhooks
- OAuth

If Next.js routing-specific integration coverage is already supported by repository tooling discovered during implementation, update it only as required for the migration.

### Browser tests

First verify whether browser-test infrastructure exists elsewhere in the repository.

If no browser framework exists, choose the smallest reliable verification approach.

Prefer one of:

1. documented deterministic browser smoke/parity verification using available application/deployment tooling; or
2. minimal Playwright smoke coverage if automated parity cannot otherwise be established reliably.

Do not introduce a large E2E architecture as part of this PR.

If Playwright is added, scope it to migration-critical behaviour such as:

- homepage loads
- major homepage sections render
- desktop navigation reaches the correct section
- mobile navigation opens and closes
- hero video component mounts without hydration/runtime errors
- booking date selection works
- booking time selection works
- full-calendar modal opens and closes
- prototype booking submission can reach confirmation
- `/confirmation` loads directly
- confirmation query parameters populate expected prototype content
- back navigation returns to the homepage
- representative mobile layout remains usable

Do not add booking backend tests in this PR.

### Visual regression tests

If browser automation is available or added, capture deterministic parity for representative desktop and mobile states.

Priority views:

- homepage / hero
- booking section
- full-calendar modal
- confirmation page

Visual differences should represent intentional framework adaptation only.

Do not blindly approve snapshot changes caused by:

- font-loading differences
- image sizing
- image optimization
- CSS ordering
- hydration
- browser timing
- animation state
- transitions
- current-date-dependent booking data

Control nondeterministic behaviour where necessary.

---

## Verification commands

Codex must inspect the final `package.json`, lockfile, and test configuration before running verification.

Do not invent scripts that are not present.

The current repository documents npm usage. Unless repository verification establishes a different canonical package manager, use npm.

At minimum, the completed migration should support:

```bash
npm install
npm run lint
npm run build
npm run start
```

If linting and type checking are split into separate scripts in the migrated application, run both, for example:

```bash
npm run lint
npm run typecheck
```

If browser tests are configured, run the actual repository script defined for them.

If visual regression tests are configured, run the actual repository script defined for them.

Verification must include:

- dependency installation succeeds
- TypeScript verification succeeds
- linting succeeds where configured
- production build succeeds
- production application starts where supported by the environment
- homepage loads
- confirmation route loads
- browser-interactive components do not produce runtime errors
- representative booking prototype interaction remains functional
- representative mobile navigation remains functional
- visual parity is checked where browser tooling permits it

Do not claim deployment is verified merely because `next build` succeeds.

Where an existing deployment or preview mechanism is available, verify the migrated application using that mechanism.

If deployment credentials or platform access are unavailable, document the exact external verification still required.

If any required command cannot be run in the available environment, document:

1. the command that should have been run;
2. why it could not be run;
3. what verification was performed instead.

Do not claim a command passed unless it was actually executed successfully.

---

## Completion report

When implementation is complete, provide a concise report containing the following sections.

### Changed

Summarise:

- Vite-to-Next.js App Router migration
- new App Router route/layout structure
- homepage migration
- confirmation-route migration
- Server Component / Client Component boundaries
- browser-only code adaptations
- Mux environment-variable migration
- font migration
- metadata migration
- global-style migration
- Tailwind migration
- asset handling
- removed Vite files
- removed Vite dependencies
- TypeScript/configuration changes
- README changes
- build-script changes

### Tests

List:

- tests added or updated
- browser smoke checks performed
- visual parity checks performed
- install command and result
- lint command and result
- type-check command and result where separate
- production build command and result
- production start/runtime check and result
- deployment/preview verification and result where available

Do not claim checks passed unless they were actually run.

### External configuration

List any required environment or deployment changes.

In particular, call out the final migration of:

```text
VITE_MUX_PLAYBACK_ID
```

to the chosen Next.js-compatible convention, expected to be:

```text
NEXT_PUBLIC_MUX_PLAYBACK_ID
```

unless the final implementation establishes a different appropriate configuration mechanism.

Also document whether existing:

```text
GEMINI_API_KEY
APP_URL
```

configuration remains required after repository usage is verified.

Do not list Stripe, Google Calendar API, OAuth, or Google Meet configuration because those integrations are explicitly outside this PR.

Use `None` when no external action is required.

### Deviations

Describe any meaningful deviation from:

- the existing UI
- existing behaviour
- this task specification

Explain why the deviation was technically necessary.

Use `None` when there were no meaningful deviations.

### Remaining issues

List unresolved migration limitations or external deployment checks that could not be completed.

Do not list future implementation of:

- booking persistence
- Stripe
- Google Calendar API
- Google Meet
- email delivery

as defects in this PR.

Those are intentionally excluded follow-up tasks.

Use `None` when the migration is fully complete and verified.
