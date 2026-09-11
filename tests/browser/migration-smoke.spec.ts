import { expect, test, type Page, type TestInfo } from '@playwright/test';
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
  while (date.getUTCDay() === 0 || date.getUTCDay() === 1) {
    date.setUTCDate(date.getUTCDate() + 1);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return {
    weekday: dayNames[date.getUTCDay()],
    date: `${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`,
  };
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await testInfo.attach(name, {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
}

test('production routes and root confirmation entries remain compatible', async ({ request }) => {
  await expect((await request.get('/')).status()).toBe(200);
  await expect((await request.get('/confirmation')).status()).toBe(200);

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
    expect(response.status(), `${key} should redirect once`).toBe(307);

    const location = response.headers().location;
    expect(location).toBeTruthy();
    const destination = new URL(location!, 'http://127.0.0.1:3000');
    expect(destination.pathname).toBe('/confirmation');
    expect(destination.searchParams.get(key)).toBe(value);

    const destinationResponse = await request.get(`${destination.pathname}${destination.search}`, {
      maxRedirects: 0,
    });
    expect(destinationResponse.status(), `${key} destination should render without a loop`).toBe(200);
  }
});

test('homepage, navigation, Mux fallback, and transcript work without browser errors', async ({ page, request }) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 1280, height: 720 });
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
  expect((await request.head(`https://stream.mux.com/${defaultPlaybackId}.m3u8`)).ok()).toBe(true);
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

test('booking prototype preserves availability, validation, calendar, and confirmation flow', async ({ page }, testInfo) => {
  const failures = collectBrowserFailures(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openHomeWithMuxFallback(page);
  await page.locator('#book-session').scrollIntoViewIfNeeded();

  const dateCards = page.locator('#book-session form button').filter({ hasText: /slots?/ });
  await expect(dateCards).toHaveCount(36);
  const expectedFirstDate = firstExpectedAvailabilityDate();
  await expect(dateCards.first()).toContainText(expectedFirstDate.weekday);
  await expect(dateCards.first()).toContainText(expectedFirstDate.date);
  const dayPrefixes = await dateCards.evaluateAll((buttons) =>
    buttons.map((button) => (button.textContent || '').trim().slice(0, 3)),
  );
  expect(new Set(dayPrefixes)).toEqual(new Set(['Tue', 'Wed', 'Thu', 'Fri', 'Sat']));

  await dateCards.nth(1).click();
  await expect(dateCards.nth(1)).toHaveClass(/bg-\[#A35048\]/);

  await page.getByRole('button', { name: 'morning', exact: true }).click();
  await expect(page.getByRole('button', { name: /AM$/ })).toHaveCount(2);
  await page.getByRole('button', { name: 'afternoon', exact: true }).click();
  await expect(page.getByRole('button', { name: /PM$/ })).toHaveCount(2);
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
  await page.locator('#confirm-booking-button').click();

  await expect(page).toHaveURL(/\/confirmation\?/);
  const confirmationUrl = new URL(page.url());
  expect(confirmationUrl.searchParams.get('name')).toBe('Browser Smoke');
  expect(confirmationUrl.searchParams.get('email')).toBe('browser.smoke@example.com');
  expect(confirmationUrl.searchParams.get('time')).toBe('5:00 PM');
  expect(confirmationUrl.searchParams.get('format')).toBe('audio');
  expect(confirmationUrl.searchParams.get('timezone')).toBe('Europe/London (GMT/BST)');
  expect(confirmationUrl.searchParams.get('booking_id')).toMatch(/^RC-\d{5}$/);
  expect(failures).toEqual([]);
});

test('confirmation parameters and prototype utilities remain usable', async ({ page, context }, testInfo) => {
  const failures = collectBrowserFailures(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const query = new URLSearchParams({
    payment_success: 'true',
    booking_id: 'RC-12345',
    name: 'Ada Example',
    email: 'ada@example.com',
    date: 'Tuesday, 15 September 2026',
    time: '11:30 AM',
    format: 'audio',
    timezone: 'Europe/London (GMT/BST)',
    session_id: 'test-session',
  });
  await page.goto(`/confirmation?${query}`);

  await expect(page.getByText('Ada Example')).toBeVisible();
  await expect(page.getByText('ada@example.com', { exact: true })).toBeVisible();
  await expect(page.getByText('Tuesday, 15 September 2026')).toBeVisible();
  await expect(page.getByText(/11:30 AM \(Europe\/London \(GMT\/BST\)\) · 55 min/)).toBeVisible();
  await expect(page.getByText('Audio-Only Phone Call')).toBeVisible();
  await expect(page.getByText('RC-12345', { exact: true })).toBeVisible();
  await expect(page.getByText('test-session')).toBeVisible();

  await page.getByTitle('Copy reference code').click();
  await expect(page.getByTitle('Copy reference code')).toContainText('Copied');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .ics File (Apple / Outlook)' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('listening-session-shahd-karaeen-RC-12345.ics');
  await attachScreenshot(page, testInfo, 'desktop-confirmation');

  await page.getByRole('button', { name: /Return to Re-Embroidered$/ }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3000/');
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
