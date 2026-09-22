import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const form = readFileSync(
  new URL("../app/dashboard/account/PasswordChangeForm.tsx", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../app/dashboard/account/actions.ts", import.meta.url),
  "utf8",
);
const tabs = readFileSync(new URL("../app/dashboard/TabNav.tsx", import.meta.url), "utf8");

test("dashboard exposes a focused account password-change page", () => {
  assert.match(tabs, /\/dashboard\/account/);
  assert.match(tabs, /Account/);
  assert.match(form, /current-password/);
  assert.match(form, /new-password/);
  assert.match(form, /Confirm new password/i);
});

test("browser verifies vault continuity before submitting password rotation", () => {
  assert.match(form, /getPasswordChangeContext/);
  assert.match(form, /prepareVerifiedVaultRewrap/);
  assert.match(form, /await changePassword/);
  assert.match(form, /prepareVerifiedVaultRewrap[\s\S]*await changePassword/);
});

test("server password action delegates tested request policy and owns credentials, not browser vault crypto", () => {
  assert.match(actions, /handlePasswordChangeRequest/);
  assert.match(actions, /verifyPassword/);
  assert.match(actions, /hashPassword/);
  assert.doesNotMatch(
    actions,
    /unwrapVaultEnvelope|rewrapVaultEnvelope|unwrapEscrowSecret|wrapEscrowSecret/,
  );
});

test("password-change UI reports throttling without exposing another verification oracle", () => {
  assert.match(form, /ratelimited/);
  assert.match(form, /Too many password-change attempts/i);
});

test("password-change UI does not overpromise session invalidation or password reset", () => {
  assert.match(form, /does not sign out existing sessions/i);
  assert.doesNotMatch(form, /reset password|forgot password/i);
});
