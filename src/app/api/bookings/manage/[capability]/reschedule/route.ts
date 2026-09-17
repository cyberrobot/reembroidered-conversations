import { authenticateBookingManagementCapability } from '@/lib/booking/booking-management.mjs';
import { createRescheduleHandler } from '@/lib/booking/booking-management-handler';
import { rescheduleBookingWithDefaultDependencies } from '@/lib/booking/booking-reschedule.mjs';

export const dynamic = 'force-dynamic';

const handler = createRescheduleHandler(
  authenticateBookingManagementCapability,
  rescheduleBookingWithDefaultDependencies,
);

export async function POST(request: Request, context: { params: Promise<{ capability: string }> }) {
  const { capability } = await context.params;
  return handler(request, capability);
}
