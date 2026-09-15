import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/escrow/actions.ts", import.meta.url), "utf8");

test("escrow server actions never accept account passwords or perform browser crypto", () => {
  assert.doesNotMatch(source, /password/i);
  assert.doesNotMatch(source, /crypto\.subtle/i);
  assert.doesNotMatch(source, /PBKDF2|AES-GCM/i);
});

test("escrow server actions authenticate before touching user-scoped recovery data", () => {
  assert.match(source, /await auth\(\)/);
  assert.match(source, /session\?\.user\?\.id/);
});

test("vault initialization is insert-once rather than an unconditional overwrite", () => {
  assert.match(source, /isNull\(users\.vaultWrapVersion\)/);
  assert.match(source, /isNull\(users\.vaultWrappedKey\)/);
});
