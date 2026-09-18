import { expect, test, type Page, type TestInfo } from '@playwright/test';
import 'dotenv/config';
import pg from 'pg';
import { invalidPlaybackId } from '../../playwright.config';

const defaultPlaybackId = '4qvdrc02lmk21KDbxfyWcWyiV7YG9Fljckr5xj5wBzXg';

function collectBrowserFailures(page: Page) {
  const failures: string[] = [];

  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    const text = message.text();
    const isExpectedInvalidMuxProbe =
      message.type() === 'error' &&
      text === 'Failed to load resource: the server responded with a status of 404 (Not Found)';
    if (message.type() === 'error' && !isExpectedInvalidMuxProbe) failures.push(`console: ${text}`);
  });

  return failures;
}

async function openHomeWithMuxFallback(page: Page) {
  const fallbackWarning = page.waitForEvent('console', {
    predicate: (message) =>
      message.type() === 'warning' && message.text().includes('Using default'),
  });

  await page.route(`https://stream.mux.com/${invalidPlaybackId}.m3u8`, (route) =>
    route.fulfill({ status: 404, contentType: 'application/vnd.apple.mpegurl', body: '' }),
  );
  await page.goto('/');
  await fallbackWarning;
}

function firstExpectedAvailabilityDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);

  date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'short',
  }).format(date);
  return {
    weekday: dayNames[date.getUTCDay()],
    date: formattedDate,
  };
}

function availabilityFixture(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  const days = [];
  while (days.length < 36) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const day = date.toISOString().slice(0, 10);
    days.push({
      date: day,
      slots: [9, 9.9166667, 13, 13.9166667, 14.8333333, 16].map((hour) => {
        const minutes = Math.round(hour * 60);
        const start = new Date(`${day}T00:00:00.000Z`);
        start.setUTCMinutes(minutes);
        const end = new Date(start.getTime() + 55 * 60_000);
        return { startAt: start.toISOString(), endAt: end.toISOString() };
      }),
    });
  }
  return { timezone: 'Europe/London', days };
}

async function mockAvailability(page: Page, body: unknown = availabilityFixture(), status = 200) {
  await page.route('**/api/availability*', (route) => route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }));
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('production routes ignore legacy payment-authority query parameters', async ({ request }) => {
  await expect((await request.get('/')).status()).toBe(200);
  const legacyConfirmation = await request.get('/confirmation?payment_success=true', { maxRedirects: 0 });
  expect(legacyConfirmation.status()).toBe(307);
  expect(new URL(legacyConfirmation.headers().location!, 'http://127.0.0.1').pathname).toBe('/booking/success');

  const entries = [
    ['confirmation', 'true'],
    ['payment_success', 'true'],
    ['success', 'true'],
    ['session_id', 'test-session'],
    ['booking_id', 'RC-12345'],
    ['id', 'RC-12345'],
  ] as const;

  for (const [key, value] of entries) {
    const response = await request.get(`/?${key}=${encodeURIComponent(value)}`, { maxRedirects: 0 });
    expect(response.status(), `${key} must not manufacture a confirmation redirect`).toBe(200);
  }
});

test('homepage, navigation, Mux fallback, and transcript work without browser errors', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await mockAvailability(page);
  await openHomeWithMuxFallback(page);

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sometimes, you just need someone to listen.');
  const sectionOrder = await page.locator('main > section').evaluateAll((sections) =>
    sections.map((section) => section.id || section.getAttribute('aria-label')),
  );
  expect(sectionOrder).toEqual([
    'meet-shahd',
    'the-experience',
    'A question from Hope: Re-Embroidered',
    'about-shahd',
    'the-book',
    'book-session',
    'boundaries',
  ]);

  const player = page.locator('mux-player');
  await expect(player).toBeVisible();
  await expect(player).toHaveAttribute('playback-id', defaultPlaybackId);
  const playControl = page.getByRole('button', { name: 'Play video introduction from Shahd Karaeen' });
  await expect(playControl).toBeVisible();
  await playControl.focus();
  await playControl.press('Space');
  await expect(playControl).toBeHidden();
  await expect(player).toHaveAttribute('playback-id', defaultPlaybackId);

  const transcript = page.getByTitle('Read spoken transcript');
  await transcript.focus();
  await transcript.press('Enter');
  await expect(page.getByRole('heading', { name: 'What to expect from a session' })).toBeVisible();
  await page.getByRole('button', { name: '✕ Close' }).click();

  await expect(page.locator('#main-nav nav')).toBeVisible();
  await page.locator('#nav-book-button').click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await expect(page.locator('#book-session')).toBeInViewport();
  expect(await page.locator('html').evaluate((element) => getComputedStyle(element).scrollBehavior)).toBe('smooth');

  expect(failures).toEqual([]);
});

