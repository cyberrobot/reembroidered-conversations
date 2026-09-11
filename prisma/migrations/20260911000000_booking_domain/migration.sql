CREATE TYPE "BookingStatus" AS ENUM ('HOLD', 'PAID', 'CONFIRMED', 'CANCELLED', 'REFUNDED');

CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'HOLD',
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "calendarEventId" TEXT,
    "meetingUrl" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookings_session_duration_check"
      CHECK ("endAt" = "startAt" + INTERVAL '55 minutes'),
    CONSTRAINT "bookings_expiry_after_creation_check"
      CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "bookings_stripe_checkout_session_id_key"
ON "bookings"("stripeCheckoutSessionId");

CREATE UNIQUE INDEX "bookings_stripe_payment_intent_id_key"
ON "bookings"("stripePaymentIntentId");

CREATE UNIQUE INDEX "bookings_calendar_event_id_key"
ON "bookings"("calendarEventId");

CREATE INDEX "bookings_start_at_idx" ON "bookings"("startAt");

CREATE INDEX "bookings_status_expires_at_idx"
ON "bookings"("status", "expiresAt");

-- Prisma cannot currently declare partial indexes, so this database-level index
-- is maintained explicitly in migration SQL.
CREATE UNIQUE INDEX "bookings_active_start_at_key"
ON "bookings"("startAt")
WHERE "status" IN ('HOLD', 'PAID', 'CONFIRMED');
