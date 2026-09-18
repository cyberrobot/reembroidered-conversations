import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function PaymentReturn({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const destination = new URL("/booking/success", "http://compatibility.local");
  if (typeof params.booking_id === "string")
    destination.searchParams.set("booking_id", params.booking_id);
  if (typeof params.session_id === "string")
    destination.searchParams.set("session_id", params.session_id);
  redirect(`${destination.pathname}${destination.search}`);
}
