import { NextResponse } from "next/server.js";
import {
  createBookingHold,
  HoldAvailabilityError,
  InvalidHoldRequestError,
  SlotUnavailableError,
} from "./booking-hold.mjs";

type HoldService = typeof createBookingHold;
const headers = { "Cache-Control": "no-store" };

export function createBookingHoldHandler(
  service: HoldService,
  getNow = () => new Date(),
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

    try {
      const hold = await service(input as never, getNow());
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
