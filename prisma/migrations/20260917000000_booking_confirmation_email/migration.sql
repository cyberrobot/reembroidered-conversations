ALTER TABLE "bookings"
ADD COLUMN "confirmationEmailSentAt" TIMESTAMPTZ(3),
ADD COLUMN "confirmationEmailId" TEXT;
