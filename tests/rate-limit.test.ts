import assert from "node:assert/strict";
import test from "node:test";

import { FixedWindowRateLimiter } from "../lib/rate-limit-core.ts";

test("allows requests through the configured limit and blocks the next one", () => {
  const limiter = new FixedWindowRateLimiter(() => 1_000);

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

test("fails closed when the bounded key store is full", () => {
  const limiter = new FixedWindowRateLimiter(() => 1_000, 2);

  assert.equal(limiter.isLimited("a", 10, 60_000), false);
  assert.equal(limiter.isLimited("b", 10, 60_000), false);
  assert.equal(limiter.isLimited("c", 10, 60_000), true);
  assert.equal(limiter.size, 2);
});

test("expired entries are reclaimed before rejecting a new key", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter(() => now, 1);

  assert.equal(limiter.isLimited("old", 10, 100), false);
  now = 1_101;
  assert.equal(limiter.isLimited("new", 10, 100), false);
  assert.equal(limiter.size, 1);
});
