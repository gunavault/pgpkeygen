import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(new URL("../app/dashboard/actions.ts", import.meta.url), "utf8");

test("new key persistence does not accept or store a revocation certificate", () => {
  const start = actionsSource.indexOf("export async function saveKey");
  const end = actionsSource.indexOf("export async function", start + 1);
  const saveKeySource = actionsSource.slice(start, end);

  assert.notEqual(start, -1, "saveKey action should exist");
  assert.notEqual(end, -1, "saveKey should be followed by another exported action");
  assert.doesNotMatch(saveKeySource, /revocationCertificate/);
});
