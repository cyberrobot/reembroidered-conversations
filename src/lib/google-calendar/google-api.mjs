import {
  GOOGLE_CALENDAR_LIST_ENDPOINT,
  GOOGLE_FREEBUSY_ENDPOINT,
  GOOGLE_CALENDAR_EVENTS_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
} from "./constants.mjs";

export class GoogleApiError extends Error {
  /** @param {'authorization' | 'unavailable' | 'invalid_response' | 'conflict' | 'not_found'} category */
  constructor(category) {
    super("Google Calendar request failed.");
    this.name = "GoogleApiError";
    this.category = category;
  }
}

function calendarEventUrl(calendarId, eventId) {
  const url = new URL(
    `${GOOGLE_CALENDAR_EVENTS_ENDPOINT}/${encodeURIComponent(calendarId)}/events`,
  );
  if (eventId) url.pathname += `/${encodeURIComponent(eventId)}`;
  return url;
}

async function calendarEventResponse(response) {
  if (response.ok) return readJson(response);
  if (response.status === 404 || response.status === 410)
    throw new GoogleApiError("not_found");
  if (response.status === 409) throw new GoogleApiError("conflict");
  if (response.status === 401 || response.status === 403) {
    if (response.status === 403) {
      try {
        const body = await response.json();
        const reasons = Array.isArray(body?.error?.errors)
          ? body.error.errors.map((error) => error?.reason).filter(Boolean)
          : [];
        if (
          reasons.some((reason) =>
            [
              "rateLimitExceeded",
              "userRateLimitExceeded",
              "quotaExceeded",
            ].includes(reason),
          )
        ) {
          throw new GoogleApiError("unavailable");
        }
      } catch (error) {
        if (error instanceof GoogleApiError) throw error;
      }
    }
    throw new GoogleApiError("authorization");
  }
  throw new GoogleApiError("unavailable");
}

export async function updateGoogleCalendarEvent(
  { accessToken, calendarId, eventId, event },
  fetchImplementation = fetch,
) {
  const url = calendarEventUrl(calendarId, eventId);
  url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("sendUpdates", "all");
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
  } catch {
    throw new GoogleApiError("unavailable");
  }
  return calendarEventResponse(response);
}

export async function deleteGoogleCalendarEvent(
  { accessToken, calendarId, eventId },
  fetchImplementation = fetch,
) {
  const url = calendarEventUrl(calendarId, eventId);
  url.searchParams.set("sendUpdates", "all");
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new GoogleApiError("unavailable");
  }
  if (response.ok || response.status === 404 || response.status === 410)
    return { removed: true };
  if (response.status === 401 || response.status === 403)
    throw new GoogleApiError("authorization");
  throw new GoogleApiError("unavailable");
}

export async function insertGoogleCalendarEvent(
  { accessToken, calendarId, event },
  fetchImplementation = fetch,
) {
  const url = calendarEventUrl(calendarId);
  url.searchParams.set("conferenceDataVersion", "1");
  url.searchParams.set("sendUpdates", "all");
  let response;
  try {
    response = await fetchImplementation(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(event),
      cache: "no-store",
    });
  } catch {
    throw new GoogleApiError("unavailable");
  }
  return calendarEventResponse(response);
}

export async function getGoogleCalendarEvent(
  { accessToken, calendarId, eventId },
  fetchImplementation = fetch,
) {
  const url = calendarEventUrl(calendarId, eventId);
  url.searchParams.set("conferenceDataVersion", "1");
  let response;
  try {
    response = await fetchImplementation(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch {
    throw new GoogleApiError("unavailable");
  }
  return calendarEventResponse(response);
}

const RFC3339_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** @param {Response} response */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new GoogleApiError("invalid_response");
  }
}

/**
 * Exchange a stored refresh token for an ephemeral access token.
 *
 * @param {{ refreshToken: string, clientId: string, clientSecret: string }} input
 * @param {typeof fetch} [fetchImplementation]
 */
export async function refreshGoogleAccessToken(
  { refreshToken, clientId, clientSecret },
  fetchImplementation = fetch,
) {
  let response;
  try {
    response = await fetchImplementation(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      cache: "no-store",
    });
  } catch {
    throw new GoogleApiError("unavailable");
  }

  if (!response.ok) {
    let errorCode;
    try {
      const body = await response.json();
      errorCode = typeof body?.error === "string" ? body.error : undefined;
    } catch {
      // Status remains sufficient for sanitized classification.
    }
    if (errorCode === "invalid_grant" || response.status === 401) {
      throw new GoogleApiError("authorization");
    }
    throw new GoogleApiError("unavailable");
  }

  const tokens = await readJson(response);
  if (
    typeof tokens?.access_token !== "string" ||
    tokens.access_token.trim().length === 0
  ) {
    throw new GoogleApiError("invalid_response");
  }
  return { accessToken: tokens.access_token };
}

