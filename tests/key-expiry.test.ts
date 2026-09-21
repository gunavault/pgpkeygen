import assert from "node:assert/strict";
import test from "node:test";

import {
  EXPIRING_SOON_DAYS,
  classifyKeyExpiry,
  expiryStatusPriority,
  prioritizeKeysByExpiry,
} from "../lib/key-expiry.ts";

const now = new Date("2026-01-01T00:00:00.000Z");
const dayMs = 24 * 60 * 60 * 1000;

test("classifies never-expiring keys", () => {
  assert.equal(classifyKeyExpiry(null, now), "never");
});

test("classifies expired keys including the exact expiry instant", () => {
  assert.equal(
    classifyKeyExpiry(new Date(now.getTime() - 1), now),
    "expired",
  );
  assert.equal(classifyKeyExpiry(new Date(now), now), "expired");
});

test("classifies keys inside the expiring-soon window including the 30-day boundary", () => {
  assert.equal(EXPIRING_SOON_DAYS, 30);
  assert.equal(
    classifyKeyExpiry(new Date(now.getTime() + 1), now),
    "expiring",
  );
  assert.equal(
    classifyKeyExpiry(
      new Date(now.getTime() + EXPIRING_SOON_DAYS * dayMs),
      now,
    ),
    "expiring",
  );
});

test("classifies keys beyond the expiring-soon boundary as healthy", () => {
  assert.equal(
    classifyKeyExpiry(
      new Date(now.getTime() + EXPIRING_SOON_DAYS * dayMs + 1),
      now,
    ),
    "healthy",
  );
});

test("prioritizes action-needed expiry states ahead of healthy and never-expiring keys", () => {
  const ordered = ["never", "healthy", "expiring", "expired"].sort(
    (a, b) =>
      expiryStatusPriority(a as ReturnType<typeof classifyKeyExpiry>) -
      expiryStatusPriority(b as ReturnType<typeof classifyKeyExpiry>),
  );

  assert.deepEqual(ordered, ["expired", "expiring", "healthy", "never"]);
});


test("expiry grouping preserves created-at recency inside each severity group", () => {
  const keys = [
    {
      id: "healthy-old",
      expiresAt: new Date(now.getTime() + 60 * dayMs),
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
    },
    {
      id: "expiring-old",
      expiresAt: new Date(now.getTime() + 10 * dayMs),
      createdAt: new Date("2025-02-01T00:00:00.000Z"),
    },
    {
      id: "expired-new",
      expiresAt: new Date(now.getTime() - dayMs),
      createdAt: new Date("2025-04-01T00:00:00.000Z"),
    },
    {
      id: "expiring-new",
      expiresAt: new Date(now.getTime() + 20 * dayMs),
      createdAt: new Date("2025-03-01T00:00:00.000Z"),
    },
    {
      id: "healthy-new",
      expiresAt: new Date(now.getTime() + 90 * dayMs),
      createdAt: new Date("2025-05-01T00:00:00.000Z"),
    },
  ];

  const prioritized = prioritizeKeysByExpiry(keys, now);

  assert.deepEqual(
    prioritized.map(({ key, expiryStatus }) => [key.id, expiryStatus]),
    [
      ["expired-new", "expired"],
      ["expiring-new", "expiring"],
      ["expiring-old", "expiring"],
      ["healthy-new", "healthy"],
      ["healthy-old", "healthy"],
    ],
  );
  assert.deepEqual(
    keys.map((key) => key.id),
    [
      "healthy-old",
      "expiring-old",
      "expired-new",
      "expiring-new",
      "healthy-new",
    ],
    "prioritization should not mutate the original recency-ordered array",
  );
});
