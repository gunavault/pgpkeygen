import assert from "node:assert/strict";
import test from "node:test";

import { resolveClientIp } from "../lib/client-ip.ts";

test("does not trust forwarding headers by default", () => {
  assert.equal(resolveClientIp("203.0.113.10, 10.0.0.2", false), null);
});

test("uses the first valid forwarded address only when proxy trust is explicit", () => {
  assert.equal(resolveClientIp("203.0.113.10, 10.0.0.2", true), "203.0.113.10");
  assert.equal(resolveClientIp("not-an-ip, 10.0.0.2", true), null);
});
