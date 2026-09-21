import assert from "node:assert/strict";
import test from "node:test";

import { isSessionValidAfterCutoff } from "../lib/session-validity.ts";

const cutoff = new Date("2026-09-21T12:00:00.500Z");

test("accounts without a cutoff accept existing sessions", () => {
  assert.equal(isSessionValidAfterCutoff(undefined, null), true);
});

test("sessions issued before the cutoff are rejected", () => {
  assert.equal(
    isSessionValidAfterCutoff(
      new Date("2026-09-21T12:00:00.499Z").getTime(),
      cutoff,
    ),
    false,
  );
});

test("sessions issued at or after the cutoff remain valid", () => {
  assert.equal(isSessionValidAfterCutoff(cutoff.getTime(), cutoff), true);
  assert.equal(
    isSessionValidAfterCutoff(
      new Date("2026-09-21T12:00:00.501Z").getTime(),
      cutoff,
    ),
    true,
  );
});

test("a cutoff fails closed for tokens with no trustworthy issue time", () => {
  assert.equal(isSessionValidAfterCutoff(undefined, cutoff), false);
  assert.equal(isSessionValidAfterCutoff(Number.NaN, cutoff), false);
});
