import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Coffee,
  CreditCard,
  ExternalLink,
  Mail,
  ShieldCheck,
  Video,
} from "lucide-react";
import { BookingReference } from "@/components/BookingReference";
import { Navigation } from "@/components/Navigation";

export interface ConfirmedBookingView {
  id: string;
  name: string;
  email: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  timezoneName?: string;
  durationMinutes: number;
  paymentLabel: string;
  meetingUrl: string;
}

export function BookingConfirmationPage({
  booking,
}: {
  booking: ConfirmedBookingView;
}) {
  return (
    <div className="paper-grain min-h-screen overflow-x-hidden bg-[#FAF8F5] pb-20 font-sans text-[#282524] selection:bg-[#F2E5D9]">
      <Navigation />

      <main className="mx-auto max-w-3xl px-4 pt-28 sm:px-6 sm:pt-32">
        <article className="relative overflow-hidden rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-6 shadow-sm sm:p-12">
          <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-[#8C4038] via-[#A35048] to-[#C47065]" />
          <div className="mx-auto max-w-xl space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#E8DFD5] bg-[#FAF2EB] text-[#A35048] shadow-xs">
              <CheckCircle2
                className="h-9 w-9 stroke-[1.75]"
                aria-hidden="true"
              />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#E8DFD5] bg-[#FAF2EB] px-3.5 py-1 text-xs font-medium text-[#8C4038]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Reservation confirmed &amp; secured
            </div>
            <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl md:text-5xl">
              Your conversation with Shahd Karaeen is reserved.
            </h1>
            <p className="text-sm font-light leading-relaxed text-[#68635F] sm:text-base">
              Thank you,{" "}
              <strong className="font-medium text-[#282524]">
                {booking.name}
              </strong>
              . Your listening session is confirmed.
            </p>
            <BookingReference bookingId={booking.id} />
          </div>

          <section
            aria-label="Booking details"
            className="mt-8 space-y-5 rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E8DFD5] pb-4 text-xs">
              <span className="flex items-center gap-1.5 text-[#78716C]">
                <CreditCard
                  className="h-4 w-4 text-[#A35048]"
                  aria-hidden="true"
                />
                Payment status
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D0E7D7] bg-[#EAF5EE] px-3 py-1 font-medium text-[#2E6B48]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#2E6B48]"
                  aria-hidden="true"
                />
                {booking.paymentLabel}
              </span>
            </div>
            <dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
              <Detail
                icon={<Calendar className="h-4 w-4" />}
                label="Date of Conversation"
                value={booking.date}
              />
              <Detail
                icon={<Clock className="h-4 w-4" />}
                label="Time & Duration"
                value={`${booking.startTime}–${booking.endTime}${booking.timezoneName ? ` (${booking.timezoneName})` : ""} · ${booking.durationMinutes} min`}
              />
              <Detail
                icon={<Video className="h-4 w-4" />}
                label="Conversation Format"
                value="Private video meeting via Google Meet"
              />
              <Detail
                icon={<Mail className="h-4 w-4" />}
                label="Confirmation Sent To"
                value={booking.email}
              />
            </dl>
          </section>

          <div className="relative my-8 text-left">
            <div className="absolute inset-0 -z-10 translate-x-1.5 translate-y-1.5 rounded-2xl border border-[#E3D5C5] bg-[#F1E7DD]" />
            <div className="rounded-2xl border border-[#EAE0D5] border-l-4 border-l-[#A35048] bg-gradient-to-br from-[#FDFBF8] via-[#FAF6F1] to-[#F5EEE6] p-6 shadow-xs sm:p-7">
              <div className="mb-2.5 flex items-center gap-2 font-serif text-xs uppercase tracking-wider text-[#A35048]">
                <Coffee className="h-4 w-4" aria-hidden="true" />A quiet note
                before our conversation
              </div>
              <p className="font-serif text-base italic leading-relaxed text-[#3E3A37] sm:text-lg">
                When the time comes, find a quiet place where you won’t be
                interrupted and use the Google Meet link below. I am looking
                forward to meeting you.
              </p>
              <span className="mt-3 block text-right text-xs font-medium text-[#78716C]">
                — Shahd Karaeen
              </span>
            </div>
          </div>

          <div className="text-center">
            <a
              href={booking.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#A35048] px-6 py-3 text-sm font-medium text-white outline-none transition hover:bg-[#8C4038] focus-visible:ring-2 focus-visible:ring-[#A35048] focus-visible:ring-offset-2 sm:w-auto"
            >
              <Video className="h-4 w-4" aria-hidden="true" />
              Join Google Meet
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
            <p className="mt-3 break-words text-xs text-[#78716C]">
              Google Calendar will also send its normal invitation to the email
              used for booking.
            </p>
          </div>

          <footer className="mt-10 border-t border-[#E8DFD5] pt-6 text-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#282524] px-6 py-3 text-xs font-medium text-[#FAF8F5] outline-none transition hover:bg-[#3D3835] focus-visible:ring-2 focus-visible:ring-[#A35048] focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Return to Re-Embroidered Conversations
            </Link>
          </footer>
        </article>
      </main>
    </div>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <div
        className="mt-0.5 shrink-0 rounded-lg bg-[#F5EFE9] p-2 text-[#A35048]"
        aria-hidden="true"
      >
        {icon}
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-[#78716C]">{label}</dt>
        <dd className="break-words font-medium text-[#282524]">{value}</dd>
      </div>
    </div>
  );
}
