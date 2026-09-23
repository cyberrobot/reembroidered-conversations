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

## Environment variables

Configure the production web service in Railway with the following environment variables.

Configure these on the Railway **web service**.

| Variable                         | Production value                                                       |
| -------------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                   | Railway production PostgreSQL connection string                        |
| `APP_URL`                        | `https://example.com`                                                  |
| `STRIPE_SECRET_KEY`              | Stripe live secret/restricted API key                                  |
| `STRIPE_WEBHOOK_SECRET`          | Production Stripe webhook signing secret (`whsec_...`)                 |
| `GOOGLE_OAUTH_CLIENT_ID`         | Production Google OAuth client ID                                      |
| `GOOGLE_OAUTH_CLIENT_SECRET`     | Production Google OAuth client secret                                  |
| `GOOGLE_ADMIN_EMAIL`             | Practitioner Google account permitted to connect                       |
| `GOOGLE_TOKEN_ENCRYPTION_KEY`    | Base64 encoding of exactly 32 random bytes                             |
| `ADMIN_SESSION_SECRET`           | High-entropy secret, minimum 32 bytes                                  |
| `RESEND_API_KEY`                 | Production Resend API key                                              |
| `BOOKING_EMAIL_FROM`             | Verified production sender                                             |
| `BOOKING_CHANGES_URL`            | `https://example.com/booking/manage`                                   |
| `BOOKING_MANAGEMENT_SECRET`      | High-entropy booking-management signing secret                         |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Production Cloudflare Turnstile site key                               |
| `TURNSTILE_SECRET_KEY`           | Production Turnstile secret                                            |
| `TURNSTILE_EXPECTED_HOSTNAME`    | Production hostname only, e.g. `example.com`                           |
| `TRUSTED_CLIENT_IP_HEADER`       | `cf-connecting-ip` when traffic is securely proxied through Cloudflare |
| `ABUSE_PROTECTION_HMAC_SECRET`   | High-entropy secret, minimum 32 bytes                                  |
| `BOOKING_RECONCILIATION_SECRET`  | High-entropy shared reconciliation secret                              |
| `NEXT_PUBLIC_MUX_PLAYBACK_ID`    | Optional Mux playback ID override                                      |

Never expose server secrets using a `NEXT_PUBLIC_` variable.

If the production hostname is proxied through Cloudflare, also set:

```env
TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip
```

Leave it unset if Cloudflare is used only for Turnstile or the DNS record is **DNS only**.

`NEXT_PUBLIC_MUX_PLAYBACK_ID` is optional and may remain unset.

## Generate production secrets

Generate independent production-only secrets for:

- `ADMIN_SESSION_SECRET`
- `BOOKING_MANAGEMENT_SECRET`
- `ABUSE_PROTECTION_HMAC_SECRET`
- `BOOKING_RECONCILIATION_SECRET`

```bash
openssl rand -base64 48
```

Generate the Google token encryption key separately. It must be the Base64 encoding of exactly 32 random bytes:

```bash
openssl rand -base64 32
```

Use the result as:

```env
GOOGLE_TOKEN_ENCRYPTION_KEY=...
```

Do not reuse local or staging secrets.

## Railway configuration

The web service listens on port `3000` and should use Node.js 22.

Use the Railway PostgreSQL service reference for `DATABASE_URL`; do not point production at a local or staging database.

`BOOKING_RECONCILIATION_SECRET` must also be configured with the same value on the Railway reconciliation cron service.

Never expose server-only secrets using a `NEXT_PUBLIC_` prefix.

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

## Google Calendar OAuth setup

1. In Google Cloud, enable the **Google Calendar API**.

2. Open **Google Auth Platform** and configure:
   - **Audience:** External
   - **Publishing status:** In production for production use
   - **Branding:** app name, support/contact email, homepage, privacy policy and terms

3. Under **Data Access**, add:
   - `openid`
   - `https://www.googleapis.com/auth/userinfo.email`
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.freebusy`
   - `https://www.googleapis.com/auth/calendar.events.owned`

4. Under **Clients**, create a **Web application** OAuth client.

5. Add this authorized redirect URI:

   ```text
   <APP_URL>/api/admin/google-calendar/callback
   ```

   Example:

   ```text
   https://example.com/api/admin/google-calendar/callback
   ```

