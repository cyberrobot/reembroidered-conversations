import assert from "node:assert/strict";
import test from "node:test";
import {
  getProviderCandidateSlotsForDate,
  validateProviderAvailabilityConfig,
} from "../src/lib/availability/candidate-slots.mjs";
import { PROVIDER_AVAILABILITY_CONFIG } from "../src/lib/availability/provider-config.mjs";

const emptyWeek = () => ({
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
});

const config = (overrides = {}) => ({
  ...PROVIDER_AVAILABILITY_CONFIG,
  weeklyWorkingHours: Object.fromEntries(
    Object.entries(PROVIDER_AVAILABILITY_CONFIG.weeklyWorkingHours).map(
      ([day, windows]) => [day, windows.map((window) => ({ ...window }))],
    ),
  ),
  daysOff: [...PROVIDER_AVAILABILITY_CONFIG.daysOff],
  ...overrides,
});

const starts = (
  date,
  providerConfig,
  now = new Date("2026-09-01T00:00:00.000Z"),
) =>
  getProviderCandidateSlotsForDate({ date, now, config: providerConfig }).map(
    (slot) => slot.startAt,
  );

test("default configuration is the canonical Monday-to-Friday London schedule", () => {
  assert.deepEqual(
    {
      timezone: PROVIDER_AVAILABILITY_CONFIG.timezone,
      sessionDurationMinutes:
        PROVIDER_AVAILABILITY_CONFIG.sessionDurationMinutes,
      bufferBeforeMinutes: PROVIDER_AVAILABILITY_CONFIG.bufferBeforeMinutes,
      bufferAfterMinutes: PROVIDER_AVAILABILITY_CONFIG.bufferAfterMinutes,
      minimumNoticeMinutes: PROVIDER_AVAILABILITY_CONFIG.minimumNoticeMinutes,
      maximumBookingHorizonDays:
        PROVIDER_AVAILABILITY_CONFIG.maximumBookingHorizonDays,
      daysOff: PROVIDER_AVAILABILITY_CONFIG.daysOff,
    },
    {
      timezone: "Europe/London",
      sessionDurationMinutes: 55,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      minimumNoticeMinutes: 1440,
      maximumBookingHorizonDays: 56,
      daysOff: [],
    },
  );
  for (const day of ["monday", "tuesday", "wednesday", "thursday", "friday"]) {
    assert.deepEqual(PROVIDER_AVAILABILITY_CONFIG.weeklyWorkingHours[day], [
      { start: "10:00", end: "12:30" },
      { start: "14:00", end: "18:00" },
    ]);
  }
  assert.deepEqual(
    PROVIDER_AVAILABILITY_CONFIG.weeklyWorkingHours.saturday,
    [],
  );
  assert.deepEqual(PROVIDER_AVAILABILITY_CONFIG.weeklyWorkingHours.sunday, []);
  assert.equal("slotIntervalMinutes" in PROVIDER_AVAILABILITY_CONFIG, false);
});

test("duration and buffers independently determine 60, 75, and 90 minute cadence", () => {
  for (const [bufferBeforeMinutes, bufferAfterMinutes, windowEnd, expected] of [
    [0, 5, "14:00", ["09:00", "10:00", "11:00", "12:00"]],
    [10, 10, "14:00", ["09:10", "10:25", "11:40"]],
    [15, 20, "14:30", ["09:15", "10:45", "12:15"]],
  ]) {
    const weeklyWorkingHours = {
      ...emptyWeek(),
      monday: [{ start: "10:00", end: windowEnd }],
    };
    const actual = starts(
      "2026-09-07",
      config({
        bufferBeforeMinutes,
        bufferAfterMinutes,
        minimumNoticeMinutes: 0,
        weeklyWorkingHours,
      }),
    );
    assert.deepEqual(
      actual.map((instant) => instant.slice(11, 16)),
      expected,
    );
  }

  const shorterSessions = starts(
    "2026-09-07",
    config({
      sessionDurationMinutes: 40,
      bufferBeforeMinutes: 5,
      bufferAfterMinutes: 5,
      minimumNoticeMinutes: 0,
      weeklyWorkingHours: {
        ...emptyWeek(),
        monday: [{ start: "10:00", end: "14:00" }],
      },
    }),
  );
  assert.deepEqual(
    shorterSessions.slice(0, 3).map((instant) => instant.slice(11, 16)),
    ["09:05", "09:55", "10:45"],
  );
});

