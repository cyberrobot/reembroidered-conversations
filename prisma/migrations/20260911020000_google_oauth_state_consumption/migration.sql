CREATE TABLE "google_oauth_state_consumptions" (
    "stateHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_oauth_state_consumptions_pkey" PRIMARY KEY ("stateHash")
);

CREATE INDEX "google_oauth_state_consumptions_expires_at_idx"
ON "google_oauth_state_consumptions"("expiresAt");
