CREATE TABLE "abuse_rate_limits" (
  "key" TEXT NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "abuse_rate_limits_pkey" PRIMARY KEY ("key", "windowStart")
);
CREATE INDEX "abuse_rate_limits_expires_at_idx" ON "abuse_rate_limits"("expiresAt");

CREATE TABLE "abuse_hold_permits" (
  "id" UUID NOT NULL,
  "clientKey" TEXT NOT NULL,
  "bookingId" UUID,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "abuse_hold_permits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "abuse_hold_permits_booking_id_key" UNIQUE ("bookingId")
);
CREATE INDEX "abuse_hold_permits_client_expiry_idx" ON "abuse_hold_permits"("clientKey", "expiresAt");

