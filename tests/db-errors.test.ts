import assert from "node:assert/strict";
import test from "node:test";

import { isUniqueViolation } from "../lib/db-errors.ts";

test("detects only PostgreSQL unique-constraint violations", () => {
  assert.equal(isUniqueViolation({ code: "23505" }), true);
  assert.equal(isUniqueViolation({ code: "08006" }), false);
  assert.equal(isUniqueViolation(new Error("duplicate")), false);
  assert.equal(isUniqueViolation(null), false);
});
