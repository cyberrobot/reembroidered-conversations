import { NextResponse } from "next/server.js";
import {
  createBookingHold,
  HoldAvailabilityError,
  InvalidHoldRequestError,
  SlotUnavailableError,
} from "./booking-hold.mjs";
import { getClientIdentity } from "../security/client-identity.mjs";
import { getAbuseStore } from "../security/abuse-store.mjs";
import { protectionErrorResponse } from "../security/protection-responses.ts";
import {
  TurnstileVerificationError,
  verifyTurnstileToken,
} from "../security/turnstile.mjs";
import { BOOKING_HOLD_MINUTES } from "./booking-hold.mjs";

type HoldService = typeof createBookingHold;
const headers = { "Cache-Control": "no-store" };

export function createBookingHoldHandler(
  service: HoldService,
  getNow = () => new Date(),
  protection = {
    getClientIdentity,
    consumeRateLimit: async (policy: string, key: string, now: Date) =>
      (await getAbuseStore()).consumeRateLimit(policy, key, now),
    verifyChallenge: verifyTurnstileToken,
    acquirePermit: async (key: string, expiresAt: Date, now: Date) =>
      (await getAbuseStore()).acquireActiveHoldPermit(key, expiresAt, now),
    commitPermit: async (permitId: string, bookingId: string) =>
      (await getAbuseStore()).commitActiveHoldPermit(permitId, bookingId),
    releasePermit: async (reference: string) =>
      (await getAbuseStore()).releaseActiveHoldPermit(reference),
    cancelUntrackedHold: async (bookingId: string) => {
      const { db } = await import("../db.ts");
      await db.booking.updateMany({
        where: { id: bookingId, status: "HOLD", stripeCheckoutSessionId: null },
        data: { status: "CANCELLED" },
      });
    },
  },
) {
  return async function bookingHoldHandler(request: Request) {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "invalid_hold_request",
            message: "Check your booking details and try again.",
          },
        },
        { status: 400, headers },
      );
    }

    const now = getNow();
    const candidate = input as { turnstileToken?: unknown };
    let permitId: string | null = null;
    let permitReleaseAllowed = true;
    try {
      const clientKey = protection.getClientIdentity(request);
      await protection.consumeRateLimit("hold", clientKey, now);
      await protection.verifyChallenge(candidate?.turnstileToken);
      permitId = await protection.acquirePermit(
        clientKey,
        new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60_000),
        now,
      );
      const { turnstileToken: _unused, ...bookingInput } = candidate ?? {};
      const hold = await service(bookingInput as never, now);
      try {
        await protection.commitPermit(permitId, hold.id);
      } catch (error) {
        let holdCancelled = false;
        try {
          await protection.cancelUntrackedHold(hold.id);
          holdCancelled = true;
        } catch {
          // Preserve the uncommitted permit while the active HOLD survives.
          permitReleaseAllowed = false;
        }
        if (holdCancelled) {
          await protection.releasePermit(permitId).catch(() => {});
          permitId = null;
        }
        throw error;
      }
      return NextResponse.json(
        {
          hold: {
            id: hold.id,
            startAt: hold.startAt.toISOString(),
            endAt: hold.endAt.toISOString(),
            timezone: hold.timezone,
            expiresAt: hold.expiresAt.toISOString(),
          },
        },
        { status: 201, headers },
      );
    } catch (error) {
      if (permitId && permitReleaseAllowed)
        await protection.releasePermit(permitId).catch(() => {});
      if (error instanceof TurnstileVerificationError) {
        const unavailable = error.code === "verification_unavailable";
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: unavailable
                ? "Security verification is temporarily unavailable. Please try again."
                : "Security verification was not accepted. Please try again.",
            },
          },
          { status: unavailable ? 503 : 400, headers },
        );
      }
      const protectedResponse = protectionErrorResponse(error);
      if (protectedResponse) return protectedResponse;
      if (error instanceof InvalidHoldRequestError) {
        return NextResponse.json(
          {
            error: {
              code: "invalid_hold_request",
              message: "Check your booking details and try again.",
            },
          },
          { status: 400, headers },
        );
      }
      if (error instanceof SlotUnavailableError) {
        return NextResponse.json(
          {
            error: {
              code: "slot_unavailable",
              message: "That time is no longer available.",
            },
          },
          { status: 409, headers },
        );
      }
      const availabilityFailure = error instanceof HoldAvailabilityError;
      console.error("Booking hold creation failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        stage: availabilityFailure ? "availability" : "persistence",
      });
      return NextResponse.json(
        {
          error: {
            code: availabilityFailure ? "hold_unavailable" : "hold_failed",
            message: "This time has not been reserved. Please try again.",
          },
        },
        { status: availabilityFailure ? 503 : 500, headers },
      );
    }
  };
}
