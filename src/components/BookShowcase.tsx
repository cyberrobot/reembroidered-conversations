import React from 'react';
import bookImg from '../assets/images/hope_reembroidered_book.jpg';
import { EmbroideredThread } from './EmbroideredThread';

export const BookShowcase: React.FC = () => {
  return (
    <section
      id="the-book"
      className="py-20 md:py-28 bg-rosy-parchment border-y border-[#EBE1D7]/80 relative overflow-hidden"
    >
      <div className="max-w-5xl mx-auto px-6 relative z-10">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Text & Literary context */}
          <div className="lg:col-span-6 space-y-6 order-2 lg:order-1">
            <div className="inline-flex items-center gap-2">
              <span className="w-5 h-px bg-[#A35048]" />
              <span className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
                Literary Foundation & Series
              </span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl text-[#282524] font-normal leading-tight">
              Rooted in the novel <br />
              <span className="italic font-serif">Hope: Re-Embroidered</span>
            </h2>

            <p className="font-sans text-sm sm:text-base text-[#59534F] leading-relaxed font-light">
              These sessions and the <strong className="font-serif font-medium text-[#282524]">Re-Embroidered Conversations</strong> series grew directly out of the psychological themes of Shahd Karaeen's novel, <em className="font-serif italic text-[#282524]">Hope: Re-Embroidered</em>. Following a woman confronting coercive control, memory, and inherited patterns of silence while seeking autonomy, the novel examines how trauma shapes identity—and how survival often begins with the quiet courage of telling the unvarnished truth.
            </p>

            {/* Excerpt Card with Deckled Book-Leaf & Rosy-Cream Color Harmony */}
            <div className="relative my-2">
              {/* Subtle offset under-layer simulating a physical book leaf */}
              <div className="absolute inset-0 translate-x-1 translate-y-1 bg-[#F1E7DD] rounded-r-xl rounded-l-xs border border-[#E3D5C5] -z-10" />

              <div className="p-6 sm:p-7 bg-gradient-to-br from-[#FDFBF8] via-[#FAF6F1] to-[#F5EEE6] border border-[#EAE0D5] border-l-3 border-l-[#A35048] rounded-r-xl rounded-l-xs shadow-[0_4px_16px_-2px_rgba(163,80,72,0.06),0_1px_2px_rgba(40,37,36,0.04)] space-y-3 font-serif">
                <p className="text-base sm:text-lg italic text-[#282524] leading-relaxed">
                  “What changed was not a person. It was the space I allowed myself to occupy.”
                </p>
                <div className="text-xs font-sans text-[#78716C] not-italic flex items-center pt-1 border-t border-[#EAE0D5]/70">
                  <span>
                    — Excerpt from <span className="font-serif italic text-[#282524]">Hope: Re-Embroidered</span> by Shahd Karaeen
                  </span>
                </div>
              </div>
            </div>

            <p className="font-sans text-sm text-[#68635F] leading-relaxed font-light">
              This space is an invitation to step away from the pressure to endure quietly. It is a room to explore the realities of survival, identity, and healing without needing to justify yourself to anyone.
            </p>
          </div>

          {/* Book Image Column */}
          <div className="lg:col-span-6 order-1 lg:order-2">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Decorative tactile paper offset frame */}
              <div className="absolute -inset-2.5 sm:-inset-3 bg-gradient-to-br from-[#FBF7F2] to-[#F4ECE2] rounded-2xl border border-[#E5D9CC] rotate-1 pointer-events-none shadow-xs" />

              <div className="relative rounded-2xl overflow-hidden border border-[#E8DDD2] shadow-sm bg-white">
                <img
                  src={bookImg.src}
                  alt="Clothbound hardback of Hope: Re-Embroidered with embroidery needle and thread"
                  referrerPolicy="no-referrer"
                  className="w-full aspect-[4/3] object-cover object-center"
                />
                <div className="p-4 bg-gradient-to-r from-[#FAF7F2] to-[#F7EFE7] border-t border-[#E8DDD2] flex items-center justify-between text-xs text-[#78716C] font-sans">
                  <span>Hope: Re-Embroidered · A Psychological Novel</span>
                  <span className="font-serif text-[#A35048] italic font-medium">Hardcover edition</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <EmbroideredThread variant="knot" />
        </div>
      </div>
    </section>
  );
};
