"use client";

import React, { useState, useEffect, useRef } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type { MuxCSSProperties } from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { Play, Calendar, Clock, ShieldCheck, Video } from "lucide-react";
const laraHeroImg =
  "https://image.mux.com/4qvdrc02lmk21KDbxfyWcWyiV7YG9Fljckr5xj5wBzXg/thumbnail.png?height=503&time=96&width=894";

// Verified, active official Mux stream ID
const DEFAULT_PLAYBACK_ID = "4qvdrc02lmk21KDbxfyWcWyiV7YG9Fljckr5xj5wBzXg";

export const HeroVideo: React.FC = () => {
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  const [, setIsPlaying] = useState(false);
  const [playbackId, setPlaybackId] = useState<string>(DEFAULT_PLAYBACK_ID);
  const playerRef = useRef<MuxPlayerElement | null>(null);

  // Validate configured Mux Playback ID if an override is provided in env
  useEffect(() => {
    const rawEnvId = process.env.NEXT_PUBLIC_MUX_PLAYBACK_ID;
    if (rawEnvId && typeof rawEnvId === "string") {
      const candidate = rawEnvId.trim().replace(/^["']|["']$/g, "");
      // If it matches default or empty, no need to re-verify
      if (
        !candidate ||
        candidate === DEFAULT_PLAYBACK_ID ||
        candidate === "oZK3xwREHCqp25emTTBxg8HNuKca701M1mhtSowxmx9M"
      ) {
        setPlaybackId(DEFAULT_PLAYBACK_ID);
        return;
      }
      fetch(`https://stream.mux.com/${candidate}.m3u8`, { method: "HEAD" })
        .then((res) => {
          if (res.ok) {
            setPlaybackId(candidate);
          } else {
            console.warn(
              `[Mux Player] Candidate playback ID returned ${res.status}. Using default.`,
            );
            setPlaybackId(DEFAULT_PLAYBACK_ID);
          }
        })
        .catch(() => {
          setPlaybackId(DEFAULT_PLAYBACK_ID);
        });
    }
  }, []);

  const handleStartPlayback = () => {
    setHasStartedPlaying(true);
    setIsPlaying(true);
    // Trigger Mux player playback smoothly
    setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.play().catch((err) => {
          console.warn("Playback request handled:", err);
        });
      }
    }, 50);
  };

  const scrollToBooking = () => {
    document
      .getElementById("book-session")
      ?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      id="meet-shahd"
      className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden"
    >
      {/* Background soft ambiance */}
      <div className="max-w-5xl mx-auto px-6">
        {/* Core Headline & Intention */}
        <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#F2EBE3] border border-[#E4D9CE] text-[#8C4038] text-xs font-sans tracking-wide mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A35048] animate-pulse" />
            <span>Private 1-to-1 Listening Sessions for Women</span>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl text-[#282524] tracking-tight leading-[1.12] font-normal mb-6">
            Sometimes, you just need someone to listen.
          </h1>

          <p className="font-sans text-lg sm:text-xl text-[#68635F] leading-relaxed max-w-2xl mx-auto font-light">
            A quiet conversation with Shahd Karaeen where you can speak what
            you’ve carried in silence. No advice, no predetermined agenda, no
            performance—just space to be heard and understood.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              id="hero-book-cta"
              onClick={scrollToBooking}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-[#A35048] hover:bg-[#8C4038] text-[#FAF8F5] text-base font-medium px-8 py-4 rounded-full transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer group active:scale-98"
            >
              <Calendar className="w-4 h-4 stroke-[1.75]" />
              <span>Reserve a Conversation</span>
            </button>

            <button
              onClick={() => {
                const experienceEl = document.getElementById("the-experience");
                if (experienceEl)
                  experienceEl.scrollIntoView({ behavior: "smooth" });
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-[#68635F] hover:text-[#282524] text-sm font-sans px-5 py-4 cursor-pointer transition-colors"
            >
              <span>How a session works</span>
              <span className="text-xs">↓</span>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-sm font-sans text-[#78716C]">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-[#A35048] shrink-0" />
              <span>55 mins · £55</span>
            </span>

            <span className="hidden sm:inline text-[#D5CAC0] select-none">
              •
            </span>

            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <ShieldCheck className="w-3.5 h-3.5 text-[#78716C] shrink-0" />
              <span>Private one-to-one</span>
            </span>

            <span className="hidden sm:inline text-[#D5CAC0] select-none">
              •
            </span>

            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <Video className="w-3.5 h-3.5 text-[#78716C] shrink-0" />
              <span>Online video</span>
            </span>
          </div>
        </div>

        {/* Video Player Card */}
        <div className="relative max-w-4xl mx-auto bg-[#FDFCFB] rounded-2xl border border-[#E8DFD5] shadow-md overflow-hidden">
          {/* Subtle top stitch accent */}
          <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#A35048]/50 to-transparent" />

          {/* Video Container */}
          <div className="relative aspect-[16/9] w-full bg-[#1F1D1C] overflow-hidden group">
            {/* Underlying Mux Player Engine */}
            <div className="w-full h-full">
              <MuxPlayer
                ref={playerRef}
                playbackId={playbackId}
                poster={laraHeroImg}
                placeholder={laraHeroImg}
                title="A Personal Introduction — Shahd Karaeen"
                metadata={{
                  video_id: "shahd-intro",
                  video_title: "A Personal Introduction — Shahd Karaeen",
                  video_series: "Re-Embroidered Conversations",
                }}
                streamType="on-demand"
                disableCookies
                noVolumePref
                noMutedPref
                preload={hasStartedPlaying ? "auto" : "none"}
                assetEndTime={300}
                playsInline
                crossOrigin="anonymous"
                primaryColor="#FAF8F5"
                secondaryColor="#1F1D1C"
                accentColor="#A35048"
                proudlyDisplayMuxBadge={false}
                className="w-full h-full object-cover"
                style={
                  {
                    "--media-font-family":
                      'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    "--media-range-bar-color": "#A35048",
                    "--media-range-track-color": "rgba(255, 255, 255, 0.25)",
                    "--media-control-background": "rgba(31, 29, 28, 0.88)",
                    "--media-control-hover-background":
                      "rgba(40, 37, 36, 0.95)",
                    "--primary-color": "#FAF8F5",
                    "--secondary-color": "#1F1D1C",
                    "--accent-color": "#A35048",
                    width: "100%",
                    height: "100%",
                    display: "block",
                  } as MuxCSSProperties
                }
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={(event) => {
                  console.warn(
                    "[Mux Player] Playback error encountered, reverting to verified stream:",
                    event,
                  );
                  if (playbackId !== DEFAULT_PLAYBACK_ID) {
                    setPlaybackId(DEFAULT_PLAYBACK_ID);
                  }
                }}
                onEnded={() => {
                  setIsPlaying(false);
                  setHasStartedPlaying(false);
                }}
              />
            </div>

            {/* Bespoke Poster State (Shown prior to first play) */}
            {!hasStartedPlaying && (
              <div
                className="absolute inset-0 z-10 cursor-pointer overflow-hidden"
                onClick={handleStartPlayback}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleStartPlayback();
                  }
                }}
                aria-label="Play video introduction from Shahd Karaeen"
              >
                {/* High-res bespoke portrait image */}
                <img
                  src={laraHeroImg}
                  alt="Shahd Karaeen welcoming you to Re-Embroidered Conversations"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover object-center transform transition-transform duration-700 hover:scale-102"
                />

                {/* Warm atmospheric vignette overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1F1D1C]/85 via-[#1F1D1C]/25 to-transparent pointer-events-none" />

                {/* Editorial context pill badge */}
                <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-[#FAF8F5]/90 backdrop-blur-md px-3 py-1.5 rounded-full text-sm font-serif text-[#282524] border border-[#E8DFD5]/70 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-[#A35048]" />
                  <span>Shahd Karaeen speaking with you · 5m</span>
                </div>

                {/* Prominent Central Play Button */}
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center pointer-events-none">
                  <div
                    id="hero-video-play-button"
                    className="w-18 h-18 sm:w-22 sm:h-22 rounded-full bg-[#FAF8F5]/95 hover:bg-white text-[#A35048] flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-106 active:scale-95 border border-[#E8DFD5] group-hover:scale-105"
                  >
                    <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1 transition-transform duration-200" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Under-Video Conversation Context */}
          <div className="p-6 sm:p-8 bg-[#FAF8F5] border-t border-[#E8DFD5] grid sm:grid-cols-3 gap-6 text-[#4B4643]">
            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-[#A35048] mt-2 shrink-0" />
              <div>
                <h4 className="font-serif text-xl text-[#282524] font-medium mb-1">
                  Private & One-to-One
                </h4>
                <p className="text-base sm:text-sm text-[#68635F] leading-relaxed">
                  A private one-to-one video conversation with Shahd Karaeen. We
                  do not record sessions.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-[#A35048] mt-2 shrink-0" />
              <div>
                <h4 className="font-serif text-[#282524] text-xl font-medium mb-1">
                  No Homework or Plans
                </h4>
                <p className="text-base sm:text-sm text-[#68635F] leading-relaxed">
                  No questionnaires to fill in beforehand. No follow-up
                  checklists. You arrive as you are.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-2 h-2 rounded-full bg-[#A35048] mt-2 shrink-0" />
              <div>
                <h4 className="font-serif text-[#282524] text-xl font-medium mb-1">
                  Gentle & Low-Pressure
                </h4>
                <p className="text-base sm:text-sm text-[#68635F] leading-relaxed">
                  Book a date and time that suits your life. Cancel or
                  reschedule easily if plans change.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
