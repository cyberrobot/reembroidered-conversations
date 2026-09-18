import Link from "next/link";
import { AlertCircle, Clock3, LoaderCircle } from "lucide-react";
import {
  BookingConfirmationPage,
  type ConfirmedBookingView,
} from "@/components/BookingConfirmationPage";
import { BookingSuccessPoller } from "@/components/BookingSuccessPoller";
import { getBookingSuccessState } from "@/lib/booking/booking-success.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BookingSuccessPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const state = await getBookingSuccessState({
    bookingId:
      typeof params.booking_id === "string" ? params.booking_id : undefined,
    sessionId:
      typeof params.session_id === "string" ? params.session_id : undefined,
  });

  if (state.kind === "confirmed")
    return (
      <BookingConfirmationPage
        booking={state.booking as ConfirmedBookingView}
      />
    );

  const polling =
    state.kind === "confirming-payment" || state.kind === "finalising-booking";
  const content = {
    "confirming-payment": {
      eyebrow: "Secure payment",
      title: "Confirming your payment…",
      body: "We are waiting for secure confirmation from Stripe. You do not need to pay again or restart Checkout.",
      icon: (
        <LoaderCircle
          className="h-9 w-9 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      ),
    },
    "finalising-booking": {
      eyebrow: "Payment received",
      title: "We’re preparing your booking.",
      body: "Your payment is secure. We’re finalising your calendar invitation and Google Meet link.",
      icon: <Clock3 className="h-9 w-9" aria-hidden="true" />,
    },
    invalid: {
      eyebrow: "Booking link",
      title: "We couldn’t verify this booking link.",
      body: "Please use the complete link supplied after Checkout. No booking details have been shown.",
      icon: <AlertCircle className="h-9 w-9" aria-hidden="true" />,
    },
    inactive: {
      eyebrow: "Booking status",
      title: "This booking is no longer active.",
      body: "This link does not represent an active confirmed reservation. Please contact Shahd if you need help.",
      icon: <AlertCircle className="h-9 w-9" aria-hidden="true" />,
    },
    unavailable: {
      eyebrow: "Temporarily unavailable",
      title: "We can’t check your booking just now.",
      body: "Your booking may still be processing. Please wait a moment and check again.",
      icon: <AlertCircle className="h-9 w-9" aria-hidden="true" />,
    },
  }[state.kind];

  return (
    <main className="paper-grain flex min-h-screen items-center bg-[#FAF8F5] px-4 py-16 text-[#282524] sm:px-6">
      <section
        aria-live={polling ? "polite" : undefined}
        aria-busy={polling}
        className="relative mx-auto w-full max-w-xl overflow-hidden rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-8 text-center shadow-sm sm:p-12"
      >
        <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-[#8C4038] via-[#A35048] to-[#C47065]" />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#E8DFD5] bg-[#FAF2EB] text-[#A35048]">
          {content.icon}
        </div>
        <p className="mt-6 text-xs font-medium uppercase tracking-widest text-[#A35048]">
          {content.eyebrow}
        </p>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl">
          {content.title}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[#68635F]">
          {content.body}
        </p>
        <BookingSuccessPoller active={polling} />
        {!polling && (
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            {state.kind === "unavailable" && (
              <Link
                href=""
                className="rounded-full border border-[#CDBFB2] bg-white px-5 py-3 text-sm font-medium text-[#282524]"
              >
                Check again
              </Link>
            )}
            <Link
              href="/"
              className="rounded-full bg-[#282524] px-6 py-3 text-sm font-medium text-white"
            >
              Return home
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
