"use client";

import React, { useState } from "react";
import {
  ShieldCheck,
  HeartHandshake,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { FREQUENT_QUESTIONS } from "../data/content";
import { EmbroideredThread } from "./EmbroideredThread";

export const BoundariesSection: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <section
      id="boundaries"
      className="py-20 md:py-24 bg-[#F5EFE9]/40 relative border-t border-[#E8DFD5]"
    >
      <div className="max-w-4xl mx-auto px-6">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-5 h-px bg-[#A35048]" />
            <span className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
              Clarity & Care
            </span>
            <span className="w-5 h-px bg-[#A35048]" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl text-[#282524] font-normal tracking-tight mb-4">
            Understanding our boundaries
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#68635F] leading-relaxed font-light">
            Clear boundaries protect both of us and ensure you receive the right
            kind of care.
          </p>
        </div>

        {/* Clear Boundary Comparison Card */}
        <div className="bg-[#FAF8F5] border border-[#E8DFD5] rounded-2xl p-6 sm:p-10 shadow-xs mb-14">
          <div className="grid md:grid-cols-2 gap-8 text-sm font-sans">
            {/* What this service is */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-[#63705C] font-medium">
                <HeartHandshake className="w-5 h-5 stroke-[1.75]" />
                <h3 className="font-serif text-xl text-[#282524]">
                  What these sessions are
                </h3>
              </div>
              <ul className="space-y-2.5 text-[#59534F] font-light">
                <li className="flex items-start gap-2">
                  <span className="text-[#63705C] mt-0.5">✓</span>
                  <span>
                    A dedicated private one-to-one conversation with Shahd
                    Karaeen.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#63705C] mt-0.5">✓</span>
                  <span>
                    A safe sounding board to untangle feelings, decisions, or
                    unsaid thoughts.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#63705C] mt-0.5">✓</span>
                  <span>
                    A quiet, non-judgmental space free of unsolicited advice or
                    performance.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#63705C] mt-0.5">✓</span>
                  <span>
                    Thoughtful reflections and active listening rooted in
                    narrative respect.
                  </span>
                </li>
              </ul>
            </div>

            {/* What this service is not */}
            <div className="space-y-4 md:border-l md:border-[#E8DFD5] md:pl-8">
              <div className="flex items-center gap-2 text-[#A35048] font-medium">
                <ShieldCheck className="w-5 h-5 stroke-[1.75]" />
                <h3 className="font-serif text-xl text-[#282524]">
                  What these sessions are not
                </h3>
              </div>
              <ul className="space-y-2.5 text-[#59534F] font-light">
                <li className="flex items-start gap-2">
                  <span className="text-[#A35048] mt-0.5">✕</span>
                  <span>
                    <strong>
                      Not psychological therapy or clinical counselling:
                    </strong>{" "}
                    Shahd Karaeen is a writer and seasoned listener, not a
                    licensed psychotherapist.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#A35048] mt-0.5">✕</span>
                  <span>
                    <strong>Not diagnostic or medical treatment:</strong> We do
                    not diagnose, treat, or manage mental health disorders.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-[#A35048] mt-0.5">✕</span>
                  <span>
                    <strong>Not crisis or emergency support:</strong> These
                    scheduled sessions are not equipped to respond to acute
                    psychiatric crises or self-harm.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          {/* Compassionate Emergency Support Box */}
          <div className="mt-8 pt-6 border-t border-[#E8DFD5] bg-[#F5EFE9]/60 -mx-6 -mb-6 sm:-mx-10 sm:-mb-10 p-6 sm:px-10 rounded-b-2xl">
            <p className="text-xs text-[#68635F] leading-relaxed mb-3">
              <strong className="text-[#282524] font-medium">
                If you are in distress or need urgent crisis support:
              </strong>{" "}
              Please connect with professional, round-the-clock resources where
              compassionate specialists are waiting to help you right now:
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs font-sans text-[#78716C]">
              <span>
                UK & Ireland:{" "}
                <strong className="text-[#282524]">Samaritans (116 123)</strong>{" "}
                or text SHOUT to 85258
              </span>
              <span>•</span>
              <span>
                US & Canada:{" "}
                <strong className="text-[#282524]">
                  988 Suicide & Crisis Lifeline
                </strong>
              </span>
              <span>•</span>
              <span>
                Worldwide:{" "}
                <a
                  href="https://findahelpline.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#A35048] underline"
                >
                  findahelpline.com
                </a>
              </span>
            </div>
          </div>
        </div>

        {/* Quiet FAQ Accordion */}
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <HelpCircle className="w-4 h-4 text-[#A35048]" />
            <h3 className="font-serif text-2xl text-[#282524] font-medium">
              Frequently asked questions
            </h3>
          </div>

          <div className="space-y-3">
            {FREQUENT_QUESTIONS.map((faq, i) => (
              <div
                key={i}
                className="bg-[#FAF8F5] border border-[#E8DFD5] rounded-xl overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 cursor-pointer"
                >
                  <span className="font-serif text-base text-[#282524] font-medium">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#78716C] shrink-0 transition-transform duration-200 ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 pt-1 text-sm font-sans text-[#68635F] font-light leading-relaxed border-t border-[#E8DFD5]/40">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14">
          <EmbroideredThread variant="divider" />
        </div>
      </div>
    </section>
  );
};
