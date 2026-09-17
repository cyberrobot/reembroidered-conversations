ALTER TABLE "bookings"
ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
ADD COLUMN "cancellationRefundDue" BOOLEAN,
ADD COLUMN "calendarCancelledAt" TIMESTAMPTZ(3),
ADD COLUMN "stripeRefundId" TEXT,
ADD COLUMN "stripeRefundStatus" TEXT,
ADD COLUMN "refundRequestedAt" TIMESTAMPTZ(3),
ADD COLUMN "refundedAt" TIMESTAMPTZ(3),
ADD COLUMN "rescheduledAt" TIMESTAMPTZ(3),
ADD COLUMN "rescheduleSourceBookingId" UUID;

CREATE UNIQUE INDEX "bookings_stripe_refund_id_key"
ON "bookings"("stripeRefundId");

-- A confirmed booking can own at most one replacement reservation at a time.
-- PostgreSQL permits multiple NULL values, so completed/abandoned holds clear the
-- link and do not prevent a later reschedule.
CREATE UNIQUE INDEX "bookings_reschedule_source_booking_id_key"
ON "bookings"("rescheduleSourceBookingId");

ALTER TABLE "bookings"
ADD CONSTRAINT "bookings_reschedule_source_booking_id_fkey"
FOREIGN KEY ("rescheduleSourceBookingId") REFERENCES "bookings"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- bookings_active_start_at_key is intentionally unchanged. Linked reschedule
-- holds use status HOLD, so they own the replacement slot until the atomic swap.
