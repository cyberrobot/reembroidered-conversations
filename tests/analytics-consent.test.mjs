import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYTICS_PREFERENCE_COOKIE,
  isValidAnalyticsMeasurementId,
  parseAnalyticsPreferenceCookie,
  parseAnalyticsPreference,
  parseLegacyAnalyticsConsent,
  resolveAnalyticsPreference,
  serializeAnalyticsPreferenceCookie,
} from "../src/lib/analytics.ts";

test("Google Analytics measurement ID validation fails closed", () => {
  assert.equal(isValidAnalyticsMeasurementId("G-TEST000001"), true);
  assert.equal(isValidAnalyticsMeasurementId(""), false);
  assert.equal(isValidAnalyticsMeasurementId(undefined), false);
  assert.equal(isValidAnalyticsMeasurementId("G-short"), false);
  assert.equal(isValidAnalyticsMeasurementId("UA-123456"), false);
  assert.equal(isValidAnalyticsMeasurementId("G-TEST 000001"), false);
});

test("legacy consent parser accepts only v1 values", () => {
  assert.equal(parseLegacyAnalyticsConsent("granted"), "granted");
  assert.equal(parseLegacyAnalyticsConsent("denied"), "denied");
  assert.equal(parseLegacyAnalyticsConsent(null), null);
  assert.equal(parseLegacyAnalyticsConsent("unknown"), null);
  assert.equal(parseLegacyAnalyticsConsent("true"), null);
});

test("analytics preference migration preserves explicit legacy choices", () => {
  assert.equal(parseAnalyticsPreference("enabled"), "enabled");
  assert.equal(parseAnalyticsPreference("disabled"), "disabled");
  assert.equal(parseAnalyticsPreference("granted"), null);
  assert.equal(parseAnalyticsPreference(null), null);

  assert.deepEqual(resolveAnalyticsPreference("enabled", null, null), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("disabled", null, null), {
    preference: "disabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, null, "granted"), {
    preference: "enabled",
    showNotice: false,
    migrated: true,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, null, "denied"), {
    preference: "disabled",
    showNotice: false,
    migrated: true,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, null, null), {
    preference: "enabled",
    showNotice: true,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("corrupt", null, null), {
    preference: "enabled",
    showNotice: true,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("corrupt", null, "denied"), {
    preference: "disabled",
    showNotice: false,
    migrated: true,
  });
  assert.deepEqual(resolveAnalyticsPreference("corrupt", "disabled", null), {
    preference: "disabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("enabled", "corrupt", null), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("corrupt", "unknown", null), {
    preference: "enabled",
    showNotice: true,
    migrated: false,
  });
});

test("disabled wins when valid current preference stores conflict", () => {
  for (const [localStorage, cookie, expected] of [
    ["enabled", "disabled", "disabled"],
    ["disabled", "enabled", "disabled"],
    ["enabled", "enabled", "enabled"],
    ["disabled", "disabled", "disabled"],
  ]) {
    assert.deepEqual(
      resolveAnalyticsPreference(localStorage, cookie, "denied"),
      { preference: expected, showNotice: false, migrated: false },
    );
  }
});

test("a valid v2 preference supersedes stale legacy consent", () => {
  assert.deepEqual(resolveAnalyticsPreference("enabled", null, "denied"), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, "enabled", "denied"), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
});

test("valid preference cookie is the fallback before legacy migration", () => {
  assert.deepEqual(resolveAnalyticsPreference(null, "enabled", null), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, "disabled", "granted"), {
    preference: "disabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference(null, "corrupt", "denied"), {
    preference: "disabled",
    showNotice: false,
    migrated: true,
  });
});

test("a valid localStorage preference works without a current cookie", () => {
  assert.deepEqual(resolveAnalyticsPreference("enabled", null, null), {
    preference: "enabled",
    showNotice: false,
    migrated: false,
  });
  assert.deepEqual(resolveAnalyticsPreference("disabled", null, null), {
    preference: "disabled",
    showNotice: false,
    migrated: false,
  });
});

test("preference cookie parser accepts enabled and disabled values", () => {
  assert.equal(
    parseAnalyticsPreferenceCookie(`${ANALYTICS_PREFERENCE_COOKIE}=enabled`),
    "enabled",
  );
  assert.equal(
    parseAnalyticsPreferenceCookie(`${ANALYTICS_PREFERENCE_COOKIE}=disabled`),
    "disabled",
  );
  assert.equal(parseAnalyticsPreferenceCookie("other=value"), null);
  assert.equal(
    parseAnalyticsPreferenceCookie(`${ANALYTICS_PREFERENCE_COOKIE}=corrupt`),
    null,
  );
  assert.equal(
    parseAnalyticsPreferenceCookie(`${ANALYTICS_PREFERENCE_COOKIE}=%E0%A4%A`),
    null,
  );
});

test("preference cookie serializer sets safe path, expiry and same-site rules", () => {
  assert.equal(
    serializeAnalyticsPreferenceCookie("disabled", false),
    `${ANALYTICS_PREFERENCE_COOKIE}=disabled; Path=/; Max-Age=31536000; SameSite=Lax`,
  );
  assert.match(
    serializeAnalyticsPreferenceCookie("enabled", true),
    /; Secure$/,
  );
});
