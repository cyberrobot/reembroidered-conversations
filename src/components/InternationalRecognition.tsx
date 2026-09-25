import { ExternalLink, Globe, Feather, Bookmark, Compass } from "lucide-react";
import { EmbroideredThread } from "./EmbroideredThread";
import { ScrollToBookingButton } from "./ScrollToBookingButton";

export const InternationalRecognition = () => {
  return (
    <section
      id="international-recognition"
      className="py-20 md:py-28 bg-[#FAF8F5] relative overflow-hidden border-t border-[#E8DFD5]/80"
    >
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 mb-3">
            <span className="w-6 h-px bg-[#A35048]" />
            <span className="text-xs uppercase tracking-widest font-sans font-medium text-[#A35048]">
              Literary Dossier & Nexus Instituut
            </span>
            <span className="w-6 h-px bg-[#A35048]" />
          </div>
          <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#282524] font-normal tracking-tight max-w-3xl mx-auto">
            An International Voice on Silence, Memory & Justice
          </h2>
          <p className="font-sans text-sm sm:text-base text-[#78716C] mt-3 font-light max-w-2xl mx-auto">
            Examining human endurance and unexpressed truth alongside global
            philosophers and authors at the Netherlands’ foremost cultural
            think-tank.
          </p>
        </div>

        {/* Two-Column Editorial Spread: Direction A (Literary Dossier & Archival Page) */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-stretch">
          {/* Left Column: Essayistic Note on Language, Discourse & The Poet's Ear */}
          <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
            <div className="space-y-5 font-sans text-[#4B4643]">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F4ECE2] text-[#A35048] text-xs font-sans font-medium border border-[#E8DDD2] w-fit">
                <Compass className="w-3.5 h-3.5" />
                <span>European Philosophical Discourse · Nexus 100</span>
              </div>

              <h3 className="font-serif text-2xl sm:text-3xl text-[#282524] font-normal leading-snug">
                Where continental philosophy meets the poetry of what remains
                unsaid.
              </h3>

              <div className="space-y-4 text-base font-light leading-relaxed text-[#59534F]">
                <p>
                  In European intellectual circles, the{" "}
                  <strong className="font-serif font-medium text-[#282524]">
                    Nexus Instituut
                  </strong>{" "}
                  has stood for decades as a prestigious forum for philosophical
                  discourse—convening writers, philosophers, and humanists to
                  reflect on human dignity and civilization.
                </p>

                <p>
                  Shahd Karaeen’s literary work is featured in the landmark
                  milestone centenary edition,{" "}
                  <em className="font-serif italic text-[#282524]">
                    Tijdschrift Nexus (Nexus 100, 2026)
                  </em>
                  . Her contributions interrogate the anatomy of silence: how
                  trauma and systemic silencing affect the human spirit, the
                  quiet courage required to hold memory intact, and the profound
                  moral necessity of bearing witness to what is withheld.
                </p>

                <p>
                  This published body of work does not belong merely to seminar
                  rooms or printed journals. It forms the intellectual
                  foundation of her listening practice. When listening to people
                  who have spent years navigating unspoken conflicts, her
                  presence is guided by a poet’s precision and a philosopher’s
                  patience.
                </p>
              </div>
            </div>

            {/* The Poet's Discipline in Listening */}
            <div className="p-6 bg-gradient-to-br from-[#FDFBF8] to-[#F5EEE6] rounded-2xl border border-[#E8DDD2] space-y-3">
              <div className="flex items-center gap-2">
                <Feather className="w-4 h-4 text-[#A35048]" />
                <h4 className="text-xs uppercase tracking-widest font-sans font-semibold text-[#A35048]">
                  The Discipline of The Poet's Ear
                </h4>
              </div>
              <p className="font-serif italic text-sm sm:text-base text-[#282524] leading-relaxed">
                “To listen as a poet is not to categorize or diagnose. It is to
                attend to cadence, to respect the pauses where words fail, and
                to honor the exact weight of what a person finally finds the
                courage to speak.”
              </p>
              {
                <div className="pt-1">
                  <ScrollToBookingButton title="Experience an unhurried 55-minute session →" />
                  {/* <button
                    onClick={handleScrollToBooking}
                    className="text-xs font-sans font-medium text-[#A35048] hover:text-[#8C4038] underline underline-offset-4 cursor-pointer"
                  >
                    Experience an unhurried 55-minute session →
                  </button> */}
                </div>
              }
            </div>
          </div>

          {/* Right Column: Physical Journal Leaf / Archival Dossier Card */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="relative h-full flex flex-col">
              {/* Paper shadow offset layer */}
              <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 bg-[#F1E7DD] rounded-2xl border border-[#E3D5C5] -z-10" />

              {/* Main Archival Card */}
              <div className="h-full bg-white rounded-2xl border border-[#E8DDD2] p-7 sm:p-9 flex flex-col justify-between shadow-xs relative">
                {/* Journal Masthead Header */}
                <div className="border-b border-[#E8DDD2] pb-5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-[#78716C] font-sans">
                    <span className="uppercase tracking-widest text-[10px] font-semibold text-[#A35048]">
                      Nexus Instituut Archive
                    </span>
                    <span className="font-serif italic">
                      Centenary Volume · 2026
                    </span>
                  </div>
                  <h4 className="font-serif text-2xl text-[#282524] font-normal tracking-tight">
                    Tijdschrift Nexus · Nexus 100
                  </h4>
                  <p className="text-xs font-sans text-[#78716C]">
                    The European journal for cultural philosophy, literature,
                    and intellectual debate
                  </p>
                </div>

                {/* Central Archival Dossier & Thematic Extract */}
                <div className="py-6 space-y-5">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-sans tracking-widest text-[#78716C] font-medium">
                      Author & Contributor
                    </span>
                    <p className="font-serif text-lg text-[#282524] font-medium">
                      Shahd Karaeen
                    </p>
                    <p className="text-xs font-sans text-[#68635F]">
                      Palestinian poet, author, and speaker on justice,
                      resilience, and memory
                    </p>
                  </div>

                  {/* Pull Quote Box styled as an archival leaf */}
                  <div className="p-5 bg-gradient-to-br from-[#FAF7F2] to-[#F5ECE1] rounded-xl border-l-3 border-l-[#A35048] border border-[#EAE0D5] space-y-2">
                    <div className="flex items-center gap-1.5 text-[#A35048] text-[11px] font-sans font-medium uppercase tracking-wider">
                      <Bookmark className="w-3.5 h-3.5" />
                      <span>Thematic Inquiry: The Anatomy of Silence</span>
                    </div>
                    <blockquote className="font-serif italic text-sm sm:text-base text-[#282524] leading-relaxed">
                      “Silence is not the peaceful absence of noise; it is an
                      invisible architecture built to protect equilibrium at the
                      expense of reality. Reclamation begins the moment we cease
                      agreeing to our own erasure.”
                    </blockquote>
                    <div className="text-[11px] font-sans text-[#78716C] pt-1">
                      — Reflected in themes across{" "}
                      <em className="font-serif italic">Nexus 100</em> &
                      literary works
                    </div>
                  </div>

                  {/* Registry Details Table */}
                  <div className="grid grid-cols-2 gap-4 pt-2 text-xs font-sans border-t border-[#E8DDD2]/60">
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-[#78716C]">
                        Institution
                      </span>
                      <span className="font-medium text-[#282524]">
                        Nexus Instituut
                      </span>
                      <span className="block text-[#78716C] text-[11px]">
                        Amsterdam & Tilburg, NL
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-wider text-[#78716C]">
                        Core Themes
                      </span>
                      <span className="font-medium text-[#282524]">
                        Justice, Dignity & Silence
                      </span>
                      <span className="block text-[#78716C] text-[11px]">
                        International Dialogue
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer with External Link */}
                <div className="pt-5 border-t border-[#E8DDD2] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <a
                    href="https://nexus-instituut.nl/person/shahd-karaeen"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F4ECE2] border border-[#E5D9CC] text-[#282524] hover:text-[#A35048] transition-all text-xs font-sans font-medium shadow-xs group cursor-pointer"
                    title="View Shahd Karaeen's official contributor page on the Nexus Instituut website"
                  >
                    <Globe className="w-3.5 h-3.5 text-[#A35048]" />
                    <span>View Nexus Instituut Profile</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#78716C] group-hover:text-[#A35048] transition-colors" />
                  </a>
                  <span className="text-[11px] font-sans text-[#78716C]">
                    nexus-instituut.nl/person/shahd-karaeen
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-16">
          <EmbroideredThread variant="curved" />
        </div>
      </div>
    </section>
  );
};
