// @ts-check

import "server-only";

import { GOOGLE_FREEBUSY_SCOPE } from "../google-calendar/constants.mjs";
import { GoogleApiError } from "../google-calendar/google-api.mjs";

export { GOOGLE_FREEBUSY_SCOPE };

export class CalendarAvailabilityError extends Error {
  /** @param {'invalid_range' | 'not_connected' | 'reauthorization_required' | 'provider_unavailable' | 'invalid_provider_response'} code */
  constructor(code) {
    super(`Calendar availability failed: ${code}.`);
    this.name = "CalendarAvailabilityError";
    this.code = code;
  }
}

const defaultDependencies = {
  getCredentials: async () => {
    const { getGoogleCalendarCredentials } =
      await import("../google-calendar/connection.ts");
    return getGoogleCalendarCredentials();
  },
  getOAuthConfig: async () => {
    const { getGoogleOAuthConfig } =
      await import("../google-calendar/config.ts");
    return getGoogleOAuthConfig();
  },
  refreshAccessToken: async (input) => {
    const { refreshGoogleAccessToken } =
      await import("../google-calendar/google-api.mjs");
    return refreshGoogleAccessToken(input);
  },
  queryFreeBusy: async (input) => {
    const { queryGoogleFreeBusy } =
      await import("../google-calendar/google-api.mjs");
    return queryGoogleFreeBusy(input);
  },
};

/**
 * Return busy periods for the connected practitioner's primary calendar.
 * The interval is [from, to), expressed as absolute instants.
 *
 * @param {Date} from
 * @param {Date} to
 * @param {typeof defaultDependencies} [dependencies]
 * @returns {Promise<Array<{ startAt: string, endAt: string }>>}
 */
export async function getBusyPeriods(
  from,
  to,
  dependencies = defaultDependencies,
) {
  if (
    !(from instanceof Date) ||
    Number.isNaN(from.getTime()) ||
    !(to instanceof Date) ||
    Number.isNaN(to.getTime()) ||
    from.getTime() >= to.getTime()
  ) {
    throw new CalendarAvailabilityError("invalid_range");
  }

  let credentials;
  try {
    credentials = await dependencies.getCredentials();
  } catch {
    throw new CalendarAvailabilityError("provider_unavailable");
  }
  if (!credentials) throw new CalendarAvailabilityError("not_connected");
  if (!credentials.grantedScopes.includes(GOOGLE_FREEBUSY_SCOPE)) {
    throw new CalendarAvailabilityError("reauthorization_required");
  }

  try {
    const config = await dependencies.getOAuthConfig();
    const { accessToken } = await dependencies.refreshAccessToken({
      refreshToken: credentials.refreshToken,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });
    return await dependencies.queryFreeBusy({
      accessToken,
      calendarId: credentials.calendarId,
      from,
      to,
    });
  } catch (error) {
    if (error instanceof CalendarAvailabilityError) throw error;
    if (error instanceof GoogleApiError) {
      if (error.category === "authorization") {
        throw new CalendarAvailabilityError("reauthorization_required");
      }
      if (error.category === "invalid_response") {
        throw new CalendarAvailabilityError("invalid_provider_response");
      }
    }
    throw new CalendarAvailabilityError("provider_unavailable");
  }
}
