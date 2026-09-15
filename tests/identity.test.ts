import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEmail } from "../lib/identity.ts";

test("normalizeEmail trims and lowercases identity input", () => {
  assert.equal(normalizeEmail("  Ada@Example.COM  "), "ada@example.com");
});