test('mobile navigation opens, closes, and navigates', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await mockAvailability(page);
  await openHomeWithMuxFallback(page);

  const toggle = page.locator('#mobile-nav-toggle');
  await toggle.focus();
  await toggle.press('Enter');
  await expect(page.getByRole('button', { name: 'Meet Shahd & Video' })).toBeVisible();
  await toggle.press('Enter');
  await expect(page.getByRole('button', { name: 'Meet Shahd & Video' })).toBeHidden();

  await toggle.click();
  await page.getByRole('button', { name: 'Reserve a Conversation (£55)' }).click();
  await expect(page.getByRole('button', { name: 'Meet Shahd & Video' })).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await expect(page.locator('#book-session')).toBeInViewport();
  expect(failures).toEqual([]);
});

test('one booking action creates a hold and automatically redirects to Checkout', async ({ page }, testInfo) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await mockAvailability(page);
  let releaseHold: (() => void) | undefined;
  let submittedHold: Record<string, unknown> | undefined;
  let holdRequests = 0;
  await page.route('**/api/bookings/hold', async (route) => {
    holdRequests += 1;
    submittedHold = route.request().postDataJSON();
    await new Promise<void>((resolve) => { releaseHold = resolve; });
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ hold: {
      id: '5a449655-7be3-432c-a124-b769e10b50ef',
      startAt: submittedHold!.startAt,
      endAt: new Date(Date.parse(String(submittedHold!.startAt)) + 55 * 60_000).toISOString(),
      timezone: 'Europe/London', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    } }) });
  });
  let checkoutRequests = 0;
  let submittedCheckout: Record<string, unknown> | undefined;
  await page.route('**/api/bookings/checkout', async (route) => {
    checkoutRequests += 1;
    submittedCheckout = route.request().postDataJSON();
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkout: {
      url: '/booking/success?booking_id=5a449655-7be3-432c-a124-b769e10b50ef&session_id=cs_test_browser_smoke',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    } }) });
  });
  await openHomeWithMuxFallback(page);
  await page.locator('#book-session').scrollIntoViewIfNeeded();
  await expect(page.locator('#confirm-booking-button')).toHaveText('Book & pay £55');

  const dateCards = page.locator('#book-session form button').filter({ hasText: /slots?/ });
  await expect(dateCards).toHaveCount(36);
  const expectedFirstDate = firstExpectedAvailabilityDate();
  await expect(dateCards.first()).toContainText(expectedFirstDate.weekday);
  await expect(dateCards.first()).toContainText(expectedFirstDate.date);
  const dayPrefixes = await dateCards.evaluateAll((buttons) =>
    buttons.map((button) => (button.textContent || '').trim().slice(0, 3)),
  );
  expect(new Set(dayPrefixes)).toEqual(new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']));

  await dateCards.nth(1).click();
  await expect(dateCards.nth(1)).toHaveClass(/bg-\[#A35048\]/);

  await page.getByRole('button', { name: 'morning', exact: true }).click();
  await expect(page.getByRole('button', { name: /AM$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'afternoon', exact: true }).click();
  await expect(page.getByRole('button', { name: /PM$/ })).toHaveCount(3);
  await page.getByRole('button', { name: 'evening', exact: true }).click();
  await expect(page.getByRole('button', { name: '5:00 PM' })).toBeVisible();
  await page.getByRole('button', { name: '5:00 PM' }).click();
  await expect(page.getByRole('button', { name: '5:00 PM' })).toHaveClass(/bg-\[#282524\]/);

  await page.getByRole('button', { name: /Audio-Only Call/ }).click();
  await expect(page.getByRole('button', { name: /Audio-Only Call/ })).toHaveClass(/ring-1/);

  await page.getByRole('button', { name: 'View full calendar' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const nextMonth = dialog.getByRole('button', { name: 'Next month' });
  const initialMonth = await nextMonth.evaluate((button) => button.previousElementSibling?.textContent?.trim());
  await nextMonth.click();
  await expect.poll(() => nextMonth.evaluate((button) => button.previousElementSibling?.textContent?.trim())).not.toBe(initialMonth);
  await dialog.getByRole('button', { name: 'Previous month' }).click();
  const availableCalendarDate = dialog.locator('button[title*="available slots"]').nth(1);
  const selectedCalendarTitle = await availableCalendarDate.getAttribute('title');
  await availableCalendarDate.click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(`Available times on ${selectedCalendarTitle!.split(' (')[0]}:`)).toBeVisible();

  await page.getByRole('button', { name: 'View full calendar' }).click();
  await attachScreenshot(page, testInfo, 'desktop-calendar-modal');
  await dialog.getByRole('button', { name: 'Close calendar' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '5:00 PM' }).click();
  await expect(page.getByRole('button', { name: '5:00 PM' })).toHaveClass(/bg-\[#282524\]/);

  const name = page.locator('#client-name');
  await page.locator('#confirm-booking-button').click();
  await expect(name).toBeFocused();
  expect(await name.evaluate((input: HTMLInputElement) => input.validationMessage)).not.toBe('');

  await name.fill('Browser Smoke');
  await page.locator('#client-email').fill('browser.smoke@example.com');
  await page.locator('#confirm-booking-button').click();
  await expect(page.getByText(/Please confirm that you understand/)).toBeVisible();
  await page.locator('#boundaries-checkbox').check();
  await page.locator('#confirm-booking-button').dblclick();
  await expect(page.locator('#confirm-booking-button')).toBeDisabled();
  await expect(page.locator('#confirm-booking-button')).toHaveText('Securing your time…');
  await expect(page.locator('#confirm-booking-button')).toHaveAttribute('aria-busy', 'true');
  expect(holdRequests).toBe(1);
  expect(checkoutRequests).toBe(0);
  expect(submittedHold).toEqual({
    name: 'Browser Smoke', email: 'browser.smoke@example.com', startAt: expect.any(String),
  });
  releaseHold?.();
  await expect.poll(() => checkoutRequests).toBe(1);
  expect(submittedCheckout).toEqual({ bookingId: '5a449655-7be3-432c-a124-b769e10b50ef' });
  await expect(page.getByText('Temporary Hold Created')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Continue to secure payment/ })).toHaveCount(0);
  await expect(page).toHaveURL(/\/booking\/success\?booking_id=/);
  await expect(page.getByText('We couldn’t verify this booking link.')).toBeVisible();
  expect(failures).toEqual([]);
});

test('lost-slot and temporary hold failures preserve form state and allow recovery', async ({ page }) => {
  let availabilityRequests = 0;
  await page.route('**/api/availability*', (route) => {
    availabilityRequests += 1;
    const fixture = availabilityFixture();
    if (availabilityRequests > 1) fixture.days[0].slots.shift();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) });
  });
  let holdRequests = 0;
  await page.route('**/api/bookings/hold', (route) => {
    holdRequests += 1;
    return route.fulfill({
      status: holdRequests === 1 ? 409 : 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: holdRequests === 1 ? 'slot_unavailable' : 'hold_unavailable' } }),
    });
  });
  let checkoutRequests = 0;
  await page.route('**/api/bookings/checkout', (route) => {
    checkoutRequests += 1;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/');
  await page.locator('#book-session').scrollIntoViewIfNeeded();
  await page.locator('#client-name').fill('Preserved Name');
  await page.locator('#client-email').fill('preserved@example.com');
  await page.locator('#boundaries-checkbox').check();
  await page.locator('#confirm-booking-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'just become unavailable' })).toBeVisible();
  await expect.poll(() => availabilityRequests).toBeGreaterThan(1);
  await expect(page.locator('#client-name')).toHaveValue('Preserved Name');
  await expect(page.locator('#client-email')).toHaveValue('preserved@example.com');
  await expect(page.locator('#confirm-booking-button')).toBeDisabled();
  expect(checkoutRequests).toBe(0);

  await page.getByRole('button', { name: /AM$/ }).first().click();
  await page.locator('#confirm-booking-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'has not yet been reserved' })).toBeVisible();
  await expect(page.locator('#client-name')).toHaveValue('Preserved Name');
  await expect(page.locator('#confirm-booking-button')).toBeEnabled();
  expect(checkoutRequests).toBe(0);
  expect(page.url()).not.toContain('/confirmation');
});

test('checkout initiation failure is retryable and a lost hold refreshes availability', async ({ page }) => {
  let availabilityRequests = 0;
  await page.route('**/api/availability*', (route) => {
    availabilityRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(availabilityFixture()) });
  });
  let holdRequests = 0;
  await page.route('**/api/bookings/hold', (route) => {
    holdRequests += 1;
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ hold: {
    id: '5a449655-7be3-432c-a124-b769e10b50ef', startAt: '2099-01-02T10:00:00.000Z', endAt: '2099-01-02T10:55:00.000Z',
    timezone: 'Europe/London', expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  } }) });
  });
  let checkoutRequests = 0;
  const checkoutBookingIds: string[] = [];
  await page.route('**/api/bookings/checkout', (route) => {
    checkoutRequests += 1;
    checkoutBookingIds.push(route.request().postDataJSON().bookingId);
    const unavailable = checkoutRequests > 1;
    return route.fulfill({ status: unavailable ? 409 : 503, contentType: 'application/json', body: JSON.stringify({ error: {
      code: unavailable ? 'hold_unavailable' : 'checkout_unavailable',
    } }) });
  });
  await page.goto('/');
  await page.locator('#client-name').fill('Checkout Recovery');
  await page.locator('#client-email').fill('checkout@example.com');
  await page.locator('#boundaries-checkbox').check();
  await page.locator('#confirm-booking-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'please try again' })).toBeVisible();
  await expect(page.locator('#confirm-booking-button')).toBeEnabled();
  await expect(page.locator('#client-name')).toBeDisabled();
  await expect(page.locator('#book-session form button').filter({ hasText: /slots?/ }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: 'View full calendar' })).toBeDisabled();
  expect(holdRequests).toBe(1);
  await page.locator('#confirm-booking-button').press('Enter');
  expect(holdRequests).toBe(1);
  await expect(page.getByRole('alert').filter({ hasText: 'no longer reserved' })).toBeVisible();
  await expect.poll(() => availabilityRequests).toBeGreaterThan(1);
  await expect(page.locator('#client-name')).toBeEnabled();
  await expect(page.locator('#confirm-booking-button')).toBeDisabled();
  expect(checkoutRequests).toBe(2);
  expect(checkoutBookingIds).toEqual([
    '5a449655-7be3-432c-a124-b769e10b50ef',
    '5a449655-7be3-432c-a124-b769e10b50ef',
  ]);
});

