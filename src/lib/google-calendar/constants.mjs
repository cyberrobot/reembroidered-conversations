export const GOOGLE_FREEBUSY_SCOPE =
  'https://www.googleapis.com/auth/calendar.freebusy';

export const GOOGLE_OAUTH_SCOPES = Object.freeze([
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  GOOGLE_FREEBUSY_SCOPE,
]);

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_JWKS_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/certs';
export const GOOGLE_CALENDAR_LIST_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/users/me/calendarList';
export const GOOGLE_FREEBUSY_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/freeBusy';
export const GOOGLE_CONNECTION_ID = 'primary';
