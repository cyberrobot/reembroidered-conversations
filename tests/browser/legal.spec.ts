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
    dialog.getByText("Version 1.1", { exact: false }).first(),
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

test("Terms statutory cancellation sections support deep links and search", async ({
  page,
}) => {
  await page.goto(
    "/?legal=terms&legalSection=statutory-right-to-cancel#book-session",
  );
  const terms = page.getByRole("dialog", { name: "Terms and Conditions" });
  await expect(terms).toBeVisible();
  await expect(
    terms.getByRole("heading", { name: "Statutory right to cancel" }),
  ).toBeInViewport();

  await page.goto("/?legal=terms&legalSection=model-cancellation-form");
  await expect(
    terms.getByRole("heading", { name: "Model cancellation form" }),
  ).toBeInViewport();

  const search = terms.getByRole("searchbox", {
    name: "Search this document",
  });
  await search.fill("14 days");
  await expect(terms.locator('[aria-live="polite"]')).toContainText(
    /matches found/,
  );
  await expect(terms.locator("mark")).not.toHaveCount(0);

  await search.fill("model cancellation form");
  await expect(terms.locator('[aria-live="polite"]')).toContainText(
    /matches found/,
  );
  await expect(terms.locator("mark")).not.toHaveCount(0);
});

test("close uses the active history entry after Back and Forward navigation", async ({
  page,
}) => {
  await prepare(page);
  const termsLink = page.locator("footer").getByRole("link", { name: "Terms" });

  await termsLink.click();
  await page
    .getByRole("dialog", { name: "Terms and Conditions" })
    .getByRole("link", { name: "Privacy Notice" })
    .click();
  await page.goBack();
  const terms = page.getByRole("dialog", { name: "Terms and Conditions" });
  await expect(terms).toBeVisible();
  await terms.getByRole("button", { name: "Close legal document" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await expect(termsLink).toBeFocused();

  await termsLink.click();
  await page
    .getByRole("dialog", { name: "Terms and Conditions" })
    .getByRole("link", { name: "Privacy Notice" })
    .click();
  await page.goBack();
  await page.goForward();
  const privacy = page.getByRole("dialog", { name: "Privacy Notice" });
  await expect(privacy).toBeVisible();
  await privacy.getByRole("button", { name: "Close legal document" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
});

test("dialog search announces and navigates results", async ({ page }) => {
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
});

test("desktop focus wraps without including the hidden mobile navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/?legal=privacy");
  const dialog = page.getByRole("dialog", { name: "Privacy Notice" });
  const first = dialog.getByRole("button", { name: "Print" });
  const desktopNavigation = dialog.locator("aside");
  const last = desktopNavigation.getByRole("link").last();
  const mobileSummary = dialog.locator("details > summary");

  await expect(mobileSummary).toBeHidden();
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
});

test("mobile summary participates in focus order and closed details hide their links", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?legal=privacy");
  const dialog = page.getByRole("dialog", { name: "Privacy Notice" });
  const first = dialog.locator("header button").first();
  const beforeSummary = dialog.getByRole("searchbox", {
    name: "Search this document",
  });
  const details = dialog.locator("details");
  const summary = details.locator("summary");
  const sectionLinks = details.getByRole("link");

  await expect(summary).toBeVisible();
  await expect(details).not.toHaveAttribute("open", "");
  await expect(sectionLinks.first()).toBeHidden();

  await beforeSummary.focus();
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(summary).toBeFocused();

  await summary.press("Enter");
  await expect(details).toHaveAttribute("open", "");
  await expect(sectionLinks.first()).toBeVisible();
  const lastSectionLink = sectionLinks.last();
  await lastSectionLink.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(lastSectionLink).toBeFocused();
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
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#site-content")).toBeHidden();
  await expect(page.locator(".legal-modal-controls")).toBeHidden();
  const legalDocument = page.locator(".legal-document");
  await expect(legalDocument).toBeVisible();
  await expect(
    legalDocument.getByRole("heading", {
      name: /Changes and document version/,
    }),
  ).toBeVisible();
  await expect(
    legalDocument.getByRole("heading", { name: "Model cancellation form" }),
  ).toBeVisible();
  await expect(
    legalDocument.getByText(/I give notice that I cancel my contract/),
  ).toBeVisible();
  const printCompanyDisclosure = legalDocument.locator("footer");
  await expect(
    printCompanyDisclosure.getByText(/Company number 16883201/),
  ).toBeVisible();
  await expect(
    printCompanyDisclosure.getByText(/82a James Carter Road/),
  ).toBeVisible();
  await expect(legalDocument.getByText(/Version 1\.1/).first()).toBeVisible();
  expect(
    await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflow,
      body: getComputedStyle(document.body).overflow,
    })),
  ).toEqual({ html: "visible", body: "visible" });
  await page.emulateMedia({ media: "screen" });
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
