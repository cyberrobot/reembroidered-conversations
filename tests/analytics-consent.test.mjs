import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidAnalyticsMeasurementId,
  parseAnalyticsConsent,
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
