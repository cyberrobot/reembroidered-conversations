import 'server-only';

import { getTokenEncryptionKey } from './config';
import {
  decryptRefreshToken as decrypt,
  encryptRefreshToken as encrypt,
} from './token-encryption.mjs';

export function encryptRefreshToken(refreshToken: string): string {
  return encrypt(refreshToken, getTokenEncryptionKey());
}

export function decryptRefreshToken(envelope: string): string {
  return decrypt(envelope, getTokenEncryptionKey());
}
