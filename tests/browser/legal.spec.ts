import { expect, test, type Page } from "@playwright/test";

const availability = {
  timezone: "Europe/London",
  days: [
    {
      date: "2035-01-08",
      slots: [
        {
          startAt: "2035-01-08T10:00:00.000Z",
          endAt: "2035-01-08T10:55:00.000Z",
        },
      ],
    },
  ],
};

async function prepare(page: Page) {
  await page.route("**/api/availability", (route) =>
    route.fulfill({ json: availability }),
  );
  await page.goto("/");
}

test("footer links open canonical documents and restore focus on close", async ({
  page,
}) => {
  await prepare(page);
  const termsLink = page.locator("footer").getByRole("link", { name: "Terms" });
  await termsLink.click();
  const dialog = page.getByRole("dialog", { name: "Terms and Conditions" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\?legal=terms$/);
  await expect(
    dialog.getByText("Version 1.0", { exact: false }).first(),
  ).toBeVisible();
  await expect(page.locator("#site-content")).toHaveAttribute("inert", "");
  await dialog.getByRole("button", { name: "Close legal document" }).click();
  await expect(dialog).toBeHidden();
  await expect(termsLink).toBeFocused();

  const privacyLink = page
    .locator("footer")
    .getByRole("link", { name: "Privacy Notice" });
  await privacyLink.click();
  await expect(
    page.getByRole("dialog", { name: "Privacy Notice" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(privacyLink).toBeFocused();
});

test("booking legal links preserve customer input and boundaries state", async ({
  page,
}) => {
  await prepare(page);
  const form = page.locator("#book-session form");
  await form.getByLabel(/Your name/).fill("Sarah");
  await form.getByLabel(/Email address/).fill("sarah@example.test");
  await form.getByRole("checkbox").check();

  await form.getByRole("link", { name: "Privacy Notice" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "Privacy Notice" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(form.getByLabel(/Your name/)).toHaveValue("Sarah");
  await expect(form.getByLabel(/Email address/)).toHaveValue(
    "sarah@example.test",
  );
  await expect(form.getByRole("checkbox")).toBeChecked();

  const terms = form.getByRole("link", { name: "Terms" });
  await terms.click();
  await expect(
    page.getByRole("dialog", { name: "Terms and Conditions" }),
  ).toBeVisible();
});

test("direct document and section links support browser history", async ({
  page,
}) => {
  await page.goto("/?legal=privacy&legalSection=retention#book-session");
  const privacy = page.getByRole("dialog", { name: "Privacy Notice" });
  await expect(privacy).toBeVisible();
  const retention = privacy.getByRole("heading", { name: /Retention/ });
  await expect(retention).toBeInViewport();

  await privacy.getByRole("link", { name: "Terms", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Terms and Conditions" }),
  ).toBeVisible();
  await page.goBack();
  await expect(privacy).toBeVisible();
  await expect(page).toHaveURL(
    /legal=privacy.*legalSection=retention.*#book-session/,
  );
  await page.goForward();
  await expect(
    page.getByRole("dialog", { name: "Terms and Conditions" }),
  ).toBeVisible();
});

test("dialog traps focus and search announces and navigates results", async ({
  page,
}) => {
  await page.goto("/?legal=privacy");
  const dialog = page.getByRole("dialog", { name: "Privacy Notice" });
  const search = dialog.getByRole("searchbox", {
    name: "Search this document",
  });
  await search.fill("Stripe");
  const status = dialog.locator('[aria-live="polite"]');
  await expect(status).toContainText(/matches found/);
  await expect(dialog.locator("mark")).not.toHaveCount(0);
  await dialog.getByRole("button", { name: "Next match" }).click();
  await expect(dialog.locator('mark[class*="text-white"]')).toHaveCount(1);

  await search.fill("no-such-legal-phrase");
  await expect(status).toHaveText("0 matches found");
  await dialog.getByRole("button", { name: "Clear" }).click();
  await expect(dialog.locator("mark")).toHaveCount(0);

  await dialog.getByRole("button", { name: "Close legal document" }).focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.locator(":focus")).toBeVisible();
  for (let index = 0; index < 20; index += 1) await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
});

test("print action is invoked and Mux privacy properties are effective", async ({
  page,
}) => {
  await page.goto("/?legal=terms");
  await page.evaluate(() => {
    Object.defineProperty(window, "print", {
      value: () => window.dispatchEvent(new Event("test-print")),
    });
  });
  const printed = page.evaluate(
    () =>
      new Promise<boolean>((resolve) =>
        window.addEventListener("test-print", () => resolve(true)),
      ),
  );
  await page.getByRole("button", { name: "Print" }).click();
  await expect(printed).resolves.toBe(true);
  await page.keyboard.press("Escape");

  const player = page.locator("mux-player");
  await expect(player).toHaveAttribute("disable-cookies", "");
  await expect(player).toHaveAttribute("no-volume-pref", "");
  await expect(player).toHaveAttribute("no-muted-pref", "");
  await expect(player).toHaveAttribute("playback-id");
});

test("legal surfaces remain usable and stable at desktop and mobile widths", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?legal=terms");
  const terms = page.getByRole("dialog", { name: "Terms and Conditions" });
  await expect(terms).toHaveScreenshot("legal-terms-desktop.png", {
    animations: "disabled",
  });

  await page.goto("/?legal=privacy");
  const privacy = page.getByRole("dialog", { name: "Privacy Notice" });
  await expect(privacy).toHaveScreenshot("legal-privacy-desktop.png", {
    animations: "disabled",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?legal=privacy");
  await expect(
    page.getByRole("dialog", { name: "Privacy Notice" }),
  ).toHaveScreenshot("legal-privacy-mobile.png", { animations: "disabled" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  const footer = page.locator("footer");
  await footer.scrollIntoViewIfNeeded();
  await expect(footer).toHaveScreenshot("legal-footer-desktop.png", {
    animations: "disabled",
  });
});
