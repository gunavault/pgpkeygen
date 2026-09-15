import assert from "node:assert/strict";
import test from "node:test";

import { chooseRevocationCertificate } from "../lib/revocation-policy.ts";

test("prefers a user-supplied revocation certificate over a legacy stored copy", () => {
  assert.equal(chooseRevocationCertificate(" supplied ", "legacy"), "supplied");
});

test("allows a legacy stored certificate only as a compatibility fallback", () => {
  assert.equal(chooseRevocationCertificate("", " legacy "), "legacy");
});

test("fails closed when no revocation certificate is available", () => {
  assert.throws(() => chooseRevocationCertificate("", null), /revocation certificate/i);
});
