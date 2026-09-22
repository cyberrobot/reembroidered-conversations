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
  for (const document of Object.values(LEGAL_DOCUMENTS)) {
    assert.equal(document.version, "1.0");
    assert.equal(document.effectiveDate, "22 September 2026");
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
  assert.match(privacy, /does not currently promise automatic deletion/i);
  assert.doesNotMatch(privacy, /automatically deleted after/i);
  assert.equal(PUBLIC_COMPANY.companyNumber, "16883201");
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
