import { expect, test, type Page } from "@playwright/test";

const preferenceKey = "reembroidered.analytics-preference.v2";
const preferenceCookie = "reembroidered_analytics_preference_v2";
const consentKey = "reembroidered.analytics-consent.v1";

async function clearAnalyticsPreference(page: Page) {
  await page.addInitScript(
    ({ preferenceKey, preferenceCookie, consentKey, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.removeItem(preferenceKey);
      localStorage.removeItem(consentKey);
      document.cookie = `${preferenceCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
      sessionStorage.setItem(marker, "done");
    },
    {
      preferenceKey,
      preferenceCookie,
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

async function stubGoogleTag(page: Page) {
  await page.route("https://www.googletagmanager.com/**", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: "window.__testGoogleTagLoaded = true;",
    }),
  );
}

test("first visit loads limited analytics and shows the responsive notice", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await clearAnalyticsPreference(page);
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("You can disable analytics at any time.");
  await expect(panel.getByRole("button", { name: "Accept" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Settings" })).toBeVisible();
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
    { animations: "disabled" },
  );
});

test("notice acknowledgement persists enabled and hides the notice", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await clearAnalyticsPreference(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=enabled`);
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await expect.poll(() => requests.length).toBe(2);
});

test("Accept preserves an opt-out made in first-visit settings", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await clearAnalyticsPreference(page);
  await page.goto("/");

  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await page.evaluate(() => {
    document.cookie = "_ga=browser-test; Path=/; SameSite=Lax";
    document.cookie = "_ga_TEST=browser-test; Path=/; SameSite=Lax";
  });

  await panel.getByRole("button", { name: "Settings" }).click();
  const toggle = panel.getByRole("switch", { name: "Minimal Analytics" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    true,
  );
  expect(
    await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((cookie) => cookie.trim().split("=", 1)[0])
        .filter((name) => name === "_ga" || name.startsWith("_ga_")),
    ),
  ).toEqual([]);

  await panel.getByRole("button", { name: "Hide" }).click();
  await panel.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);

  await page.reload();
  await expect(panel).toBeHidden();
  expect(requests).toHaveLength(1);
});

test("settings switch applies and persists both preference directions immediately", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript(
    ({ key, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.setItem(key, "enabled");
      sessionStorage.setItem(marker, "done");
    },
    { key: preferenceKey, marker: "reembroidered.analytics-switch-seeded" },
  );
  await page.goto("/");
  await page.evaluate(() => {
    document.cookie = "_ga=browser-test; Path=/; SameSite=Lax";
    document.cookie = "_ga_TEST=browser-test; Path=/; SameSite=Lax";
  });

  const footerSettings = page
    .locator("footer")
    .getByRole("button", { name: "Analytics settings" });
  await footerSettings.scrollIntoViewIfNeeded();
  await footerSettings.click();
  const panel = page.getByRole("region", { name: "Analytics settings" });
  const toggle = panel.getByRole("switch", { name: "Minimal Analytics" });
  await expect(panel).toContainText("Analytics is currently on.");
  await toggle.click();

  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(panel).toContainText("Analytics is currently off.");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  expect(
    await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((cookie) => cookie.trim().split("=", 1)[0])
        .filter((name) => name === "_ga" || name.startsWith("_ga_")),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    true,
  );

  await page.reload();
  expect(requests).toHaveLength(1);
  await footerSettings.click();
  const reloadedPanel = page.getByRole("region", {
    name: "Analytics settings",
  });
  const reloadedToggle = reloadedPanel.getByRole("switch", {
    name: "Minimal Analytics",
  });
  await expect(reloadedPanel).toContainText("Analytics is currently off.");
  await reloadedToggle.click();
  await expect(reloadedToggle).toHaveAttribute("aria-checked", "true");
  await expect(reloadedPanel).toContainText("Analytics is currently on.");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    false,
  );
  expect(requests).toHaveLength(2);
});

test("Necessary Only disables analytics, clears cookies, and closes settings", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, "enabled"),
    preferenceKey,
  );
  await page.goto("/");
  await expect.poll(() => requests.length).toBe(1);
  await page.evaluate(() => {
    document.cookie = "_ga=browser-test; Path=/; SameSite=Lax";
    document.cookie = "_ga_TEST=browser-test; Path=/; SameSite=Lax";
  });

  const footerSettings = page
    .locator("footer")
    .getByRole("button", { name: "Analytics settings" });
  await footerSettings.scrollIntoViewIfNeeded();
  await footerSettings.click();
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await panel.getByRole("button", { name: "Necessary Only" }).click();

  await expect(panel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    true,
  );
  expect(
    await page.evaluate(() =>
      document.cookie
        .split(";")
        .map((cookie) => cookie.trim().split("=", 1)[0])
        .filter((name) => name === "_ga" || name.startsWith("_ga_")),
    ),
  ).toEqual([]);

  await page.reload();
  await expect(panel).toBeHidden();
  expect(requests).toHaveLength(1);
});

