import assert from "node:assert/strict";
import test from "node:test";

import { canCreateKey, parseMaxKeysPerUser } from "../lib/key-quota.ts";

test("key quota rejects creation at the configured limit", () => {
  assert.equal(canCreateKey(49, 50), true);
  assert.equal(canCreateKey(50, 50), false);
  assert.equal(canCreateKey(51, 50), false);
});

test("key quota parser uses a safe default for invalid values", () => {
  assert.equal(parseMaxKeysPerUser(undefined), 50);
  assert.equal(parseMaxKeysPerUser("not-a-number"), 50);
  assert.equal(parseMaxKeysPerUser("0"), 50);
  assert.equal(parseMaxKeysPerUser("25"), 25);
});
