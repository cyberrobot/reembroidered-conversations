import React from "react";

export const ThemeQuestionInterstitial: React.FC = () => {
  return (
    <section
      aria-label="A question from Hope: Re-Embroidered"
      className="py-14 sm:py-20 bg-gradient-to-b from-[#FAF8F5] via-[#F7EFE8]/60 to-[#FAF8F5] border-y border-[#EBE1D7]/60 relative overflow-hidden"
    >
      <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
        {/* Subtle crimson stitch accent */}
        <div className="inline-flex items-center justify-center gap-2 mb-6">
          <span className="w-8 h-px bg-[#A35048]/40" />
          <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]" />
          <span className="w-8 h-px bg-[#A35048]/40" />
        </div>

        {/* Central Existential Question from the Novel Back Cover */}
        <blockquote className="font-serif text-2xl sm:text-3xl md:text-4xl text-[#282524] font-normal leading-snug sm:leading-relaxed max-w-3xl mx-auto tracking-tight">
          “If everyone agrees on a version of you that is not true…{" "}
          <span className="italic text-[#A35048]">
            does it become truth anyway?
          </span>
          ”
        </blockquote>

        {/* Attribution & Contextual Bridge */}
        <div className="mt-5 space-y-2 max-w-xl mx-auto">
          <cite className="font-sans text-xs uppercase tracking-widest text-[#78716C] not-italic block">
            From the novel{" "}
            <span className="font-serif italic capitalize text-[#282524] text-sm">
              Hope: Re-Embroidered
            </span>{" "}
            by Shahd Karaeen
          </cite>
          <p className="font-sans text-xs sm:text-sm text-[#68635F] font-light leading-relaxed pt-1">
            In relationships, families, and silent compromises, the world often
            builds a story about us. This listening room exists so you can speak
            your unedited truth—without anyone correcting or replacing you.
          </p>
        </div>
      </div>
    </section>
  );
};