test('locally expired hold clears ownership and refreshes availability', async ({ page }) => {
  let availabilityRequests = 0;
  await page.route('**/api/availability*', (route) => {
    availabilityRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(availabilityFixture()) });
  });
  await page.route('**/api/bookings/hold', (route) => {
    const submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ hold: {
      id: 'expiring-hold', startAt: submitted.startAt,
      endAt: new Date(Date.parse(submitted.startAt) + 55 * 60_000).toISOString(),
      timezone: 'Europe/London', expiresAt: new Date(Date.now() + 750).toISOString(),
    } }) });
  });
  await page.route('**/api/bookings/checkout', (route) => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'checkout_unavailable' } }),
  }));
  await page.goto('/');
  await page.locator('#client-name').fill('Expiry Test');
  await page.locator('#client-email').fill('expiry@example.com');
  await page.locator('#boundaries-checkbox').check();
  await page.locator('#confirm-booking-button').click();
  await expect(page.getByRole('alert').filter({ hasText: 'still held' })).toBeVisible();
  await expect(page.locator('#client-name')).toBeDisabled();
  await expect(page.getByRole('alert').filter({ hasText: 'temporary hold has expired' })).toBeVisible();
  await expect.poll(() => availabilityRequests).toBeGreaterThan(1);
  await expect(page.locator('#client-name')).toBeEnabled();
});

