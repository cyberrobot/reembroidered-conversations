import { notFound } from "next/navigation";
import {
  BookingManagementPage,
  type BookingManagementState,
} from "@/components/BookingManagementPage";

export const dynamic = "force-dynamic";

const booking = {
  name: "Sarah Jenkins",
  email: "sarah.j@example.test",
  startAt: "2035-01-08T10:00:00.000Z",
  endAt: "2035-01-08T10:55:00.000Z",
  timezone: "Europe/London",
  durationMinutes: 55,
  amountPaid: "£55.00",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
};

const states: Record<string, BookingManagementState> = {
  active: {
    kind: "active",
    booking,
    cancellation: { refundEligible: true, cutoffHours: 24 },
  },
  cancelled: {
    kind: "cancelled",
    booking,
    cancellation: {
      cancelledAt: "2034-12-01T10:00:00.000Z",
      refundEligible: true,
      refundStatus: "pending",
      calendarStatus: "cancelled",
    },
  },
  invalid: { kind: "invalid" },
};

export default async function BookingManagementVisualFixture({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  if (process.env.BOOKING_MANAGEMENT_VISUAL_FIXTURES !== "enabled") notFound();
  const { scenario } = await params;
  const state = states[scenario];
  if (!state) notFound();
  return (
    <BookingManagementPage capability="visual-fixture" initialState={state} />
  );
}
