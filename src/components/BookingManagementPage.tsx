"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CalendarX,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Info,
  Lock,
  RotateCcw,
  ShieldCheck,
  Video,
} from "lucide-react";
import { Navigation } from "./Navigation";
import { AvailabilityPicker } from "./availability/AvailabilityPicker";
import { useAvailability } from "../hooks/useAvailability";

export interface ManagementBookingView {
  name: string;
  email: string;
  startAt: string;
  endAt: string;
  timezone: string;
  durationMinutes: number;
  amountPaid: string;
  meetingUrl?: string | null;
}

type RefundStatus =
  | "not_applicable"
  | "not_decided"
  | "pending"
  | "processing"
  | "refunded"
  | "needs_attention";

export type BookingManagementState =
  | { kind: "invalid" | "unavailable" }
  | { kind: "inactive" | "past"; booking: ManagementBookingView }
  | {
      kind: "active";
      booking: ManagementBookingView;
      cancellation: { refundEligible: boolean; cutoffHours: number };
    }
  | {
      kind: "reschedule_pending";
      booking: ManagementBookingView;
      target: { startAt: string; endAt: string; timezone: string };
      cancellation: { refundEligible: boolean; cutoffHours: number };
    }
  | {
      kind: "cancelled";
      booking: ManagementBookingView;
      cancellation: {
        cancelledAt: string | null;
        refundEligible: boolean;
        refundStatus: RefundStatus;
        calendarStatus: "cancelled" | "pending";
      };
    };

type ManagementStep =
  | "overview"
  | "reschedule_select"
  | "reschedule_review"
  | "reschedule_processing"
  | "reschedule_success"
  | "reschedule_conflict"
  | "reschedule_pending"
  | "cancel_confirm"
  | "cancel_processing"
  | "cancel_success";

interface BookingManagementPageProps {
  capability?: string;
  initialState: BookingManagementState;
}

function bookingPresentation(booking: ManagementBookingView) {
  const start = new Date(booking.startAt);
  const end = new Date(booking.endAt);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: booking.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(start);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: booking.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const zone =
    new Intl.DateTimeFormat("en-GB", {
      timeZone: booking.timezone,
      timeZoneName: "short",
    })
      .formatToParts(start)
      .find((part) => part.type === "timeZoneName")?.value ?? booking.timezone;
  return { date, time: `${time.format(start)}–${time.format(end)}`, zone };
}

function focusTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function BookingManagementPage({
  capability,
  initialState,
}: BookingManagementPageProps) {
  const [managementState, setManagementState] = useState(initialState);
  const [booking, setBooking] = useState(
    "booking" in initialState ? initialState.booking : null,
  );
  const [step, setStep] = useState<ManagementStep>("overview");
  const {
    availableDays,
    status: availabilityStatus,
    refresh: refreshAvailability,
  } = useAvailability({ enabled: step === "reschedule_select" });
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [message, setMessage] = useState("");
  const mutationInFlight = useRef(false);
  const focusRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    focusRef.current?.focus();
  }, [step, managementState.kind]);

  const activeDay = availableDays.find((day) => day.date === selectedDate);
  const selectedSlot = activeDay?.slots.find(
    (slot) => slot.id === selectedSlotId,
  );
  const current = booking ? bookingPresentation(booking) : null;
  const selected = useMemo(
    () =>
      selectedSlot && booking
        ? bookingPresentation({
            ...booking,
            startAt: selectedSlot.startAt,
            endAt: selectedSlot.endAt,
          })
        : null,
    [booking, selectedSlot],
  );

  const moveTo = (next: ManagementStep, nextMessage = "") => {
    setMessage(nextMessage);
    setStep(next);
    focusTop();
  };

  const submitReschedule = async (pendingStartAt?: string) => {
    const requestedStartAt = pendingStartAt ?? selectedSlot?.startAt;
    if (!capability || !requestedStartAt || mutationInFlight.current) return;
    mutationInFlight.current = true;
    moveTo("reschedule_processing");
    try {
      const response = await fetch(
        `/api/bookings/manage/${encodeURIComponent(capability)}/reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startAt: requestedStartAt }),
        },
      );
      const body = await response.json();
      if (response.ok && body?.status === "rescheduled" && body.booking) {
        const updatedBooking = booking
          ? { ...booking, ...body.booking }
          : body.booking;
        setBooking(updatedBooking);
        if (managementState.kind === "reschedule_pending") {
          setManagementState({
            kind: "active",
            booking: updatedBooking,
            cancellation: managementState.cancellation,
          });
        }
        moveTo("reschedule_success");
      } else if (body?.error?.code === "slot_unavailable") {
        refreshAvailability();
        moveTo("reschedule_conflict");
      } else if (
        body?.error?.code === "reconciliation_pending" ||
        body?.error?.code === "change_in_progress"
      ) {
        moveTo("reschedule_pending", body.error.message);
      } else {
        if (
          managementState.kind === "reschedule_pending" &&
          body?.error?.code === "calendar_unavailable"
        ) {
          setManagementState({
            kind: "active",
            booking,
            cancellation: managementState.cancellation,
          });
        }
        moveTo(
          "reschedule_conflict",
          body?.error?.message ??
            "Your original booking remains protected. Please try again.",
        );
      }
    } catch {
      moveTo(
        "reschedule_pending",
        "We could not confirm the provider response. Both times remain protected while the change is reconciled.",
      );
    } finally {
      mutationInFlight.current = false;
    }
  };

  const submitCancellation = async () => {
    if (
      !capability ||
      mutationInFlight.current ||
      !booking ||
      managementState.kind !== "active"
    )
      return;
    const expectedRefundEligible = managementState.cancellation.refundEligible;
    mutationInFlight.current = true;
    moveTo("cancel_processing");
    try {
      const response = await fetch(
        `/api/bookings/manage/${encodeURIComponent(capability)}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expectedRefundEligible }),
        },
      );
      const body = await response.json();
      if (
        body?.error?.code === "refund_policy_changed" &&
        typeof body?.cancellation?.refundEligible === "boolean"
      ) {
        setManagementState({
          ...managementState,
          cancellation: {
            refundEligible: body.cancellation.refundEligible,
            cutoffHours:
              body.cancellation.cutoffHours ??
              managementState.cancellation.cutoffHours,
          },
        });
        moveTo("cancel_confirm", body.error.message);
        return;
      }
      if (!response.ok || !["cancelled", "refunded"].includes(body?.status)) {
        moveTo(
          "cancel_confirm",
          body?.error?.message ??
            "We could not confirm the cancellation. Please try again.",
        );
        return;
      }
      const refundStatus: RefundStatus = body.refund?.status ?? "pending";
      const cancelledState: BookingManagementState = {
        kind: "cancelled",
        booking,
        cancellation: {
          cancelledAt: body.cancelledAt,
          refundEligible: Boolean(body.refund?.eligible),
          refundStatus,
          calendarStatus: body.calendar?.status ?? "pending",
        },
      };
      setManagementState(cancelledState);
      setMessage(
        body.externalFollowUpPending
          ? "Your booking is cancelled. One or more provider updates are still being safely reconciled."
          : "",
      );
      setStep("cancel_success");
      focusTop();
    } catch {
      setMessage(
        "We could not reach booking management. Please check this page before trying again.",
      );
      setStep("cancel_confirm");
      focusTop();
    } finally {
      mutationInFlight.current = false;
    }
  };

  return (
    <div className="paper-grain relative min-h-screen overflow-x-hidden bg-[#FAF8F5] pb-24 font-sans text-[#282524] selection:bg-[#F2E5D9]">
      <Navigation />
      <main className="mx-auto max-w-3xl px-4 pt-28 sm:px-6 sm:pt-36">
        <div aria-live="polite" className="sr-only">
          {message}
        </div>

        {managementState.kind === "invalid" && (
          <StateCard
            icon={<Lock className="h-8 w-8" />}
            title="This management link cannot be verified"
            focusRef={focusRef}
          >
            <p>
              For your privacy and security, booking details cannot be displayed
              without a valid link.
            </p>
            <InfoBox>
              Check the complete link in your original confirmation email.
              Opening a valid link never changes a booking by itself.
            </InfoBox>
          </StateCard>
        )}

        {managementState.kind === "unavailable" && (
          <StateCard
            icon={<AlertCircle className="h-8 w-8" />}
            title="Connection temporarily unavailable"
            focusRef={focusRef}
          >
            <p>
              We could not reach the booking system. No booking change has been
              made.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="primary-button"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
          </StateCard>
        )}

        {(managementState.kind === "past" ||
          managementState.kind === "inactive") &&
          booking &&
          current && (
            <StateCard
              icon={<CheckCircle2 className="h-8 w-8" />}
              title={
                managementState.kind === "past"
                  ? "Conversation completed"
                  : "This booking is not available for changes"
              }
              focusRef={focusRef}
            >
              <p>
                This listening session on <strong>{current.date}</strong> cannot
                be cancelled or rescheduled online.
              </p>
              <BookingSummary booking={booking} />
            </StateCard>
          )}

        {managementState.kind === "cancelled" &&
          booking &&
          current &&
          (step === "overview" || step === "cancel_success") && (
            <article className="relative space-y-8 overflow-hidden rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-6 shadow-sm sm:p-12">
              <div className="absolute left-0 top-0 h-2 w-full bg-[#A89F91]" />
              <header className="space-y-3 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#E8DFD5] bg-[#FAF2EB] text-[#A35048]">
                  <CalendarX className="h-7 w-7" />
                </div>
                <span className="inline-flex rounded-full border border-[#E8DFD5] bg-[#F5EFE9] px-3 py-1 text-xs font-medium text-[#7E2D24]">
                  Booking cancelled
                </span>
                <h1
                  ref={focusRef}
                  tabIndex={-1}
                  className="font-serif text-3xl font-medium tracking-tight outline-none"
                >
                  This booking has been cancelled
                </h1>
                <p className="text-sm text-[#68635F]">
                  The reservation for{" "}
                  <strong className="text-[#282524]">{booking.name}</strong> on{" "}
                  {current.date} is no longer active.
                </p>
              </header>
              <dl className="space-y-3.5 rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-xs">
                <SummaryRow
                  label="Original appointment"
                  value={`${current.date} at ${current.time}`}
                />
                <SummaryRow
                  label="Refund status"
                  value={refundCopy(
                    managementState.cancellation.refundEligible,
                    managementState.cancellation.refundStatus,
                    booking.amountPaid,
                  )}
                  success={
                    managementState.cancellation.refundStatus === "refunded"
                  }
                />
                <SummaryRow
                  label="Calendar invitation"
                  value={
                    managementState.cancellation.calendarStatus === "cancelled"
                      ? "Cancellation sent to Google Calendar"
                      : "Calendar update pending"
                  }
                />
              </dl>
              {message && <InfoBox>{message}</InfoBox>}
              <HomeLink />
            </article>
          )}

        {managementState.kind === "reschedule_pending" &&
          booking &&
          current && (
            <StateCard
              icon={<Clock className="h-8 w-8" />}
              title="Your change is still being finalised"
              focusRef={focusRef}
            >
              <p>
                Both your current time and requested replacement remain
                protected while the existing Calendar event is reconciled.
              </p>
              <div className="grid gap-4 text-left sm:grid-cols-2">
                <ComparisonCard
                  label="Current time"
                  date={current.date}
                  time={current.time}
                  muted
                />
                <ComparisonCard
                  label="Requested time"
                  date={
                    bookingPresentation({
                      ...booking,
                      ...managementState.target,
                    }).date
                  }
                  time={
                    bookingPresentation({
                      ...booking,
                      ...managementState.target,
                    }).time
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => submitReschedule(managementState.target.startAt)}
                className="primary-button"
              >
                Continue finalising this change
              </button>
              <InfoBox>
                A different target cannot be selected until this exact operation
                completes or is safely abandoned.
              </InfoBox>
            </StateCard>
          )}

        {managementState.kind === "active" && booking && current && (
          <>
            {step === "overview" && (
              <article className="relative space-y-8 overflow-hidden rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-6 shadow-sm sm:p-12">
                <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-[#8C4038] via-[#A35048] to-[#C47065]" />
                <header className="space-y-3 text-center">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8DFD5] bg-[#FAF2EB] px-3 py-1 text-xs font-medium text-[#8C4038]">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Private booking management
                  </span>
                  <h1
                    ref={focusRef}
                    tabIndex={-1}
                    className="font-serif text-3xl font-medium tracking-tight outline-none sm:text-4xl"
                  >
                    Manage your conversation
                  </h1>
                  <p className="text-sm leading-relaxed text-[#68635F]">
                    Your confirmed time stays protected until any requested
                    change is safely completed.
                  </p>
                </header>
                <BookingSummary booking={booking} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => moveTo("reschedule_select")}
                    className="group rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-left transition hover:border-[#A35048] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A35048]"
                  >
                    <Calendar className="mb-3 h-6 w-6 text-[#A35048]" />
                    <span className="flex items-center justify-between font-serif text-xl font-medium">
                      Reschedule{" "}
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-[#68635F]">
                      Choose another currently available time. No new payment is
                      required.
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTo("cancel_confirm")}
                    className="group rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-left transition hover:border-[#A35048] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#A35048]"
                  >
                    <CalendarX className="mb-3 h-6 w-6 text-[#A35048]" />
                    <span className="flex items-center justify-between font-serif text-xl font-medium">
                      Cancel booking{" "}
                      <ChevronRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </span>
                    <span className="mt-2 block text-xs leading-relaxed text-[#68635F]">
                      Review the cancellation and refund outcome before
                      confirming.
                    </span>
                  </button>
                </div>
              </article>
            )}

            {step === "reschedule_select" && (
              <FlowCard
                title="Choose a new time"
                eyebrow="Reschedule · Step 1 of 2"
                focusRef={focusRef}
                onBack={() => moveTo("overview")}
              >
                <InfoBox>
                  Your original booking remains secured while you browse.
                  Availability is checked again when you confirm.
                </InfoBox>
                {availabilityStatus === "loading" && (
                  <StatusPanel busy>Checking current availability…</StatusPanel>
                )}
                {availabilityStatus === "error" && (
                  <StatusPanel error>
                    Availability is temporarily unavailable.
                    <button
                      type="button"
                      onClick={refreshAvailability}
                      className="ml-2 underline"
                    >
                      Try again
                    </button>
                  </StatusPanel>
                )}
                {availabilityStatus === "ready" &&
                  availableDays.length === 0 && (
                    <StatusPanel>
                      No replacement times are currently available.
                    </StatusPanel>
                  )}
                {availabilityStatus === "ready" && availableDays.length > 0 && (
                  <>
                    <AvailabilityPicker
                      availableDays={availableDays}
                      selectedDate={selectedDate}
                      selectedSlotId={selectedSlotId}
                      onSelectDate={setSelectedDate}
                      onSelectSlot={setSelectedSlotId}
                    />
                    <button
                      type="button"
                      disabled={!selectedSlot}
                      onClick={() => moveTo("reschedule_review")}
                      className="primary-button w-full disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Review new time
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </>
                )}
              </FlowCard>
            )}

            {step === "reschedule_review" && selected && (
              <FlowCard
                title="Review your new time"
                eyebrow="Reschedule · Step 2 of 2"
                focusRef={focusRef}
                onBack={() => moveTo("reschedule_select")}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <ComparisonCard
                    label="Current time"
                    date={current.date}
                    time={current.time}
                    muted
                  />
                  <ComparisonCard
                    label="New time"
                    date={selected.date}
                    time={selected.time}
                  />
                </div>
                <InfoBox>
                  Your existing payment and booking identity stay the same. We
                  update the existing Calendar invitation and preserve its
                  Google Meet wherever Google does.
                </InfoBox>
                <button
                  type="button"
                  onClick={() => submitReschedule()}
                  className="primary-button w-full"
                >
                  Secure this new time
                </button>
              </FlowCard>
            )}

            {step === "reschedule_processing" && (
              <ProcessingCard
                focusRef={focusRef}
                title="Securing your new time…"
              >
                Your original time remains protected while the replacement is
                reserved and the Calendar invitation is updated.
              </ProcessingCard>
            )}

            {step === "reschedule_success" && booking && (
              <StateCard
                icon={<CheckCircle2 className="h-8 w-8" />}
                title="Your conversation has been rescheduled"
                focusRef={focusRef}
              >
                <p>
                  Your new time is secured and the previous time has been
                  released.
                </p>
                <BookingSummary booking={booking} />
                <InfoBox>
                  Your payment remains applied. Google Calendar has been asked
                  to notify the attendee of the updated time.
                </InfoBox>
                <HomeLink />
              </StateCard>
            )}

            {step === "reschedule_conflict" && (
              <StateCard
                icon={<AlertCircle className="h-8 w-8" />}
                title="That time could not be secured"
                focusRef={focusRef}
              >
                <p>
                  {message ||
                    `Your existing reservation for ${current.date} at ${current.time} remains protected.`}
                </p>
                <button
                  type="button"
                  onClick={() => moveTo("reschedule_select")}
                  className="primary-button"
                >
                  <RotateCcw className="h-4 w-4" />
                  Choose another time
                </button>
              </StateCard>
            )}

            {step === "reschedule_pending" && (
              <StateCard
                icon={<Clock className="h-8 w-8" />}
                title="Your change is still being finalised"
                focusRef={focusRef}
              >
                <p>
                  {message ||
                    "Both the original and replacement time remain protected while the Calendar state is reconciled."}
                </p>
                <InfoBox>
                  Do not start another change. Refresh this private link shortly
                  to check the authoritative booking state.
                </InfoBox>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="primary-button"
                >
                  <RotateCcw className="h-4 w-4" />
                  Check status
                </button>
              </StateCard>
            )}

            {step === "cancel_confirm" && (
              <FlowCard
                title="Cancel this booking?"
                eyebrow="Cancellation confirmation"
                focusRef={focusRef}
                onBack={() => moveTo("overview")}
              >
                <BookingSummary booking={booking} compact />
                <div
                  className={`rounded-2xl border p-5 text-sm leading-relaxed ${managementState.cancellation.refundEligible ? "border-[#D0E7D7] bg-[#EAF5EE] text-[#285A3E]" : "border-[#E8DFD5] bg-[#FAF8F5] text-[#68635F]"}`}
                >
                  {managementState.cancellation.refundEligible
                    ? `This cancellation is eligible for a full refund of ${booking.amountPaid} to the original payment method.`
                    : "This booking can be cancelled, but the automatic refund period has passed."}
                </div>
                {message && <StatusPanel error>{message}</StatusPanel>}
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => moveTo("overview")}
                    className="secondary-button flex-1"
                  >
                    Keep my booking
                  </button>
                  <button
                    type="button"
                    onClick={submitCancellation}
                    className="danger-button flex-1"
                  >
                    Yes, cancel booking
                  </button>
                </div>
              </FlowCard>
            )}

            {step === "cancel_processing" && (
              <ProcessingCard
                focusRef={focusRef}
                title="Cancelling your booking…"
              >
                The booking is being released first. Calendar and refund updates
                are reconciled independently and safely.
              </ProcessingCard>
            )}
          </>
        )}
      </main>

      <style jsx global>{`
        .primary-button {
          display: inline-flex;
          min-height: 3rem;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border-radius: 9999px;
          background: #a35048;
          padding: 0.75rem 1.5rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: white;
          transition: background 0.2s;
        }
        .primary-button:hover {
          background: #8c4038;
        }
        .primary-button:focus-visible,
        .secondary-button:focus-visible,
        .danger-button:focus-visible {
          outline: 2px solid #a35048;
          outline-offset: 2px;
        }
        .secondary-button {
          display: inline-flex;
          min-height: 3rem;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          border: 1px solid #e8dfd5;
          border-radius: 9999px;
          background: #faf8f5;
          padding: 0.75rem 1.5rem;
          font-size: 0.8rem;
          font-weight: 600;
        }
        .danger-button {
          display: inline-flex;
          min-height: 3rem;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          background: #7e2d24;
          padding: 0.75rem 1.5rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: white;
        }
      `}</style>
    </div>
  );
}

