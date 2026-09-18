import { NextResponse } from "next/server.js";
import { StripeWebhookReconciliationError } from "./stripe-webhook.mjs";

type Dependencies = {
  constructEvent: (payload: string, signature: string) => unknown;
  processEvent: (event: unknown) => Promise<void>;
};

export function createStripeWebhookHandler(dependencies: Dependencies) {
  return async function stripeWebhookHandler(request: Request) {
    const signature = request.headers.get("stripe-signature");
    if (!signature)
      return NextResponse.json(
        { error: { code: "invalid_signature" } },
        { status: 400 },
      );
    const payload = await request.text();
    let event: unknown;
    try {
      event = dependencies.constructEvent(payload, signature);
    } catch {
      return NextResponse.json(
        { error: { code: "invalid_signature" } },
        { status: 400 },
      );
    }
    try {
      await dependencies.processEvent(event);
      return NextResponse.json({ received: true });
    } catch (error) {
      console.error("Stripe webhook processing failed.", {
        eventId:
          typeof event === "object" && event && "id" in event
            ? event.id
            : undefined,
        errorName: error instanceof Error ? error.name : "UnknownError",
        reconciliationRequired:
          error instanceof StripeWebhookReconciliationError,
        reconciliationCode:
          error instanceof StripeWebhookReconciliationError
            ? error.code
            : undefined,
      });
      return NextResponse.json(
        { error: { code: "webhook_processing_failed" } },
        { status: 500 },
      );
    }
  };
}
