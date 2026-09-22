import { runBookingReconciliation } from "../../../../../lib/booking/booking-reconciliation.mjs";
import { createBookingReconciliationHandler } from "../../../../../lib/booking/booking-reconciliation-handler.ts";

export const dynamic = "force-dynamic";

export const POST = createBookingReconciliationHandler(
  runBookingReconciliation,
);
