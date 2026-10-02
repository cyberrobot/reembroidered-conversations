export const ANALYTICS_CONSENT_KEY = "reembroidered.analytics-consent.v1";
export const ANALYTICS_PREFERENCE_KEY = "reembroidered.analytics-preference.v2";
export const ANALYTICS_SETTINGS_EVENT = "reembroidered:analytics-settings";

export type AnalyticsConsentChoice = "granted" | "denied";
export type AnalyticsPreference = "enabled" | "disabled";

export function parseAnalyticsPreference(
  value: string | null,
): AnalyticsPreference | null {
  return value === "enabled" || value === "disabled" ? value : null;
}

export function resolveAnalyticsPreference(
  preference: string | null,
  legacyConsent: string | null,
): { preference: AnalyticsPreference; showNotice: boolean; migrated: boolean } {
  const parsedPreference = parseAnalyticsPreference(preference);
  if (parsedPreference) {
    return { preference: parsedPreference, showNotice: false, migrated: false };
  }

  if (!parsedPreference && legacyConsent === "denied") {
    return { preference: "disabled", showNotice: false, migrated: true };
  }

  if (preference === null && legacyConsent === "granted") {
    return { preference: "enabled", showNotice: false, migrated: true };
  }

  return { preference: "enabled", showNotice: true, migrated: false };
}

export function isValidAnalyticsMeasurementId(
  value: string | undefined,
): value is string {
  return typeof value === "string" && /^G-[A-Z0-9]{6,}$/.test(value);
}

export function parseAnalyticsConsent(
  value: string | null,
): AnalyticsConsentChoice | null {
  return value === "granted" || value === "denied" ? value : null;
}
