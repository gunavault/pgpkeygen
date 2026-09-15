import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(new URL("../app/dashboard/actions.ts", import.meta.url), "utf8");

test("new key persistence does not accept or store a revocation certificate", () => {
  const saveKeySource = actionsSource.slice(
    actionsSource.indexOf("export async function saveKey"),
    actionsSource.indexOf("export async function deleteKey"),
  );

  assert.doesNotMatch(saveKeySource, /revocationCertificate/);
});
