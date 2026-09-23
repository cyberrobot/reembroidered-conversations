import React from "react";
import { LegalLink } from "./LegalLink";
import { PUBLIC_COMPANY } from "../data/legal";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#282524] text-[#FAF8F5] py-16 px-6 font-sans border-t border-[#3E3A37]">
      <div className="max-w-5xl mx-auto">
        <div className="grid md:grid-cols-12 gap-10 pb-12 border-b border-[#3E3A37]">
          {/* Brand & Closing Thought */}
          <div className="md:col-span-5 space-y-4">
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
          <div className="md:col-span-2 space-y-3 text-xs text-[#D9CFC4]">
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
          <div className="md:col-span-2 space-y-3 text-xs text-[#D9CFC4]">
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
                Private one-to-one sessions via Google Meet. See our Privacy
                Notice and Terms for how information is handled.
              </li>
            </ul>
          </div>

          <div className="md:col-span-3 space-y-3 text-xs text-[#D9CFC4]">
            <span className="text-white font-medium uppercase tracking-wider block text-[11px]">
              Legal
            </span>
            <ul className="space-y-2">
              <li>
                <LegalLink
                  document="terms"
                  className="hover:text-white transition-colors underline-offset-4 hover:underline"
                >
                  Terms
                </LegalLink>
              </li>
              <li>
                <LegalLink
                  document="privacy"
                  className="hover:text-white transition-colors underline-offset-4 hover:underline"
                >
                  Privacy Notice
                </LegalLink>
              </li>
            </ul>
            <address className="not-italic space-y-1 pt-3 text-[#A8A29E] leading-relaxed">
              <strong className="block font-medium text-[#D9CFC4]">
                {PUBLIC_COMPANY.legalName}
              </strong>
              <span className="block">
                Company number {PUBLIC_COMPANY.companyNumber}
              </span>
              <span className="block">
                Registered in {PUBLIC_COMPANY.jurisdiction}
              </span>
              <span className="block">{PUBLIC_COMPANY.companyType}</span>
              <span className="block pt-1">
                Registered office:
                <br />
                {PUBLIC_COMPANY.registeredOfficeLines.map((line, index) => (
                  <React.Fragment key={`${line}-${index}`}>
                    {line}
                    {index < PUBLIC_COMPANY.registeredOfficeLines.length - 1
                      ? ","
                      : ""}
                    {index <
                      PUBLIC_COMPANY.registeredOfficeLines.length - 1 && <br />}
                  </React.Fragment>
                ))}
              </span>
            </address>
          </div>
        </div>

        {/* Bottom Colophon */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#A8A29E]">
          <div>© 2026 {PUBLIC_COMPANY.legalName}. All rights reserved.</div>
          <div className="flex items-center gap-1.5 text-xs">
            <span>Woven with care & quiet attention</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]" />
          </div>
        </div>
      </div>
    </footer>
  );
};
