"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, SlidersHorizontal } from "lucide-react";
import { LegalLink } from "@/components/LegalLink";
import {
  ANALYTICS_PREFERENCE_KEY,
  ANALYTICS_SETTINGS_EVENT,
  isValidAnalyticsMeasurementId,
  parseAnalyticsPreferenceCookie,
  resolveAnalyticsPreference,
  serializeAnalyticsPreferenceCookie,
  type AnalyticsPreference,
  LEGACY_ANALYTICS_CONSENT_KEY,
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
    if (name === "_ga" || name.startsWith("_ga_")) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
}

export function AnalyticsConsent({ measurementId }: AnalyticsConsentProps) {
  const validMeasurementId = isValidAnalyticsMeasurementId(measurementId)
    ? measurementId
    : undefined;
  const [preference, setPreferenceState] = useState<AnalyticsPreference | null>(
    null,
  );
  const [preferenceRead, setPreferenceRead] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const analyticsSelected = preference === "enabled";

  const persistPreference = useCallback(
    (nextPreference: AnalyticsPreference) => {
      let localStorageSaved = false;
      let cookieSaved = false;

      try {
        localStorage.setItem(ANALYTICS_PREFERENCE_KEY, nextPreference);
        localStorage.removeItem(LEGACY_ANALYTICS_CONSENT_KEY);
        localStorageSaved = true;
      } catch {
        // The first-party cookie below can preserve the preference instead.
      }

      try {
        document.cookie = serializeAnalyticsPreferenceCookie(
          nextPreference,
          window.location.protocol === "https:",
        );
        cookieSaved =
          parseAnalyticsPreferenceCookie(document.cookie) === nextPreference;
      } catch {
        // Keep the effective choice for this page even when storage is blocked.
      }

      if (localStorageSaved || cookieSaved) {
        try {
          localStorage.removeItem(LEGACY_ANALYTICS_CONSENT_KEY);
        } catch {
          // Migration cleanup is best-effort after a current preference is saved.
        }
      }

      return localStorageSaved || cookieSaved;
    },
    [],
  );

  const setPreference = useCallback(
    (nextPreference: AnalyticsPreference) => {
      if (!validMeasurementId) return;
      if (nextPreference === "disabled") disableAnalytics(validMeasurementId);
      else window[`ga-disable-${validMeasurementId}`] = false;

      persistPreference(nextPreference);
      setPreferenceState(nextPreference);
    },
    [persistPreference, validMeasurementId],
  );

  const savePreference = useCallback(
    (nextPreference: AnalyticsPreference) => {
      setPreference(nextPreference);
      setSettingsOpen(false);
      setNoticeOpen(false);
    },
    [setPreference],
  );

  const acknowledgeNotice = useCallback(() => {
    if (!preference) return;
    savePreference(preference);
  }, [preference, savePreference]);

  useEffect(() => {
    if (!validMeasurementId) return;
    let storedPreference: string | null = null;
    let legacyConsent: string | null = null;
    try {
      storedPreference = localStorage.getItem(ANALYTICS_PREFERENCE_KEY);
      legacyConsent = localStorage.getItem(LEGACY_ANALYTICS_CONSENT_KEY);
    } catch {
      // The first-party cookie remains available when localStorage is blocked.
    }

    const storedCookiePreference = parseAnalyticsPreferenceCookie(
      document.cookie,
    );
    const resolution = resolveAnalyticsPreference(
      storedPreference,
      storedCookiePreference,
      legacyConsent,
    );
    setPreferenceState(resolution.preference);
    setNoticeOpen(resolution.showNotice);
    if (
      resolution.migrated ||
      storedPreference !== null ||
      storedCookiePreference !== null
    ) {
      try {
        localStorage.setItem(ANALYTICS_PREFERENCE_KEY, resolution.preference);
      } catch {
        // The first-party cookie still preserves the migrated preference.
      }
      try {
        document.cookie = serializeAnalyticsPreferenceCookie(
          resolution.preference,
          window.location.protocol === "https:",
        );
      } catch {
        // Migration is still effective in memory for this page.
      }
      try {
        localStorage.removeItem(LEGACY_ANALYTICS_CONSENT_KEY);
      } catch {
        // Migration cleanup is best-effort.
      }
    }
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

  useEffect(() => {
    if (!validMeasurementId || !preferenceRead) return;

    if (preference !== "enabled") {
      if (preference === "disabled") disableAnalytics(validMeasurementId);
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
  }, [preference, preferenceRead, validMeasurementId]);

  if (
    !validMeasurementId ||
    !preferenceRead ||
    (!noticeOpen && !settingsOpen)
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
      {!expanded && (
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center justify-between">
          <div className="min-w-0 flex flex-col">
            <h2
              id="analytics-consent-title"
              className="font-serif text-xl font-bold leading-snug sm:text-base"
            >
              Quiet Privacy &amp; Cookies:
            </h2>{" "}
            <p className="text-sm leading-relaxed text-[#625D59] sm:text-xs">
              We use cookies to understand how this website is used and improve
              it. You can disable analytics at any time.{" "}
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
              <span>{expanded ? "Hide" : "Settings"}</span>
            </button>
            <button
              type="button"
              onClick={acknowledgeNotice}
              className={`${actionClass} bg-[#282524] text-white shadow-sm hover:bg-[#403B38]`}
            >
              Accept
            </button>
          </div>
        </div>
      )}

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
                    {`Analytics is currently ${analyticsSelected ? "on" : "off"}. Limited statistics help improve the public website.`}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analyticsSelected}
                  aria-label="Minimal Analytics"
                  onClick={() =>
                    setPreference(analyticsSelected ? "disabled" : "enabled")
                  }
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
                aria-expanded={expanded}
                aria-controls="analytics-preferences"
                onClick={() => setExpanded((value) => !value)}
                className={`${actionClass} text-[#6D6763] hover:text-[#282524]`}
              >
                <SlidersHorizontal
                  aria-hidden="true"
                  className="size-4 text-[#B94F43]"
                />
                <span>Hide</span>
              </button>
              <button
                type="button"
                onClick={() => savePreference("disabled")}
                className={`${actionClass} border border-[#D8D1CB] bg-transparent text-[#625D59] hover:bg-[#F1ECE6]`}
              >
                Necessary Only
              </button>
              <button
                type="button"
                onClick={() => savePreference(preference)}
                className={`${actionClass} bg-[#282524] text-white shadow-sm hover:bg-[#403B38]`}
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
