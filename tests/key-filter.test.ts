import test from "node:test";
import assert from "node:assert/strict";
import type { FilterableKey } from "../lib/key-filter.ts";
import { dashboardHref, filterKeys, normalizeQuery, parseKeyStatusFilter } from "../lib/key-filter.ts";

const keys: (FilterableKey & { id: string })[] = [
  {
    id: "release",
    title: "Release signing key",
    name: "Ada Lovelace",
    email: "ada@lovelace.dev",
    fingerprint: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
    details: "Used by CI to sign tarballs",
    revokedAt: null,
  },
  {
    id: "old-laptop",
    title: "Old laptop",
    name: "Ada Lovelace",
    email: "ada@example.org",
    fingerprint: "1111222233334444555566667777888899990000",
    details: null,
    revokedAt: new Date("2025-03-01T00:00:00.000Z"),
  },
  {
    id: "backup",
    title: "Backup",
    name: "Grace Hopper",
    email: "grace@navy.mil",
    fingerprint: "FFFFEEEEDDDDCCCCBBBBAAAA99998888777766665",
    details: "Offline backup key",
    revokedAt: null,
  },
];

const ids = (result: { id: string }[]) => result.map((k) => k.id);

test("empty or whitespace query with status all returns every key", () => {
  assert.deepEqual(ids(filterKeys(keys, {})), ["release", "old-laptop", "backup"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "   ", status: "all" })), ["release", "old-laptop", "backup"]);
});

test("query matches title, name, email and details case-insensitively", () => {
  assert.deepEqual(ids(filterKeys(keys, { query: "RELEASE" })), ["release"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "grace" })), ["backup"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "example.org" })), ["old-laptop"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "tarballs" })), ["release"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "lovelace" })), ["release", "old-laptop"]);
});

test("query matches a fingerprint with or without display spacing", () => {
  assert.deepEqual(ids(filterKeys(keys, { query: "abcdef0123" })), ["release"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "1111 2222 3333" })), ["old-laptop"]);
});

test("status filter narrows to active or revoked keys", () => {
  assert.deepEqual(ids(filterKeys(keys, { status: "active" })), ["release", "backup"]);
  assert.deepEqual(ids(filterKeys(keys, { status: "revoked" })), ["old-laptop"]);
});

test("query and status combine, and a miss yields an empty list", () => {
  assert.deepEqual(ids(filterKeys(keys, { query: "ada", status: "revoked" })), ["old-laptop"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "ada", status: "active" })), ["release"]);
  assert.deepEqual(ids(filterKeys(keys, { query: "does-not-exist" })), []);
  assert.deepEqual(ids(filterKeys([], { query: "anything" })), []);
});

test("normalizeQuery trims and takes the first of repeated params", () => {
  assert.equal(normalizeQuery(undefined), "");
  assert.equal(normalizeQuery("  hello  "), "hello");
  assert.equal(normalizeQuery(["first", "second"]), "first");
  assert.equal(normalizeQuery([]), "");
});

test("parseKeyStatusFilter accepts known values and falls back to all", () => {
  assert.equal(parseKeyStatusFilter("active"), "active");
  assert.equal(parseKeyStatusFilter("REVOKED"), "revoked");
  assert.equal(parseKeyStatusFilter("all"), "all");
  assert.equal(parseKeyStatusFilter(undefined), "all");
  assert.equal(parseKeyStatusFilter("bogus"), "all");
  assert.equal(parseKeyStatusFilter(["revoked", "active"]), "revoked");
});

test("dashboardHref omits default params and encodes the query", () => {
  assert.equal(dashboardHref("", "all"), "/dashboard");
  assert.equal(dashboardHref("release", "all"), "/dashboard?q=release");
  assert.equal(dashboardHref("", "revoked"), "/dashboard?status=revoked");
  assert.equal(dashboardHref("ada & co", "active"), "/dashboard?q=ada+%26+co&status=active");
});
