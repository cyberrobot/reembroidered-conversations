import { NextResponse } from "next/server.js";
import {
  addCalendarDays,
  getCalendarDateInTimeZone,
} from "../booking-date.mjs";
import { getAvailableSlots } from "./available-slots.mjs";
import { PROVIDER_AVAILABILITY_CONFIG } from "./provider-config.mjs";
import { getClientIdentity } from "../security/client-identity.mjs";
import { getAbuseStore } from "../security/abuse-store.mjs";
import { protectionErrorResponse } from "../security/protection-responses.ts";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

type AvailabilityService = typeof getAvailableSlots;

export function createAvailabilityHandler(
  service: AvailabilityService,
  config = PROVIDER_AVAILABILITY_CONFIG,
  getNow = () => new Date(),
  protection = {
    getClientIdentity,
    consumeRateLimit: async (policy: string, key: string, now: Date) =>
      (await getAbuseStore()).consumeRateLimit(policy, key, now),
  },
) {
  return async function availabilityHandler(request: Request) {
    const now = getNow();
    const url = new URL(request.url);
    const today = getCalendarDateInTimeZone(now, config.timezone);
    const horizon = addCalendarDays(today, config.maximumBookingHorizonDays);
    const hasFrom = url.searchParams.has("from");
    const hasTo = url.searchParams.has("to");
    const fromDate = hasFrom ? url.searchParams.get("from") : today;
    const toDate = hasTo ? url.searchParams.get("to") : horizon;

    if (
      !isCalendarDate(fromDate) ||
      !isCalendarDate(toDate) ||
      fromDate > toDate ||
      fromDate < today ||
      toDate > horizon
    ) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_date_range",
            message: "Choose a valid availability date range.",
          },
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    try {
      const clientKey = protection.getClientIdentity(request);
      await protection.consumeRateLimit("availability", clientKey, now);
    } catch (error) {
      return protectionErrorResponse(error)!;
    }

    try {
      const slots = await service({ fromDate, toDate, now, config });
      const grouped = new Map<
        string,
        Array<{ startAt: string; endAt: string }>
      >();
      for (const { date, startAt, endAt } of slots) {
        const daySlots = grouped.get(date) ?? [];
        daySlots.push({ startAt, endAt });
        grouped.set(date, daySlots);
      }
      return NextResponse.json(
        {
          timezone: config.timezone,
          days: [...grouped].map(([date, daySlots]) => ({
            date,
            slots: daySlots,
          })),
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    } catch (error) {
      console.error("Availability calculation failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode:
          error &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : undefined,
      });
      return NextResponse.json(
        {
          error: {
            code: "availability_unavailable",
            message: "Availability is temporarily unavailable.",
          },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
