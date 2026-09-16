import assert from "node:assert/strict";
import test from "node:test";
import { getTableColumns } from "drizzle-orm";

import { pgpKeys, users } from "../lib/db/schema.ts";

test("user vault envelope storage is nullable for existing accounts", () => {
  const columns = getTableColumns(users);
  for (const name of [
    "vaultWrappedKey",
    "vaultKdfSalt",
    "vaultKdfIv",
    "vaultKdfIterations",
    "vaultWrapVersion",
  ] as const) {
    assert.ok(columns[name], `missing users.${name}`);
    assert.equal(columns[name].notNull, false, `${name} must remain nullable`);
  }
});

test("per-key escrow storage is nullable so opt-out remains the default", () => {
  const columns = getTableColumns(pgpKeys);
  for (const name of ["escrowCiphertext", "escrowIv", "escrowVersion"] as const) {
    assert.ok(columns[name], `missing pgpKeys.${name}`);
    assert.equal(columns[name].notNull, false, `${name} must remain nullable`);
  }
});
