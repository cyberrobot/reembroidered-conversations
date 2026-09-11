import { authorizeAdminIdentity } from './identity.mjs';

export class OAuthFlowError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export async function completeGoogleOAuth(input, dependencies) {
  try {
    const tokens = await dependencies.exchangeCode(input);
    if (!tokens.refreshToken) throw new OAuthFlowError('missing_refresh_token');
    const claims = await dependencies.verifyIdentity(tokens.idToken);
    const identity = authorizeAdminIdentity(claims, input.adminEmail);
    const calendar = await dependencies.discoverCalendar(tokens.accessToken);
    const encryptedRefreshToken = dependencies.encryptToken(tokens.refreshToken, input.state);
    await dependencies.persistConnection({
      googleSubject: identity.subject,
      googleEmail: identity.email,
      calendarId: calendar.id,
      calendarSummary: calendar.summary,
      calendarTimeZone: calendar.timeZone,
      refreshTokenEncrypted: encryptedRefreshToken,
      grantedScopes: tokens.grantedScopes,
    });
    return identity;
  } catch (error) {
    if (error instanceof OAuthFlowError) throw error;
    if (error?.code === 'unauthorized_account') {
      throw new OAuthFlowError('unauthorized_account');
    }
    throw new OAuthFlowError('connection_failed');
  }
}
