import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../lib/password.ts";

test("password hashing is asynchronous", async () => {
  const pending = hashPassword("correct horse battery staple");
  assert.equal(pending instanceof Promise, true);
  await pending;
});

test("hashPassword uses a fresh salt for the same password", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");

  assert.notEqual(first, second);
});

test("verifyPassword accepts the matching password and rejects another", async () => {
  const stored = await hashPassword("correct horse battery staple");

  const matching = verifyPassword("correct horse battery staple", stored);
  assert.equal(matching instanceof Promise, true);
  assert.equal(await matching, true);
  assert.equal(await verifyPassword("wrong password", stored), false);
});

test("verifyPassword fails closed for malformed stored hashes", async () => {
  assert.equal(await verifyPassword("anything", ""), false);
  assert.equal(await verifyPassword("anything", "missing-separator"), false);
  assert.equal(await verifyPassword("anything", "abcd:"), false);
});
