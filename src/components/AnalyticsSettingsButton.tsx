"use client";

import { ANALYTICS_SETTINGS_EVENT } from "@/lib/analytics";

export function AnalyticsSettingsButton() {
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
