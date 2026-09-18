import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import 'dotenv/config';
import pg from 'pg';
import { managementTestSecret } from '../../playwright.config';

const connectionString = process.env.DATABASE_URL;
test.skip(!connectionString, 'DATABASE_URL is required for booking management browser coverage');
const pool = connectionString ? new pg.Pool({ connectionString }) : null;
const ids = [
  '5a449655-7be3-432c-a124-b769e10b5301',
  '5a449655-7be3-432c-a124-b769e10b5302',
  '5a449655-7be3-432c-a124-b769e10b5303',
  '5a449655-7be3-432c-a124-b769e10b5304',
];

function capability(bookingId: string) {
  const signature = createHmac('sha256', managementTestSecret)
    .update(`booking-management:v1:${bookingId}`)
    .digest('base64url');
  return `${bookingId}.${signature}`;
}

async function seed(index = 0, options: { startAt?: Date; status?: 'CONFIRMED' | 'CANCELLED' | 'REFUNDED'; refundDue?: boolean | null; refundStatus?: string | null } = {}) {
  const id = ids[index];
  const startAt = options.startAt ?? new Date('2035-01-08T10:00:00.000Z');
  const endAt = new Date(startAt.getTime() + 55 * 60_000);
  const status = options.status ?? 'CONFIRMED';
  await pool!.query('DELETE FROM "bookings" WHERE "id" = $1', [id]);
  await pool!.query(
    `INSERT INTO "bookings"
      ("id", "name", "email", "startAt", "endAt", "timezone", "status",
       "stripeCheckoutSessionId", "stripePaymentIntentId", "calendarEventId", "meetingUrl", "expiresAt",
       "cancelledAt", "cancellationRefundDue", "calendarCancelledAt", "stripeRefundId", "stripeRefundStatus", "refundedAt")
     VALUES ($1, 'Sarah Jenkins', 'sarah.j@example.test', $2, $3, 'Europe/London', $4::"BookingStatus",
       $5, $6, $7, 'https://meet.google.com/abc-defg-hij', $8,
       $9, $10, $11, $12, $13, $14)`,
    [
      id, startAt, endAt, status, `cs_management_${index}`, `pi_management_${index}`, `event_management_${index}`,
      new Date(startAt.getTime() + 60 * 60_000),
      status === 'CONFIRMED' ? null : new Date('2034-12-01T10:00:00.000Z'),
      options.refundDue ?? null,
      status === 'CONFIRMED' ? null : new Date('2034-12-01T10:01:00.000Z'),
      options.refundStatus ? `re_management_${index}` : null,
      options.refundStatus ?? null,
      status === 'REFUNDED' ? new Date('2034-12-01T10:02:00.000Z') : null,
    ],
  );
  return { id, capability: capability(id), startAt, endAt };
}

const availability = {
  timezone: 'Europe/London',
  days: [
    { date: '2035-01-09', slots: [
      { startAt: '2035-01-09T10:00:00.000Z', endAt: '2035-01-09T10:55:00.000Z' },
      { startAt: '2035-01-09T12:00:00.000Z', endAt: '2035-01-09T12:55:00.000Z' },
    ] },
    { date: '2035-01-10', slots: [{ startAt: '2035-01-10T14:00:00.000Z', endAt: '2035-01-10T14:55:00.000Z' }] },
  ],
};

test.afterEach(async () => {
  if (pool) await pool.query('DELETE FROM "bookings" WHERE "id" = ANY($1::uuid[]) OR "rescheduleSourceBookingId" = ANY($1::uuid[])', [ids]);
});
test.afterAll(async () => { await pool?.end(); });

test('confirmed booking renders authoritative details, secure headers, keyboard actions, and desktop visual', async ({ page }) => {
  const fixture = await seed(0);
  const response = await page.goto(`/booking/manage/${fixture.capability}`);
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  await expect(page.getByRole('heading', { name: 'Manage your conversation' })).toBeVisible();
  for (const text of ['Sarah Jenkins', 'sarah.j@example.test', 'Monday, 8 January 2035', '10:00–10:55', '55 min', '£55.00']) await expect(page.getByText(text, { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /Reschedule/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cancel booking/ })).toBeVisible();
  await page.getByRole('button', { name: /Reschedule/ }).focus();
  await expect(page.getByRole('button', { name: /Reschedule/ })).toBeFocused();
});

