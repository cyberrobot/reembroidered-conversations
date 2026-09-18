import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_TTL_SECONDS = 8 * 60 * 60;

function signature(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function validateSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret) < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 bytes.");
  }
}

export function createAdminSession(subject, email, secret, now = Date.now()) {
  validateSecret(secret);
  const payload = Buffer.from(
    JSON.stringify({
      subject,
      email,
      exp: Math.floor(now / 1000) + ADMIN_SESSION_TTL_SECONDS,
    }),
  ).toString("base64url");
  const value = `v1.${payload}`;
  return `${value}.${signature(value, secret)}`;
}

export function validateAdminSession(value, secret, now = Date.now()) {
  validateSecret(secret);
  const parts = typeof value === "string" ? value.split(".") : [];
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  const signedValue = `${parts[0]}.${parts[1]}`;
  const expected = Buffer.from(signature(signedValue, secret));
  const actual = Buffer.from(parts[2]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    );
    if (
      typeof payload.subject !== "string" ||
      typeof payload.email !== "string" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= Math.floor(now / 1000)
    )
      return null;
    return payload;
  } catch {
    return null;
  }
}
