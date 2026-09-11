import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function parseEncryptionKey(encodedKey) {
  if (typeof encodedKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encodedKey)) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes.');
  }
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must encode exactly 32 bytes.');
  }
  return key;
}

export function encryptRefreshToken(plaintext, encodedKey) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('A refresh token is required.');
  }
  const key = parseEncryptionKey(encodedKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return `v1.${nonce.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptRefreshToken(envelope, encodedKey) {
  const parts = typeof envelope === 'string' ? envelope.split('.') : [];
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted refresh token.');
  }
  try {
    const [, nonceText, tagText, ciphertextText] = parts;
    const decodeSegment = (text) => {
      if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('invalid encoding');
      const decoded = Buffer.from(text, 'base64url');
      if (decoded.toString('base64url') !== text) throw new Error('non-canonical encoding');
      return decoded;
    };
    const nonce = decodeSegment(nonceText);
    const tag = decodeSegment(tagText);
    const ciphertext = decodeSegment(ciphertextText);
    if (nonce.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error('invalid envelope');
    }
    const decipher = createDecipheriv('aes-256-gcm', parseEncryptionKey(encodedKey), nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Invalid encrypted refresh token.');
  }
}
