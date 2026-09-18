import { createBookingCheckout } from "../../../../lib/booking/stripe-checkout.mjs";
import { createBookingCheckoutHandler } from "../../../../lib/booking/stripe-checkout-handler.ts";

export const dynamic = "force-dynamic";
export const POST = createBookingCheckoutHandler(createBookingCheckout);
