import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server.js";

const headers = { "Cache-Control": "no-store" };

function secretDigest(value: string) {
  return createHash("sha256").update(value, "utf8").digest();
}

function validBearerSecret(request: Request, expectedSecret: string) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const supplied = authorization.slice("Bearer ".length);
  if (!supplied) return false;
  return timingSafeEqual(secretDigest(supplied), secretDigest(expectedSecret));
}

export function getBookingReconciliationSecret(
  environment: NodeJS.ProcessEnv = process.env,
) {
  const secret = environment.BOOKING_RECONCILIATION_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("BOOKING_RECONCILIATION_SECRET is not configured safely.");
  }
  return secret;
}

type Aggregate = {
  scanned: number;
  recovered: number;
  alreadyReconciled: number;
  deferred: number;
  manualAttention: number;
  failed: number;
  categories: Record<
    string,
    {
      scanned: number;
      recovered: number;
      alreadyReconciled: number;
      deferred: number;
      manualAttention: number;
      failed: number;
    }
  >;
};

const countKeys = [
  "scanned",
  "recovered",
  "alreadyReconciled",
  "deferred",
  "manualAttention",
  "failed",
] as const;
const categoryKeys = [
  "paid",
  "confirmationEmail",
  "checkoutHold",
  "cancellation",
  "reschedule",
] as const;

function safeCounts(source: Record<string, unknown> | undefined) {
  return Object.fromEntries(
    countKeys.map((key) => [
      key,
      typeof source?.[key] === "number" ? source[key] : 0,
    ]),
  );
}

function aggregateResponse(result: Aggregate) {
  return {
    ...safeCounts(result as unknown as Record<string, unknown>),
    categories: Object.fromEntries(
      categoryKeys.map((category) => [
        category,
        safeCounts(
          result.categories?.[category] as unknown as
            Record<string, unknown> | undefined,
        ),
      ]),
    ),
  };
}

export function createBookingReconciliationHandler(
  run: (now: Date) => Promise<Aggregate>,
  getSecret: () => string = getBookingReconciliationSecret,
  getNow: () => Date = () => new Date(),
) {
  return async function bookingReconciliationHandler(request: Request) {
    let secret: string;
    try {
      secret = getSecret();
    } catch {
      return NextResponse.json(
        { error: { code: "reconciliation_unavailable" } },
        { status: 503, headers },
      );
    }
    if (!validBearerSecret(request, secret)) {
      return NextResponse.json(
        { error: { code: "unauthorized" } },
        { status: 401, headers },
      );
    }
    try {
      const result = await run(getNow());
      return NextResponse.json(aggregateResponse(result), { headers });
    } catch (error) {
      console.error("Booking reconciliation run failed to start.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      return NextResponse.json(
        { error: { code: "reconciliation_unavailable" } },
        { status: 503, headers },
      );
    }
  };
}
