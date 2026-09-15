import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generateForm = readFileSync(new URL("../app/dashboard/GenerateKeyForm.tsx", import.meta.url), "utf8");
const keyActions = readFileSync(new URL("../app/dashboard/KeyActions.tsx", import.meta.url), "utf8");
const recoveryPrompt = readFileSync(new URL("../app/dashboard/LocalRecoveryPrompt.tsx", import.meta.url), "utf8");
const dashboardPage = readFileSync(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");

test("passphrase recovery is explicit opt-in and defaults off", () => {
  assert.match(generateForm, /const \[recoveryEnabled, setRecoveryEnabled\] = useState\(false\)/);
  assert.match(generateForm, /account password.*single point of failure/i);
  assert.match(generateForm, /offline/i);
});

test("opt-in generation wraps locally and persists only opaque escrow", () => {
  assert.match(generateForm, /wrapEscrowSecret/);
  assert.match(generateForm, /getVaultContext/);
  assert.match(generateForm, /escrow:\s*recoveryEnabled\s*\?/);
  assert.doesNotMatch(generateForm, /localStorage|sessionStorage|indexedDB/i);
});

test("opt-out keys expose no reveal affordance", () => {
  assert.match(dashboardPage, /hasEscrow=\{!!key\.escrowVersion\}/);
  assert.match(keyActions, /hasEscrow\s*&&/);
});

test("reveal fetches opaque data before a network-blind local password prompt", () => {
  assert.match(keyActions, /getKeyEscrow/);
  assert.match(recoveryPrompt, /type="password"/);
  assert.match(recoveryPrompt, /unwrapVaultEnvelope/);
  assert.match(recoveryPrompt, /unwrapEscrowSecret/);
  assert.doesNotMatch(recoveryPrompt, /getKeyEscrow|useVault|server action/i);
});
