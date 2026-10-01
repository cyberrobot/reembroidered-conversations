"use client";

import {
  ANALYTICS_SETTINGS_EVENT,
  isValidAnalyticsMeasurementId,
} from "@/lib/analytics";

type AnalyticsSettingsButtonProps = { measurementId?: string };

export function AnalyticsSettingsButton({
  measurementId,
}: AnalyticsSettingsButtonProps) {
  if (!isValidAnalyticsMeasurementId(measurementId)) return null;
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}
      className="text-left underline-offset-4 hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E5988F]"
    >
      Analytics settings
    </button>
  );
}
