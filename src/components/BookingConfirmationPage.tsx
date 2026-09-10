import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Calendar,
  Clock,
  Video,
  Phone,
  Mail,
  User,
  Download,
  CalendarPlus,
  ArrowLeft,
  Copy,
  Check,
  ShieldCheck,
  Coffee,
  Printer,
  Sparkles,
  ExternalLink,
  CreditCard,
} from 'lucide-react';
import { BookingConfirmation, SessionFormat } from '../types';

interface BookingConfirmationPageProps {
  onBackToHome: () => void;
  initialConfirmation?: BookingConfirmation | null;
}

export const BookingConfirmationPage: React.FC<BookingConfirmationPageProps> = ({
  onBackToHome,
  initialConfirmation,
}) => {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showTestBar, setShowTestBar] = useState(true);

  // Parse URL parameters
  const [params, setParams] = useState(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    return new URLSearchParams(search);
  });

  useEffect(() => {
    const handlePopState = () => {
      setParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Derive booking details from URL or initialConfirmation, with realistic defaults
  const bookingId =
    params.get('booking_id') ||
    params.get('id') ||
    initialConfirmation?.bookingId ||
    'RC-78421';

  const clientName =
    params.get('name') ||
    params.get('clientName') ||
    initialConfirmation?.clientName ||
    'Sarah Jenkins';

  const clientEmail =
    params.get('email') ||
    params.get('clientEmail') ||
    initialConfirmation?.clientEmail ||
    'sarah.j@example.com';

  const date =
    params.get('date') ||
    initialConfirmation?.date ||
    'Thursday, 24 September 2026';

  const time =
    params.get('time') ||
    initialConfirmation?.time ||
    '14:00 - 14:55';

  const rawFormat = (params.get('format') || initialConfirmation?.format || 'video').toLowerCase();
  const format: SessionFormat = rawFormat === 'audio' || rawFormat === 'phone' ? 'audio' : 'video';

  const timeZone =
    params.get('timezone') ||
    params.get('tz') ||
    initialConfirmation?.timeZone ||
    'BST (London Time)';

  const sessionId =
    params.get('session_id') ||
    params.get('checkout_session_id') ||
    'cs_live_9a8b7c6d5e4f3a2b';

  const amount = params.get('amount') || '£55.00';
  const isStripeRedirect =
    params.get('payment_success') === 'true' ||
    params.get('success') === 'true' ||
    Boolean(params.get('session_id')) ||
    params.get('source') === 'stripe';

  // Build Google Calendar Link
  const title = encodeURIComponent('Listening Session with Shahd Karaeen · Re-Embroidered Conversations');
  const details = encodeURIComponent(
    `Private 55-minute listening conversation with Shahd Karaeen.\n\n` +
      `Booking Reference: ${bookingId}\n` +
      `Format: ${format === 'video' ? 'Encrypted Video Room (Link sent to ' + clientEmail + ')' : 'Audio-Only Phone Call'}\n` +
      `Platform: Re-Embroidered Conversations (London, UK)\n\n` +
      `Note: Please ensure you are in a quiet, undisturbed space with a cup of tea or water. Looking forward to our conversation.`
  );
  const googleCalendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`;

  // Handle iCal .ics download
  const handleDownloadIcs = () => {
    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Re-Embroidered Conversations//Listening Session//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${bookingId}@re-embroidered.com`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      `SUMMARY:Listening Session with Shahd Karaeen`,
      `DESCRIPTION:Private listening conversation with Shahd Karaeen.\\nBooking ID: ${bookingId}\\nFormat: ${format}`,
      `LOCATION:${format === 'video' ? 'Private Video Meeting' : 'Phone Call'}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `listening-session-shahd-karaeen-${bookingId}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyBookingId = () => {
    navigator.clipboard.writeText(bookingId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  const copyTestUrl = (paramString: string) => {
    const url = `${window.location.origin}${window.location.pathname}?${paramString}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const applyUrlPreset = (query: string) => {
    window.history.pushState({}, '', `${window.location.pathname}?${query}`);
    setParams(new URLSearchParams(`?${query}`));
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#282524] font-sans selection:bg-[#F2E5D9] selection:text-[#282524] relative paper-grain pb-24">
      {/* Top Test Banner for Developers & Stakeholders */}
      {showTestBar && (
        <aside
          aria-label="URL Parameter Instant Testing Bar"
          className="bg-[#282524] text-[#FAF8F5] border-b border-[#3D3835] px-4 py-2.5 text-xs font-sans print:hidden shadow-md"
        >
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 bg-[#A35048] text-white px-2 py-0.5 rounded-full font-medium tracking-wide uppercase text-[10px]">
                <Sparkles className="w-3 h-3" /> URL Test Mode
              </span>
              <span className="text-[#C4B7A9] hidden sm:inline">
                Test how Stripe redirects into this confirmation page via URL parameters.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  applyUrlPreset(
                    `payment_success=true&booking_id=RC-${Math.floor(10000 + Math.random() * 90000)}&format=video&name=Sarah+Jenkins&date=Thursday,+24+September+2026&time=14:00+-+14:55`
                  )
                }
                className="bg-[#3D3835] hover:bg-[#4E4844] text-white px-2.5 py-1 rounded transition-colors cursor-pointer"
              >
                Preset: Video Session
              </button>

              <button
                type="button"
                onClick={() =>
                  applyUrlPreset(
                    `payment_success=true&booking_id=RC-${Math.floor(10000 + Math.random() * 90000)}&format=audio&name=David+Morrison&date=Monday,+28+September+2026&time=10:00+-+10:55`
                  )
                }
                className="bg-[#3D3835] hover:bg-[#4E4844] text-white px-2.5 py-1 rounded transition-colors cursor-pointer"
              >
                Preset: Phone Call
              </button>

              <button
                type="button"
                onClick={() =>
                  copyTestUrl(
                    `payment_success=true&booking_id=${bookingId}&format=${format}&session_id=cs_test_simulated_success`
                  )
                }
                className="inline-flex items-center gap-1 bg-[#A35048] hover:bg-[#8C4038] text-white px-2.5 py-1 rounded transition-colors cursor-pointer"
              >
                {copiedUrl ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{copiedUrl ? 'Copied URL!' : 'Copy Stripe URL'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTestBar(false)}
                className="text-[#99908A] hover:text-white ml-2 text-xs cursor-pointer"
                title="Hide test bar"
              >
                Hide
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Editorial Header / Navigation */}
      <header className="border-b border-[#E8DFD5] bg-[#FAF8F5]/90 backdrop-blur-md sticky top-0 z-30 print:hidden">
        <div className="max-w-5xl mx-auto px-6 h-18 flex items-center justify-between">
          <button
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-[#78716C] hover:text-[#282524] transition-colors cursor-pointer font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Re-Embroidered</span>
          </button>

          <div className="text-center">
            <span className="font-serif text-lg tracking-wide text-[#282524] font-medium block">
              Re-Embroidered Conversations
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#A35048] font-sans">
              Shahd Karaeen
            </span>
          </div>

          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-xs text-[#78716C] hover:text-[#282524] transition-colors cursor-pointer border border-[#E8DFD5] px-3 py-1.5 rounded-full bg-white/60 shadow-2xs"
            title="Print or Save as PDF"
          >
            <Printer className="w-3.5 h-3.5 text-[#A35048]" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
        </div>
      </header>

      {/* Main Confirmation Content */}
      <main className="max-w-3xl mx-auto px-6 pt-10 sm:pt-14">
        {/* Success Card */}
        <div className="bg-[#FDFCFB] border border-[#E8DFD5] rounded-3xl p-8 sm:p-12 shadow-sm relative overflow-hidden">
          {/* Terracotta Heritage Top Accent Bar */}
          <div className="h-2 w-full bg-gradient-to-r from-[#8C4038] via-[#A35048] to-[#C47065] absolute top-0 left-0" />

          {/* Central Confirmation Header */}
          <div className="text-center space-y-4 max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-full bg-[#FAF2EB] text-[#A35048] border border-[#E8DFD5] flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-9 h-9 stroke-[1.75]" />
            </div>

            <div className="inline-flex items-center gap-2 bg-[#FAF2EB] px-3.5 py-1 rounded-full border border-[#E8DFD5] text-xs font-sans text-[#8C4038] font-medium">
              <ShieldCheck className="w-3.5 h-3.5 text-[#A35048]" />
              <span>Reservation Confirmed & Secured</span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#282524] font-medium tracking-tight">
              Your conversation with Shahd is reserved.
            </h1>

            <p className="font-sans text-sm sm:text-base text-[#68635F] leading-relaxed font-light">
              Thank you, <span className="text-[#282524] font-medium">{clientName}</span>. Your private 55-minute listening session has been secured in Shahd Karaeen's personal calendar.
            </p>

            {/* Reference Badge with Copy Button */}
            <div className="pt-2 flex items-center justify-center gap-2">
              <div className="inline-flex items-center gap-2 bg-[#FAF8F5] border border-[#E8DFD5] rounded-lg px-3 py-1.5 text-xs font-mono text-[#282524]">
                <span className="text-[#78716C] font-sans text-[11px] uppercase tracking-wider">Booking ID:</span>
                <span className="font-bold text-[#A35048]">{bookingId}</span>
              </div>
              <button
                type="button"
                onClick={copyBookingId}
                className="p-1.5 rounded-lg border border-[#E8DFD5] bg-[#FAF8F5] hover:bg-white text-[#78716C] hover:text-[#282524] transition-colors cursor-pointer text-xs flex items-center gap-1"
                title="Copy reference code"
              >
                {copiedId ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="text-[11px]">{copiedId ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Payment & Stripe Status Callout */}
          <div className="mt-8 bg-[#FAF8F5] rounded-2xl border border-[#E8DFD5] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#E8DFD5] text-xs font-sans">
              <span className="text-[#78716C] flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-[#A35048]" />
                <span>Payment Status</span>
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[#2E6B48] bg-[#EAF5EE] px-2.5 py-0.5 rounded-full border border-[#D0E7D7]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2E6B48]" />
                {isStripeRedirect ? 'Paid via Stripe Checkout' : 'Payment Settled'} ({amount})
              </span>
            </div>

            {/* Session Attributes Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm font-sans">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#F5EFE9] text-[#A35048] shrink-0 mt-0.5">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[#78716C] block text-xs">Date of Conversation</span>
                  <span className="font-medium text-[#282524]">{date}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#F5EFE9] text-[#A35048] shrink-0 mt-0.5">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[#78716C] block text-xs">Time & Duration</span>
                  <span className="font-medium text-[#282524]">{time} ({timeZone}) · 55 min</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#F5EFE9] text-[#A35048] shrink-0 mt-0.5">
                  {format === 'video' ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
                </div>
                <div>
                  <span className="text-[#78716C] block text-xs">Conversation Format</span>
                  <span className="font-medium text-[#282524] capitalize">
                    {format === 'video' ? 'Private Video Meeting (Encrypted)' : 'Audio-Only Phone Call'}
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-[#F5EFE9] text-[#A35048] shrink-0 mt-0.5">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[#78716C] block text-xs">Confirmation Sent To</span>
                  <span className="font-medium text-[#282524] break-all">{clientEmail}</span>
                </div>
              </div>
            </div>

            {sessionId && isStripeRedirect && (
              <div className="pt-2 text-[11px] font-mono text-[#99908A] flex items-center justify-between border-t border-[#E8DFD5]">
                <span>Stripe Session: {sessionId}</span>
                <span className="font-sans text-[#78716C]">Receipt emailed automatically</span>
              </div>
            )}
          </div>

          {/* Authentic Deckled Note from Shahd Karaeen */}
          <div className="relative text-left my-8">
            <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 bg-[#F1E7DD] rounded-2xl border border-[#E3D5C5] -z-10" />
            <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-[#FDFBF8] via-[#FAF6F1] to-[#F5EEE6] border border-[#EAE0D5] border-l-4 border-l-[#A35048] shadow-xs">
              <div className="flex items-center gap-2 text-xs font-serif text-[#A35048] uppercase tracking-wider mb-2.5">
                <Coffee className="w-4 h-4 text-[#A35048]" />
                <span>A quiet note before our conversation</span>
              </div>
              <blockquote className="font-serif italic text-base sm:text-lg text-[#3E3A37] leading-relaxed">
                “When the time comes, simply find a quiet chair where you won’t be interrupted, make a cup of tea or pour a glass of water, and click the link. You don’t need notes. I am looking forward to meeting you.”
              </blockquote>
              <span className="block text-xs font-sans text-[#78716C] mt-3 text-right font-medium">
                — Shahd Karaeen
              </span>
            </div>
          </div>

          {/* Calendar Actions */}
          <div className="space-y-3 pt-2">
            <div className="text-center">
              <span className="text-xs uppercase tracking-widest text-[#78716C] font-sans font-medium">
                Sync With Your Calendar
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href={googleCalendarLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FAF8F5] hover:bg-white text-[#282524] border border-[#E8DFD5] text-xs font-sans font-medium px-5 py-3 rounded-full shadow-2xs hover:shadow-xs transition-all cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4 text-[#A35048]" />
                <span>Add to Google Calendar</span>
                <ExternalLink className="w-3 h-3 text-[#99908A]" />
              </a>

              <button
                type="button"
                onClick={handleDownloadIcs}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#FAF8F5] hover:bg-white text-[#282524] border border-[#E8DFD5] text-xs font-sans font-medium px-5 py-3 rounded-full shadow-2xs hover:shadow-xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#A35048]" />
                <span>Download .ics File (Apple / Outlook)</span>
              </button>
            </div>
          </div>

          {/* Reassuring Next Steps Timeline */}
          <div className="mt-10 pt-8 border-t border-[#E8DFD5] space-y-4">
            <h3 className="font-serif text-lg text-[#282524] font-medium text-center">
              What happens next
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-sans">
              <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E8DFD5] space-y-1.5">
                <span className="w-6 h-6 rounded-full bg-[#FAF2EB] text-[#A35048] flex items-center justify-center font-serif text-xs font-medium border border-[#E8DFD5]">
                  1
                </span>
                <h4 className="font-medium text-[#282524]">Check your inbox</h4>
                <p className="text-[#68635F] leading-relaxed">
                  A receipt and calendar invite have been sent to {clientEmail}. Check your spam folder if it doesn't arrive within 5 minutes.
                </p>
              </div>

              <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E8DFD5] space-y-1.5">
                <span className="w-6 h-6 rounded-full bg-[#FAF2EB] text-[#A35048] flex items-center justify-center font-serif text-xs font-medium border border-[#E8DFD5]">
                  2
                </span>
                <h4 className="font-medium text-[#282524]">24-Hour Reminder</h4>
                <p className="text-[#68635F] leading-relaxed">
                  Shahd will send a quiet reminder 24 hours prior with the direct, one-click meeting link.
                </p>
              </div>

              <div className="bg-[#FAF8F5] p-4 rounded-xl border border-[#E8DFD5] space-y-1.5">
                <span className="w-6 h-6 rounded-full bg-[#FAF2EB] text-[#A35048] flex items-center justify-center font-serif text-xs font-medium border border-[#E8DFD5]">
                  3
                </span>
                <h4 className="font-medium text-[#282524]">Flexible Rescheduling</h4>
                <p className="text-[#68635F] leading-relaxed">
                  Life happens. You can reschedule anytime up to 24 hours in advance by replying directly to your email.
                </p>
              </div>
            </div>
          </div>

          {/* Footer Back Action */}
          <div className="mt-10 pt-6 border-t border-[#E8DFD5] text-center space-y-3">
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center justify-center gap-2 bg-[#282524] hover:bg-[#3D3835] text-[#FAF8F5] px-6 py-3 rounded-full text-xs font-sans font-medium transition-colors cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Return to Re-Embroidered Homepage</span>
            </button>
            <p className="text-[11px] text-[#99908A] font-sans">
              Have any immediate questions? Reach Shahd directly at{' '}
              <a href="mailto:shahd@re-embroidered.com" className="text-[#A35048] underline">
                shahd@re-embroidered.com
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
