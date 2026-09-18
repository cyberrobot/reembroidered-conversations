import { cancelBookingWithDefaultDependencies } from "@/lib/booking/booking-cancellation.mjs";
import { authenticateBookingManagementCapability } from "@/lib/booking/booking-management.mjs";
import { createCancellationHandler } from "@/lib/booking/booking-management-handler";

export const dynamic = "force-dynamic";

const handler = createCancellationHandler(
  authenticateBookingManagementCapability,
  cancelBookingWithDefaultDependencies,
);

export async function POST(
  request: Request,
  context: { params: Promise<{ capability: string }> },
) {
  const { capability } = await context.params;
  return handler(request, capability);
}
