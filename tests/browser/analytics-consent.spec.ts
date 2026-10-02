import { expect, test, type Page } from "@playwright/test";

const preferenceKey = "reembroidered.analytics-preference.v2";
const consentKey = "reembroidered.analytics-consent.v1";

async function clearAnalyticsPreference(page: Page) {
  await page.addInitScript(
    ({ preferenceKey, consentKey, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.removeItem(preferenceKey);
      localStorage.removeItem(consentKey);
      sessionStorage.setItem(marker, "done");
    },
    {
      preferenceKey,
      consentKey,
      marker: "reembroidered.analytics-test-clean-once",
    },
  );
}

function trackGoogleRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      requests.push(request.url());
    }
  });
  return requests;
}

test("first visit loads limited analytics and shows the responsive opt-out notice", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__testGoogleTagLoaded = true;",
    }),
  );
  await clearAnalyticsPreference(page);
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("limited Google Analytics statistics");
  await expect(panel.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Disable analytics" }).first(),
  ).toBeVisible();
  await expect(panel.getByRole("link", { name: "Learn more" })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBeNull();
  await expect(
    page.locator('script[src*="googletagmanager.com/gtag/js"]'),
  ).toHaveCount(1);
  const config = await page.evaluate(() =>
    (window.dataLayer ?? [])
      .map((entry) => Array.from(entry))
      .find((args) => args[0] === "config"),
  );
  expect(config?.[2]).toMatchObject({ cookie_domain: "none" });

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(panel).toHaveScreenshot("analytics-consent-desktop.png", {
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveScreenshot("analytics-consent-mobile.png", {
    animations: "disabled",
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.getByRole("button", { name: "Settings" }).click();
  await expect(panel).toContainText("Analytics is currently on.");
  await expect(
    panel.getByRole("switch", { name: "Minimal Analytics" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(panel).toHaveScreenshot(
    "analytics-consent-expanded-desktop.png",
    { animations: "disabled" },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveScreenshot(
    "analytics-consent-expanded-mobile.png",
    {
      animations: "disabled",
    },
  );
});

test("Continue acknowledges the notice, persists enabled and hides it after reload", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await clearAnalyticsPreference(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await expect.poll(() => requests.length).toBe(2);
});

test("disable immediately clears GA cookies and remains disabled after reload", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await clearAnalyticsPreference(page);
  await page.goto("/");
  await page.evaluate(() => {
    document.cookie = "_ga=browser-test; Path=/; SameSite=Lax";
    document.cookie = "_ga_TEST=browser-test; Path=/; SameSite=Lax";
  });
  await page.getByRole("button", { name: "Disable analytics" }).first().click();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  expect(
    await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((cookie) => cookie.trim().split("=", 1)[0])
        .filter((name) => name.startsWith("_ga")),
    ),
  ).toEqual([]);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  expect(requests).toHaveLength(1);
});

test("legacy v1 denial and grant migrate before analytics loads", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.addInitScript(
    ({ key, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.setItem(key, "denied");
      sessionStorage.setItem(marker, "done");
    },
    {
      key: consentKey,
      marker: "reembroidered.analytics-test-legacy-choice-once",
    },
  );
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  expect(requests).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), consentKey),
  ).toBeNull();

  await page.evaluate(
    ({ preferenceKey, consentKey }) => {
      localStorage.removeItem(preferenceKey);
      localStorage.setItem(consentKey, "granted");
    },
    { preferenceKey, consentKey },
  );
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  await expect.poll(() => requests.length).toBe(1);
});

test("corrupt preferences default on with the objection notice visible", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, "maybe"),
    preferenceKey,
  );
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Disable analytics" }).first(),
  ).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
});

test("footer settings show status and allow enabled/disabled changes", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.addInitScript(
    (key) => localStorage.setItem(key, "enabled"),
    preferenceKey,
  );
  await page.goto("/");
  const settings = page
    .locator("footer")
    .getByRole("button", { name: "Analytics settings" });
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toContainText("Analytics is currently on.");
  await panel
    .locator("#analytics-preferences")
    .getByRole("button", { name: "Disable analytics", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await settings.click();
  await expect(panel).toContainText("Analytics is currently off.");
  await panel
    .getByRole("button", { name: "Enable analytics", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  expect(requests.length).toBe(1);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    false,
  );
});

test("Privacy Notice uses the canonical legal modal and inert background", async ({
  page,
}) => {
  await clearAnalyticsPreference(page);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await panel.getByRole("link", { name: "Learn more" }).click();
  const dialog = page.getByRole("dialog", { name: "Privacy Notice" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText("Version 1.2", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator("#site-content")).toHaveAttribute("inert", "");
  await expect(
    panel.getByRole("button", { name: "Disable analytics" }).first(),
  ).toBeEnabled();
  await dialog.getByRole("button", { name: "Close legal document" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#site-content")).not.toHaveAttribute("inert", "");
  await expect(
    panel.getByRole("button", { name: "Disable analytics" }).first(),
  ).toBeVisible();
});

test("enabled preference never loads analytics on sensitive routes", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "enabled"),
    preferenceKey,
  );
  const requests = trackGoogleRequests(page);
  for (const route of [
    "/booking/manage/not-a-real-capability",
    "/booking/success?booking_id=test&session_id=cs_test",
    "/admin/google-calendar/result?status=connected",
  ]) {
    await page.goto(route);
    await expect(
      page.locator('script[src*="googletagmanager.com/gtag/js"]'),
    ).toHaveCount(0);
  }
  expect(requests).toEqual([]);
});

test("Google script failure does not interrupt homepage or booking interaction", async ({
  page,
}) => {
  await clearAnalyticsPreference(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: /Sometimes, you just need someone to listen/,
    }),
  ).toBeVisible();
  await page.locator("#book-session").scrollIntoViewIfNeeded();
  await expect(page.locator("#book-session")).toBeVisible();
});
