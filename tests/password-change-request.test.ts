import assert from "node:assert/strict";
import test from "node:test";

import {
  handlePasswordChangeRequest,
  type PasswordChangeRequestEnvironment,
} from "../lib/password-change-request.ts";
import { FixedWindowRateLimiter } from "../lib/rate-limit-core.ts";

function createHarness() {
  const limiter = new FixedWindowRateLimiter(() => 1_000);
  let verifyCalls = 0;
  let credentialWrites = 0;
  let transactionAudits = 0;
  const failureAudits: string[] = [];

  const environment: PasswordChangeRequestEnvironment = {
    isRateLimited(key, limit, windowMs) {
      return limiter.isLimited(key, limit, windowMs);
    },
    async verifyPassword() {
      verifyCalls += 1;
      return false;
    },
    async hashPassword() {
      return "unused-hash";
    },
    async auditPasswordChangeFailed(email) {
      failureAudits.push(email);
    },
    async transaction(callback) {
      return callback({
        async loadAccountForUpdate() {
          return {
            email: "account@example.com",
            passwordHash: "stored-hash",
            envelope: null,
          };
        },
        async updateCredentials() {
          credentialWrites += 1;
        },
        async auditPasswordChanged() {
          transactionAudits += 1;
        },
      });
    },
  };

  return {
    environment,
    verifyCalls: () => verifyCalls,
    credentialWrites: () => credentialWrites,
    transactionAudits: () => transactionAudits,
    failureAudits,
  };
}

const request = {
  currentPassword: "wrong-current-password",
  newPassword: "new-account-password",
  newEnvelope: null,
};

test("password-change account limit refuses attempt N+1 before password verification and isolates accounts", async () => {
  const harness = createHarness();

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.deepEqual(
      await handlePasswordChangeRequest(
        {
          userId: "user-alice",
          actorEmail: "alice@example.com",
          sourceIp: null,
        },
        request,
        harness.environment,
      ),
      { ok: false, error: "current-password" },
    );
  }

  assert.equal(harness.verifyCalls(), 5);

  assert.deepEqual(
    await handlePasswordChangeRequest(
      {
        userId: "user-alice",
        actorEmail: "alice@example.com",
        sourceIp: null,
      },
      request,
      harness.environment,
    ),
    { ok: false, error: "ratelimited" },
  );
  assert.equal(
    harness.verifyCalls(),
    5,
    "rate-limited attempts must be rejected before verifyPassword",
  );

  assert.deepEqual(
    await handlePasswordChangeRequest(
      {
        userId: "user-bob",
        actorEmail: "bob@example.com",
        sourceIp: null,
      },
      request,
      harness.environment,
    ),
    { ok: false, error: "current-password" },
  );
  assert.equal(
    harness.verifyCalls(),
    6,
    "another account must have an independent limiter bucket",
  );
});

test("password-change source limit refuses the 31st attempt before password verification", async () => {
  const harness = createHarness();

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    assert.deepEqual(
      await handlePasswordChangeRequest(
        {
          userId: `user-${attempt}`,
          actorEmail: `user-${attempt}@example.com`,
          sourceIp: "198.51.100.42",
        },
        request,
        harness.environment,
      ),
      { ok: false, error: "current-password" },
    );
  }

  assert.equal(harness.verifyCalls(), 30);

  assert.deepEqual(
    await handlePasswordChangeRequest(
      {
        userId: "user-31",
        actorEmail: "user-31@example.com",
        sourceIp: "198.51.100.42",
      },
      request,
      harness.environment,
    ),
    { ok: false, error: "ratelimited" },
  );
  assert.equal(
    harness.verifyCalls(),
    30,
    "source throttling must run before password verification",
  );
});

test("wrong current password writes exactly one failure audit outside the transaction writer", async () => {
  const harness = createHarness();

  assert.deepEqual(
    await handlePasswordChangeRequest(
      {
        userId: "user-1",
        actorEmail: "actor@example.com",
        sourceIp: null,
      },
      request,
      harness.environment,
    ),
    { ok: false, error: "current-password" },
  );

  assert.deepEqual(harness.failureAudits, ["actor@example.com"]);
  assert.equal(harness.transactionAudits(), 0);
  assert.equal(harness.credentialWrites(), 0);
});
