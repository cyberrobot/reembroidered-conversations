# Re-Embroidered Conversations

A Next.js App Router application for Re-Embroidered Conversations, a website for
booking prototype one-to-one listening sessions with Shahd Karaeen.

## Run Locally

**Prerequisites:** Node.js 20.9 or later and npm.


1. Install dependencies with `npm install`.
2. Optionally copy `.env.example` to `.env.local` and set
   `NEXT_PUBLIC_MUX_PLAYBACK_ID` to override the built-in Mux playback ID.
3. Start development with `npm run dev`, then open <http://localhost:3000>.

## Production

Build and run the production server:

```bash
npm run build
npm run start
```

The application does not require `GEMINI_API_KEY` or `APP_URL`; neither variable
is used by the migrated application. The booking and confirmation experiences are
client-side prototypes and do not create real bookings or payments.

## Verification

Run the deterministic date tests and TypeScript check:

```bash
npm test
npm run lint
```

The migration-focused browser suite builds and starts the production application,
then verifies routes, responsive layouts, and critical prototype interactions in
Chromium:

```bash
npx playwright install chromium
npm run test:browser
```

The browser run writes its inspectable HTML report and screenshot attachments to
`playwright-report/`.