function StateCard({
  icon,
  title,
  focusRef,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  focusRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <article className="space-y-6 rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-6 text-center shadow-sm sm:p-12">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[#E8DFD5] bg-[#FAF2EB] text-[#A35048]">
        {icon}
      </div>
      <div className="mx-auto max-w-xl space-y-3">
        <h1
          ref={focusRef}
          tabIndex={-1}
          className="font-serif text-3xl font-medium tracking-tight outline-none"
        >
          {title}
        </h1>
        <div className="space-y-5 text-sm leading-relaxed text-[#68635F]">
          {children}
        </div>
      </div>
    </article>
  );
}

function FlowCard({
  title,
  eyebrow,
  focusRef,
  onBack,
  children,
}: {
  title: string;
  eyebrow: string;
  focusRef: React.RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <article className="relative space-y-7 overflow-hidden rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-6 shadow-sm sm:p-10">
      <div className="absolute left-0 top-0 h-2 w-full bg-gradient-to-r from-[#8C4038] via-[#A35048] to-[#C47065]" />
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-[#68635F] hover:text-[#A35048]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <header>
        <p className="text-xs font-medium uppercase tracking-widest text-[#A35048]">
          {eyebrow}
        </p>
        <h1
          ref={focusRef}
          tabIndex={-1}
          className="mt-2 font-serif text-3xl font-medium tracking-tight outline-none"
        >
          {title}
        </h1>
      </header>
      {children}
    </article>
  );
}

function ProcessingCard({
  focusRef,
  title,
  children,
}: {
  focusRef: React.RefObject<HTMLHeadingElement | null>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article
      aria-busy="true"
      className="space-y-5 rounded-3xl border border-[#E8DFD5] bg-[#FDFCFB] p-8 text-center shadow-sm sm:p-12"
    >
      <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-[#E8DFD5] border-t-[#A35048] motion-reduce:animate-none" />
      <h1
        ref={focusRef}
        tabIndex={-1}
        className="font-serif text-3xl font-medium outline-none"
      >
        {title}
      </h1>
      <p className="text-sm leading-relaxed text-[#68635F]">{children}</p>
    </article>
  );
}

function BookingSummary({
  booking,
  compact = false,
}: {
  booking: ManagementBookingView;
  compact?: boolean;
}) {
  const display = bookingPresentation(booking);
  return (
    <section
      aria-label="Booking details"
      className={`rounded-2xl border border-[#E8DFD5] bg-[#FAF8F5] ${compact ? "p-4" : "p-5 sm:p-6"}`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#E8DFD5] pb-4 text-xs">
        <div>
          <span className="block text-[#78716C]">Booking for</span>
          <strong className="mt-1 block text-sm text-[#282524]">
            {booking.name}
          </strong>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#D0E7D7] bg-[#EAF5EE] px-3 py-1 font-medium text-[#2E6B48]">
          <CreditCard className="h-3.5 w-3.5" />
          Paid · {booking.amountPaid}
        </span>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <Detail
          icon={<Calendar className="h-4 w-4" />}
          label="Date"
          value={display.date}
        />
        <Detail
          icon={<Clock className="h-4 w-4" />}
          label="Time & duration"
          value={`${display.time} (${display.zone}) · ${booking.durationMinutes} min`}
        />
        <Detail
          icon={<Video className="h-4 w-4" />}
          label="Format"
          value="Private video meeting via Google Meet"
        />
        <Detail
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Confirmation sent to"
          value={booking.email}
        />
      </dl>
    </section>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
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

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E8DFD5] bg-[#FAF8F5] p-4 text-left text-xs leading-relaxed text-[#68635F]">
      <Info className="mr-2 inline h-4 w-4 text-[#A35048]" />
      {children}
    </div>
  );
}
function StatusPanel({
  children,
  busy = false,
  error = false,
}: {
  children: React.ReactNode;
  busy?: boolean;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      aria-busy={busy || undefined}
      className={`rounded-xl border p-5 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "border-[#E8DFD5] bg-[#FAF8F5] text-[#68635F]"}`}
    >
      {children}
    </div>
  );
}
function ComparisonCard({
  label,
  date,
  time,
  muted = false,
}: {
  label: string;
  date: string;
  time: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${muted ? "border-[#E8DFD5] bg-[#FAF8F5]" : "border-[#A35048] bg-[#FAF2EB]"}`}
    >
      <p className="text-xs font-medium uppercase tracking-widest text-[#78716C]">
        {label}
      </p>
      <p className="mt-3 font-serif text-xl font-medium">{date}</p>
      <p className="mt-1 text-sm text-[#68635F]">{time}</p>
    </div>
  );
}
function SummaryRow({
  label,
  value,
  success = false,
}: {
  label: string;
  value: string;
  success?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-1 border-b border-[#E8DFD5] py-1 last:border-0 sm:flex-row">
      <dt className="text-[#78716C]">{label}</dt>
      <dd
        className={`font-medium ${success ? "text-[#2E6B48]" : "text-[#282524]"}`}
      >
        {value}
      </dd>
    </div>
  );
}
function HomeLink() {
  return (
    <a href="/" className="secondary-button">
      <ArrowLeft className="h-4 w-4" />
      Return to Re-Embroidered Conversations
    </a>
  );
}
function refundCopy(eligible: boolean, status: RefundStatus, amount: string) {
  if (!eligible) return "No automatic refund applies";
  if (status === "refunded") return `${amount} refunded`;
  if (status === "processing") return `${amount} refund processing`;
  if (status === "needs_attention") return "Refund needs attention";
  return `${amount} refund pending`;
}
