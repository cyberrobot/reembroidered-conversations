# Re-Embroidered Conversations

A Next.js App Router application for Re-Embroidered Conversations, a website for
booking prototype one-to-one listening sessions with Shahd Karaeen.

## Run Locally

**Prerequisites:** Node.js 20.9 or later and npm.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`. Set the server-only `DATABASE_URL` to a
   PostgreSQL connection string. `NEXT_PUBLIC_MUX_PLAYBACK_ID` remains optional.
3. Apply the committed database migrations with `npm run db:migrate:deploy`.
4. Start development with `npm run dev`, then open <http://localhost:3000>.

`npm install` generates Prisma Client automatically. After editing the schema,
run `npm run db:generate`; validate it with `npm run db:validate`. To create a
new development migration, use `npm run db:migrate:dev` against a disposable
development database. Deployments should apply only committed migrations with
`npm run db:migrate:deploy`.

## Production

Build and run the production server:

```bash
npm run build
npm run start
```

The application does not require `GEMINI_API_KEY` or `APP_URL`; neither variable
is used by the migrated application. `DATABASE_URL` must be supplied only to
server/database processes and must not use a `NEXT_PUBLIC_` prefix. The booking
and confirmation experiences remain client-side prototypes and do not create
real bookings or payments.

## Verification

Audit the complete dependency graph before merging:

```bash
npm run security:audit
```

High and critical findings must be resolved before merge. The `deepmerge-ts`
override raises Prisma's `@prisma/config` transitive dependency to 8.0.2 (the
minimum safe version is 8.0.0), and the `mysql2` override raises Prisma CLI's
transitive dependency to 3.24.4 (the minimum safe version is 3.22.0). These are
temporary security pins and should be removed once a compatible stable Prisma
release carries the patched dependencies itself.

Run the deterministic date tests and TypeScript check:

```bash
npm test
npm run lint
```

To run the database invariant test after applying migrations to a disposable
PostgreSQL database, set `DATABASE_SCHEMA_TEST_URL` for that command only:

```bash
DATABASE_SCHEMA_TEST_URL="$DATABASE_URL" npm test
```

Never point the schema invariant test at shared or production data.

The migration-focused browser suite builds and starts the production application,
then verifies routes, responsive layouts, and critical prototype interactions in
Chromium:

```bash
npx playwright install chromium
npm run test:browser
```

The browser run writes its inspectable HTML report and screenshot attachments to
`playwright-report/`.
