"use client";

import React, { useState, useRef, useEffect } from "react";
import { AlertCircle } from "lucide-react";
import {
  BookingCheckoutResponse,
  BookingHold,
  BookingHoldResponse,
} from "../types";
import { AvailabilityPicker } from "./availability/AvailabilityPicker";
import { useAvailability } from "../hooks/useAvailability";
import { TurnstileVerification } from "./TurnstileVerification";
import { LegalLink } from "./LegalLink";

export const BookingSection: React.FC = () => {
  const {
    availableDays,
    status: availabilityStatus,
    refresh: refreshAvailability,
  } = useAvailability();
  // Selected date & slot state
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [requiresFreshSelection, setRequiresFreshSelection] = useState(false);

  // Client details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [acceptedBoundaries, setAcceptedBoundaries] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hold, setHold] = useState<BookingHold | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<
    "idle" | "processing" | "redirecting"
  >("idle");
  const [checkoutError, setCheckoutError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileInvalid, setTurnstileInvalid] = useState(false);
  const [turnstileAttempt, setTurnstileAttempt] = useState(0);
  const checkoutInFlightRef = useRef(false);
  const nextCheckoutOperationIdRef = useRef(0);
  const activeCheckoutOperationRef = useRef<{
    id: number;
    controller: AbortController;
  } | null>(null);

  const activeDay = availableDays.find((day) => day.date === selectedDate);
  const selectedSlotData = activeDay?.slots.find(
    (slot) => slot.id === selectedSlot,
  );

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutInFlightRef.current) return;
    if (!name.trim()) {
      setErrorMsg("Please provide your name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMsg(
        "Please provide a valid email address so we can send you the session link.",
      );
      return;
    }
    if (!activeDay || !selectedSlotData) {
      setErrorMsg("Please choose a time slot for your session.");
      return;
    }
    if (!acceptedBoundaries) {
      setErrorMsg(
        "Please confirm that you understand this is a listening session, not therapy or medical treatment.",
      );
      return;
    }
    if (!hold && !turnstileToken) {
      setTurnstileInvalid(true);
      setErrorMsg(
        "Please complete the quick security verification before confirming.",
      );
      return;
    }

    setErrorMsg("");
    setCheckoutError("");
    checkoutInFlightRef.current = true;
    setCheckoutStatus("processing");
    const operationId = ++nextCheckoutOperationIdRef.current;
    const controller = new AbortController();
    activeCheckoutOperationRef.current = { id: operationId, controller };
    const isCurrentOperation = () =>
      activeCheckoutOperationRef.current?.id === operationId;
    const finishCurrentOperation = () => {
      if (!isCurrentOperation()) return false;
      activeCheckoutOperationRef.current = null;
      checkoutInFlightRef.current = false;
      setCheckoutStatus("idle");
      return true;
    };
    let reusableHold = hold;
    try {
      if (!reusableHold) {
        const response = await fetch("/api/bookings/hold", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            startAt: selectedSlotData.startAt,
            acceptedBoundaries: true,
            turnstileToken,
          }),
          signal: controller.signal,
        });
        const body = (await response.json()) as
          BookingHoldResponse | { error?: { code?: string } };
        if (!isCurrentOperation()) return;
        if (!response.ok) {
          setTurnstileToken(null);
          setTurnstileInvalid(false);
          setTurnstileAttempt((value) => value + 1);
          const errorCode = "error" in body ? body.error?.code : undefined;
          switch (errorCode) {
            case "slot_unavailable":
              setSelectedSlot("");
              setRequiresFreshSelection(true);
              setErrorMsg(
                "That time has just become unavailable. Please choose another available time.",
              );
              refreshAvailability();
              break;
            case "active_hold_limit":
              setErrorMsg(
                "You already have two reserved times. Complete one booking or wait for a hold to expire.",
              );
              break;
            case "rate_limited":
              setErrorMsg(
                "Too many booking attempts. Your details are still here; please wait before trying again.",
              );
              break;
            case "verification_failed":
            case "verification_unavailable":
              setErrorMsg(
                "Security verification needs to be completed again. Your booking details have been preserved.",
              );
              break;
            default:
              setErrorMsg(
                "Your time has not yet been reserved. Please try again.",
              );
          }
          finishCurrentOperation();
          return;
        }
        reusableHold = (body as BookingHoldResponse).hold;
        setHold(reusableHold);
      }

      const response = await fetch("/api/bookings/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: reusableHold.id }),
        signal: controller.signal,
      });
      const body = (await response.json()) as
        BookingCheckoutResponse | { error?: { code?: string } };
      if (!isCurrentOperation()) return;
      if (!response.ok) {
        if ("error" in body && body.error?.code === "hold_unavailable") {
          setHold(null);
          setSelectedSlot("");
          setRequiresFreshSelection(true);
          setErrorMsg(
            "Your temporary hold is no longer reserved. Please choose an available time again.",
          );
          refreshAvailability();
        } else {
          setCheckoutError(
            "Secure payment could not be started. Your time is still held, so please try again.",
          );
        }
        finishCurrentOperation();
        return;
      }
      const checkout = (body as BookingCheckoutResponse).checkout;
      setHold((current) =>
        current ? { ...current, expiresAt: checkout.expiresAt } : current,
      );
      setCheckoutStatus("redirecting");
      window.location.assign(checkout.url);
    } catch {
      if (!isCurrentOperation()) return;
      if (reusableHold) {
        setCheckoutError(
          "Secure payment could not be started. Your time is still held, so please try again.",
        );
      } else {
        setErrorMsg("Your time has not yet been reserved. Please try again.");
      }
      finishCurrentOperation();
    }
  };

  useEffect(() => {
    if (!hold) return;
    const delay = Math.max(0, Date.parse(hold.expiresAt) - Date.now());
    const timer = window.setTimeout(() => {
      const activeOperation = activeCheckoutOperationRef.current;
      if (activeOperation) {
        activeCheckoutOperationRef.current = null;
        activeOperation.controller.abort();
      }
      setHold(null);
      checkoutInFlightRef.current = false;
      setCheckoutStatus("idle");
      setSelectedSlot("");
      setRequiresFreshSelection(true);
      setCheckoutError("");
      setErrorMsg(
        "Your temporary hold has expired. Please choose an available time again.",
      );
      refreshAvailability();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [hold]);

  return (
    <section id="book-session" className="py-20 md:py-28 bg-[#FAF8F5] relative">
      <div className="max-w-4xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-6 h-px bg-[#A35048]" />
            <span className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
              Reserve Your Conversation
            </span>
            <span className="w-6 h-px bg-[#A35048]" />
          </div>

          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#282524] font-normal tracking-tight mb-4">
            Reserve a conversation.
          </h2>

          <p className="font-sans text-sm sm:text-base text-[#68635F] leading-relaxed font-light">
            Choose a date and time that suits your rhythm. There is nothing to
            prepare, no questionnaire to complete, and zero pressure to explain
            yourself before we meet.
          </p>

          <p className="mt-5 font-sans text-sm text-[#4B4643]">
            55-minute private video conversation · £55
          </p>
        </div>

        {/* Interactive Booking Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-[#FDFCFB] border border-[#E8DFD5] rounded-2xl p-6 sm:p-10 shadow-sm"
        >
          {/* Step 1: Choose Date & Time */}
          <div className="mb-10 pb-8 border-b border-[#E8DFD5]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-xs font-serif uppercase tracking-widest text-[#A35048] font-medium">
                  Step 1 of 3
                </span>
                <h3 className="font-serif text-2xl text-[#282524] font-medium">
                  Select a date & time
                </h3>
              </div>
            </div>

            {availabilityStatus === "loading" && (
              <div
                role="status"
                className="mb-6 rounded-xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-sm text-[#68635F]"
              >
                Checking current availability…
              </div>
            )}

            {availabilityStatus === "error" && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700"
              >
                <p>
                  We could not load availability just now. No times can be
                  selected until the calendar is checked.
                </p>
                <button
                  type="button"
                  onClick={refreshAvailability}
                  className="mt-3 font-medium underline underline-offset-4"
                >
                  Try again
                </button>
              </div>
            )}

            {availabilityStatus === "ready" && availableDays.length === 0 && (
              <div
                role="status"
                className="mb-6 rounded-xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-sm text-[#68635F]"
              >
                There are no available session times in the current booking
                window.
              </div>
            )}

            {availabilityStatus === "ready" && availableDays.length > 0 && (
              <AvailabilityPicker
                availableDays={availableDays}
                selectedDate={selectedDate}
                selectedSlotId={selectedSlot}
                onSelectDate={setSelectedDate}
                onSelectSlot={(slotId) => {
                  setSelectedSlot(slotId);
                  if (slotId) setRequiresFreshSelection(false);
                  setTurnstileToken(null);
                  setTurnstileInvalid(false);
                }}
                disabled={Boolean(hold)}
                autoSelectSlot={!requiresFreshSelection}
              />
            )}
          </div>

          {/* Step 2: Customer Details */}
          <div className="mb-10 pb-8 border-b border-[#E8DFD5]">
            <span className="text-xs font-serif uppercase tracking-widest text-[#A35048] font-medium">
              Step 2 of 3
            </span>
            <h3 className="font-serif text-2xl text-[#282524] font-medium mb-4">
              Your details
            </h3>
            <p className="mb-6 text-sm text-[#68635F]">
              55-minute private video conversation
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="client-name"
                  className="block text-xs font-sans text-[#4B4643] mb-1.5"
                >
                  Your name <span className="text-[#A35048]">*</span>
                </label>
                <input
                  id="client-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={Boolean(hold)}
                  placeholder="e.g. Sarah"
                  className="w-full bg-[#FAF8F5] border border-[#E8DFD5] rounded-xl px-4 py-2.5 text-sm text-[#282524] placeholder-[#A8A29E] focus:outline-none focus:border-[#A35048]"
                />
              </div>

              <div>
                <label
                  htmlFor="client-email"
                  className="block text-xs font-sans text-[#4B4643] mb-1.5"
                >
                  Email address (for calendar & link){" "}
                  <span className="text-[#A35048]">*</span>
                </label>
                <input
                  id="client-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={Boolean(hold)}
                  placeholder="sarah@example.com"
                  className="w-full bg-[#FAF8F5] border border-[#E8DFD5] rounded-xl px-4 py-2.5 text-sm text-[#282524] placeholder-[#A8A29E] focus:outline-none focus:border-[#A35048]"
                />
              </div>
            </div>
            <div className="mt-5 rounded-xl border border-[#E8DFD5] bg-[#F5EFE9]/60 p-4 text-xs leading-relaxed text-[#68635F]">
              We use your name and email to reserve and manage your session,
              process payment, create your Google Calendar/Meet invitation and
              send booking emails.
            </div>
          </div>

          {/* Step 3: Consent & Security */}
          <div className="mb-8">
            <span className="text-xs font-serif uppercase tracking-widest text-[#A35048] font-medium">
              Step 3 of 3
            </span>
            <h3 className="font-serif text-2xl text-[#282524] font-medium mb-3">
              Consent &amp; security
            </h3>

            {/* Boundaries Checkbox */}
            <div className="p-4 rounded-xl bg-[#F5EFE9]/80 border border-[#E8DFD5] mb-6">
              <label className="flex items-start gap-3 cursor-pointer text-xs sm:text-sm text-[#4B4643]">
                <input
                  type="checkbox"
                  id="boundaries-checkbox"
                  checked={acceptedBoundaries}
                  onChange={(e) => setAcceptedBoundaries(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-[#A35048] accent-[#A35048] border-[#C4B7A9] cursor-pointer"
                />
                <span>
                  I understand that this is a private listening session with
                  Shahd Karaeen and is{" "}
                  <strong className="font-medium text-[#282524]">
                    not psychological therapy, counselling, psychiatric
                    treatment, or crisis support
                  </strong>
                  . By booking and paying, I enter into a contract subject to{" "}
                  <LegalLink
                    document="terms"
                    className="font-medium text-[#A35048] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A35048]"
                  >
                    Terms
                  </LegalLink>
                  . See our{" "}
                  <LegalLink
                    document="privacy"
                    className="font-medium text-[#A35048] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A35048]"
                  >
                    Privacy Notice
                  </LegalLink>{" "}
                  for how your information is used.
                </span>
              </label>
            </div>

            <TurnstileVerification
              token={turnstileToken}
              onTokenChange={(value) => {
                setTurnstileToken(value);
                if (value) setTurnstileInvalid(false);
              }}
              resetKey={`${selectedSlot}:${turnstileAttempt}`}
              invalid={turnstileInvalid}
            />

            {/* Error Message */}
            {errorMsg && (
              <div
                role="alert"
                className="p-3 mb-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {checkoutError && (
              <div
                role="alert"
                className="p-3 mb-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{checkoutError}</span>
              </div>
            )}

            {/* Submit CTA */}
            <div className="flex justify-end w-full sm:w-auto">
              <button
                id="confirm-booking-button"
                type="submit"
                disabled={
                  availabilityStatus !== "ready" ||
                  !selectedSlotData ||
                  checkoutStatus !== "idle"
                }
                aria-busy={checkoutStatus !== "idle"}
                className="w-full sm:w-auto bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] text-sm font-medium px-8 py-3.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkoutStatus !== "idle"
                  ? "Securing your time…"
                  : "Continue to secure checkout £55"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};
