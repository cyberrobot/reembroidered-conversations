import { NextResponse } from "next/server.js";
import {
  AbuseProtectionUnavailableError,
  ActiveHoldLimitError,
  RateLimitExceededError,
} from "./abuse-store.mjs";
import { ClientIdentityUnavailableError } from "./client-identity.mjs";

const noStore = { "Cache-Control": "no-store" };

export function protectionErrorResponse(error: unknown) {
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: "Too many requests. Please try again shortly.",
        },
      },
      {
        status: 429,
        headers: { ...noStore, "Retry-After": String(error.retryAfterSeconds) },
      },
    );
  }
  if (error instanceof ActiveHoldLimitError) {
    return NextResponse.json(
      {
        error: {
          code: "active_hold_limit",
          message:
            "You already have two reserved times. Complete or wait for one to expire before choosing another.",
        },
      },
      { status: 409, headers: noStore },
    );
  }
  if (
    error instanceof AbuseProtectionUnavailableError ||
    error instanceof ClientIdentityUnavailableError
  ) {
    return NextResponse.json(
      {
        error: {
          code: "abuse_protection_unavailable",
          message:
            "Booking protection is temporarily unavailable. Please try again shortly.",
        },
      },
      { status: 503, headers: noStore },
    );
  }
  return null;
}
