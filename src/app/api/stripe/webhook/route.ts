import { processStripeWebhook } from "../../../../lib/booking/stripe-webhook.mjs";
import { createStripeWebhookHandler } from "../../../../lib/booking/stripe-webhook-handler.ts";
import {
  getStripeClient,
  getStripeWebhookSecret,
} from "../../../../lib/stripe/client.ts";

export const dynamic = "force-dynamic";

export const POST = createStripeWebhookHandler({
  constructEvent: (payload, signature) =>
    getStripeClient().webhooks.constructEvent(
      payload,
      signature,
      getStripeWebhookSecret(),
    ),
  processEvent: processStripeWebhook,
});
