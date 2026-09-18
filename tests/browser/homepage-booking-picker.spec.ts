import { expect, test, type Page } from "@playwright/test";
import { invalidPlaybackId } from "../../playwright.config";

const days = [
  ["2035-01-08", "08:00:00.000Z", "10:00:00.000Z"],
  ["2035-01-09", "09:00:00.000Z", "12:00:00.000Z"],
  ["2035-01-10", "10:00:00.000Z", "14:00:00.000Z"],
  ["2035-01-11", "11:00:00.000Z", "17:00:00.000Z"],
  ["2035-01-12", "09:30:00.000Z", "13:00:00.000Z"],
  ["2035-01-15", "08:30:00.000Z", "15:00:00.000Z"],
  ["2035-01-16", "10:30:00.000Z", "16:00:00.000Z"],
  ["2035-01-17", "11:30:00.000Z", "18:00:00.000Z"],
  ["2035-01-18", "09:00:00.000Z", "14:30:00.000Z"],
  ["2035-01-19", "10:00:00.000Z", "17:30:00.000Z"],
  ["2035-01-22", "08:00:00.000Z", "12:30:00.000Z"],
  ["2035-01-23", "09:00:00.000Z", "15:30:00.000Z"],
  ["2035-01-24", "10:00:00.000Z", "18:30:00.000Z"],
  ["2035-01-25", "11:00:00.000Z", "13:30:00.000Z"],
  ["2035-01-26", "08:30:00.000Z", "16:30:00.000Z"],
  ["2035-01-29", "09:30:00.000Z", "17:00:00.000Z"],
  ["2035-01-30", "10:30:00.000Z", "14:00:00.000Z"],
  ["2035-01-31", "11:30:00.000Z", "18:00:00.000Z"],
] as const;

const availability = {
  timezone: "Europe/London",
  days: days.map(([date, first, second]) => ({
    date,
    slots: [first, second].map((time) => ({
      startAt: `${date}T${time}`,
      endAt: new Date(
        Date.parse(`${date}T${time}`) + 55 * 60_000,
      ).toISOString(),
    })),
  })),
};

async function openBookingPicker(page: Page) {
  await page.route("**/api/availability", (route) =>
    route.fulfill({ json: availability }),
  );
  await page.route(
    `https://stream.mux.com/${invalidPlaybackId}.m3u8`,
    (route) =>
      route.fulfill({
        status: 404,
        contentType: "application/vnd.apple.mpegurl",
        body: "",
      }),
  );
  await page.goto("/");
  const form = page.locator("#book-session form");
  await expect(form.getByText("Upcoming available days")).toBeVisible();
  await page.addStyleTag({
    content:
      "#main-nav { display: none !important; } *, *::before, *::after { animation: none !important; transition: none !important; }",
  });
  return form;
}

for (const viewport of [
  { name: "desktop", width: 1280, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`homepage booking picker preserves the ${viewport.name} baseline`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const form = await openBookingPicker(page);
    await expect(form).toHaveScreenshot(
      `homepage-booking-picker-${viewport.name}.png`,
      {
        animations: "disabled",
      },
    );
  });
}

test("homepage picker preserves date ordering, badges, end card, and controlled selections", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const form = await openBookingPicker(page);
  const strip = form.getByRole("group", { name: "Available dates" });
  const cards = strip.locator("button[data-availability-date]");

  await expect(cards).toHaveCount(days.length);
  expect(
    await cards.evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("data-availability-date")),
    ),
  ).toEqual(days.map(([date]) => date));
  await expect(cards.first()).toContainText("Nearest");
  await expect(cards.nth(1).getByText("Nearest", { exact: true })).toHaveCount(
    0,
  );
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");

  const stripButtons = strip.locator(":scope > button");
  await expect(stripButtons.last()).toContainText("Later dates");
  await stripButtons.last().click();
  await expect(
    page.getByRole("dialog", { name: "Select a specific date" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close calendar" }).click();

  await cards.nth(1).click();
  await expect(cards.first()).toHaveAttribute("aria-pressed", "false");
  await expect(cards.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByRole("button", { name: "9:00 AM" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await form.getByRole("button", { name: "12:00 PM" }).click();
  await expect(form.getByRole("button", { name: "12:00 PM" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(form.getByRole("button", { name: "9:00 AM" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("full-calendar later-date selection scrolls its date card into the visible strip", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  const form = await openBookingPicker(page);
  const strip = form.getByRole("group", { name: "Available dates" });
  const targetDate = days.at(-1)![0];
  const targetCard = strip.locator(
    `button[data-availability-date="${targetDate}"]`,
  );

  const initiallyVisible = await targetCard.evaluate((card) => {
    const cardRect = card.getBoundingClientRect();
    const stripRect = card.parentElement!.getBoundingClientRect();
    return cardRect.left >= stripRect.left && cardRect.right <= stripRect.right;
  });
  expect(initiallyVisible).toBe(false);

  await form.getByRole("button", { name: "View full calendar" }).click();
  const dialog = page.getByRole("dialog", { name: "Select a specific date" });
  await dialog.locator(`button[title*="Wednesday, 31 Jan"]`).click();
  await expect(dialog).toBeHidden();
  await expect(targetCard).toHaveAttribute("aria-pressed", "true");
  await expect(
    form.getByText("Available times on Wednesday, 31 Jan:"),
  ).toBeVisible();

  await expect
    .poll(() =>
      targetCard.evaluate((card) => {
        const cardRect = card.getBoundingClientRect();
        const stripRect = card.parentElement!.getBoundingClientRect();
        return (
          cardRect.left >= stripRect.left && cardRect.right <= stripRect.right
        );
      }),
    )
    .toBe(true);
});
