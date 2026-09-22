# Railway booking reconciliation schedule

Production booking reconciliation runs as a separate short-lived Railway cron
service built from this repository. Railway cron jobs execute a service start
command and require the process to exit after each run.

Configure the service with:

- **Start command:** `npm run booking:reconcile:scheduled`
- **Cron schedule:** `*/10 * * * *` (UTC)
- **Restart policy:** Never
- **Public domain:** Not required

Set these variables on the cron service:

- `APP_URL`: the canonical HTTPS origin of the production web service
- `BOOKING_RECONCILIATION_SECRET`: the same high-entropy value configured on
  the web service

Set `BOOKING_RECONCILIATION_SECRET` on the web service as well. Do not put the
secret in a URL, command argument, or repository file.

The cron process sends an authenticated `POST` request to
`/api/internal/bookings/reconcile`, prints only aggregate results, and exits.
Railway skips an invocation when the previous execution remains active, while
the reconciliation operations themselves remain safe if another trigger or
provider callback overlaps the run.

Railway project state is currently managed outside this repository. The cron
service and schedule therefore need to be created in the Railway dashboard.
Do not add a project-level `.railway/railway.ts` without first importing and
reviewing the existing project, because an incomplete project definition can
remove resources that it omits.
