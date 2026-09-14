CREATE TABLE "google_calendar_connections" (
    "id" TEXT NOT NULL,
    "googleSubject" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarSummary" TEXT NOT NULL,
    "calendarTimeZone" TEXT,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "grantedScopes" TEXT[] NOT NULL,
    "connectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "google_calendar_connections_pkey" PRIMARY KEY ("id")
);
