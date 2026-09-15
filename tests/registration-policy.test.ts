import assert from "node:assert/strict";
import test from "node:test";
import { roleForSelfRegistration } from "../lib/registration-policy.ts";

test("self-registration never grants admin from a submitted email", () => {
  assert.equal(roleForSelfRegistration("admin@example.com"), "user");
  assert.equal(roleForSelfRegistration("someone@example.com"), "user");
});
