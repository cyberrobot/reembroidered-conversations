import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | undefined;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey)
    throw new Error("STRIPE_SECRET_KEY is required to use Stripe Checkout.");
  stripeClient ??= new Stripe(secretKey);
  return stripeClient;
}

export function getStripeWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is required to process Stripe webhooks.",
    );
  return secret;
}
