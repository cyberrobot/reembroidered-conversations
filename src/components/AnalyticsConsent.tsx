"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, SlidersHorizontal, X } from "lucide-react";
import { LegalLink } from "@/components/LegalLink";
import {
  ANALYTICS_CONSENT_KEY,
  ANALYTICS_SETTINGS_EVENT,
  isValidAnalyticsMeasurementId,
  parseAnalyticsConsent,
  type AnalyticsConsentChoice,
} from "@/lib/analytics";

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
    [key: `ga-disable-${string}`]: boolean | undefined;
    __recGaLoadedIds?: string[];
  }
}

type AnalyticsConsentProps = {
  measurementId?: string;
};

function disableAnalytics(measurementId: string) {
  window[`ga-disable-${measurementId}`] = true;
  window.gtag?.("consent", "update", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });

  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=", 1)[0];
    if (name.startsWith("_ga")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
}

export function AnalyticsConsent({ measurementId }: AnalyticsConsentProps) {
  const validMeasurementId = isValidAnalyticsMeasurementId(measurementId)
    ? measurementId
    : undefined;
  const [choice, setChoice] = useState<AnalyticsConsentChoice | null>(null);
  const [preferenceRead, setPreferenceRead] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [analyticsSelected, setAnalyticsSelected] = useState(false);

  useEffect(() => {
    if (!validMeasurementId) return;
    let storedChoice: string | null = null;
    try {
      storedChoice = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    } catch {
      // Analytics stays off when browser storage is unavailable.
    }
    const savedChoice = parseAnalyticsConsent(storedChoice);
    setChoice(savedChoice);
    setAnalyticsSelected(savedChoice === "granted");
    setPreferenceRead(true);
  }, [validMeasurementId]);

  useEffect(() => {
    if (!validMeasurementId) return;
    const openSettings = () => {
      setSettingsOpen(true);
      setExpanded(true);
    };
    window.addEventListener(ANALYTICS_SETTINGS_EVENT, openSettings);
    return () =>
      window.removeEventListener(ANALYTICS_SETTINGS_EVENT, openSettings);
  }, [validMeasurementId]);

  const saveChoice = useCallback(
    (nextChoice: AnalyticsConsentChoice) => {
      if (!validMeasurementId) return;
      try {
        localStorage.setItem(ANALYTICS_CONSENT_KEY, nextChoice);
      } catch {
        // Keep the choice for this page without blocking site use.
      }
      setChoice(nextChoice);
      setAnalyticsSelected(nextChoice === "granted");
      setSettingsOpen(false);
      if (nextChoice === "denied") disableAnalytics(validMeasurementId);
    },
    [validMeasurementId],
  );

  useEffect(() => {
    if (!validMeasurementId || !preferenceRead) return;

    if (choice !== "granted") {
      if (choice === "denied") disableAnalytics(validMeasurementId);
      return;
    }

    window[`ga-disable-${validMeasurementId}`] = false;
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(..._args: unknown[]) {
      window.dataLayer?.push(arguments);
    };

    const loadedIds = (window.__recGaLoadedIds ??= []);
    if (loadedIds.includes(validMeasurementId)) {
      window.gtag("consent", "update", {
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      });
      return;
    }

    window.gtag("js", new Date());
    window.gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("config", validMeasurementId, {
      send_page_view: false,
      cookie_domain: "none",
      page_location: `${window.location.origin}/`,
      page_title: "Re-Embroidered Conversations",
    });
    window.gtag("event", "page_view", {
      page_location: `${window.location.origin}/`,
      page_title: "Re-Embroidered Conversations",
    });
    loadedIds.push(validMeasurementId);

    const script = document.createElement("script");
    script.id = `rec-google-analytics-${validMeasurementId}`;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${validMeasurementId}`;
    document.head.append(script);

    return () => {
      window[`ga-disable-${validMeasurementId}`] = true;
    };
  }, [choice, preferenceRead, validMeasurementId]);

  if (
    !validMeasurementId ||
    !preferenceRead ||
    (choice !== null && !settingsOpen)
  ) {
    return null;
  }

  const focusClass =
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B94F43]";
  const actionClass = `cursor-pointer inline-flex min-h-7 items-center justify-center px-4 gap-2 rounded-full text-sm sm:text-xs font-medium transition-colors ${focusClass}`;

  return (
    <aside
      role="region"
      aria-label="Analytics settings"
      aria-live="polite"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-[110rem] border border-[#E8DFD5] bg-[#FAF8F5] text-[#282524] shadow-[0_10px_34px_rgba(40,37,36,0.18)] sm:inset-x-2 sm:bottom-2 rounded-[14px] px-3 py-2"
    >
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center justify-between">
        <div className="min-w-0 flex flex-col">
          <h2
            id="analytics-consent-title"
            className="font-serif text-xl font-bold leading-snug sm:text-base"
          >
            Quiet Privacy &amp; Cookies:
          </h2>{" "}
          <p className="text-sm leading-relaxed text-[#625D59] sm:text-xs">
            Essential cookies support security and booking features. Optional
            page analytics stays off unless you allow it. We do not use
            advertising cookies.{" "}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <LegalLink
            document="privacy"
            section="cookies-browser-storage"
            className="text-sm font-medium text-[#B94F43] underline-offset-4 hover:underline sm:text-xs"
          >
            Learn more
          </LegalLink>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="analytics-preferences"
            onClick={() => setExpanded((value) => !value)}
            className={`${actionClass} text-[#6D6763] hover:text-[#282524]`}
          >
            <SlidersHorizontal
              aria-hidden="true"
              className="size-4 text-[#B94F43]"
            />
            <span>{expanded ? "Hide" : "Customize"}</span>
          </button>
          <button
            type="button"
            onClick={() => saveChoice("granted")}
            className={`${actionClass} bg-[#282524] text-white shadow-sm hover:bg-[#403B38]`}
          >
            Accept
          </button>
          <button
            type="button"
            aria-label="Essential only and close cookie settings"
            onClick={() => saveChoice("denied")}
            className={`${actionClass} text-[#AAA39E] hover:bg-[#F1ECE6] hover:text-[#282524]`}
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      </div>

      {expanded && (
        <div id="analytics-preferences" className="pt-1">
          <div className="grid gap-3 md:grid-cols-2">
            <section className="rounded-[14px] border border-[#E8DFD5] bg-[#F6F1EB] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-1">
                  <ShieldCheck
                    aria-hidden="true"
                    className="size-4 shrink-0 text-[#B94F43]"
                  />
                  <h3 className="text-sm font-medium sm:text-xs">
                    Strictly Necessary
                  </h3>
                </div>
                <span className="shrink-0 rounded-lg bg-[#EEE7DF] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#817A74] sm:text-[8px]">
                  Always active
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[#716B66] sm:text-xs">
                Supports security, payment and booking flows, including
                Turnstile verification.
              </p>
            </section>

            <section className="rounded-[14px] border border-[#E8DFD5] bg-[#FAF8F5] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium sm:text-xs">
                    Minimal Analytics
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#716B66] sm:text-xs">
                    Optional insights into page visits. Booking form contents
                    and booking identifiers are not intentionally sent.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsSelected}
                  aria-label="Minimal Analytics"
                  onClick={() => setAnalyticsSelected((value) => !value)}
                  className={`mt-0.5 inline-flex h-5 w-8 shrink-0 items-center rounded-full p-1 transition-colors ${focusClass} ${analyticsSelected ? "bg-[#B94F43]" : "bg-[#D8D1CB]"}`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-3 rounded-full bg-white shadow-sm transition-transform ${analyticsSelected ? "translate-x-3" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </section>
          </div>

          <div className="mt-3 flex flex-col gap-4 text-sm text-[#817A74] sm:flex-row sm:items-center sm:justify-between sm:text-xs">
            <p>
              Read details in our{" "}
              <LegalLink
                document="privacy"
                section="cookies-browser-storage"
                className="font-medium text-[#B94F43] hover:underline"
              >
                Privacy Notice (Cookies &amp; browser storage)
              </LegalLink>
              .
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={() => saveChoice("denied")}
                className={`${actionClass} border border-[#D8D1CB] bg-transparent text-[#625D59] hover:bg-[#F1ECE6]`}
              >
                Essential Only
              </button>
              <button
                type="button"
                onClick={() =>
                  saveChoice(analyticsSelected ? "granted" : "denied")
                }
                className={`${actionClass} bg-[#282524] text-white hover:bg-[#403B38]`}
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
