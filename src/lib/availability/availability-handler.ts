import { NextResponse } from 'next/server.js';
import { addCalendarDays, getCalendarDateInTimeZone } from '../booking-date.mjs';
import { getAvailableSlots } from './available-slots.mjs';
import { PROVIDER_AVAILABILITY_CONFIG } from './provider-config.mjs';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

type AvailabilityService = typeof getAvailableSlots;

export function createAvailabilityHandler(service: AvailabilityService) {
  return async function availabilityHandler(request: Request) {
    const now = new Date();
    const url = new URL(request.url);
    const fromDate = url.searchParams.get('from');
    const toDate = url.searchParams.get('to');
    const today = getCalendarDateInTimeZone(now, PROVIDER_AVAILABILITY_CONFIG.timezone);
    const horizon = addCalendarDays(today, PROVIDER_AVAILABILITY_CONFIG.maximumBookingHorizonDays);

    if (
      !isCalendarDate(fromDate) || !isCalendarDate(toDate) ||
      fromDate > toDate || fromDate < today || toDate > horizon
    ) {
      return NextResponse.json(
        { error: { code: 'invalid_date_range', message: 'Choose a valid availability date range.' } },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    try {
      const slots = await service({ fromDate, toDate, now });
      const grouped = new Map<string, Array<{ startAt: string; endAt: string }>>();
      for (const { date, startAt, endAt } of slots) {
        const daySlots = grouped.get(date) ?? [];
        daySlots.push({ startAt, endAt });
        grouped.set(date, daySlots);
      }
      return NextResponse.json(
        {
          timezone: PROVIDER_AVAILABILITY_CONFIG.timezone,
          days: [...grouped].map(([date, daySlots]) => ({ date, slots: daySlots })),
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      console.error('Availability calculation failed.', {
        errorName: error instanceof Error ? error.name : 'UnknownError',
      });
      return NextResponse.json(
        { error: { code: 'availability_unavailable', message: 'Availability is temporarily unavailable.' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  };
}
