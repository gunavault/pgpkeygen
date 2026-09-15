import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../lib/password.ts";

test("hashPassword uses a fresh salt for the same password", () => {
  const first = hashPassword("correct horse battery staple");
  const second = hashPassword("correct horse battery staple");

  assert.notEqual(first, second);
});

test("verifyPassword accepts the matching password and rejects another", () => {
  const stored = hashPassword("correct horse battery staple");

  assert.equal(verifyPassword("correct horse battery staple", stored), true);
  assert.equal(verifyPassword("wrong password", stored), false);
});

test("verifyPassword fails closed for malformed stored hashes", () => {
  assert.equal(verifyPassword("anything", ""), false);
  assert.equal(verifyPassword("anything", "missing-separator"), false);
  assert.equal(verifyPassword("anything", "abcd:"), false);
});
