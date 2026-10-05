import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_TIME_ZONE, formatTimestamp, resolveTimeZone } from "../lib/display-time.ts";

const instant = new Date("2026-10-05T08:43:11.000Z");

test("default display zone is UTC+7", () => {
  assert.equal(formatTimestamp(instant, resolveTimeZone(undefined)), "2026-10-05 15:43:11 UTC+7");
});

test("crosses the date line correctly for late-UTC events", () => {
  assert.equal(
    formatTimestamp(new Date("2026-10-05T20:30:00.000Z"), DEFAULT_TIME_ZONE),
    "2026-10-06 03:30:00 UTC+7",
  );
});

test("APP_TIME_ZONE overrides the default", () => {
  assert.equal(formatTimestamp(instant, resolveTimeZone("UTC")), "2026-10-05 08:43:11 UTC");
  assert.equal(formatTimestamp(instant, resolveTimeZone("Asia/Makassar")), "2026-10-05 16:43:11 UTC+8");
});

test("offsets are computed, not copied from the ICU zone name", () => {
  // Node.js builds spell UTC differently ("GMT" vs "GMT+0"); the label must not depend on it.
  assert.equal(formatTimestamp(instant, "Etc/UTC"), "2026-10-05 08:43:11 UTC");
  assert.equal(formatTimestamp(instant, "Asia/Kolkata"), "2026-10-05 14:13:11 UTC+5:30");
  assert.equal(formatTimestamp(instant, "America/New_York"), "2026-10-05 04:43:11 UTC-4");
  assert.equal(formatTimestamp(new Date("2026-10-05T08:43:11.999Z"), "Asia/Jakarta"), "2026-10-05 15:43:11 UTC+7");
});

test("an invalid or blank zone falls back to the default instead of crashing the page", () => {
  assert.equal(resolveTimeZone("Not/AZone"), DEFAULT_TIME_ZONE);
  assert.equal(resolveTimeZone("   "), DEFAULT_TIME_ZONE);
});
