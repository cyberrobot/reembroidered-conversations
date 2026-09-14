import {
  GOOGLE_CALENDAR_LIST_ENDPOINT,
  GOOGLE_TOKEN_ENDPOINT,
} from './constants.mjs';

export async function exchangeAuthorizationCode(
  { code, codeVerifier, clientId, clientSecret, redirectUri },
  fetchImplementation = fetch,
) {
  const response = await fetchImplementation(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Google token exchange failed.');
  const tokens = await response.json();
  if (
    typeof tokens.access_token !== 'string' ||
    typeof tokens.id_token !== 'string'
  ) {
    throw new Error('Google token response was incomplete.');
  }
  return {
    accessToken: tokens.access_token,
    idToken: tokens.id_token,
    refreshToken:
      typeof tokens.refresh_token === 'string' ? tokens.refresh_token : null,
    grantedScopes:
      typeof tokens.scope === 'string' ? tokens.scope.split(/\s+/).filter(Boolean) : [],
  };
}

export async function discoverPrimaryCalendar(accessToken, fetchImplementation = fetch) {
  let pageToken;
  do {
    const url = new URL(GOOGLE_CALENDAR_LIST_ENDPOINT);
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchImplementation(url, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Google CalendarList request failed.');
    const page = await response.json();
    const primary = Array.isArray(page.items)
      ? page.items.find((calendar) => calendar.primary === true)
      : undefined;
    if (primary) {
      if (typeof primary.id !== 'string' || typeof primary.summary !== 'string') {
        throw new Error('Primary Google calendar metadata was incomplete.');
      }
      return {
        id: primary.id,
        summary: primary.summary,
        timeZone: typeof primary.timeZone === 'string' ? primary.timeZone : null,
      };
    }
    pageToken = typeof page.nextPageToken === 'string' ? page.nextPageToken : undefined;
  } while (pageToken);
  throw new Error('Primary Google calendar was not found.');
}
