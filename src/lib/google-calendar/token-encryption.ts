import 'server-only';

import { getTokenEncryptionKey } from './config.ts';
import {
  decryptRefreshToken as decrypt,
  encryptRefreshToken as encrypt,
  encryptedRefreshTokenContainsOAuthState as containsOAuthState,
} from './token-encryption.mjs';

export function encryptRefreshToken(refreshToken: string, oauthState?: string): string {
  return encrypt(refreshToken, getTokenEncryptionKey(), oauthState);
}

export function decryptRefreshToken(envelope: string): string {
  return decrypt(envelope, getTokenEncryptionKey());
}

export function encryptedRefreshTokenContainsOAuthState(
  envelope: string,
  oauthState: string,
): boolean {
  return containsOAuthState(envelope, getTokenEncryptionKey(), oauthState);
}
