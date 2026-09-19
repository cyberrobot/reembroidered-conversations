// @ts-check
import "server-only";

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
  const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME;
  if (
    !result.success ||
    result.action !== "booking_hold" ||
    (expectedHostname && result.hostname !== expectedHostname)
  ) {
    throw new TurnstileVerificationError();
  }
}
