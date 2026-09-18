'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  Clock,
  Video,
  Phone,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { BookingCheckoutResponse, BookingHold, BookingHoldResponse, SessionFormat } from '../types';
import { AvailabilityPicker } from './availability/AvailabilityPicker';
import { useAvailability } from '../hooks/useAvailability';

export const BookingSection: React.FC = () => {
  const { availableDays, timezone, status: availabilityStatus, refresh: refreshAvailability } = useAvailability();
  const timeZone = timezone ? `${timezone} (GMT/BST)` : 'Europe/London (GMT/BST)';

  // Selected date & slot state
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [requiresFreshSelection, setRequiresFreshSelection] = useState(false);
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>('video');

  // Client details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [optionalNote, setOptionalNote] = useState('');
  const [acceptedBoundaries, setAcceptedBoundaries] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [hold, setHold] = useState<BookingHold | null>(null);
  const [checkoutStatus, setCheckoutStatus] = useState<'idle' | 'processing' | 'redirecting'>('idle');
  const [checkoutError, setCheckoutError] = useState('');
  const checkoutInFlightRef = useRef(false);
  const nextCheckoutOperationIdRef = useRef(0);
  const activeCheckoutOperationRef = useRef<{ id: number; controller: AbortController } | null>(null);

  const activeDay = availableDays.find((day) => day.date === selectedDate);
  const selectedSlotData = activeDay?.slots.find((slot) => slot.id === selectedSlot);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (checkoutInFlightRef.current) return;
    if (!name.trim()) {
      setErrorMsg('Please provide your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please provide a valid email address so we can send you the session link.');
      return;
    }
    if (!activeDay || !selectedSlotData) {
      setErrorMsg('Please choose a time slot for your session.');
      return;
    }
    if (!acceptedBoundaries) {
      setErrorMsg('Please confirm that you understand this is a listening session, not therapy or medical treatment.');
      return;
    }

    setErrorMsg('');
    setCheckoutError('');
    checkoutInFlightRef.current = true;
    setCheckoutStatus('processing');
    const operationId = ++nextCheckoutOperationIdRef.current;
    const controller = new AbortController();
    activeCheckoutOperationRef.current = { id: operationId, controller };
    const isCurrentOperation = () => activeCheckoutOperationRef.current?.id === operationId;
    const finishCurrentOperation = () => {
      if (!isCurrentOperation()) return false;
      activeCheckoutOperationRef.current = null;
      checkoutInFlightRef.current = false;
      setCheckoutStatus('idle');
      return true;
    };
    let reusableHold = hold;
    try {
      if (!reusableHold) {
        const response = await fetch('/api/bookings/hold', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, startAt: selectedSlotData.startAt }),
          signal: controller.signal,
        });
        const body = await response.json() as BookingHoldResponse | { error?: { code?: string } };
        if (!isCurrentOperation()) return;
        if (!response.ok) {
          if (response.status === 409) {
            setSelectedSlot('');
            setRequiresFreshSelection(true);
            setErrorMsg('That time has just become unavailable. Please choose another available time.');
            refreshAvailability();
          } else {
            setErrorMsg('Your time has not yet been reserved. Please try again.');
          }
          finishCurrentOperation();
          return;
        }
        reusableHold = (body as BookingHoldResponse).hold;
        setHold(reusableHold);
      }

      const response = await fetch('/api/bookings/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: reusableHold.id }),
        signal: controller.signal,
      });
      const body = await response.json() as BookingCheckoutResponse | { error?: { code?: string } };
      if (!isCurrentOperation()) return;
      if (!response.ok) {
        if ('error' in body && body.error?.code === 'hold_unavailable') {
          setHold(null);
          setSelectedSlot('');
          setRequiresFreshSelection(true);
          setErrorMsg('Your temporary hold is no longer reserved. Please choose an available time again.');
          refreshAvailability();
        } else {
          setCheckoutError('Secure payment could not be started. Your time is still held, so please try again.');
        }
        finishCurrentOperation();
        return;
      }
      const checkout = (body as BookingCheckoutResponse).checkout;
      setHold((current) => current ? { ...current, expiresAt: checkout.expiresAt } : current);
      setCheckoutStatus('redirecting');
      window.location.assign(checkout.url);
    } catch {
      if (!isCurrentOperation()) return;
      if (reusableHold) {
        setCheckoutError('Secure payment could not be started. Your time is still held, so please try again.');
      } else {
        setErrorMsg('Your time has not yet been reserved. Please try again.');
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
      setCheckoutStatus('idle');
      setSelectedSlot('');
      setRequiresFreshSelection(true);
      setCheckoutError('');
      setErrorMsg('Your temporary hold has expired. Please choose an available time again.');
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
            Choose a date and time that suits your rhythm. There is nothing to prepare,
            no questionnaire to complete, and zero pressure to explain yourself before we meet.
          </p>

          {/* Pricing & Duration Bar */}
          <div className="mt-6 inline-flex flex-wrap items-center justify-center gap-3 bg-[#F5EFE9] px-5 py-2.5 rounded-full border border-[#E8DFD5] text-xs sm:text-sm font-sans text-[#4B4643]">
            <span className="font-medium text-[#282524] flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#A35048]" /> 55-minute private session
            </span>
            <span className="text-[#C4B7A9]">•</span>
            <span className="font-serif text-base font-medium text-[#A35048]">
              £55
            </span>
          </div>
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

              {availabilityStatus === 'loading' && (
                <div role="status" className="mb-6 rounded-xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-sm text-[#68635F]">
                  Checking current availability…
                </div>
              )}

              {availabilityStatus === 'error' && (
                <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                  <p>We could not load availability just now. No times can be selected until the calendar is checked.</p>
                  <button
                    type="button"
                    onClick={refreshAvailability}
                    className="mt-3 font-medium underline underline-offset-4"
                  >
                    Try again
                  </button>
                </div>
              )}

              {availabilityStatus === 'ready' && availableDays.length === 0 && (
                <div role="status" className="mb-6 rounded-xl border border-[#E8DFD5] bg-[#FAF8F5] p-5 text-sm text-[#68635F]">
                  There are no available session times in the current booking window.
                </div>
              )}

              {availabilityStatus === 'ready' && availableDays.length > 0 && (
                <AvailabilityPicker
                  availableDays={availableDays}
                  selectedDate={selectedDate}
                  selectedSlotId={selectedSlot}
                  onSelectDate={setSelectedDate}
                  onSelectSlot={(slotId) => { setSelectedSlot(slotId); if (slotId) setRequiresFreshSelection(false); }}
                  disabled={Boolean(hold)}
                  autoSelectSlot={!requiresFreshSelection}
                />
              )}
            </div>

            {/* Step 2: Format & Basic Details */}
            <div className="mb-10 pb-8 border-b border-[#E8DFD5]">
              <span className="text-xs font-serif uppercase tracking-widest text-[#A35048] font-medium">
                Step 2 of 3
              </span>
              <h3 className="font-serif text-2xl text-[#282524] font-medium mb-4">
                Session format & your details
              </h3>

              {/* Format Choice: Video or Audio */}
              <div className="grid sm:grid-cols-2 gap-4 mb-6">
                <button
                  type="button"
                  onClick={() => setSessionFormat('video')}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-3 ${
                    sessionFormat === 'video'
                      ? 'bg-[#F5EFE9] border-[#A35048] ring-1 ring-[#A35048]'
                      : 'bg-[#FAF8F5] border-[#E8DFD5] hover:border-[#C4B7A9]'
                  }`}
                >
                  <Video className={`w-5 h-5 mt-0.5 ${sessionFormat === 'video' ? 'text-[#A35048]' : 'text-[#78716C]'}`} />
                  <div>
                    <h4 className="font-serif text-base font-medium text-[#282524]">
                      Video Conversation
                    </h4>
                    <p className="text-xs text-[#68635F] mt-1 leading-relaxed">
                      A quiet face-to-face over Google Meet or Zoom. Warm, direct, and personal.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSessionFormat('audio')}
                  className={`p-4 rounded-xl border text-left cursor-pointer transition-all flex items-start gap-3 ${
                    sessionFormat === 'audio'
                      ? 'bg-[#F5EFE9] border-[#A35048] ring-1 ring-[#A35048]'
                      : 'bg-[#FAF8F5] border-[#E8DFD5] hover:border-[#C4B7A9]'
                  }`}
                >
                  <Phone className={`w-5 h-5 mt-0.5 ${sessionFormat === 'audio' ? 'text-[#A35048]' : 'text-[#78716C]'}`} />
                  <div>
                    <h4 className="font-serif text-base font-medium text-[#282524]">
                      Audio-Only Call
                    </h4>
                    <p className="text-xs text-[#68635F] mt-1 leading-relaxed">
                      No cameras. Put your headphones on and speak comfortably without being seen.
                    </p>
                  </div>
                </button>
              </div>

              {/* Name, Email, Phone */}
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="client-name" className="block text-xs font-sans text-[#4B4643] mb-1.5">
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
                  <label htmlFor="client-email" className="block text-xs font-sans text-[#4B4643] mb-1.5">
                    Email address (for calendar & link) <span className="text-[#A35048]">*</span>
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

              <div>
                <label htmlFor="client-phone" className="block text-xs font-sans text-[#4B4643] mb-1.5">
                  Phone / Mobile number <span className="text-[#78716C] font-light">(Optional)</span>
                </label>
                <input
                  id="client-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+44 7123 456789"
                  className="w-full bg-[#FAF8F5] border border-[#E8DFD5] rounded-xl px-4 py-2.5 text-sm text-[#282524] placeholder-[#A8A29E] focus:outline-none focus:border-[#A35048]"
                />
              </div>
            </div>

            {/* Step 3: Optional context & Boundaries */}
            <div className="mb-8">
              <span className="text-xs font-serif uppercase tracking-widest text-[#A35048] font-medium">
                Step 3 of 3
              </span>
              <h3 className="font-serif text-2xl text-[#282524] font-medium mb-3">
                Anything Shahd Karaeen should know beforehand?
              </h3>

              <div className="mb-6">
                <textarea
                  id="client-note"
                  rows={3}
                  value={optionalNote}
                  onChange={(e) => setOptionalNote(e.target.value)}
                  placeholder="Optional: A few words if you'd like to share what's on your mind... or leave completely blank."
                  className="w-full bg-[#FAF8F5] border border-[#E8DFD5] rounded-xl p-3.5 text-sm text-[#282524] placeholder-[#A8A29E] focus:outline-none focus:border-[#A35048] resize-none"
                />
                <p className="text-xs text-[#78716C] mt-1.5 font-sans font-light">
                  Reassurance: You do not need to explain your situation. Many women arrive with no words prepared at all and simply begin with how their morning was.
                </p>
              </div>

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
                    I understand that this is a private listening session with Shahd Karaeen and is{' '}
                    <strong className="font-medium text-[#282524]">
                      not psychological therapy, counselling, psychiatric treatment, or crisis support
                    </strong>
                    .
                  </span>
                </label>
              </div>

              {/* Error Message */}
              {errorMsg && (
                <div role="alert" className="p-3 mb-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {checkoutError && (
                <div role="alert" className="p-3 mb-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{checkoutError}</span>
                </div>
              )}

              {/* Submit CTA */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-xs text-[#78716C] text-center sm:text-left">
                  <span>Private listening session · </span>
                  <span className="font-medium text-[#282524]">
                    £55
                  </span>
                  <p className="text-[11px] text-[#A8A29E]">
                    Secure payment link sent upon confirmation · Reschedule anytime up to 24h prior
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <button
                    id="confirm-booking-button"
                    type="submit"
                    disabled={availabilityStatus !== 'ready' || !selectedSlotData || checkoutStatus !== 'idle'}
                    aria-busy={checkoutStatus !== 'idle'}
                    className="w-full sm:w-auto bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] text-sm font-medium px-8 py-3.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {checkoutStatus !== 'idle' ? 'Securing your time…' : 'Book & pay £55'}
                  </button>
                </div>
              </div>
            </div>
          </form>
      </div>
    </section>
  );
};
