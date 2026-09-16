import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginAction = readFileSync(new URL("../app/login/actions.ts", import.meta.url), "utf8");
const loginForm = readFileSync(new URL("../app/login/LoginForm.tsx", import.meta.url), "utf8");
const provider = readFileSync(new URL("../app/VaultProvider.tsx", import.meta.url), "utf8");
const logoutButton = readFileSync(new URL("../app/dashboard/LogoutButton.tsx", import.meta.url), "utf8");

test("successful credentials login returns control to the browser without weakening throttles", () => {
  assert.match(loginAction, /login:global/);
  assert.match(loginAction, /login:account:/);
  assert.match(loginAction, /login:source:/);
  assert.match(loginAction, /redirect:\s*false/);
  assert.doesNotMatch(loginAction, /redirect\("\/dashboard"/);
});

test("browser bootstraps or unlocks the vault only after login succeeds", () => {
  assert.match(loginForm, /await login\(formData\)/);
  assert.match(loginForm, /getVaultEnvelope/);
  assert.match(loginForm, /createVaultEnvelope/);
  assert.match(loginForm, /initializeVaultEnvelope/);
  assert.match(loginForm, /unwrapVaultEnvelope/);
  assert.match(loginForm, /setVaultKey/);
});

test("vault key remains memory-only", () => {
  assert.match(provider, /useState<Uint8Array \| null>/);
  assert.doesNotMatch(provider + loginForm, /localStorage|sessionStorage|indexedDB/i);
});

test("logout explicitly clears the in-memory vault key", () => {
  assert.match(logoutButton, /clearVaultKey/);
  assert.match(logoutButton, /logout/);
});
