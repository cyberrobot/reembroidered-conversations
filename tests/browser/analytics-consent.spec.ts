import { expect, test, type Page } from "@playwright/test";

const consentKey = "reembroidered.analytics-consent.v1";

async function startWithNoChoice(page: Page) {
  await page.addInitScript(
    ({ key, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.removeItem(key);
      sessionStorage.setItem(marker, "done");
    },
    {
      key: consentKey,
      marker: "reembroidered.analytics-consent-test-initialized",
    },
  );
}

test("unresolved consent blocks Google and shows responsive consent choices", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
  await startWithNoChoice(page);
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Essential only and close cookie settings",
    }),
  ).toBeVisible();
  await expect(panel.getByRole("link", { name: "Learn more" })).toBeVisible();
  await expect.poll(() => googleRequests).toEqual([]);
  expect(
    (await page.context().cookies()).filter(({ name }) =>
      name.startsWith("_ga"),
    ),
  ).toEqual([]);

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(panel).toHaveScreenshot("analytics-consent-desktop.png", {
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveScreenshot("analytics-consent-mobile.png", {
    animations: "disabled",
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await panel.getByRole("button", { name: "Customize" }).click();
  await expect(
    panel.getByRole("switch", { name: "Minimal Analytics" }),
  ).toHaveAttribute("aria-checked", "false");
  await expect(panel).toHaveScreenshot(
    "analytics-consent-expanded-desktop.png",
    {
      animations: "disabled",
    },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toHaveScreenshot(
    "analytics-consent-expanded-mobile.png",
    {
      animations: "disabled",
    },
  );

  const privacyLink = panel.getByRole("link", { name: "Learn more" });
  await privacyLink.focus();
  await page.keyboard.press("Tab");
  await expect(panel.getByRole("button", { name: "Hide" })).toBeFocused();
});

test("allow persists consent and loads one Google tag; reload keeps it enabled", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith("https://www.googletagmanager.com/")) {
      googleRequests.push(request.url());
    }
  });
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__testGoogleTagLoaded = true;",
    }),
  );
  await startWithNoChoice(page);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeVisible();
  await expect.poll(() => googleRequests).toEqual([]);

  await page.getByRole("button", { name: "Accept" }).click();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await expect.poll(() => googleRequests.length).toBe(1);
  const commands = await page.evaluate(() =>
    (window.dataLayer ?? []).map((entry) => ({
      isArray: Array.isArray(entry),
      length: entry.length,
      args: Array.from(entry),
    })),
  );
  expect(commands.length).toBeGreaterThanOrEqual(4);
  expect(commands.every((command) => command.isArray === false)).toBe(true);
  expect(commands.find(({ args }) => args[0] === "js")?.args).toHaveLength(2);
  expect(
    commands.find(({ args }) => args[0] === "consent" && args[1] === "update")
      ?.args[2],
  ).toMatchObject({
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  expect(
    commands.find(({ args }) => args[0] === "config")?.args.slice(0, 2),
  ).toEqual(["config", "G-TEST000001"]);
  expect(
    commands.find(({ args }) => args[0] === "config")?.args[2],
  ).toMatchObject({ cookie_domain: "none" });
  expect(
    commands
      .find(({ args }) => args[0] === "event" && args[1] === "page_view")
      ?.args.slice(0, 2),
  ).toEqual(["event", "page_view"]);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), consentKey))
    .toBe("granted");
  await expect(
    page.locator('script[src*="googletagmanager.com/gtag/js"]'),
  ).toHaveCount(1);

  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await expect.poll(() => googleRequests.length).toBe(2);
  await expect(
    page.locator('script[src*="googletagmanager.com/gtag/js"]'),
  ).toHaveCount(1);
});

test("reject persists and keeps analytics blocked across reload", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
  await startWithNoChoice(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Essential Only" }).click();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), consentKey))
    .toBe("denied");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  expect(googleRequests).toEqual([]);
});

test("invalid stored choice fails closed and asks the visitor", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "maybe"),
    consentKey,
  );
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.abort(),
  );
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeVisible();
  await expect.poll(() => googleRequests).toEqual([]);
});

test("footer settings reopens choice, reports state and withdraws it", async ({
  page,
}) => {
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
  await page.addInitScript(
    ({ key, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.setItem(key, "granted");
      sessionStorage.setItem(marker, "done");
    },
    {
      key: consentKey,
      marker: "reembroidered.analytics-consent-test-granted-once",
    },
  );
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({ contentType: "application/javascript", body: "" }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  const footer = page.locator("footer");
  const settings = footer.getByRole("button", { name: "Analytics settings" });
  await settings.scrollIntoViewIfNeeded();
  await settings.focus();
  await page.keyboard.press("Enter");

  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(
    panel.getByRole("switch", { name: "Minimal Analytics" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => {
    document.cookie = "_ga=browser-test; Path=/; SameSite=Lax";
    document.cookie = "_ga_TEST=browser-test; Path=/; SameSite=Lax";
  });
  expect(
    await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((value) => value.trim().split("=", 1)[0])
        .filter((name) => name.startsWith("_ga")),
    ),
  ).toEqual(["_ga", "_ga_TEST"]);
  await panel
    .getByRole("button", { name: "Essential Only", exact: true })
    .click();
  await expect(panel).toBeHidden();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), consentKey))
    .toBe("denied");
  expect(
    await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((value) => value.trim().split("=", 1)[0])
        .filter((name) => name.startsWith("_ga")),
    ),
  ).toEqual([]);

  await settings.click();
  await expect(
    panel.getByRole("switch", { name: "Minimal Analytics" }),
  ).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  expect(googleRequests).toHaveLength(1);
});

test("consent Privacy Notice uses the canonical modal and restores controls", async ({
  page,
}) => {
  await startWithNoChoice(page);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await panel.getByRole("link", { name: "Learn more" }).click();
  const dialog = page.getByRole("dialog", { name: "Privacy Notice" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#site-content")).toHaveAttribute("inert", "");
  expect(
    await panel.evaluate((element) =>
      element.closest("#site-content")?.hasAttribute("inert"),
    ),
  ).toBe(true);
  await expect(
    panel.getByRole("button", { name: "Essential Only" }),
  ).toBeEnabled();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(dialog.locator(":focus")).toHaveCount(1);
  await expect(
    dialog.getByText("Version 1.1", { exact: false }).first(),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Close legal document" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    panel.getByRole("button", { name: "Essential Only" }),
  ).toBeEnabled();
  await expect(page.locator("#site-content")).not.toHaveAttribute("inert", "");
});

test("granted preference never loads analytics on sensitive routes", async ({
  page,
}) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "granted"),
    consentKey,
  );
  const googleRequests: string[] = [];
  page.on("request", (request) => {
    if (/googletagmanager\.com|google-analytics\.com/.test(request.url())) {
      googleRequests.push(request.url());
    }
  });
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
  expect(googleRequests).toEqual([]);
});

test("a failed Google tag does not interrupt homepage or booking interaction", async ({
  page,
}) => {
  await startWithNoChoice(page);
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.abort(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(
    page.getByRole("heading", {
      name: /Sometimes, you just need someone to listen/,
    }),
  ).toBeVisible();
  await page.locator("#book-session").scrollIntoViewIfNeeded();
  await expect(page.locator("#book-session")).toBeVisible();
});
