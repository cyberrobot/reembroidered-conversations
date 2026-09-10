import React from 'react';
import laraAboutImg from '../assets/images/shahd_karaeen_portrait.jpeg';

interface AboutShahdProps {
  onBookClick: () => void;
}

export const AboutShahd: React.FC<AboutShahdProps> = ({ onBookClick }) => {
  return (
    <section id="about-shahd" className="py-20 md:py-28 bg-[#FAF8F5] relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-6">
        {/* Section Tag */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-6 h-px bg-[#A35048]" />
            <span className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
              The Person Behind The Service
            </span>
            <span className="w-6 h-px bg-[#A35048]" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#282524] font-normal tracking-tight">
            Meet Shahd Karaeen
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#78716C] mt-2 font-light">
            Author, listener, and founder of <em className="italic font-serif">Re-Embroidered Conversations</em>
          </p>
        </div>

        {/* Story Grid with Editorial Portrait & Personal Pledge */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          {/* Left Column: Portrait + Personal Pledge */}
          <div className="lg:col-span-5 space-y-6">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              {/* Decorative warm parchment offset frame */}
              <div className="absolute -inset-3 bg-gradient-to-br from-[#FBF7F2] to-[#F4ECE2] rounded-2xl border border-[#E5D9CC] -rotate-1 pointer-events-none shadow-xs" />

              {/* Main Photo Card */}
              <div className="relative rounded-2xl overflow-hidden border border-[#E8DDD2] shadow-sm bg-white">
                <img
                  src={laraAboutImg}
                  alt="Shahd Karaeen in her study with book and notebook"
                  referrerPolicy="no-referrer"
                  className="w-full aspect-[3/4] object-cover object-center"
                />

                {/* Subtle caption pill */}
                <div className="p-4 bg-gradient-to-r from-[#FAF7F2] to-[#F7EFE7] border-t border-[#E8DDD2] text-xs font-serif text-[#68635F] italic flex items-center justify-between">
                  <span>"Listening is an act of quiet hospitality."</span>
                  <span className="text-[#A35048] not-italic font-sans text-[10px] uppercase tracking-wider font-semibold">
                    SHAHD KARAEEN
                  </span>
                </div>
              </div>
            </div>

            {/* Personal Pledge - Positioned directly below photo to anchor the column */}
            <div className="pt-5 text-left space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A35048]" />
                <span className="text-[11px] font-sans uppercase tracking-widest text-[#A35048] font-semibold">
                  A Personal Pledge
                </span>
                <span className="h-px flex-1 bg-[#E8DFD5]/70" />
              </div>

              <blockquote className="font-serif italic text-sm sm:text-base text-[#282524] leading-relaxed pl-4 border-l-2 border-l-[#A35048]">
                “When you sit with me, you don't have to edit your truth or protect anyone’s comfort. Survival is not a weakness—it is proof of your resilience. You are safe to put the burden down.”
              </blockquote>

              <div className="pt-1 flex flex-col gap-2 font-sans text-xs">
                <span className="text-[#78716C]">
                  — Shahd Karaeen, Writer & Listener
                </span>
                <button
                  onClick={onBookClick}
                  className="font-medium text-[#A35048] hover:text-[#8C4038] underline underline-offset-4 cursor-pointer text-left self-start"
                >
                  Reserve a conversation with Shahd Karaeen →
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Personality & Narrative */}
          <div className="lg:col-span-7 space-y-6 font-sans text-[#4B4643]">
            <h3 className="font-serif text-2xl sm:text-3xl text-[#282524] font-normal leading-snug">
              “For as long as I can remember, words have been the way back to oneself.”
            </h3>

            <div className="space-y-4 text-base font-light leading-relaxed text-[#59534F]">
              <p>
                Born in Jerusalem and now rooted in the United Kingdom, my perspective has been shaped by the liminal spaces between homeland, displacement, and the unwritten expectations placed upon women across cultures. Long before I published my work, I kept diaries as a refuge—using words to name fears, untangle silence, and make sense of the quiet pressures women are taught to absorb.
              </p>

              <p>
                Over the years, those private journals evolved into poetry, fiction, and the novel <strong className="font-serif font-medium text-[#282524]">Hope: Re-Embroidered</strong>, alongside the <strong className="font-serif font-medium text-[#282524]">Re-Embroidered Conversations</strong> series. As someone who has walked through the realities of survival and emotional conditioning, I know intimately what it means to feel unseen, isolated, or conditioned to endure in silence.
              </p>

              <p>
                I am deeply interested in what happens behind closed doors—how silence operates within families, marriages, and cultural structures, and how speaking what has been buried can become an act of profound reclamation.
              </p>

              <p>
                These one-to-one sessions are not about providing tidy solutions. They are a dedicated, safe threshold where the truths you have carried quietly can finally be heard, untangled, and met with absolute presence.
              </p>
            </div>

            {/* Roles, Affiliations & Public Voice - Open, un-boxed editorial registry */}
            <div className="pt-6 border-t border-[#E8DFD5] space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-5 h-px bg-[#A35048]" />
                <h4 className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
                  Roles, Affiliations & Public Voice
                </h4>
              </div>

              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3.5 text-xs sm:text-sm text-[#4B4643]">
                <div className="flex items-start gap-2.5">
                  <span className="text-[#A35048] font-serif text-sm leading-none mt-1 select-none">•</span>
                  <div>
                    <span className="font-medium text-[#282524]">Author</span>,{' '}
                    <em className="font-serif italic text-[#A35048]">Hope: Re-Embroidered</em>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-[#A35048] font-serif text-sm leading-none mt-1 select-none">•</span>
                  <div>
                    <span className="font-medium text-[#282524]">Founder & Director</span>, Peace Is The Song CIC
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-[#A35048] font-serif text-sm leading-none mt-1 select-none">•</span>
                  <div>
                    <span className="font-medium text-[#282524]">Host & Creator</span>,{' '}
                    <em className="font-serif italic text-[#A35048]">Re-Embroidered Conversations</em>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-[#A35048] font-serif text-sm leading-none mt-1 select-none">•</span>
                  <div>
                    <span className="font-medium text-[#282524]">Internationally Published Poet</span>{' '}
                    <span className="text-[#78716C]">— Nexus Institute</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-[#A35048] font-serif text-sm leading-none mt-1 select-none">•</span>
                  <div>
                    <span className="font-medium text-[#282524]">Ambassador for Peace</span>{' '}
                    <span className="text-[#78716C]">— Universal Peace Federation (UPF)</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <span className="text-[#A35048] font-serif text-sm leading-none mt-1 select-none">•</span>
                  <div>
                    <span className="font-medium text-[#282524]">Lived-Experience Advocate</span> & Speaker
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
