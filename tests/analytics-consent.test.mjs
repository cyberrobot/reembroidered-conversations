import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidAnalyticsMeasurementId,
  parseAnalyticsConsent,
  parseAnalyticsPreference,
  resolveAnalyticsPreference,
} from "../src/lib/analytics.ts";

test("Google Analytics measurement ID validation fails closed", () => {
  assert.equal(isValidAnalyticsMeasurementId("G-TEST000001"), true);
  assert.equal(isValidAnalyticsMeasurementId(""), false);
  assert.equal(isValidAnalyticsMeasurementId(undefined), false);
  assert.equal(isValidAnalyticsMeasurementId("G-short"), false);
  assert.equal(isValidAnalyticsMeasurementId("UA-123456"), false);
  assert.equal(isValidAnalyticsMeasurementId("G-TEST 000001"), false);
});

test("analytics consent parser accepts only explicit versioned choices", () => {
  assert.equal(parseAnalyticsConsent("granted"), "granted");
  assert.equal(parseAnalyticsConsent("denied"), "denied");
  assert.equal(parseAnalyticsConsent(null), null);
  assert.equal(parseAnalyticsConsent("unknown"), null);
  assert.equal(parseAnalyticsConsent("true"), null);
});

test("analytics preference migration preserves explicit legacy choices", () => {
  assert.equal(parseAnalyticsPreference("enabled"), "enabled");
  assert.equal(parseAnalyticsPreference("disabled"), "disabled");
  assert.equal(parseAnalyticsPreference("granted"), null);
  assert.equal(parseAnalyticsPreference(null), null);

  assert.deepEqual(resolveAnalyticsPreference("enabled", null), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("disabled", null), {
    preference: "disabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, "granted"), {
    preference: "enabled",
    showNotice: false,
    migrated: true,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, "denied"), {
    preference: "disabled",
    showNotice: false,
    migrated: true,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, null), {
    preference: "enabled",
    showNotice: true,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("corrupt", null), {
    preference: "enabled",
    showNotice: true,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("corrupt", "denied"), {
    preference: "disabled",
    showNotice: false,
    migrated: true,
  });
});
