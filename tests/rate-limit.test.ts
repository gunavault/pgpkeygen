import assert from "node:assert/strict";
import test from "node:test";

import { FixedWindowRateLimiter } from "../lib/rate-limit-core.ts";

test("allows requests through the configured limit and blocks the next one", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter(() => now);

  assert.equal(limiter.isLimited("login:user", 2, 60_000), false);
  assert.equal(limiter.isLimited("login:user", 2, 60_000), false);
  assert.equal(limiter.isLimited("login:user", 2, 60_000), true);
});

test("keeps counters isolated by key", () => {
  const limiter = new FixedWindowRateLimiter(() => 1_000);

  assert.equal(limiter.isLimited("login:alice", 1, 60_000), false);
  assert.equal(limiter.isLimited("login:alice", 1, 60_000), true);
  assert.equal(limiter.isLimited("login:bob", 1, 60_000), false);
});

test("starts a fresh window after the current window expires", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter(() => now);

  assert.equal(limiter.isLimited("register:ip", 1, 1_000), false);
  assert.equal(limiter.isLimited("register:ip", 1, 1_000), true);

  now = 2_001;
  assert.equal(limiter.isLimited("register:ip", 1, 1_000), false);
});
