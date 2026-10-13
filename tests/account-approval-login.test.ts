import assert from "node:assert/strict";
import test from "node:test";

import { checkCredentials, type CredentialUser } from "../lib/credential-check.ts";
import { isSessionAllowed } from "../lib/session-validity.ts";

function environmentFor(user: CredentialUser | null) {
  const audit: string[] = [];
  return {
    audit,
    environment: {
      findUserByEmail: async () => user,
      verifyPassword: async (password: string, hash: string) => hash === `hash:${password}`,
      audit: async (email: string, action: string, details?: string) => {
        audit.push(details ? `${action} ${email} (${details})` : `${action} ${email}`);
      },
    },
  };
}

const base = { id: "u1", email: "u@example.test", role: "user", passwordHash: "hash:right-password" };

test("an active account with the right password signs in", async () => {
  const { environment, audit } = environmentFor({ ...base, status: "active" });
  const result = await checkCredentials("u@example.test", "right-password", environment);
  assert.deepEqual(result, { ok: true, user: { id: "u1", email: "u@example.test", role: "user" } });
  assert.deepEqual(audit, ["login.success u@example.test"]);
});

for (const status of ["pending", "rejected", "", "something-else"]) {
  test(`an account with status "${status}" is refused even with the right password`, async () => {
    const { environment, audit } = environmentFor({ ...base, status });
    const result = await checkCredentials("u@example.test", "right-password", environment);
    assert.deepEqual(result, { ok: false, reason: "not_approved" });
    assert.deepEqual(audit, [`login.blocked u@example.test (account ${status})`]);
  });
}

test("a wrong password on a pending account looks exactly like any wrong password", async () => {
  const pending = environmentFor({ ...base, status: "pending" });
  const missing = environmentFor(null);
  const a = await checkCredentials("u@example.test", "guess", pending.environment);
  const b = await checkCredentials("u@example.test", "guess", missing.environment);
  assert.deepEqual(a, { ok: false, reason: "invalid" });
  assert.deepEqual(b, a);
  assert.deepEqual(pending.audit, ["login.failed u@example.test"]);
});

test("a session ends when its account is no longer active", () => {
  const issuedAt = Date.parse("2026-10-05T08:00:00Z");
  assert.equal(isSessionAllowed({ status: "active", sessionsValidAfter: null }, issuedAt), true);
  assert.equal(isSessionAllowed({ status: "pending", sessionsValidAfter: null }, issuedAt), false);
  assert.equal(isSessionAllowed({ status: "rejected", sessionsValidAfter: null }, issuedAt), false);
  assert.equal(isSessionAllowed(null, issuedAt), false);
});

test("an active account still honours sign-out-everywhere", () => {
  const cutoff = new Date("2026-10-05T09:00:00Z");
  assert.equal(isSessionAllowed({ status: "active", sessionsValidAfter: cutoff }, Date.parse("2026-10-05T08:00:00Z")), false);
  assert.equal(isSessionAllowed({ status: "active", sessionsValidAfter: cutoff }, Date.parse("2026-10-05T10:00:00Z")), true);
});
