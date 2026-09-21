// @ts-check
import "server-only";

const TURNSTILE_ALWAYS_PASS_TEST_SITEKEY = "1x00000000000000000000AA";
const TURNSTILE_ALWAYS_PASS_TEST_SECRET = "1x0000000000000000000000000000000AA";

export class TurnstileVerificationError extends Error {
  constructor(code = "verification_failed") {
    super("Turnstile verification failed.");
    this.name = "TurnstileVerificationError";
    this.code = code;
  }
}

export async function verifyTurnstileToken(token) {
  if (typeof token !== "string" || !token.trim())
    throw new TurnstileVerificationError();
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new TurnstileVerificationError("verification_unavailable");
  const production = process.env.NODE_ENV === "production";
  if (
    production &&
    (secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET ||
      process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ===
        TURNSTILE_ALWAYS_PASS_TEST_SITEKEY)
  ) {
    throw new TurnstileVerificationError("verification_unavailable");
  }
  const expectedAction =
    !production && secret === TURNSTILE_ALWAYS_PASS_TEST_SECRET
      ? "test"
      : "booking_hold";
  let response;
  try {
    response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      },
    );
  } catch {
    throw new TurnstileVerificationError("verification_unavailable");
  }
  if (!response.ok)
    throw new TurnstileVerificationError("verification_unavailable");
  let result;
  try {
    result = await response.json();
  } catch {
    throw new TurnstileVerificationError("verification_unavailable");
  }
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new TurnstileVerificationError("verification_unavailable");
  const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  if (
    result.success !== true ||
    result.action !== expectedAction ||
    (expectedHostname && result.hostname !== expectedHostname)
  ) {
    console.warn("Turnstile verification rejected.", {
      success: result.success === true,
      errorCodes: Array.isArray(result["error-codes"])
        ? result["error-codes"]
        : [],
      action: typeof result.action === "string" ? result.action : null,
      hostname: typeof result.hostname === "string" ? result.hostname : null,
      expectedAction,
      expectedHostname: expectedHostname || null,
    });
    throw new TurnstileVerificationError();
  }
}
