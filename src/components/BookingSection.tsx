'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Phone,
  CheckCircle,
  Download,
  CalendarPlus,
  ShieldCheck,
  Coffee,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { DayAvailability, SessionFormat, BookingConfirmation } from '../types';
import { FullCalendarModal } from './FullCalendarModal';

interface BookingSectionProps {
  initialDate?: string;
}

export const BookingSection: React.FC<BookingSectionProps> = ({ initialDate }) => {
  const router = useRouter();
  // Time zone
  const [timeZone, setTimeZone] = useState('Europe/London (GMT/BST)');

  // Generate ~36 upcoming realistic days across the next 7-8 weeks starting from tomorrow
  const availableDays: DayAvailability[] = useMemo(() => {
    const days: DayAvailability[] = [];
    const base = initialDate ? new Date(`${initialDate}T12:00:00`) : new Date();
    // Start from tomorrow
    base.setDate(base.getDate() + 1);

    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
    ];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    let count = 0;
    // Generate up to 36 available listening days
    while (days.length < 36 && count < 65) {
      const current = new Date(base);
      current.setDate(base.getDate() + count);
      count++;

      const dayOfWeekNum = current.getDay();
      // Shahd Karaeen listens Tuesday through Saturday (Sunday & Monday off for focused practice)
      if (dayOfWeekNum === 0 || dayOfWeekNum === 1) continue;

      const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const dateStr = `${current.getFullYear()}-${pad(current.getMonth() + 1)}-${pad(current.getDate())}`;
      const dayOfWeek = dayNames[dayOfWeekNum];
      const formattedDate = `${dayOfWeek}, ${current.getDate()} ${monthNames[current.getMonth()]}`;

      // Morning, afternoon, evening slots
      days.push({
        date: dateStr,
        dayOfWeek,
        formattedDate,
        slots: [
          { id: `${dateStr}-1000`, time: '10:00 AM', period: 'morning', available: true },
          { id: `${dateStr}-1130`, time: '11:30 AM', period: 'morning', available: true },
          { id: `${dateStr}-1400`, time: '2:00 PM', period: 'afternoon', available: true },
          { id: `${dateStr}-1530`, time: '3:30 PM', period: 'afternoon', available: dayOfWeekNum !== 6 },
          { id: `${dateStr}-1700`, time: '5:00 PM', period: 'evening', available: true },
        ],
      });
    }
    return days;
  }, [initialDate]);

  // Selected date & slot state
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<string>('10:00 AM');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');
  const [sessionFormat, setSessionFormat] = useState<SessionFormat>('video');

  // Full calendar modal & horizontal scroll states
  const [showFullCalendar, setShowFullCalendar] = useState(false);
  const dateStripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollButtons = () => {
    if (!dateStripRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = dateStripRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    updateScrollButtons();
    const handleResize = () => updateScrollButtons();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [availableDays]);

  const scrollStrip = (direction: 'left' | 'right') => {
    if (!dateStripRef.current) return;
    const scrollAmount = 340;
    dateStripRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
    setTimeout(updateScrollButtons, 350);
  };

  const handleSelectDateFromCalendar = (dateStr: string) => {
    const idx = availableDays.findIndex((d) => d.date === dateStr);
    if (idx !== -1) {
      setSelectedDayIndex(idx);
      if (availableDays[idx].slots.length > 0) {
        setSelectedSlot(availableDays[idx].slots[0].time);
      }
      setTimeout(() => {
        if (dateStripRef.current) {
          const card = dateStripRef.current.children[idx] as HTMLElement;
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          }
          updateScrollButtons();
        }
      }, 100);
    }
  };

  // Client details
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [optionalNote, setOptionalNote] = useState('');
  const [acceptedBoundaries, setAcceptedBoundaries] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Confirmation state
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

  const activeDay = availableDays[selectedDayIndex] || availableDays[0];

  const filteredSlots = useMemo(() => {
    if (!activeDay) return [];
    if (periodFilter === 'all') return activeDay.slots;
    return activeDay.slots.filter((s) => s.period === periodFilter);
  }, [activeDay, periodFilter]);

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Please provide your name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg('Please provide a valid email address so we can send you the session link.');
      return;
    }
    if (!selectedSlot) {
      setErrorMsg('Please choose a time slot for your session.');
      return;
    }
    if (!acceptedBoundaries) {
      setErrorMsg('Please confirm that you understand this is a listening session, not therapy or medical treatment.');
      return;
    }

    setErrorMsg('');
    const bookingId = `RC-${Math.floor(10000 + Math.random() * 90000)}`;

    // Create google calendar link
    const title = encodeURIComponent('One-to-One Listening Session with Shahd Karaeen');
    const details = encodeURIComponent(
      `Private listening session with Shahd Karaeen (Re-Embroidered Conversations).\nFormat: ${
        sessionFormat === 'video' ? 'Private Video (link in email)' : 'Audio-only call'
      }\nBooking ID: ${bookingId}`
    );
    const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;

    const newConf: BookingConfirmation = {
      bookingId,
      createdAt: new Date().toISOString(),
      date: activeDay.formattedDate,
      time: selectedSlot,
      format: sessionFormat,
      clientName: name,
      clientEmail: email,
      clientPhone: phone,
      timeZone,
      optionalNote,
      confirmedBoundaries: true,
      calendarLinkGoogle: googleLink,
      calendarLinkIcs: '',
    };

    setConfirmation(newConf);
    openConfirmation(newConf);
  };

  const openConfirmation = (data?: BookingConfirmation) => {
    const query = new URLSearchParams({
      payment_success: 'true',
      booking_id: data?.bookingId ?? 'RC-78421',
    });

    if (data) {
      query.set('name', data.clientName);
      query.set('email', data.clientEmail);
      query.set('date', data.date);
      query.set('time', data.time);
      query.set('format', data.format);
      query.set('timezone', data.timeZone);
    }

    router.push(`/confirmation?${query.toString()}`);
  };

  // Generate .ics file download
  const handleDownloadIcs = () => {
    if (!confirmation) return;
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Re-Embroidered Conversations//Listening Session//EN',
      'BEGIN:VEVENT',
      `SUMMARY:Listening Session with Shahd Karaeen · Re-Embroidered Conversations`,
      `DESCRIPTION:Private listening conversation with Shahd Karaeen.\\nBooking ID: ${confirmation.bookingId}\\nFormat: ${confirmation.format}`,
      `STATUS:CONFIRMED`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listening-session-shahd-karaeen-${confirmation.bookingId}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

        {/* If Confirmation is Active, show Confirmation Card */}
        {confirmation ? (
          <div className="bg-[#FDFCFB] border border-[#E8DFD5] rounded-2xl p-8 sm:p-12 shadow-md relative overflow-hidden animate-fadeIn">
            <div className="h-1.5 w-full bg-[#A35048] absolute top-0 left-0" />

            <div className="max-w-xl mx-auto text-center space-y-6">
              <div className="w-14 h-14 rounded-full bg-[#F5EFE9] text-[#A35048] flex items-center justify-center mx-auto border border-[#E8DFD5]">
                <CheckCircle className="w-8 h-8 stroke-[1.5]" />
              </div>

              <div>
                <span className="text-xs uppercase tracking-widest font-sans text-[#A35048] font-medium">
                  Your Space Is Reserved
                </span>
                <h3 className="font-serif text-3xl sm:text-4xl text-[#282524] font-medium mt-1">
                  We will see you on {confirmation.date}
                </h3>
                <p className="font-sans text-sm text-[#78716C] mt-2">
                  Reference: <span className="font-mono text-[#282524]">{confirmation.bookingId}</span>
                </p>
              </div>

              {/* Session Details Box */}
              <div className="bg-[#FAF8F5] p-5 rounded-xl border border-[#E8DFD5] text-left text-sm space-y-2.5 font-sans">
                <div className="flex justify-between pb-2 border-b border-[#E8DFD5]">
                  <span className="text-[#78716C]">Time:</span>
                  <span className="font-medium text-[#282524]">
                    {confirmation.time} ({confirmation.timeZone.split(' ')[0]}) · 55 minutes
                  </span>
                </div>
                <div className="flex justify-between pb-2 border-b border-[#E8DFD5]">
                  <span className="text-[#78716C]">Format:</span>
                  <span className="font-medium text-[#282524] capitalize flex items-center gap-1.5">
                    {confirmation.format === 'video' ? (
                      <>
                        <Video className="w-3.5 h-3.5 text-[#A35048]" /> Video Call (Link sent to email)
                      </>
                    ) : (
                      <>
                        <Phone className="w-3.5 h-3.5 text-[#A35048]" /> Audio-Only Phone Call
                      </>
                    )}
                  </span>
                </div>
                <div className="flex justify-between pb-2 border-b border-[#E8DFD5]">
                  <span className="text-[#78716C]">Client:</span>
                  <span className="font-medium text-[#282524]">{confirmation.clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#78716C]">Confirmation sent to:</span>
                  <span className="font-medium text-[#282524]">{confirmation.clientEmail}</span>
                </div>
              </div>

              {/* A gentle note from Shahd Karaeen on preparation with deckled book leaf styling */}
              <div className="relative text-left my-1">
                <div className="absolute inset-0 translate-x-1 translate-y-1 bg-[#F1E7DD] rounded-xl border border-[#E3D5C5] -z-10" />
                <div className="p-5 sm:p-6 rounded-xl bg-gradient-to-br from-[#FDFBF8] via-[#FAF6F1] to-[#F5EEE6] border border-[#EAE0D5] border-l-3 border-l-[#A35048] shadow-[0_4px_16px_-2px_rgba(163,80,72,0.05),0_1px_2px_rgba(40,37,36,0.04)]">
                  <div className="flex items-center gap-2 text-xs font-serif text-[#A35048] uppercase tracking-wider mb-2">
                    <Coffee className="w-4 h-4 text-[#A35048]" />
                    <span>A quiet note before our conversation</span>
                  </div>
                  <p className="font-serif italic text-base sm:text-lg text-[#3E3A37] leading-relaxed">
                    “When the time comes, simply find a quiet chair where you won’t be interrupted, make a cup of tea or pour a glass of water, and click the link. You don’t need notes. I am looking forward to meeting you.”
                  </p>
                  <span className="block text-xs font-sans text-[#78716C] mt-2.5 text-right font-medium">
                    — Shahd Karaeen
                  </span>
                </div>
              </div>

              {/* Action Buttons: Calendar Sync */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <a
                  href={confirmation.calendarLinkGoogle}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FAF8F5] hover:bg-white text-[#282524] border border-[#E8DFD5] text-xs font-sans font-medium px-4 py-3 rounded-full shadow-xs cursor-pointer transition-all"
                >
                  <CalendarPlus className="w-4 h-4 text-[#A35048]" />
                  <span>Add to Google Calendar</span>
                </a>

                <button
                  onClick={handleDownloadIcs}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FAF8F5] hover:bg-white text-[#282524] border border-[#E8DFD5] text-xs font-sans font-medium px-4 py-3 rounded-full shadow-xs cursor-pointer transition-all"
                >
                  <Download className="w-4 h-4 text-[#A35048]" />
                  <span>Download .ics file (Apple / Outlook)</span>
                </button>
              </div>

              {/* Reset or Open Dedicated Page */}
              <div className="pt-4 border-t border-[#E8DFD5] flex flex-col sm:flex-row items-center justify-between gap-3">
                <button
                  onClick={() => setConfirmation(null)}
                  className="text-xs text-[#78716C] hover:text-[#A35048] underline underline-offset-4 cursor-pointer"
                >
                  Need to book another slot or change your booking?
                </button>

                <button
                  onClick={() => openConfirmation(confirmation)}
                  className="inline-flex items-center gap-1 text-xs text-[#A35048] hover:text-[#8C4038] font-medium cursor-pointer"
                >
                  <span>Open Fullscreen Confirmation Page</span>
                  <Sparkles className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Interactive Booking Form */
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

              {/* Date Selection Header & Controls */}
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex flex-col md:flex-row items-center gap-2">
                    <p className="text-xs text-[#282524] font-medium font-sans">
                      Upcoming available days
                    </p>
                    <p>
                      <span className="text-[#C4B7A9]">•</span>
                      <span className="text-[11px] text-[#78716C] font-light">
                        Nearest dates shown first
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowFullCalendar(true)}
                      className="inline-flex items-center gap-1.5 text-xs text-[#A35048] hover:text-[#8C4038] font-medium underline underline-offset-4 decoration-[#A35048]/40 hover:decoration-[#A35048] transition-colors cursor-pointer"
                    >
                      <CalendarIcon className="w-3.5 h-3.5 stroke-[1.75]" />
                      <span>View full calendar</span>
                    </button>

                    {/* Horizontal Pagination Arrows */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => scrollStrip('left')}
                        disabled={!canScrollLeft}
                        className="p-1.5 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] text-[#282524] hover:border-[#A35048] hover:text-[#A35048] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="Scroll to earlier dates"
                        title="Earlier dates"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => scrollStrip('right')}
                        disabled={!canScrollRight}
                        className="p-1.5 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] text-[#282524] hover:border-[#A35048] hover:text-[#A35048] disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        aria-label="Scroll to later dates"
                        title="Later dates"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Horizontal Date Pills Slider with Visual Overflow Cues */}
                <div className="relative group/strip">
                  {/* Left gradient fade cue */}
                  <div
                    className={`pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-[#FDFCFB] to-transparent z-10 transition-opacity duration-200 ${
                      canScrollLeft ? 'opacity-100' : 'opacity-0'
                    }`}
                  />

                  {/* Right gradient fade cue indicating more dates ahead */}
                  <div
                    className={`pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#FDFCFB] to-transparent z-10 transition-opacity duration-200 ${
                      canScrollRight ? 'opacity-100' : 'opacity-0'
                    }`}
                  />

                  {/* Desktop Floating Right Arrow for immediate affordance */}
                  {canScrollRight && (
                    <button
                      type="button"
                      onClick={() => scrollStrip('right')}
                      className="hidden md:flex absolute -right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E8DFD5] shadow-md items-center justify-center text-[#282524] hover:text-[#A35048] hover:border-[#A35048] transition-all cursor-pointer hover:scale-105 active:scale-95"
                      aria-label="Next dates"
                      title="Next available dates"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {/* Desktop Floating Left Arrow */}
                  {canScrollLeft && (
                    <button
                      type="button"
                      onClick={() => scrollStrip('left')}
                      className="hidden md:flex absolute -left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-[#FAF8F5] border border-[#E8DFD5] shadow-md items-center justify-center text-[#282524] hover:text-[#A35048] hover:border-[#A35048] transition-all cursor-pointer hover:scale-105 active:scale-95"
                      aria-label="Previous dates"
                      title="Previous dates"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}

                  {/* Date cards scroll container */}
                  <div
                    ref={dateStripRef}
                    onScroll={updateScrollButtons}
                    className="flex gap-2.5 overflow-x-auto pb-2.5 pt-0.5 px-0.5 scrollbar-none scroll-smooth"
                  >
                    {availableDays.map((day, idx) => {
                      const isSelected = selectedDayIndex === idx;
                      const availableCount = day.slots.filter((s) => s.available).length;
                      return (
                        <button
                          key={day.date}
                          type="button"
                          onClick={() => {
                            setSelectedDayIndex(idx);
                            if (day.slots.length > 0) {
                              setSelectedSlot(day.slots[0].time);
                            }
                          }}
                          className={`shrink-0 px-4 py-3 rounded-xl border text-left cursor-pointer transition-all duration-150 min-w-[104px] ${
                            isSelected
                              ? 'bg-[#A35048] text-[#FAF8F5] border-[#A35048] shadow-xs'
                              : 'bg-[#FAF8F5] text-[#4B4643] border-[#E8DFD5] hover:border-[#C4B7A9] hover:bg-[#F5EFE9]/60'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className="block text-[11px] font-sans opacity-80 uppercase tracking-wider font-medium">
                              {day.dayOfWeek.slice(0, 3)}
                            </span>
                            {idx === 0 && (
                              <span
                                className={`text-[9px] uppercase tracking-wider font-semibold px-1 py-0.2 rounded-xs ${
                                  isSelected ? 'bg-white/25 text-white' : 'bg-[#E8DFD5] text-[#A35048]'
                                }`}
                              >
                                Nearest
                              </span>
                            )}
                          </div>
                          <span className="block font-serif text-base font-medium leading-snug">
                            {day.formattedDate.split(', ')[1]}
                          </span>
                          <span
                            className={`block text-[10px] font-sans mt-1 ${
                              isSelected ? 'text-white/80' : 'text-[#78716C]'
                            }`}
                          >
                            {availableCount} {availableCount === 1 ? 'slot' : 'slots'}
                          </span>
                        </button>
                      );
                    })}

                    {/* Browse Later Dates Card */}
                    <button
                      type="button"
                      onClick={() => setShowFullCalendar(true)}
                      className="shrink-0 px-4 py-3 rounded-xl border border-dashed border-[#C4B7A9] hover:border-[#A35048] text-left cursor-pointer transition-all duration-150 bg-[#FAF8F5]/80 hover:bg-[#F5EFE9] flex flex-col justify-center items-center min-w-[110px] group"
                      title="Open full calendar to select any date across the next 8 weeks"
                    >
                      <CalendarIcon className="w-4 h-4 text-[#A35048] mb-1 group-hover:scale-110 transition-transform" />
                      <span className="text-xs font-serif font-medium text-[#282524] whitespace-nowrap">
                        Later dates
                      </span>
                      <span className="text-[10px] text-[#78716C] mt-0.5 whitespace-nowrap">
                        Full calendar →
                      </span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Time of Day Filter & Slot Grid */}
              <div>
                <div className="flex flex-col md:flex-row gap-2 md:gap-0 items-center justify-between mb-3 text-xs text-[#68635F]">
                  <span>Available times on {activeDay.formattedDate}:</span>
                  <div className="flex gap-1">
                    {(['all', 'morning', 'afternoon', 'evening'] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setPeriodFilter(filter)}
                        className={`px-2 py-0.5 rounded capitalize text-[11px] cursor-pointer ${
                          periodFilter === filter
                            ? 'bg-[#E8DFD5] text-[#282524] font-medium'
                            : 'text-[#78716C] hover:text-[#282524]'
                        }`}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {filteredSlots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => setSelectedSlot(slot.time)}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-sans font-medium transition-all cursor-pointer text-center ${
                        selectedSlot === slot.time
                          ? 'bg-[#282524] text-white border-[#282524] shadow-xs ring-2 ring-[#A35048]/30'
                          : 'bg-[#FAF8F5] text-[#4B4643] border-[#E8DFD5] hover:border-[#A35048]'
                      }`}
                    >
                      {slot.time}
                    </button>
                  ))}
                </div>
              </div>
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
                <div className="p-3 mb-6 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
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
                    type="button"
                    onClick={() => openConfirmation()}
                    className="text-xs text-[#78716C] hover:text-[#A35048] transition-colors cursor-pointer py-2 px-3 rounded-lg hover:bg-[#F5EFE9] border border-dashed border-[#C4B7A9]"
                    title="Instant test: Preview how Stripe redirects to the booking confirmation page"
                  >
                    Instant Test: Preview Confirmation
                  </button>
                  <button
                    id="confirm-booking-button"
                    type="submit"
                    className="w-full sm:w-auto bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] text-sm font-medium px-8 py-3.5 rounded-full transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer active:scale-98"
                  >
                    Reserve Conversation
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
        {/* Full Month Calendar Modal */}
        <FullCalendarModal
          isOpen={showFullCalendar}
          onClose={() => setShowFullCalendar(false)}
          availableDays={availableDays}
          selectedDate={activeDay?.date || availableDays[0]?.date}
          onSelectDate={handleSelectDateFromCalendar}
        />
      </div>
    </section>
  );
};