test('reschedule selection, review, processing, success, and conflict use real API results', async ({ page }) => {
  const fixture = await seed(0);
  await page.route('**/api/availability', (route) => route.fulfill({ json: availability }));
  let submittedStartAt: string | undefined;
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(`**/api/bookings/manage/${fixture.capability}/reschedule`, async (route) => {
    submittedStartAt = (await route.request().postDataJSON()).startAt;
    await responseGate;
    await route.fulfill({ json: {
      status: 'rescheduled', booking: {
        startAt: availability.days[1].slots[0].startAt,
        endAt: availability.days[1].slots[0].endAt,
        timezone: 'Europe/London', meetingUrl: 'https://meet.google.com/abc-defg-hij',
      },
    } });
  });
  await page.goto(`/booking/manage/${fixture.capability}`);
  await page.getByRole('button', { name: /Reschedule/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new time' })).toBeVisible();
  await expect(page.getByText('Upcoming available days')).toBeVisible();
  await expect(page.getByText('Nearest dates shown first')).toBeVisible();
  await expect(page.getByRole('button', { name: '10:00 AM' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'afternoon', exact: true }).click();
  await expect(page.getByRole('button', { name: '12:00 PM' })).toBeVisible();
  await page.getByRole('button', { name: 'View full calendar' }).click();
  const calendar = page.getByRole('dialog');
  await expect(calendar).toBeVisible();
  await calendar.locator('button[title*="Wednesday, 10 Jan"]').click();
  await expect(calendar).toBeHidden();
  await expect(page.getByText('Available times on Wednesday, 10 Jan:')).toBeVisible();
  await expect(page.getByRole('button', { name: '2:00 PM' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /Review new time/ }).click();
  await expect(page.getByRole('heading', { name: 'Review your new time' })).toBeVisible();
  await expect(page.getByText('Current time')).toBeVisible();
  await expect(page.getByText('New time', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Secure this new time' }).click();
  await expect(page.getByRole('heading', { name: 'Securing your new time…' })).toBeVisible();
  releaseResponse();
  await expect(page.getByRole('heading', { name: 'Your conversation has been rescheduled' })).toBeVisible();
  await expect(page.getByText('Wednesday, 10 January 2035', { exact: false })).toBeVisible();
  expect(submittedStartAt).toBe(availability.days[1].slots[0].startAt);

  await page.unrouteAll({ behavior: 'wait' });
  let refreshedAvailabilityRequests = 0;
  await page.route('**/api/availability', (route) => {
    refreshedAvailabilityRequests += 1;
    return route.fulfill({ json: refreshedAvailabilityRequests === 1 ? availability : {
      ...availability,
      days: [availability.days[1]],
    } });
  });
  await page.route(`**/api/bookings/manage/${fixture.capability}/reschedule`, (route) => route.fulfill({
    status: 409, json: { error: { code: 'slot_unavailable', message: 'That time is no longer available. Your original booking has not changed.' } },
  }));
  await page.goto(`/booking/manage/${fixture.capability}`);
  await page.getByRole('button', { name: /Reschedule/ }).click();
  await page.getByRole('button', { name: /Review new time/ }).click();
  await page.getByRole('button', { name: 'Secure this new time' }).click();
  await expect(page.getByRole('heading', { name: 'That time could not be secured' })).toBeVisible();
  await expect(page.getByText('remains protected', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: /Choose another time/ }).click();
  await expect.poll(() => refreshedAvailabilityRequests).toBeGreaterThan(1);
  await expect(page.getByText('Available times on Wednesday, 10 Jan:')).toBeVisible();
  await expect(page.getByRole('button', { name: '2:00 PM' })).toHaveAttribute('aria-pressed', 'true');
});

test('cancellation is explicit, shows processing, and renders precise refund pending state', async ({ page }) => {
  const fixture = await seed(0);
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route(`**/api/bookings/manage/${fixture.capability}/cancel`, async (route) => {
    await responseGate;
    await route.fulfill({ json: {
      status: 'cancelled', cancelledAt: '2034-12-01T10:00:00.000Z',
      refund: { eligible: true, status: 'pending' }, calendar: { status: 'cancelled' }, externalFollowUpPending: true,
    } });
  });
  await page.goto(`/booking/manage/${fixture.capability}`);
  await page.getByRole('button', { name: /Cancel booking/ }).click();
  await expect(page.getByRole('heading', { name: 'Cancel this booking?' })).toBeVisible();
  await expect(page.getByText('eligible for a full refund', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep my booking' })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, cancel booking' }).click();
  await expect(page.getByRole('heading', { name: 'Cancelling your booking…' })).toBeVisible();
  releaseResponse();
  await expect(page.getByRole('heading', { name: 'This booking has been cancelled' })).toBeVisible();
  await expect(page.getByText('£55.00 refund pending')).toBeVisible();
  await expect(page.getByRole('button', { name: /Reschedule/ })).toHaveCount(0);
});

test('provider error detail remains visible after returning to cancellation confirmation', async ({ page }) => {
  const fixture = await seed(0);
  await page.route(`**/api/bookings/manage/${fixture.capability}/cancel`, (route) => route.fulfill({
    status: 503,
    json: { error: { code: 'cancellation_unavailable', message: 'Cancellation is temporarily unavailable. Please try again.' } },
  }));
  await page.goto(`/booking/manage/${fixture.capability}`);
  await page.getByRole('button', { name: /Cancel booking/ }).click();
  await page.getByRole('button', { name: 'Yes, cancel booking' }).click();
  await expect(page.getByRole('heading', { name: 'Cancel this booking?' })).toBeVisible();
  await expect(page.getByRole('article').getByRole('alert')).toHaveText('Cancellation is temporarily unavailable. Please try again.');
});

test('stale refundable policy is updated and requires explicit confirmation again', async ({ page }) => {
  const fixture = await seed(0);
  let attempts = 0;
  await page.route(`**/api/bookings/manage/${fixture.capability}/cancel`, async (route) => {
    attempts += 1;
    const input = await route.request().postDataJSON();
    if (attempts === 1) {
      expect(input).toEqual({ expectedRefundEligible: true });
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'refund_policy_changed',
            message: 'The refund outcome changed while this page was open. Review the updated terms and confirm again.',
          },
          cancellation: { refundEligible: false, cutoffHours: 24 },
        },
      });
      return;
    }
    expect(input).toEqual({ expectedRefundEligible: false });
    await route.fulfill({ json: {
      status: 'cancelled', cancelledAt: '2034-12-01T10:00:00.000Z',
      refund: { eligible: false, status: 'not_applicable' },
      calendar: { status: 'cancelled' }, externalFollowUpPending: false,
    } });
  });
  await page.goto(`/booking/manage/${fixture.capability}`);
  await page.getByRole('button', { name: /Cancel booking/ }).click();
  await expect(page.getByText('eligible for a full refund', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Yes, cancel booking' }).click();
  await expect(page.getByRole('heading', { name: 'Cancel this booking?' })).toBeVisible();
  await expect(page.getByText('automatic refund period has passed', { exact: false })).toBeVisible();
  await expect(page.getByRole('article').getByRole('alert')).toContainText('confirm again');
  expect(attempts).toBe(1);

  await page.getByRole('button', { name: 'Yes, cancel booking' }).click();
  await expect(page.getByRole('heading', { name: 'This booking has been cancelled' })).toBeVisible();
  await expect(page.getByText('No automatic refund applies')).toBeVisible();
  expect(attempts).toBe(2);
});

test('refreshing an uncertain reschedule exposes and resumes the exact linked hold', async ({ page }) => {
  const fixture = await seed(0);
  await pool!.query(
    `INSERT INTO "bookings" ("id", "name", "email", "startAt", "endAt", "timezone", "status", "expiresAt", "rescheduleSourceBookingId")
     VALUES ($1, 'Sarah Jenkins', 'sarah.j@example.test', $2, $3, 'Europe/London', 'HOLD', $4, $5)`,
    [ids[3], '2035-01-09T10:00:00.000Z', '2035-01-09T10:55:00.000Z', '2034-12-01T10:15:00.000Z', fixture.id],
  );
  let submittedStartAt;
  await page.route(`**/api/bookings/manage/${fixture.capability}/reschedule`, async (route) => {
    submittedStartAt = (await route.request().postDataJSON()).startAt;
    await route.fulfill({ json: { status: 'rescheduled', booking: {
      startAt: '2035-01-09T10:00:00.000Z', endAt: '2035-01-09T10:55:00.000Z',
      timezone: 'Europe/London', meetingUrl: 'https://meet.google.com/abc-defg-hij',
    } } });
  });
  await page.goto(`/booking/manage/${fixture.capability}`);
  await expect(page.getByRole('heading', { name: 'Your change is still being finalised' })).toBeVisible();
  await expect(page.getByText('Requested time')).toBeVisible();
  await page.getByRole('button', { name: 'Continue finalising this change' }).click();
  await expect(page.getByRole('heading', { name: 'Your conversation has been rescheduled' })).toBeVisible();
  expect(submittedStartAt).toBe('2035-01-09T10:00:00.000Z');
});

test('late cancellation copy promises no automatic refund', async ({ page }) => {
  const fixture = await seed(1, { startAt: new Date(Date.now() + 12 * 60 * 60_000) });
  await page.goto(`/booking/manage/${fixture.capability}`);
  await page.getByRole('button', { name: /Cancel booking/ }).click();
  await expect(page.getByText('automatic refund period has passed', { exact: false })).toBeVisible();
});

test('invalid capability reveals no booking data and has a protected visual', async ({ page }) => {
  await seed(0);
  await page.goto(`/booking/manage/${ids[0]}.tampered`);
  await expect(page.getByRole('heading', { name: 'This management link cannot be verified' })).toBeVisible();
  await expect(page.getByText('Sarah Jenkins')).toHaveCount(0);
  await expect(page.getByText('sarah.j@example.test')).toHaveCount(0);
});

test('cancelled/refunded booking is inactive and accurately reports provider state', async ({ page }) => {
  const fixture = await seed(2, { status: 'REFUNDED', refundDue: true, refundStatus: 'succeeded' });
  await page.goto(`/booking/manage/${fixture.capability}`);
  await expect(page.getByRole('heading', { name: 'This booking has been cancelled' })).toBeVisible();
  await expect(page.getByText('£55.00 refunded')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cancel booking/ })).toHaveCount(0);
});

test('mobile confirmed and reschedule layouts have no horizontal overflow', async ({ page }) => {
  const fixture = await seed(0);
  await page.route('**/api/availability', (route) => route.fulfill({ json: availability }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/booking/manage/${fixture.capability}`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole('button', { name: /Reschedule/ }).click();
  await expect(page.getByRole('heading', { name: 'Choose a new time' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