test('a pending Checkout response cannot affect state after its hold expires', async ({ page }) => {
  let availabilityRequests = 0;
  await page.route('**/api/availability*', (route) => {
    availabilityRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(availabilityFixture()) });
  });

  let holdRequests = 0;
  await page.route('**/api/bookings/hold', (route) => {
    holdRequests += 1;
    const submitted = route.request().postDataJSON();
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ hold: {
      id: holdRequests === 1 ? 'stale-expiring-hold' : 'fresh-hold',
      startAt: submitted.startAt,
      endAt: new Date(Date.parse(submitted.startAt) + 55 * 60_000).toISOString(),
      timezone: 'Europe/London',
      expiresAt: new Date(Date.now() + (holdRequests === 1 ? 750 : 15 * 60_000)).toISOString(),
    } }) });
  });

  let checkoutRequests = 0;
  let releaseStaleCheckout: (() => void) | undefined;
  await page.route('**/api/bookings/checkout', async (route) => {
    checkoutRequests += 1;
    if (checkoutRequests === 1) {
      await new Promise<void>((resolve) => { releaseStaleCheckout = resolve; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkout: {
        url: '/payment?booking_id=stale-expiring-hold',
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      } }) }).catch(() => undefined);
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ checkout: {
      url: '/payment?booking_id=fresh-hold',
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    } }) });
  });

  await page.goto('/');
  await page.locator('#client-name').fill('Expiry Race');
  await page.locator('#client-email').fill('expiry-race@example.com');
  await page.locator('#boundaries-checkbox').check();
  await page.locator('#confirm-booking-button').click();
  await expect.poll(() => checkoutRequests).toBe(1);
  await expect(page.locator('#confirm-booking-button')).toHaveText('Securing your time…');

  const expiredAlert = page.getByRole('alert').filter({ hasText: 'temporary hold has expired' });
  await expect(expiredAlert).toBeVisible();
  await expect.poll(() => availabilityRequests).toBeGreaterThan(1);
  await expect(page.locator('#confirm-booking-button')).toBeDisabled();
  await page.getByRole('button', { name: /AM$/ }).first().click();
  await expect(page.locator('#confirm-booking-button')).toBeEnabled();
  expect(holdRequests).toBe(1);
  expect(checkoutRequests).toBe(1);

  releaseStaleCheckout?.();
  await page.waitForTimeout(100);
  await expect(page).not.toHaveURL(/stale-expiring-hold/);
  await expect(expiredAlert).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'still held' })).toHaveCount(0);

  await page.locator('#confirm-booking-button').click();
  await expect.poll(() => holdRequests).toBe(2);
  await expect.poll(() => checkoutRequests).toBe(2);
  await expect(page).toHaveURL(/\/booking\/success\?booking_id=fresh-hold/);
});

