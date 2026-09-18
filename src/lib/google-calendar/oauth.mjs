import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const OAUTH_TRANSACTION_TTL_SECONDS = 10 * 60;

const base64Url = (value) => Buffer.from(value).toString("base64url");

export function createOAuthState() {
  return base64Url(randomBytes(32));
}

export function createCodeVerifier() {
  return base64Url(randomBytes(48));
}

export function createCodeChallenge(verifier) {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createOAuthStateEnvelope(state, secret, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + OAUTH_TRANSACTION_TTL_SECONDS;
  const value = `v1.${expiresAt}.${state}`;
  return `${value}.${sign(value, secret)}`;
}

export function validateOAuthStateEnvelope(
  envelope,
  returnedState,
  secret,
  now = Date.now(),
) {
  return readOAuthStateEnvelope(envelope, returnedState, secret, now) !== null;
}

export function readOAuthStateEnvelope(
  envelope,
  returnedState,
  secret,
  now = Date.now(),
) {
  if (!envelope || !returnedState) return null;
  const parts = envelope.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  const [version, expiresAtText, state, signature] = parts;
  const value = `${version}.${expiresAtText}.${state}`;
  const expiresAt = Number(expiresAtText);
  const valid =
    Number.isSafeInteger(expiresAt) &&
    expiresAt > Math.floor(now / 1000) &&
    safeEqual(signature, sign(value, secret)) &&
    safeEqual(state, returnedState);
  return valid ? { state, expiresAt } : null;
}

export function isValidCodeVerifier(verifier) {
  return (
    typeof verifier === "string" &&
    verifier.length >= 43 &&
    verifier.length <= 128 &&
    /^[A-Za-z0-9._~-]+$/.test(verifier)
  );
}

export function buildGoogleAuthorizationUrl({
  clientId,
  redirectUri,
  scopes,
  state,
  codeChallenge,
  loginHint,
}) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    login_hint: loginHint,
  }).toString();
  return url;
}
