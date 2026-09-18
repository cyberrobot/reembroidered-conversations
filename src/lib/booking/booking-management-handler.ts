import { NextResponse } from "next/server.js";
import { BookingCancellationError } from "./booking-cancellation.mjs";
import { BookingRescheduleError } from "./booking-reschedule.mjs";

const headers = { "Cache-Control": "no-store" };

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  const requestUrl = new URL(request.url);
  if (origin === requestUrl.origin) return true;

  // Next may expose its internal bind address in request.url (for example
  // 0.0.0.0) while the browser correctly sends localhost or a proxy-facing
  // host. Compare the Origin with that effective external request authority
  // without accepting an arbitrary origin.
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = forwardedHost || request.headers.get("host");
  if (!host) return false;
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const protocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);
  return origin === `${protocol}://${host}`;
}

function invalidLink() {
  return NextResponse.json(
    {
      error: {
        code: "invalid_management_link",
        message: "This booking-management link cannot be verified.",
      },
    },
    { status: 404, headers },
  );
}

export function createManagementStateHandler(
  service: (capability: string, now: Date) => Promise<any>,
  getNow = () => new Date(),
) {
  return async function managementStateHandler(
    _request: Request,
    capability: string,
  ) {
    const state = await service(capability, getNow());
    if (state.kind === "invalid") return invalidLink();
    if (state.kind === "unavailable") {
      return NextResponse.json(
        {
          error: {
            code: "management_unavailable",
            message: "Booking management is temporarily unavailable.",
          },
        },
        { status: 503, headers },
      );
    }
    return NextResponse.json(state, { headers });
  };
}

export function createCancellationHandler(
  authenticate: (capability: string) => string | null,
  service: (bookingId: string, input: unknown, now: Date) => Promise<any>,
  getNow = () => new Date(),
) {
  return async function cancellationHandler(
    request: Request,
    capability: string,
  ) {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_origin",
            message: "This request could not be verified.",
          },
        },
        { status: 403, headers },
      );
    }
    const bookingId = authenticate(capability);
    if (!bookingId) return invalidLink();
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "invalid_cancellation_request",
            message: "Review the current cancellation terms before confirming.",
          },
        },
        { status: 400, headers },
      );
    }
    try {
      return NextResponse.json(await service(bookingId, input, getNow()), {
        headers,
      });
    } catch (error) {
      if (
        error instanceof BookingCancellationError &&
        error.code === "refund_policy_changed"
      ) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message:
                "The refund outcome changed while this page was open. Review the updated terms and confirm again.",
            },
            cancellation: error.details,
          },
          { status: 409, headers },
        );
      }
      if (
        error instanceof BookingCancellationError &&
        error.code === "invalid_cancellation_request"
      ) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message:
                "Review the current cancellation terms before confirming.",
            },
          },
          { status: 400, headers },
        );
      }
      if (
        error instanceof BookingCancellationError &&
        error.code === "booking_not_cancellable"
      ) {
        return NextResponse.json(
          {
            error: {
              code: error.code,
              message: "This booking can no longer be cancelled online.",
            },
          },
          { status: 409, headers },
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "management_unavailable",
            message: "The booking was not changed. Please try again.",
          },
        },
        { status: 503, headers },
      );
    }
  };
}

export function createRescheduleHandler(
  authenticate: (capability: string) => string | null,
  service: (bookingId: string, input: unknown, now: Date) => Promise<any>,
  getNow = () => new Date(),
) {
  return async function rescheduleHandler(
    request: Request,
    capability: string,
  ) {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_origin",
            message: "This request could not be verified.",
          },
        },
        { status: 403, headers },
      );
    }
    const bookingId = authenticate(capability);
    if (!bookingId) return invalidLink();
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "invalid_reschedule_request",
            message: "Choose a valid available time.",
          },
        },
        { status: 400, headers },
      );
    }
    try {
      return NextResponse.json(await service(bookingId, input, getNow()), {
        headers,
      });
    } catch (error) {
      if (error instanceof BookingRescheduleError) {
        const status =
          {
            invalid_reschedule_request: 400,
            booking_not_reschedulable: 409,
            slot_unavailable: 409,
            change_in_progress: 409,
            calendar_unavailable: 503,
            reconciliation_pending: 202,
            management_unavailable: 503,
          }[error.code] ?? 503;
        const messages: Record<string, string> = {
          invalid_reschedule_request: "Choose a valid available time.",
          booking_not_reschedulable:
            "This booking can no longer be rescheduled online.",
          slot_unavailable:
            "That time is no longer available. Your original booking has not changed.",
          change_in_progress: "A booking change is already being finalised.",
          calendar_unavailable:
            "The new time could not be secured. Your original booking has not changed.",
          reconciliation_pending:
            "Your change is still being safely finalised. Both times remain protected.",
          management_unavailable:
            "The booking was not changed. Please try again.",
        };
        return NextResponse.json(
          { error: { code: error.code, message: messages[error.code] } },
          { status, headers },
        );
      }
      return NextResponse.json(
        {
          error: {
            code: "management_unavailable",
            message: "The booking was not changed. Please try again.",
          },
        },
        { status: 503, headers },
      );
    }
  };
}
