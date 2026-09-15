import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionsSource = readFileSync(new URL("../app/dashboard/actions.ts", import.meta.url), "utf8");

test("server-side key persistence has no passphrase or email-secret path", () => {
  assert.doesNotMatch(actionsSource, /passphrase/i);
  assert.doesNotMatch(actionsSource, /sendPassphraseEmail/);
  assert.doesNotMatch(actionsSource, /@\/lib\/mail/);
});
