import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { HeroVideo } from './components/HeroVideo';
import { Experience } from './components/Experience';
import { ThemeQuestionInterstitial } from './components/ThemeQuestionInterstitial';
import { AboutShahd } from './components/AboutShahd';
import { BookShowcase } from './components/BookShowcase';
import { BookingSection } from './components/BookingSection';
import { BoundariesSection } from './components/BoundariesSection';
import { Footer } from './components/Footer';
import { BookingConfirmationPage } from './components/BookingConfirmationPage';
import { BookingConfirmation } from './types';
import { Sparkles } from 'lucide-react';

export default function App() {
  const [activeConfirmation, setActiveConfirmation] = useState<BookingConfirmation | null>(null);

  // Check if URL parameters signal a confirmation view
  const checkIsConfirmationFromUrl = () => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search;
    const params = new URLSearchParams(search);
    return (
      params.get('confirmation') === 'true' ||
      params.get('payment_success') === 'true' ||
      params.get('success') === 'true' ||
      params.has('session_id') ||
      params.has('booking_id') ||
      params.has('id') ||
      window.location.pathname.endsWith('/confirmation')
    );
  };

  const [isConfirmationView, setIsConfirmationView] = useState(checkIsConfirmationFromUrl);

  // Sync state with browser navigation and popstate events
  useEffect(() => {
    const handlePopState = () => {
      setIsConfirmationView(checkIsConfirmationFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleScrollToBooking = () => {
    const bookingEl = document.getElementById('book-session');
    if (bookingEl) {
      bookingEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Open confirmation page and sync URL search params
  const handleOpenConfirmation = (conf?: BookingConfirmation) => {
    if (conf) {
      setActiveConfirmation(conf);
      const query = new URLSearchParams({
        payment_success: 'true',
        booking_id: conf.bookingId,
        name: conf.clientName,
        email: conf.clientEmail,
        date: conf.date,
        time: conf.time,
        format: conf.format,
      });
      window.history.pushState({}, '', `${window.location.pathname}?${query.toString()}`);
    } else {
      window.history.pushState({}, '', `${window.location.pathname}?payment_success=true&booking_id=RC-78421`);
    }
    setIsConfirmationView(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Return to homepage and clean URL search params
  const handleBackToHome = () => {
    window.history.pushState({}, '', window.location.pathname.replace(/\/confirmation\/?$/, '') || '/');
    setIsConfirmationView(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // If in confirmation view, render the dedicated BookingConfirmationPage
  if (isConfirmationView) {
    return (
      <BookingConfirmationPage
        onBackToHome={handleBackToHome}
        initialConfirmation={activeConfirmation}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#282524] font-sans selection:bg-[#F2E5D9] selection:text-[#282524] relative paper-grain">
      {/* Floating Instant Testing Button for Preview */}
      <aside aria-label="Instant Test Floating Trigger" className="fixed bottom-5 right-5 z-50 print:hidden">
        <button
          type="button"
          onClick={() => handleOpenConfirmation()}
          className="group flex items-center gap-2 bg-[#282524] hover:bg-[#3D3835] text-[#FAF8F5] px-4 py-2.5 rounded-full shadow-lg border border-[#A35048]/40 text-xs font-sans font-medium transition-all duration-200 hover:scale-105 cursor-pointer"
          title="Instant Testing: View Stripe Booking Confirmation Page"
        >
          <span className="w-2 h-2 rounded-full bg-[#A35048] group-hover:animate-ping" />
          <Sparkles className="w-3.5 h-3.5 text-[#E8DFD5]" />
          <span>Test Confirmation Page</span>
        </button>
      </aside>

      {/* Editorial Navigation */}
      <Navigation onBookClick={handleScrollToBooking} />

      <main>
        {/* Priority 1: Meet Shahd and hear her explain the service */}
        <HeroVideo onBookClick={handleScrollToBooking} />

        {/* Explain the experience: Uncomplicated, reassuring, 5 pillars */}
        <Experience onBookClick={handleScrollToBooking} />

        {/* Atmospheric Interstitial: The central theme question from Hope: Re-Embroidered */}
        <ThemeQuestionInterstitial />

        {/* Priority 2: Understand who Shahd is and why they can trust her */}
        <AboutShahd onBookClick={handleScrollToBooking} />

        {/* The literary foundation: The novel Hope: Re-Embroidered */}
        <BookShowcase />

        {/* Priority 3: Book a 55-minute session */}
        <BookingSection onGoToConfirmation={handleOpenConfirmation} />

        {/* Boundaries and reassuring clarity */}
        <BoundariesSection />
      </main>

      {/* Literary Footer */}
      <Footer />
    </div>
  );
}
