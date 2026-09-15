import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/dashboard/actions.ts", import.meta.url), "utf8");
const start = source.indexOf("export async function saveKey");
const end = source.indexOf("export async function", start + 1);
const saveSource = source.slice(start, end);

test("key persistence accepts only an opaque escrow DTO for optional recovery", () => {
  assert.match(saveSource, /escrow\?: unknown/);
  assert.match(saveSource, /escrowColumns\(input\.escrow/);
});

test("opaque recovery wiring does not weaken the existing secret boundary", () => {
  assert.doesNotMatch(saveSource, /passphrase/i);
  assert.doesNotMatch(saveSource, /crypto\.subtle|PBKDF2|AES-GCM/i);
});
