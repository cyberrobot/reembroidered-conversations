export const ANALYTICS_CONSENT_KEY = "reembroidered.analytics-consent.v1";
export const ANALYTICS_SETTINGS_EVENT = "reembroidered:analytics-settings";

export type AnalyticsConsentChoice = "granted" | "denied";

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
