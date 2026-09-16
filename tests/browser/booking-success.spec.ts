import { expect, test } from '@playwright/test';
import 'dotenv/config';
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
test.skip(!connectionString, 'DATABASE_URL is required for booking success browser coverage');

const pool = connectionString ? new pg.Pool({ connectionString }) : null;
const bookingIds = [
  '5a449655-7be3-432c-a124-b769e10b5101',
  '5a449655-7be3-432c-a124-b769e10b5102',
  '5a449655-7be3-432c-a124-b769e10b5103',
  '5a449655-7be3-432c-a124-b769e10b5104',
];

async function seedBooking(index: number, status: 'PAID' | 'CONFIRMED' = 'CONFIRMED') {
  const id = bookingIds[index];
  const sessionId = `cs_test_confirmation_${index}`;
  await pool!.query('DELETE FROM "bookings" WHERE "id" = $1', [id]);
  await pool!.query(
    `INSERT INTO "bookings" ("id", "name", "email", "startAt", "endAt", "timezone", "status", "stripeCheckoutSessionId", "stripePaymentIntentId", "calendarEventId", "meetingUrl", "expiresAt")
     VALUES ($1, 'Sarah Jenkins', 'sarah@example.test', '2026-09-24T13:00:00.000Z', '2026-09-24T13:55:00.000Z', 'Europe/London', $2::"BookingStatus", $3, 'pi_test_confirmation', $4, $5, '2026-09-24T14:30:00.000Z')`,
    [id, status, sessionId, status === 'CONFIRMED' ? `rec${id.replaceAll('-', '')}` : null, status === 'CONFIRMED' ? 'https://meet.google.com/abc-defg-hij' : null],
  );
  return { id, sessionId };
}

test.afterEach(async () => {
  if (pool) await pool.query('DELETE FROM "bookings" WHERE "id" = ANY($1::uuid[])', [bookingIds]);
});

test.afterAll(async () => {
  await pool?.end();
});

test('confirmed booking renders persisted details and desktop visual', async ({ page }) => {
  const fixture = await seedBooking(0);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/booking/success?booking_id=${fixture.id}&session_id=${fixture.sessionId}&name=Attacker&amount=£1&meetingUrl=https://example.com`);

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your conversation with Shahd Karaeen is reserved.');
  for (const text of ['Sarah Jenkins', 'Thursday, 24 September 2026', '14:00–14:55', 'Europe/London', '55-minute session', '£55 paid']) await expect(page.getByText(text, { exact: false })).toBeVisible();
  await expect(page.getByText('Attacker')).toHaveCount(0);
  const meet = page.getByRole('link', { name: 'Join Google Meet' });
  await expect(meet).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
  await meet.focus();
  await expect(meet).toBeFocused();
  await expect(page).toHaveScreenshot('booking-success-confirmed-desktop.png', { fullPage: true, animations: 'disabled' });
});

test('session mismatch reveals no persisted booking information', async ({ page }) => {
  const fixture = await seedBooking(1);
  await page.goto(`/booking/success?booking_id=${fixture.id}&session_id=cs_test_attacker`);
  await expect(page.getByRole('heading', { name: 'We couldn’t verify this booking link.' })).toBeVisible();
  await expect(page.getByText('Sarah Jenkins')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Join Google Meet' })).toHaveCount(0);
});

test('finalising booking visual is stable', async ({ page }) => {
  const fixture = await seedBooking(2, 'PAID');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/booking/success?booking_id=${fixture.id}&session_id=${fixture.sessionId}`);
  await expect(page.getByRole('heading', { name: 'We’re preparing your booking.' })).toBeVisible();
  await expect(page).toHaveScreenshot('booking-success-finalising.png', { fullPage: true, animations: 'disabled' });
});

test('PAID booking automatically transitions to confirmed without reload', async ({ page }) => {
  const fixture = await seedBooking(3, 'PAID');
  await page.goto(`/booking/success?booking_id=${fixture.id}&session_id=${fixture.sessionId}`);
  await expect(page.getByRole('heading', { name: 'We’re preparing your booking.' })).toBeVisible();
  await pool!.query(
    `UPDATE "bookings" SET "status" = 'CONFIRMED', "calendarEventId" = $2, "meetingUrl" = 'https://meet.google.com/abc-defg-hij' WHERE "id" = $1`,
    [fixture.id, `rec${fixture.id.replaceAll('-', '')}`],
  );
  const meet = page.getByRole('link', { name: 'Join Google Meet' });
  await expect(meet).toBeVisible({ timeout: 10_000 });
  await expect(meet).toHaveAttribute('href', 'https://meet.google.com/abc-defg-hij');
});

test('confirmed mobile layout has no horizontal overflow', async ({ page }) => {
  const fixture = await seedBooking(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/booking/success?booking_id=${fixture.id}&session_id=${fixture.sessionId}`);
  await expect(page.getByRole('link', { name: 'Join Google Meet' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot('booking-success-confirmed-mobile.png', { fullPage: true, animations: 'disabled' });
});
