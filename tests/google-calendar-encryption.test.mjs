import assert from "node:assert/strict";
import test from "node:test";

import {
  decryptRefreshToken,
  encryptRefreshToken,
  encryptedRefreshTokenContainsOAuthState,
  parseEncryptionKey,
} from "../src/lib/google-calendar/token-encryption.mjs";

const key = Buffer.alloc(32, 7).toString("base64");
const wrongKey = Buffer.alloc(32, 8).toString("base64");

test("refresh-token encryption round trips with randomized authenticated ciphertext", () => {
  const plaintext = "refresh-token-fixture-not-a-real-token";
  const first = encryptRefreshToken(plaintext, key);
  const second = encryptRefreshToken(plaintext, key);
  assert.notEqual(first, second);
  assert.equal(first.includes(plaintext), false);
  assert.equal(decryptRefreshToken(first, key), plaintext);
  assert.equal(decryptRefreshToken(second, key), plaintext);
});

test("encrypted credential binds a successful OAuth state without exposing it", () => {
  const state = "state-that-must-not-remain-in-plaintext";
  const encrypted = encryptRefreshToken("fixture-token", key, state);
  assert.equal(encrypted.includes(state), false);
  assert.equal(decryptRefreshToken(encrypted, key), "fixture-token");
  assert.equal(
    encryptedRefreshTokenContainsOAuthState(encrypted, key, state),
    true,
  );
  assert.equal(
    encryptedRefreshTokenContainsOAuthState(encrypted, key, "different-state"),
    false,
  );
});

test("refresh-token decryption fails closed for wrong keys, tampering, and malformed values", () => {
  const encrypted = encryptRefreshToken("fixture", key);
  assert.throws(() => decryptRefreshToken(encrypted, wrongKey));
  const parts = encrypted.split(".");
  const ciphertext = Buffer.from(parts[3], "base64url");
  ciphertext[0] ^= 1;
  const modified = `${parts.slice(0, 3).join(".")}.${ciphertext.toString("base64url")}`;
  assert.throws(() => decryptRefreshToken(modified, key));
  assert.throws(() => decryptRefreshToken("not-an-envelope", key));
});

test("invalid encryption key configuration is rejected", () => {
  assert.throws(() => parseEncryptionKey("too-short"));
  assert.throws(() => parseEncryptionKey(Buffer.alloc(31).toString("base64")));
  assert.deepEqual(parseEncryptionKey(key), Buffer.alloc(32, 7));
});