test("Save preferences preserves the effective switch state in both directions", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, "enabled"),
    preferenceKey,
  );
  await page.goto("/");
  await expect.poll(() => requests.length).toBe(1);

  const footerSettings = page
    .locator("footer")
    .getByRole("button", { name: "Analytics settings" });
  await footerSettings.scrollIntoViewIfNeeded();
  await footerSettings.click();
  const panel = page.getByRole("region", { name: "Analytics settings" });
  const toggle = panel.getByRole("switch", { name: "Minimal Analytics" });

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    true,
  );

  await panel.getByRole("button", { name: "Save preferences" }).click();
  await expect(panel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    true,
  );
  expect(requests).toHaveLength(1);

  await footerSettings.scrollIntoViewIfNeeded();
  await footerSettings.click();
  const reopenedPanel = page.getByRole("region", {
    name: "Analytics settings",
  });
  const reopenedToggle = reopenedPanel.getByRole("switch", {
    name: "Minimal Analytics",
  });
  await reopenedToggle.click();
  await expect(reopenedToggle).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=enabled`);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    false,
  );

  await reopenedPanel.getByRole("button", { name: "Save preferences" }).click();
  await expect(reopenedPanel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=enabled`);
  expect(await page.evaluate(() => window[`ga-disable-G-TEST000001`])).toBe(
    false,
  );
  expect(requests).toHaveLength(1);
});

test("settings acknowledgement closes without enabling disabled analytics", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript(
    (key) => localStorage.setItem(key, "disabled"),
    preferenceKey,
  );
  await page.goto("/");
  const footerSettings = page
    .locator("footer")
    .getByRole("button", { name: "Analytics settings" });
  await footerSettings.scrollIntoViewIfNeeded();
  await footerSettings.click();
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toContainText("Analytics is currently off.");
  await panel.getByRole("button", { name: "Hide" }).click();
  await panel.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  expect(requests).toEqual([]);
});

test("a disabled preference cookie works when localStorage is unavailable", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("Storage unavailable", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  const footerSettings = page
    .locator("footer")
    .getByRole("button", { name: "Analytics settings" });
  await footerSettings.scrollIntoViewIfNeeded();
  await footerSettings.click();
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await panel.getByRole("switch", { name: "Minimal Analytics" }).click();
  await expect(panel).toContainText("Analytics is currently off.");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  expect(requests).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  expect(requests).toHaveLength(1);
});

test("a disabled fallback cookie prevents analytics before interaction", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript((cookieName) => {
    document.cookie = `${cookieName}=disabled; Path=/; SameSite=Lax`;
  }, preferenceCookie);
  await page.goto("/");
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  expect(requests).toEqual([]);
});

test("a disabled current preference wins a localStorage-cookie conflict", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
  await page.addInitScript(
    ({ key, cookieName }) => {
      localStorage.setItem(key, "enabled");
      document.cookie = `${cookieName}=disabled; Path=/; SameSite=Lax`;
    },
    { key: preferenceKey, cookieName: preferenceCookie },
  );
  await page.goto("/");

  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("disabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=disabled`);
  await expect(
    page.getByRole("region", { name: "Analytics settings" }),
  ).toBeHidden();
  await expect(
    page.locator('script[src*="googletagmanager.com/gtag/js"]'),
  ).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("legacy v1 denial and grant migrate before analytics loads", async ({
  page,
}) => {
  const requests = trackGoogleRequests(page);
  await stubGoogleTag(page);
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
    ({ preferenceKey, consentKey, preferenceCookie }) => {
      localStorage.removeItem(preferenceKey);
      localStorage.setItem(consentKey, "granted");
      document.cookie = `${preferenceCookie}=; Path=/; Max-Age=0; SameSite=Lax`;
    },
    { preferenceKey, consentKey, preferenceCookie },
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
  await stubGoogleTag(page);
  await page.addInitScript(
    ({ key, cookieName, legacyKey, marker }) => {
      if (sessionStorage.getItem(marker) === "done") return;
      localStorage.setItem(key, "maybe");
      localStorage.removeItem(legacyKey);
      document.cookie = `${cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
      sessionStorage.setItem(marker, "done");
    },
    {
      key: preferenceKey,
      cookieName: preferenceCookie,
      legacyKey: consentKey,
      marker: "reembroidered.analytics-corrupt-seeded-once",
    },
  );
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Analytics settings" });
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("maybe");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    `${preferenceCookie}=enabled`,
  );

  await page.reload();
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Accept", exact: true }),
  ).toBeVisible();
  await expect.poll(() => requests.length).toBe(2);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preferenceKey),
  ).toBe("maybe");
  expect(await page.evaluate(() => document.cookie)).not.toContain(
    `${preferenceCookie}=enabled`,
  );

  await panel.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(panel).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate((key) => localStorage.getItem(key), preferenceKey),
    )
    .toBe("enabled");
  await expect
    .poll(() => page.evaluate(() => document.cookie))
    .toContain(`${preferenceCookie}=enabled`);

  await page.reload();
  await expect(panel).toBeHidden();
  await expect.poll(() => requests.length).toBe(3);
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
  await expect(panel.getByRole("button", { name: "Accept" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Close legal document" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("#site-content")).not.toHaveAttribute("inert", "");
  await expect(panel.getByRole("button", { name: "Accept" })).toBeVisible();
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
