import React from "react";
import { Heart } from "lucide-react";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#282524] text-[#FAF8F5] py-16 px-6 font-sans border-t border-[#3E3A37]">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-12 gap-10 pb-12 border-b border-[#3E3A37]">
          {/* Brand & Closing Thought */}
          <div className="md:col-span-6 space-y-4">
            <span className="font-serif text-2xl tracking-tight text-white block">
              Re-Embroidered Conversations
            </span>
            <p className="font-serif italic text-[#D9CFC4] text-base leading-relaxed max-w-md">
              “Sometimes, you don’t need an answer. You simply need someone to
              sit in the room while you listen to the sound of your own truth.”
            </p>
            <span className="text-xs text-[#A8A29E] block">
              Private one-to-one listening sessions with Shahd Karaeen.
            </span>
          </div>

          {/* Quick Links */}
          <div className="md:col-span-3 space-y-3 text-xs text-[#D9CFC4]">
            <span className="text-white font-medium uppercase tracking-wider block text-[11px]">
              Exploration
            </span>
            <ul className="space-y-2">
              <li>
                <a
                  href="#meet-shahd"
                  className="hover:text-white transition-colors"
                >
                  Meet Shahd Karaeen (Video Note)
                </a>
              </li>
              <li>
                <a
                  href="#the-experience"
                  className="hover:text-white transition-colors"
                >
                  The Experience
                </a>
              </li>
              <li>
                <a
                  href="#about-shahd"
                  className="hover:text-white transition-colors"
                >
                  About Shahd Karaeen & Background
                </a>
              </li>
              <li>
                <a
                  href="#the-book"
                  className="hover:text-white transition-colors"
                >
                  The Novel: Hope: Re-Embroidered
                </a>
              </li>
            </ul>
          </div>

          {/* Boundaries & Booking */}
          <div className="md:col-span-3 space-y-3 text-xs text-[#D9CFC4]">
            <span className="text-white font-medium uppercase tracking-wider block text-[11px]">
              Care & Integrity
            </span>
            <ul className="space-y-2">
              <li>
                <a
                  href="#book-session"
                  className="text-[#E5988F] hover:text-white font-medium transition-colors"
                >
                  Reserve a Conversation (£55)
                </a>
              </li>
              <li>
                <a
                  href="#boundaries"
                  className="hover:text-white transition-colors"
                >
                  Boundaries & Safety
                </a>
              </li>
              <li className="text-[#A8A29E] leading-relaxed pt-1">
                Strict personal confidentiality. All sessions held over secure
                private video or telephone links.
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Colophon */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A8A29E]">
          <div>
            © 2026 PEACE IS THE SONG C.I.C. Company number 16883201. All rights
            reserved.
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span>Woven with care & quiet attention</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]" />
          </div>
        </div>
      </div>
    </footer>
  );
};
