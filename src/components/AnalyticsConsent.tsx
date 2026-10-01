"use client";

import { useCallback, useEffect, useState } from "react";
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

  useEffect(() => {
    if (!validMeasurementId) return;
    let storedChoice: string | null = null;
    try {
      storedChoice = localStorage.getItem(ANALYTICS_CONSENT_KEY);
    } catch {
      // Analytics stays off when browser storage is unavailable.
    }
    setChoice(parseAnalyticsConsent(storedChoice));
    setPreferenceRead(true);
  }, [validMeasurementId]);

  useEffect(() => {
    if (!validMeasurementId) return;
    const openSettings = () => setSettingsOpen(true);
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

  return (
    <aside
      role="region"
      aria-labelledby="analytics-consent-title"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-2xl rounded-xl border border-[#D9CFC4] bg-[#FAF8F5] p-5 text-[#282524] shadow-[0_12px_40px_rgba(40,37,36,0.22)] sm:inset-x-6 sm:bottom-6 sm:p-6"
    >
      <h2
        id="analytics-consent-title"
        className="font-serif text-xl font-medium"
      >
        Analytics settings
      </h2>
      {settingsOpen && choice !== null ? (
        <p className="mt-2 text-sm leading-relaxed text-[#57514D]">
          Analytics is currently {choice === "granted" ? "on" : "off"}.
        </p>
      ) : (
        <p className="mt-2 text-sm leading-relaxed text-[#57514D]">
          We use optional Google Analytics to understand how this site is used.
          Analytics stays off unless you allow it.
        </p>
      )}
      <p className="mt-2 text-sm">
        <LegalLink
          document="privacy"
          className="underline decoration-[#9A6B63] underline-offset-4 hover:text-[#754D46] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A6B63]"
        >
          Privacy Notice
        </LegalLink>
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => saveChoice("granted")}
          className="min-h-11 rounded-md bg-[#282524] px-4 py-2 text-sm font-medium text-white hover:bg-[#403B38] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A6B63]"
        >
          Allow analytics
        </button>
        <button
          type="button"
          onClick={() => saveChoice("denied")}
          className="min-h-11 rounded-md border border-[#8D837B] bg-transparent px-4 py-2 text-sm font-medium text-[#282524] hover:bg-[#EEE8E1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9A6B63]"
        >
          Reject analytics
        </button>
      </div>
    </aside>
  );
}