test("each weekday uses its own windows and weekends can remain unavailable", () => {
  const now = new Date("2026-09-06T00:00:00.000Z");
  for (const [date, expectedCount] of [
    ["2026-09-07", 6],
    ["2026-09-08", 6],
    ["2026-09-09", 6],
    ["2026-09-10", 6],
    ["2026-09-11", 6],
    ["2026-09-12", 0],
    ["2026-09-13", 0],
  ]) {
    assert.equal(
      getProviderCandidateSlotsForDate({
        date,
        now,
        config: config({ minimumNoticeMinutes: 0 }),
      }).length,
      expectedCount,
    );
  }
});

test("buffers and sessions fit within each independent working window", () => {
  const providerConfig = config({
    sessionDurationMinutes: 55,
    bufferBeforeMinutes: 10,
    bufferAfterMinutes: 5,
    minimumNoticeMinutes: 0,
    weeklyWorkingHours: {
      ...emptyWeek(),
      monday: [
        { start: "10:00", end: "13:00" },
        { start: "14:00", end: "15:10" },
      ],
    },
  });
  const slots = getProviderCandidateSlotsForDate({
    date: "2026-09-07",
    now: new Date("2026-09-01T00:00:00Z"),
    config: providerConfig,
  });
  assert.deepEqual(slots, [
    {
      startAt: "2026-09-07T09:10:00.000Z",
      endAt: "2026-09-07T10:05:00.000Z",
      occupancyStartAt: "2026-09-07T09:00:00.000Z",
      occupancyEndAt: "2026-09-07T10:10:00.000Z",
    },
    {
      startAt: "2026-09-07T10:20:00.000Z",
      endAt: "2026-09-07T11:15:00.000Z",
      occupancyStartAt: "2026-09-07T10:10:00.000Z",
      occupancyEndAt: "2026-09-07T11:20:00.000Z",
    },
    {
      startAt: "2026-09-07T13:10:00.000Z",
      endAt: "2026-09-07T14:05:00.000Z",
      occupancyStartAt: "2026-09-07T13:00:00.000Z",
      occupancyEndAt: "2026-09-07T14:10:00.000Z",
    },
  ]);
});

test("days off override working hours and duplicate dates behave consistently", () => {
  const providerConfig = config({
    daysOff: ["2026-09-08", "2026-09-08"],
    minimumNoticeMinutes: 0,
  });
  assert.deepEqual(starts("2026-09-08", providerConfig), []);
});

test("minimum notice excludes starts before the elapsed-time boundary and includes equality", () => {
  const providerConfig = config({
    minimumNoticeMinutes: 60,
    maximumBookingHorizonDays: 1,
    weeklyWorkingHours: {
      ...emptyWeek(),
      monday: [{ start: "10:00", end: "12:00" }],
    },
  });
  assert.deepEqual(
    starts(
      "2026-09-07",
      providerConfig,
      new Date("2026-09-07T07:59:59.999Z"),
    ).map((s) => s.slice(11, 16)),
    ["09:00", "09:55"],
  );
  assert.deepEqual(
    starts(
      "2026-09-07",
      providerConfig,
      new Date("2026-09-07T08:00:00.000Z"),
    ).map((s) => s.slice(11, 16)),
    ["09:00", "09:55"],
  );
  assert.deepEqual(
    starts(
      "2026-09-07",
      providerConfig,
      new Date("2026-09-07T08:00:00.001Z"),
    ).map((s) => s.slice(11, 16)),
    ["09:55"],
  );
});

test("maximum horizon is inclusive by provider-local calendar date", () => {
  const providerConfig = config({
    minimumNoticeMinutes: 0,
    maximumBookingHorizonDays: 7,
  });
  const now = new Date("2026-10-18T23:30:00.000Z"); // Monday 19 October in London.
  assert.ok(starts("2026-10-23", providerConfig, now).length > 0);
  assert.ok(starts("2026-10-26", providerConfig, now).length > 0);
  assert.deepEqual(starts("2026-10-27", providerConfig, now), []);
  assert.deepEqual(starts("2026-10-18", providerConfig, now), []);
});

test("London wall-clock slots map to distinct GMT and BST instants", () => {
  const providerConfig = config({
    minimumNoticeMinutes: 0,
    maximumBookingHorizonDays: 400,
    weeklyWorkingHours: {
      ...emptyWeek(),
      tuesday: [{ start: "10:00", end: "11:00" }],
    },
  });
  const now = new Date("2026-01-01T00:00:00.000Z");
  assert.equal(
    starts("2026-01-06", providerConfig, now)[0],
    "2026-01-06T10:00:00.000Z",
  );
  assert.equal(
    starts("2026-07-07", providerConfig, now)[0],
    "2026-07-07T09:00:00.000Z",
  );
});

