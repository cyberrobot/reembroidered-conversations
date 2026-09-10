import React from 'react';
import { EXPERIENCE_PILLARS } from '../data/content';
import { EmbroideredThread } from './EmbroideredThread';

export const Experience: React.FC = () => {
  return (
    <section id="the-experience" className="py-20 md:py-28 bg-[#F5EFE9]/60 relative">
      <div className="max-w-5xl mx-auto px-6">
        {/* Section Header */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-6 h-px bg-[#A35048]" />
            <span className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
              The Conversation
            </span>
            <span className="w-6 h-px bg-[#A35048]" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#282524] font-normal tracking-tight mb-5">
            An uncomplicated, unhurried space.
          </h2>
          <p className="font-sans text-[#68635F] text-base sm:text-lg leading-relaxed font-light">
            You don't need to perform, explain yourself perfectly, or arrive with a goal.
            Here is what makes these 55 minutes different from everyday life.
          </p>
        </div>

        {/* 5 Core Pillars */}
        <div className="grid md:grid-cols-2 gap-6 sm:gap-8 mb-16">
          {EXPERIENCE_PILLARS.map((pillar, idx) => (
            <div
              key={idx}
              className={`bg-[#FAF8F5] p-8 rounded-2xl border border-[#E8DFD5] transition-all hover:border-[#D5C7B8] hover:shadow-xs relative ${
                idx === 4 ? 'md:col-span-2 md:max-w-2xl md:mx-auto w-full' : ''
              }`}
            >
              {/* Pillar Number & Stitch Tag */}
              <div className="flex items-center justify-between mb-4">
                <span className="font-serif italic text-2xl text-[#A35048] font-light">
                  {pillar.number}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]/50" />
              </div>

              <h3 className="font-serif text-xl sm:text-2xl text-[#282524] font-medium mb-3">
                {pillar.title}
              </h3>

              <p className="font-sans text-sm sm:text-base text-[#68635F] leading-relaxed font-light">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>

        {/* What people bring into the room */}
        <div className="bg-[#FAF8F5] border border-[#E8DFD5] rounded-2xl p-8 sm:p-12 mb-16">
          <div className="max-w-3xl mx-auto">
            <h3 className="font-serif text-2xl sm:text-3xl text-[#282524] font-medium mb-4 text-center">
              What might you bring into the room?
            </h3>
            <p className="font-sans text-sm text-[#78716C] text-center mb-8 max-w-xl mx-auto font-light">
              There is no threshold of importance or tidiness required. Women often book a session for:
            </p>

            <div className="grid sm:grid-cols-2 gap-4 text-sm text-[#4B4643] font-sans">
              <div className="p-4 rounded-xl bg-[#F5EFE9]/50 border border-[#E8DFD5]/70 flex items-start gap-3">
                <span className="text-[#A35048] font-serif text-lg leading-none mt-0.5">•</span>
                <p className="font-light">
                  <strong className="font-medium text-[#282524]">A quiet crossroad:</strong> Contemplating leaving a job, a relationship, or an identity that no longer fits.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F5EFE9]/50 border border-[#E8DFD5]/70 flex items-start gap-3">
                <span className="text-[#A35048] font-serif text-lg leading-none mt-0.5">•</span>
                <p className="font-light">
                  <strong className="font-medium text-[#282524]">Unfiltered unloading:</strong> Saying the messy, politically incorrect, or exhausted thoughts you can't tell your family.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F5EFE9]/50 border border-[#E8DFD5]/70 flex items-start gap-3">
                <span className="text-[#A35048] font-serif text-lg leading-none mt-0.5">•</span>
                <p className="font-light">
                  <strong className="font-medium text-[#282524]">Invisible labor:</strong> The exhaustion of holding everyone else’s emotional and domestic worlds together.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F5EFE9]/50 border border-[#E8DFD5]/70 flex items-start gap-3">
                <span className="text-[#A35048] font-serif text-lg leading-none mt-0.5">•</span>
                <p className="font-light">
                  <strong className="font-medium text-[#282524]">Quiet grief or change:</strong> A shift in health, children leaving home, an unacknowledged ending, or an unfulfilled longing.
                </p>
              </div>
            </div>

            <div className="mt-8 text-center">
              <p className="font-serif italic text-base sm:text-lg text-[#68635F]">
                "Or simply a Tuesday afternoon when you need to hear your own voice bounce back from someone who is truly paying attention."
              </p>
            </div>
          </div>
        </div>

        {/* Embroidered stitch bridge */}
        <EmbroideredThread variant="curved" />
      </div>
    </section>
  );
};
