import type { Metadata } from "next";
import {
  BookingManagementPage,
  type BookingManagementState,
} from "@/components/BookingManagementPage";
import { getBookingManagementState } from "@/lib/booking/booking-management.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Manage your booking — Re-Embroidered Conversations",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ capability: string }>;
}) {
  const { capability } = await params;
  const state = await getBookingManagementState(capability, new Date());
  return (
    <BookingManagementPage
      capability={state.kind === "invalid" ? undefined : capability}
      initialState={state as BookingManagementState}
    />
  );
}