test("London working hours remain ordered and 55 minutes across both DST transitions", () => {
  const providerConfig = config({
    minimumNoticeMinutes: 0,
    maximumBookingHorizonDays: 400,
    weeklyWorkingHours: {
      ...emptyWeek(),
      friday: [{ start: "10:00", end: "12:00" }],
      monday: [{ start: "10:00", end: "12:00" }],
    },
  });
  const now = new Date("2026-01-01T00:00:00.000Z");
  const cases = [
    ["2026-03-27", ["2026-03-27T10:00:00.000Z", "2026-03-27T10:55:00.000Z"]],
    ["2026-03-30", ["2026-03-30T09:00:00.000Z", "2026-03-30T09:55:00.000Z"]],
    ["2026-10-23", ["2026-10-23T09:00:00.000Z", "2026-10-23T09:55:00.000Z"]],
    ["2026-10-26", ["2026-10-26T10:00:00.000Z", "2026-10-26T10:55:00.000Z"]],
  ];
  for (const [date, expectedStarts] of cases) {
    const slots = getProviderCandidateSlotsForDate({
      date,
      now,
      config: providerConfig,
    });
    assert.deepEqual(
      slots.map((slot) => slot.startAt),
      expectedStarts,
    );
    assert.deepEqual(
      slots.map((slot) => Date.parse(slot.endAt) - Date.parse(slot.startAt)),
      [55 * 60_000, 55 * 60_000],
    );
    assert.deepEqual(
      slots.map((slot) => slot.startAt),
      [...slots.map((slot) => slot.startAt)].sort(),
    );
    assert.equal(new Set(slots.map((slot) => slot.startAt)).size, slots.length);
  }
});

test("results are chronological and duplicate-free even with adjacent windows", () => {
  const providerConfig = config({
    minimumNoticeMinutes: 0,
    weeklyWorkingHours: {
      ...emptyWeek(),
      monday: [
        { start: "11:00", end: "12:00" },
        { start: "10:00", end: "11:00" },
      ],
    },
  });
  const actual = starts("2026-09-07", providerConfig);
  assert.deepEqual(actual, [...new Set(actual)].sort());
});

test("configuration validation rejects invalid business rules", () => {
  const invalidCases = [
    { timezone: "Not/A_Timezone" },
    { sessionDurationMinutes: 0 },
    { sessionDurationMinutes: -1 },
    { bufferBeforeMinutes: -1 },
    { bufferAfterMinutes: -1 },
    { minimumNoticeMinutes: -1 },
    { maximumBookingHorizonDays: -1 },
    {
      weeklyWorkingHours: {
        ...emptyWeek(),
        monday: [{ start: "9:00", end: "10:00" }],
      },
    },
    {
      weeklyWorkingHours: {
        ...emptyWeek(),
        monday: [{ start: "24:00", end: "25:00" }],
      },
    },
    {
      weeklyWorkingHours: {
        ...emptyWeek(),
        monday: [{ start: "10:00", end: "10:00" }],
      },
    },
    {
      weeklyWorkingHours: {
        ...emptyWeek(),
        monday: [{ start: "11:00", end: "10:00" }],
      },
    },
    {
      weeklyWorkingHours: {
        ...emptyWeek(),
        monday: [
          { start: "10:00", end: "12:00" },
          { start: "11:00", end: "13:00" },
        ],
      },
    },
    { daysOff: ["2026-02-30"] },
    { daysOff: ["not-a-date"] },
  ];
  for (const overrides of invalidCases) {
    assert.throws(() => validateProviderAvailabilityConfig(config(overrides)));
  }
});

test("timezone validation never falls back to the machine timezone", () => {
  for (const timezone of [undefined, null, "", 0, false, {}, []]) {
    assert.throws(
      () => validateProviderAvailabilityConfig(config({ timezone })),
      {
        name: "TypeError",
        message: "timezone must be a non-empty IANA timezone identifier.",
      },
    );
  }

  assert.throws(
    () =>
      validateProviderAvailabilityConfig(
        config({ timezone: "Not/A_Timezone" }),
      ),
    { name: "RangeError", message: "Invalid IANA timezone: Not/A_Timezone" },
  );
  assert.doesNotThrow(() =>
    validateProviderAvailabilityConfig(config({ timezone: "Europe/London" })),
  );
});

test("independent notice, horizon, hours, and days-off edits remain valid", () => {
  for (const overrides of [
    { minimumNoticeMinutes: 15 },
    { maximumBookingHorizonDays: 90 },
    {
      weeklyWorkingHours: {
        ...emptyWeek(),
        sunday: [{ start: "09:00", end: "10:00" }],
      },
    },
    { daysOff: ["2026-12-22"] },
  ]) {
    assert.doesNotThrow(() =>
      validateProviderAvailabilityConfig(config(overrides)),
    );
  }
});
