import { NextResponse } from "next/server.js";
import {
  CheckoutUnavailableError,
  createBookingCheckout,
  HoldUnavailableError,
  InvalidCheckoutRequestError,
} from "./stripe-checkout.mjs";
import { STRIPE_CHECKOUT_MINUTES } from "./session-product.mjs";
import { getClientIdentity } from "../security/client-identity.mjs";
import { getAbuseStore } from "../security/abuse-store.mjs";
import { protectionErrorResponse } from "../security/protection-responses.ts";

type CheckoutService = typeof createBookingCheckout;
const headers = { "Cache-Control": "no-store" };
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createBookingCheckoutHandler(
  service: CheckoutService,
  getNow = () => new Date(),
  protection = {
    getClientIdentity,
    consumeRateLimit: async (policy: string, key: string, now: Date) =>
      (await getAbuseStore()).consumeRateLimit(policy, key, now),
    extendPermit: async (bookingId: string, expiresAt: Date) =>
      (await getAbuseStore()).extendActiveHoldPermit(bookingId, expiresAt),
    syncPermit: async (bookingId: string) =>
      (await getAbuseStore()).syncActiveHoldPermitToBooking(bookingId),
  },
) {
  return async function bookingCheckoutHandler(request: Request) {
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "invalid_checkout_request",
            message: "Check the payment request and try again.",
          },
        },
        { status: 400, headers },
      );
    }
    const now = getNow();
    let bookingId = "invalid";
    let permitExtended = false;
    try {
      bookingId =
        typeof (input as { bookingId?: unknown })?.bookingId === "string"
          ? (input as { bookingId: string }).bookingId
          : "invalid";
      const clientKey = protection.getClientIdentity(request);
      await protection.consumeRateLimit("checkout", clientKey, now);
      await protection.consumeRateLimit("checkoutBooking", bookingId, now);
      if (!UUID_PATTERN.test(bookingId))
        throw new InvalidCheckoutRequestError();
      await protection.extendPermit(
        bookingId,
        new Date(now.getTime() + STRIPE_CHECKOUT_MINUTES * 60_000),
      );
      permitExtended = true;
      const checkout = await service(input as never, now);
      await protection.extendPermit(bookingId, checkout.expiresAt);
      return NextResponse.json(
        {
          checkout: {
            url: checkout.url,
            expiresAt: checkout.expiresAt.toISOString(),
          },
        },
        { headers },
      );
    } catch (error) {
      if (permitExtended)
        await protection.syncPermit?.(bookingId).catch(() => {});
      const protectedResponse = protectionErrorResponse(error);
      if (protectedResponse) return protectedResponse;
      if (error instanceof InvalidCheckoutRequestError) {
        return NextResponse.json(
          {
            error: {
              code: "invalid_checkout_request",
              message: "Check the payment request and try again.",
            },
          },
          { status: 400, headers },
        );
      }
      if (error instanceof HoldUnavailableError) {
        return NextResponse.json(
          {
            error: {
              code: "hold_unavailable",
              message: "That time is no longer reserved.",
            },
          },
          { status: 409, headers },
        );
      }
      console.error("Stripe Checkout initiation failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json(
        {
          error: {
            code: "checkout_unavailable",
            message: "Secure payment could not be started. Please try again.",
          },
        },
        {
          status: error instanceof CheckoutUnavailableError ? 503 : 500,
          headers,
        },
      );
    }
  };
}
