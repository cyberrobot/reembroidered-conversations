import { getAvailableSlots } from "../../../lib/availability/available-slots.mjs";
import { createAvailabilityHandler } from "../../../lib/availability/availability-handler.ts";

export const dynamic = "force-dynamic";

export const GET = createAvailabilityHandler(getAvailableSlots);
