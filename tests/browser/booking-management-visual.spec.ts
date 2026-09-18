import { expect, test } from "@playwright/test";

const availability = {
  timezone: "Europe/London",
  days: [
    {
      date: "2035-01-09",
      slots: [
        {
          startAt: "2035-01-09T10:00:00.000Z",
          endAt: "2035-01-09T10:55:00.000Z",
        },
        {
          startAt: "2035-01-09T12:00:00.000Z",
          endAt: "2035-01-09T12:55:00.000Z",
        },
      ],
    },
    {
      date: "2035-01-10",
      slots: [
        {
          startAt: "2035-01-10T14:00:00.000Z",
          endAt: "2035-01-10T14:55:00.000Z",
        },
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/availability", (route) =>
    route.fulfill({ json: availability }),
  );
});

test("desktop management states preserve the AI Studio visual flow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/visual-fixtures/booking-management/active");
  await expect(
    page.getByRole("heading", { name: "Manage your conversation" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "booking-management-confirmed-desktop.png",
    { fullPage: true, animations: "disabled" },
  );

  await page.getByRole("button", { name: /Reschedule/ }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a new time" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "booking-management-reschedule-selection.png",
    { fullPage: true, animations: "disabled" },
  );
  await page.getByRole("button", { name: /Review new time/ }).click();
  await expect(
    page.getByRole("heading", { name: "Review your new time" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "booking-management-reschedule-review.png",
    { fullPage: true, animations: "disabled" },
  );

  await page.goto("/visual-fixtures/booking-management/active");
  await page.getByRole("button", { name: /Cancel booking/ }).click();
  await expect(
    page.getByRole("heading", { name: "Cancel this booking?" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "booking-management-cancellation-confirmation.png",
    { fullPage: true, animations: "disabled" },
  );

  await page.goto("/visual-fixtures/booking-management/cancelled");
  await expect(
    page.getByRole("heading", { name: "This booking has been cancelled" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot(
    "booking-management-cancelled-success.png",
    { fullPage: true, animations: "disabled" },
  );

  await page.goto("/visual-fixtures/booking-management/invalid");
  await expect(
    page.getByRole("heading", {
      name: "This management link cannot be verified",
    }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("booking-management-invalid-link.png", {
    fullPage: true,
    animations: "disabled",
  });
});

test("mobile confirmed and reschedule visuals remain usable without overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/visual-fixtures/booking-management/active");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot(
    "booking-management-confirmed-mobile.png",
    { fullPage: true, animations: "disabled" },
  );
  await page.getByRole("button", { name: /Reschedule/ }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a new time" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await expect(page).toHaveScreenshot(
    "booking-management-reschedule-mobile.png",
    { fullPage: true, animations: "disabled" },
  );
});
