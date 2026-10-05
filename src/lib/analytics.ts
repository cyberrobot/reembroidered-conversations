export const ANALYTICS_PREFERENCE_KEY = "reembroidered.analytics-preference.v2";
export const ANALYTICS_PREFERENCE_COOKIE =
  "reembroidered_analytics_preference_v2";
export const LEGACY_ANALYTICS_CONSENT_KEY =
  "reembroidered.analytics-consent.v1";
export const ANALYTICS_SETTINGS_EVENT = "reembroidered:analytics-settings";

export type AnalyticsPreference = "enabled" | "disabled";
type LegacyAnalyticsConsent = "granted" | "denied";

export function parseAnalyticsPreference(
  value: string | null,
): AnalyticsPreference | null {
  return value === "enabled" || value === "disabled" ? value : null;
}

export function resolveAnalyticsPreference(
  preference: string | null,
  cookiePreference: string | null,
  legacyConsent: string | null,
): { preference: AnalyticsPreference; showNotice: boolean; migrated: boolean } {
  const parsedPreference = parseAnalyticsPreference(preference);
  const parsedCookiePreference = parseAnalyticsPreference(cookiePreference);
  if (parsedPreference || parsedCookiePreference) {
    const resolvedPreference =
      parsedPreference === "disabled" || parsedCookiePreference === "disabled"
        ? "disabled"
        : "enabled";
    return {
      preference: resolvedPreference,
      showNotice: false,
      migrated: false,
    };
  }

  const parsedLegacyConsent = parseLegacyAnalyticsConsent(legacyConsent);
  if (parsedLegacyConsent === "denied") {
    return { preference: "disabled", showNotice: false, migrated: true };
  }

  if (parsedLegacyConsent === "granted") {
    return { preference: "enabled", showNotice: false, migrated: true };
  }

  return { preference: "enabled", showNotice: true, migrated: false };
}

export function isValidAnalyticsMeasurementId(
  value: string | undefined,
): value is string {
  return typeof value === "string" && /^G-[A-Z0-9]{6,}$/.test(value);
}

export function parseLegacyAnalyticsConsent(
  value: string | null,
): LegacyAnalyticsConsent | null {
  return value === "granted" || value === "denied" ? value : null;
}

export function parseAnalyticsPreferenceCookie(
  cookieString: string,
): AnalyticsPreference | null {
  const encodedName = `${ANALYTICS_PREFERENCE_COOKIE}=`;
  const item = cookieString
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(encodedName));
  if (!item) return null;

  try {
    return parseAnalyticsPreference(
      decodeURIComponent(item.slice(encodedName.length)),
    );
  } catch {
    return null;
  }
}

export function serializeAnalyticsPreferenceCookie(
  preference: AnalyticsPreference,
  secure: boolean,
): string {
  return `${ANALYTICS_PREFERENCE_COOKIE}=${preference}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
