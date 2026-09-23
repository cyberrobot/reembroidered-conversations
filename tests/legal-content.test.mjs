import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LEGAL_DOCUMENTS,
  PRIVACY_NOTICE,
  PUBLIC_COMPANY,
  TERMS,
} from "../src/data/legal.ts";

function text(document) {
  return [
    document.title,
    ...document.introduction,
    ...document.sections.flatMap(({ title, paragraphs }) => [
      title,
      ...paragraphs,
    ]),
  ].join("\n");
}

test("legal documents expose stable versioned metadata and unique section IDs", () => {
  assert.deepEqual(Object.keys(LEGAL_DOCUMENTS), ["terms", "privacy"]);
  assert.equal(TERMS.version, "1.1");
  assert.equal(TERMS.effectiveDate, "23 September 2026");
  assert.equal(PRIVACY_NOTICE.version, "1.0");
  assert.equal(PRIVACY_NOTICE.effectiveDate, "22 September 2026");
  for (const document of Object.values(LEGAL_DOCUMENTS)) {
    const ids = document.sections.map(({ id }) => id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.every((id) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)));
    assert.match(text(document), /16883201/);
    assert.match(text(document), /82a James Carter Road/);
  }
});

test("Terms match the current product and preserve statutory consumer rights", () => {
  const terms = text(TERMS);
  assert.match(terms, /55-minute/);
  assert.match(terms, /£55 GBP/);
  assert.match(terms, /Google Meet/);
  assert.match(terms, /automatic refund policy/i);
  assert.match(terms, /at least 24 hours/i);
  assert.match(terms, /Nothing in these Terms limits any cancellation/i);
  assert.match(
    terms,
    /14 days after the day on which the contract is concluded/i,
  );
  assert.match(terms, /without giving any reason/i);
  assert.match(
    terms,
    /contract is concluded when payment has been successfully processed and we confirm your booking/i,
  );
  assert.match(terms, /24-hour policy is separate from.*statutory/i);
  assert.match(terms, /expressly request that we provide the service/i);
  assert.match(terms, /proportionate amount for the service already supplied/i);
  assert.match(
    terms,
    /lose the statutory right to cancel once the service has been fully performed/i,
  );
  assert.match(terms, /no later than 14 days after we are informed/i);
  assert.match(terms, /same payment method used for the original transaction/i);
  assert.match(terms, /Model cancellation form/i);
  assert.match(terms, /I give notice that I cancel my contract/i);
  assert.match(terms, /82a James Carter Road/);
  assert.match(terms, /clear statement that you wish to cancel/i);
  assert.match(terms, /does not restrict or override/i);
  assert.doesNotMatch(terms, /no statutory rights/i);
});

test("Privacy Notice describes actual data flows without inventing consent or deletion", () => {
  const privacy = text(PRIVACY_NOTICE);
  for (const expected of [
    "boundaries acknowledgement",
    "Stripe Checkout Session",
    "PaymentIntent",
    "Google Calendar",
    "Resend",
    "Cloudflare Turnstile",
    "keyed/HMAC pseudonymous client identifier",
    "Mux",
    "Railway",
    "PostgreSQL database hosting",
  ]) {
    assert.match(privacy, new RegExp(expected.replace("/", "\\/"), "i"));
  }
  assert.match(privacy, /not UK GDPR consent/i);
  assert.match(
    privacy,
    /does not currently automatically delete booking rows/i,
  );
  assert.match(
    privacy,
    /active HOLD or temporary-reservation period is short-lived/i,
  );
  assert.match(
    privacy,
    /booking row.*may remain.*after the hold expires or is cancelled/i,
  );
  assert.match(
    privacy,
    /expiry or cancellation does not automatically delete/i,
  );
  assert.doesNotMatch(privacy, /automatically deleted after/i);
  assert.match(privacy, /cookie-less playback analytics/i);
  assert.match(privacy, /video performance/i);
  assert.match(
    privacy,
    /legitimate interests in operating, understanding and maintaining/i,
  );
  assert.equal(PUBLIC_COMPANY.companyNumber, "16883201");
});

test("legal documents publish the registered office but no unconfirmed email", () => {
  const legalText = Object.values(LEGAL_DOCUMENTS).map(text).join("\n");
  assert.match(legalText, /82a James Carter Road/);
  assert.doesNotMatch(legalText, /hello@peaceisthesong\.org/i);
  assert.doesNotMatch(legalText, /privacy@peaceisthesong\.org/i);
  assert.equal("contactEmail" in PUBLIC_COMPANY, false);
  assert.equal("privacyEmail" in PUBLIC_COMPANY, false);
});

test("public copy no longer contains obsolete absolute confidentiality claims", async () => {
  const files = await Promise.all(
    [
      "src/components/HeroVideo.tsx",
      "src/components/Footer.tsx",
      "src/components/BoundariesSection.tsx",
      "src/data/content.ts",
    ].map((path) => readFile(new URL(`../${path}`, import.meta.url), "utf8")),
  );
  const publicCopy = files.join("\n");
  for (const obsolete of [
    "100% Confidential",
    "Completely confidential",
    "Strict personal confidentiality",
    "under any circumstances",
    "private video or telephone links",
  ]) {
    assert.doesNotMatch(publicCopy, new RegExp(obsolete, "i"));
  }
});