6. Configure these environment variables:

   ```env
   APP_URL=https://example.com
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_ADMIN_EMAIL=provider@example.com
   GOOGLE_TOKEN_ENCRYPTION_KEY=...
   ADMIN_SESSION_SECRET=...
   ```

7. Deploy the application, then open the Google Calendar connect endpoint and authorize the Google account matching `GOOGLE_ADMIN_EMAIL`.

Do not reuse development OAuth credentials or databases in production.

## Stripe

Use Stripe **live mode** credentials in production.

Configure:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

### Production Webhook

Create a Stripe webhook/event destination for:

```text
https://example.com/api/stripe/webhook
```

Configure it with:

```text
Events from: Your account
Payload style: Snapshot
API version: 2026-08-26.dahlia
```

Listen only for:

```text
checkout.session.completed
checkout.session.expired
```

After creating the destination, reveal its signing secret:

```text
whsec_...
```

Store it in Railway as:

```text
STRIPE_WEBHOOK_SECRET
```

The webhook must remain enabled. Successful payments rely on it to transition bookings and continue Calendar/Meet finalisation.

Do not use the webhook secret generated by `stripe listen` in production.

## Resend

Configure a production sender/domain in Resend and complete the required DNS verification.

Set:

```text
RESEND_API_KEY
BOOKING_EMAIL_FROM
```

Example:

```text
BOOKING_EMAIL_FROM=Re-Embroidered Conversations <bookings@example.com>
```

The sender must be permitted by the configured Resend account/domain.

## Cloudflare Turnstile

Create a production Turnstile widget for the production hostname.

Configure:

```text
NEXT_PUBLIC_TURNSTILE_SITE_KEY
TURNSTILE_SECRET_KEY
TURNSTILE_EXPECTED_HOSTNAME
```

`TURNSTILE_EXPECTED_HOSTNAME` is the hostname only:

```text
example.com
```

Do not include:

```text
https://
```

or a path.

For Cloudflare-proxied production traffic:

```text
TRUSTED_CLIENT_IP_HEADER=cf-connecting-ip
```

Only trust this header when the production origin is protected from clients bypassing Cloudflare and supplying the header themselves.

## Booking Reconciliation Cron

Production recovery runs as a separate short-lived Railway cron service built from this repository.

Configure:

```text
Start command: npm run booking:reconcile:scheduled
Cron schedule: */10 * * * *
Restart policy: Never
Public domain: Not required
```

The schedule is UTC.

Set these variables on the cron service:

```text
APP_URL=https://example.com
BOOKING_RECONCILIATION_SECRET=<same value as web service>
```

`BOOKING_RECONCILIATION_SECRET` must also exist on the web service.

The cron process calls:

```text
POST /api/internal/bookings/reconcile
```

and exits after each reconciliation run.

Do not put the reconciliation secret in a URL, command argument or repository file.

## Deployment Order

For a new production environment:

1. Create the Railway production project.
2. Create the production PostgreSQL service.
3. Create the Railway web service from this repository.
4. Configure Node.js 22.
5. Create/configure the production domain and Cloudflare.
6. Set all production environment variables.
7. Configure Google OAuth.
8. Configure Stripe live credentials and webhook.
9. Configure Resend.
10. Configure Cloudflare Turnstile.
11. Apply Prisma migrations.
12. Deploy the web service.
13. Complete the production Google Calendar connection.
14. Create the Railway reconciliation cron service.
15. Verify the complete booking lifecycle.

## Production Verification

After deployment verify:

```text
Homepage loads over HTTPS
Turnstile completes successfully
Availability loads from the connected Google Calendar
A booking hold can be created
Stripe Checkout opens in live mode
Successful payment reaches the Stripe webhook
Booking reaches CONFIRMED
Google Calendar event is created
Google Meet URL is created
Customer receives the Calendar invitation
Customer receives the branded confirmation email
Booking-management link opens
Cancellation/refund behaviour works as configured
Rescheduling works
Reconciliation cron runs successfully
```

Check Railway, Stripe, Google and Resend logs for failures during the first end-to-end production booking.

## Subsequent Deployments

For normal production releases:

```bash
npm ci
npm run build
npm run db:migrate:deploy
```

Deploy the web service only after CI succeeds.

Do not recreate or overwrite persistent production secrets during routine deployments.

When a deployment introduces a new environment variable, provider configuration change or database migration, apply that production configuration before enabling code that depends on it.