test('booking availability distinguishes loading, empty, and recoverable service errors', async ({ page }) => {
  let releaseLoading: (() => void) | undefined;
  await page.route('**/api/availability*', async (route) => {
    await new Promise<void>((resolve) => { releaseLoading = resolve; });
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ timezone: 'Europe/London', days: [] }) });
  });
  await page.goto('/');
  await expect(page.getByText('Checking current availability…')).toBeVisible();
  releaseLoading?.();
  await expect(page.getByText('There are no available session times in the current booking window.')).toBeVisible();
  await expect(page.locator('#confirm-booking-button')).toBeDisabled();

  await page.unroute('**/api/availability*');
  await mockAvailability(page, { error: { code: 'availability_unavailable' } }, 503);
  await page.reload();
  await expect(page.getByRole('alert').filter({ hasText: 'We could not load' })).toContainText('We could not load availability just now');
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.locator('#confirm-booking-button')).toBeDisabled();
});

test('payment return requires matching booking and Checkout Session identifiers', async ({ page }) => {
  const failures = collectBrowserFailures(page);
  const paidId = '5a449655-7be3-432c-a124-b769e10b50c1';
  const holdId = '5a449655-7be3-432c-a124-b769e10b50c2';
  const paidSession = 'cs_test_browser_paid';
  const holdSession = 'cs_test_browser_hold';
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO bookings
        (id, name, email, "startAt", "endAt", timezone, status, "stripeCheckoutSessionId", "stripePaymentIntentId", "expiresAt", "createdAt")
      VALUES
        ($1, 'Browser Paid', 'paid@example.com', '2039-01-03T10:00:00Z', '2039-01-03T10:55:00Z', 'Europe/London', 'PAID', $2, 'pi_test_browser_paid', '2039-01-02T10:31:00Z', '2039-01-02T10:00:00Z'),
        ($3, 'Browser Hold', 'hold@example.com', '2039-01-03T12:00:00Z', '2039-01-03T12:55:00Z', 'Europe/London', 'HOLD', $4, NULL, '2039-01-02T10:31:00Z', '2039-01-02T10:00:00Z')
    `, [paidId, paidSession, holdId, holdSession]);

    await page.goto(`/payment?booking_id=${paidId}`);
    await expect(page).toHaveURL(new RegExp(`/booking/success\\?booking_id=${paidId}`));
    await expect(page.getByText('We couldn’t verify this booking link.')).toBeVisible();

    await page.goto(`/payment?payment_success=true&success=true&booking_id=${paidId}&session_id=cs_test_wrong`);
    await expect(page.getByText('We couldn’t verify this booking link.')).toBeVisible();

    await page.goto(`/payment?booking_id=${paidId}&session_id=${paidSession}`);
    await expect(page.getByText('Payment received')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'We’re preparing your booking.' })).toBeVisible();

    await page.goto(`/payment?booking_id=${holdId}&session_id=${holdSession}`);
    await expect(page.getByRole('heading', { name: 'Confirming your payment…' })).toBeVisible();
    await expect(page.getByText('Payment received')).toHaveCount(0);

    await page.goto('/confirmation?payment_success=true&success=true');
    await expect(page).toHaveURL('/booking/success');
    await expect(page.getByText('We couldn’t verify this booking link.')).toBeVisible();
  } finally {
    await client.query('DELETE FROM bookings WHERE id = ANY($1::uuid[])', [[paidId, holdId]]);
    await client.end();
  }
  expect(failures).toEqual([]);
});

test('responsive visual tokens and layouts remain intact', async ({ page }, testInfo) => {
  const viewports = [
    { name: 'desktop', width: 1280, height: 720 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ];

  await page.route(`https://stream.mux.com/${invalidPlaybackId}.m3u8`, (route) =>
    route.fulfill({ status: 404, contentType: 'application/vnd.apple.mpegurl', body: '' }),
  );
  await mockAvailability(page);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.addStyleTag({
      content: '*, *::before, *::after { animation: none !important; transition: none !important; }',
    });

    const visualTokens = await page.evaluate(() => {
      const pageRootStyle = getComputedStyle(document.querySelector<HTMLElement>('.paper-grain')!);
      const headingStyle = getComputedStyle(document.querySelector('h1')!);
      const aboutImage = document.querySelector<HTMLImageElement>('#about-shahd img')!;
      const muxPlayer = document.querySelector('mux-player')!;
      const muxRect = muxPlayer.getBoundingClientRect();
      const imageRect = aboutImage.getBoundingClientRect();

      return {
        bodyFont: pageRootStyle.fontFamily,
        headingFont: headingStyle.fontFamily,
        color: pageRootStyle.color,
        backgroundImage: pageRootStyle.backgroundImage,
        imageRatio: imageRect.width / imageRect.height,
        muxRatio: muxRect.width / muxRect.height,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });

    expect(visualTokens.bodyFont).toContain('Plus Jakarta Sans');
    expect(visualTokens.headingFont).toContain('Cormorant Garamond');
    expect(visualTokens.color).toBe('rgb(40, 37, 36)');
    expect(visualTokens.backgroundImage).toContain('radial-gradient');
    expect(visualTokens.imageRatio).toBeCloseTo(0.75, 1);
    expect(visualTokens.muxRatio).toBeCloseTo(16 / 9, 1);
    expect(visualTokens.overflow).toBeLessThanOrEqual(0);

    if (viewport.name === 'desktop') {
      await expect(page.locator('#main-nav nav')).toBeVisible();
      await expect(page.locator('#mobile-nav-toggle')).toBeHidden();
    } else {
      await expect(page.locator('#main-nav nav')).toBeHidden();
      await expect(page.locator('#mobile-nav-toggle')).toBeVisible();
    }

    await attachScreenshot(page, testInfo, `${viewport.name}-hero`);
    await page.locator('#book-session').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'View full calendar' })).toBeVisible();
    await attachScreenshot(page, testInfo, `${viewport.name}-booking`);
  }
});
