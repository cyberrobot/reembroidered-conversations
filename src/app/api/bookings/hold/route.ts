import { createBookingHold } from "../../../../lib/booking/booking-hold.mjs";
import { createBookingHoldHandler } from "../../../../lib/booking/booking-hold-handler.ts";

export const dynamic = "force-dynamic";

export const POST = createBookingHoldHandler(createBookingHold);
