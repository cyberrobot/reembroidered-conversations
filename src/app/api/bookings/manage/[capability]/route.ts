import { getBookingManagementState } from '@/lib/booking/booking-management.mjs';
import { createManagementStateHandler } from '@/lib/booking/booking-management-handler';

export const dynamic = 'force-dynamic';

const handler = createManagementStateHandler(getBookingManagementState);

export async function GET(request: Request, context: { params: Promise<{ capability: string }> }) {
  const { capability } = await context.params;
  return handler(request, capability);
}