/**
 * Query one calendar and return validated, normalized busy periods.
 *
 * @param {{ accessToken: string, calendarId: string, from: Date, to: Date }} input
 * @param {typeof fetch} [fetchImplementation]
 * @returns {Promise<Array<{ startAt: string, endAt: string }>>}
 */
export async function queryGoogleFreeBusy(
  { accessToken, calendarId, from, to },
  fetchImplementation = fetch,
) {
  let response;
  try {
    response = await fetchImplementation(GOOGLE_FREEBUSY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
        timeZone: "UTC",
        items: [{ id: calendarId }],
      }),
      cache: "no-store",
    });
  } catch {
    throw new GoogleApiError("unavailable");
  }

  if (!response.ok) {
    let reasons = [];
    if (response.status === 403) {
      try {
        const body = await response.json();
        reasons = Array.isArray(body?.error?.errors)
          ? body.error.errors.map((error) => error?.reason).filter(Boolean)
          : [];
      } catch {
        // A body is not required to classify the status safely.
      }
    }
    const rateLimited = reasons.some((reason) =>
      ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(
        reason,
      ),
    );
    if (response.status === 401 || (response.status === 403 && !rateLimited)) {
      throw new GoogleApiError("authorization");
    }
    throw new GoogleApiError("unavailable");
  }

  const result = await readJson(response);
  const calendar = result?.calendars?.[calendarId];
  if (
    calendar &&
    typeof calendar === "object" &&
    Array.isArray(calendar.errors) &&
    calendar.errors.length > 0
  ) {
    throw new GoogleApiError("unavailable");
  }
  if (
    !result ||
    typeof result !== "object" ||
    !result.calendars ||
    typeof result.calendars !== "object" ||
    !calendar ||
    typeof calendar !== "object" ||
    ("errors" in calendar && !Array.isArray(calendar.errors)) ||
    !Array.isArray(calendar.busy)
  ) {
    throw new GoogleApiError("invalid_response");
  }

  const periods = calendar.busy.map((period) => {
    if (!period || typeof period !== "object")
      throw new GoogleApiError("invalid_response");
    if (
      typeof period.start !== "string" ||
      typeof period.end !== "string" ||
      !RFC3339_INSTANT_PATTERN.test(period.start) ||
      !RFC3339_INSTANT_PATTERN.test(period.end)
    ) {
      throw new GoogleApiError("invalid_response");
    }
    const start = new Date(period.start);
    const end = new Date(period.end);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      start.getTime() >= end.getTime()
    ) {
      throw new GoogleApiError("invalid_response");
    }
    return { startAt: start.toISOString(), endAt: end.toISOString() };
  });

  return periods.sort((left, right) =>
    left.startAt.localeCompare(right.startAt),
  );
}

export async function exchangeAuthorizationCode(
  { code, codeVerifier, clientId, clientSecret, redirectUri },
  fetchImplementation = fetch,
) {
  const response = await fetchImplementation(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Google token exchange failed.");
  const tokens = await response.json();
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.id_token !== "string"
  ) {
    throw new Error("Google token response was incomplete.");
  }
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken:
      typeof tokens.refresh_token === "string" ? tokens.refresh_token : null,
    grantedScopes:
      typeof tokens.scope === "string"
        ? tokens.scope.split(/\s+/).filter(Boolean)
        : [],
  };
}

export async function discoverPrimaryCalendar(
  accessToken,
  fetchImplementation = fetch,
) {
  let pageToken;
  do {
    const url = new URL(GOOGLE_CALENDAR_LIST_ENDPOINT);
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetchImplementation(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Google CalendarList request failed.");
    const page = await response.json();
    const primary = Array.isArray(page.items)
      ? page.items.find((calendar) => calendar.primary === true)
      : undefined;
    if (primary) {
      if (
        typeof primary.id !== "string" ||
        typeof primary.summary !== "string"
      ) {
        throw new Error("Primary Google calendar metadata was incomplete.");
      }
      return {
        id: primary.id,
        summary: primary.summary,
        timeZone:
          typeof primary.timeZone === "string" ? primary.timeZone : null,
      };
    }
    pageToken =
      typeof page.nextPageToken === "string" ? page.nextPageToken : undefined;
  } while (pageToken);
  throw new Error("Primary Google calendar was not found.");
}
