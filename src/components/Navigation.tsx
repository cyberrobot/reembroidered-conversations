import React, { useState, useEffect } from 'react';
import { BookOpen, Calendar, Menu, X, HeartHandshake } from 'lucide-react';

interface NavigationProps {
  onBookClick: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ onBookClick }) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <header
      id="main-nav"
      className={`fixed top-0 left-0 right-0 z-40 transition-all duration-300 ${
        scrolled
          ? 'bg-[#FAF8F5]/90 backdrop-blur-md shadow-xs border-b border-[#E8DFD5]'
          : 'bg-transparent border-b border-[#E8DFD5]/40'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <a
          href="#"
          className="group flex flex-col focus:outline-none shrink-0"
          onClick={(e) => {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span className="font-serif text-xl sm:text-2xl tracking-tight text-[#282524] font-medium group-hover:text-[#A35048] transition-colors whitespace-nowrap">
            Re-Embroidered Conversations
          </span>
          <span className="text-xs text-[#78716C] tracking-wide font-sans flex items-center gap-1.5 whitespace-nowrap">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#A35048]" />
            Private Listening with Shahd Karaeen
          </span>
        </a>

        {/* Desktop Nav Links (Visible on desktop >= 1024px) */}
        <nav className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm font-sans text-[#4B4643]">
          <button
            onClick={() => scrollTo('meet-shahd')}
            className="hover:text-[#A35048] transition-colors cursor-pointer py-1"
          >
            Meet Shahd
          </button>
          <button
            onClick={() => scrollTo('the-experience')}
            className="hover:text-[#A35048] transition-colors cursor-pointer py-1"
          >
            The Experience
          </button>
          <button
            onClick={() => scrollTo('about-shahd')}
            className="hover:text-[#A35048] transition-colors cursor-pointer py-1"
          >
            About Shahd
          </button>
          <button
            onClick={() => scrollTo('the-book')}
            className="hover:text-[#A35048] transition-colors cursor-pointer py-1"
          >
            The Novel
          </button>
          <button
            onClick={() => scrollTo('boundaries')}
            className="hover:text-[#A35048] transition-colors cursor-pointer py-1 text-[#78716C]"
          >
            Boundaries
          </button>

          <button
            id="nav-book-button"
            onClick={onBookClick}
            className="inline-flex items-center gap-2 bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] text-sm font-medium px-5 py-2.5 rounded-full transition-all duration-200 shadow-xs cursor-pointer active:scale-98"
          >
            <Calendar className="w-4 h-4 stroke-[1.75]" />
            <span>Reserve a Conversation</span>
          </button>
        </nav>

        {/* Mobile & Tablet controls */}
        <div className="flex lg:hidden items-center gap-3">
          {/* Visible on Tablet (sm & md, >= 640px), hidden on mobile (< 640px) */}
          <button
            onClick={onBookClick}
            className="hidden sm:inline-flex items-center gap-1.5 bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] text-xs font-medium px-4 py-2 rounded-full shadow-xs cursor-pointer transition-all duration-150 active:scale-98"
          >
            <Calendar className="w-3.5 h-3.5 stroke-[1.75]" />
            <span className="hidden md:inline">Reserve a Conversation</span>
            <span className="md:hidden">Reserve (£55)</span>
          </button>

          <button
            id="mobile-nav-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-[#4B4643] hover:text-[#282524] cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile & Tablet dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#FAF8F5] border-b border-[#E8DFD5] px-6 py-5 shadow-lg flex flex-col gap-4 font-sans text-base">
          <button
            onClick={() => scrollTo('meet-shahd')}
            className="text-left text-[#4B4643] hover:text-[#A35048] py-1.5"
          >
            Meet Shahd & Video
          </button>
          <button
            onClick={() => scrollTo('the-experience')}
            className="text-left text-[#4B4643] hover:text-[#A35048] py-1.5"
          >
            The Experience
          </button>
          <button
            onClick={() => scrollTo('about-shahd')}
            className="text-left text-[#4B4643] hover:text-[#A35048] py-1.5"
          >
            About Shahd
          </button>
          <button
            onClick={() => scrollTo('the-book')}
            className="text-left text-[#4B4643] hover:text-[#A35048] py-1.5"
          >
            The Novel: Hope: Re-Embroidered
          </button>
          <button
            onClick={() => scrollTo('boundaries')}
            className="text-left text-[#78716C] hover:text-[#A35048] py-1.5"
          >
            Boundaries & FAQ
          </button>
          <div className="pt-2 border-t border-[#E8DFD5]">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onBookClick();
              }}
              className="w-full text-center bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] font-medium py-3 rounded-full shadow-xs cursor-pointer"
            >
              Reserve a Conversation (£55)
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
