import assert from "node:assert/strict";
import test from "node:test";
import {
  BOOKING_TIME_ZONE,
  getCalendarDateInTimeZone,
  getTomorrowCalendarDateInTimeZone,
} from "../src/lib/booking-date.mjs";

test("uses the London calendar date across the UTC/BST midnight boundary", () => {
  const instant = new Date("2026-06-30T23:30:00.000Z");

  assert.equal(BOOKING_TIME_ZONE, "Europe/London");
  assert.equal(getCalendarDateInTimeZone(instant), "2026-07-01");
  assert.equal(getTomorrowCalendarDateInTimeZone(instant), "2026-07-02");
});

test("calculates tomorrow deterministically across a GMT year boundary", () => {
  const instant = new Date("2026-12-31T23:30:00.000Z");

  assert.equal(getCalendarDateInTimeZone(instant), "2026-12-31");
  assert.equal(getTomorrowCalendarDateInTimeZone(instant), "2027-01-01");
});
