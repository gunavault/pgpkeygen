import assert from "node:assert/strict";
import test from "node:test";

import {
  performPasswordChange,
  type PasswordChangeAccount,
  type PasswordChangeEnvironment,
  type PasswordChangeTransaction,
} from "../lib/password-change.ts";
import { hashPassword, verifyPassword } from "../lib/password.ts";
import { createVaultEnvelope } from "../lib/vault-escrow.ts";
import type { VaultEnvelope } from "../lib/vault-escrow.ts";

type State = PasswordChangeAccount & { audit: string[] };

function cloneEnvelope(envelope: VaultEnvelope | null): VaultEnvelope | null {
  return envelope ? { ...envelope } : null;
}

function createEnvironment(
  initial: State,
  options: { auditFails?: boolean } = {},
): {
  environment: PasswordChangeEnvironment;
  state: () => State;
  commits: () => number;
} {
  let current: State = {
    ...initial,
    envelope: cloneEnvelope(initial.envelope),
    audit: [...initial.audit],
  };
  let commitCount = 0;

  const environment: PasswordChangeEnvironment = {
    verifyPassword,
    hashPassword,
    async transaction(callback) {
      const staged: State = {
        ...current,
        envelope: cloneEnvelope(current.envelope),
        audit: [...current.audit],
      };

      const tx: PasswordChangeTransaction = {
        async loadAccountForUpdate() {
          return {
            email: staged.email,
            passwordHash: staged.passwordHash,
            envelope: cloneEnvelope(staged.envelope),
          };
        },
        async updateCredentials(_userId, passwordHash, envelope) {
          staged.passwordHash = passwordHash;
          staged.envelope = cloneEnvelope(envelope);
        },
        async auditPasswordChanged(email) {
          if (options.auditFails) throw new Error("Audit insert failed");
          staged.audit.push(`password.changed:${email}`);
        },
      };

      const result = await callback(tx);
      current = staged;
      commitCount += 1;
      return result;
    },
  };

  return {
    environment,
    state: () => current,
    commits: () => commitCount,
  };
}

test("wrong current password changes nothing and writes no audit entry", async () => {
  const passwordHash = await hashPassword("correct-current-password");
  const harness = createEnvironment({
    email: "user@example.com",
    passwordHash,
    envelope: null,
    audit: [],
  });

  await assert.rejects(
    performPasswordChange(
      {
        userId: "user-1",
        currentPassword: "wrong-current-password",
        newPassword: "new-account-password",
        newEnvelope: null,
      },
      harness.environment,
    ),
    /current password/i,
  );

  assert.equal(harness.commits(), 0);
  assert.equal(harness.state().passwordHash, passwordHash);
  assert.deepEqual(harness.state().audit, []);
});

test("account without a vault envelope changes only the password hash", async () => {
  const passwordHash = await hashPassword("current-account-password");
  const harness = createEnvironment({
    email: "user@example.com",
    passwordHash,
    envelope: null,
    audit: [],
  });

  await performPasswordChange(
    {
      userId: "user-1",
      currentPassword: "current-account-password",
      newPassword: "new-account-password",
      newEnvelope: null,
    },
    harness.environment,
  );

  assert.equal(harness.commits(), 1);
  assert.equal(await verifyPassword("new-account-password", harness.state().passwordHash), true);
  assert.equal(await verifyPassword("current-account-password", harness.state().passwordHash), false);
  assert.equal(harness.state().envelope, null);
  assert.deepEqual(harness.state().audit, ["password.changed:user@example.com"]);
});

test("vault account commits the new password hash and candidate envelope together", async () => {
  const passwordHash = await hashPassword("current-account-password");
  const existing = await createVaultEnvelope("current-account-password");
  const candidate = await createVaultEnvelope("new-account-password");
  const harness = createEnvironment({
    email: "user@example.com",
    passwordHash,
    envelope: existing.envelope,
    audit: [],
  });

  await performPasswordChange(
    {
      userId: "user-1",
      currentPassword: "current-account-password",
      newPassword: "new-account-password",
      newEnvelope: candidate.envelope,
    },
    harness.environment,
  );

  assert.equal(harness.commits(), 1);
  assert.equal(await verifyPassword("new-account-password", harness.state().passwordHash), true);
  assert.deepEqual(harness.state().envelope, candidate.envelope);
  assert.deepEqual(harness.state().audit, ["password.changed:user@example.com"]);
});

test("audit failure rolls back both the password hash and vault envelope", async () => {
  const passwordHash = await hashPassword("current-account-password");
  const existing = await createVaultEnvelope("current-account-password");
  const candidate = await createVaultEnvelope("new-account-password");
  const harness = createEnvironment(
    {
      email: "user@example.com",
      passwordHash,
      envelope: existing.envelope,
      audit: [],
    },
    { auditFails: true },
  );

  await assert.rejects(
    performPasswordChange(
      {
        userId: "user-1",
        currentPassword: "current-account-password",
        newPassword: "new-account-password",
        newEnvelope: candidate.envelope,
      },
      harness.environment,
    ),
    /audit insert failed/i,
  );

  assert.equal(harness.commits(), 0);
  assert.equal(harness.state().passwordHash, passwordHash);
  assert.deepEqual(harness.state().envelope, existing.envelope);
  assert.deepEqual(harness.state().audit, []);
});

test("vault rotation rejects replayed envelope randomness before any write", async () => {
  const passwordHash = await hashPassword("current-account-password");
  const existing = await createVaultEnvelope("current-account-password");
  const harness = createEnvironment({
    email: "user@example.com",
    passwordHash,
    envelope: existing.envelope,
    audit: [],
  });

  await assert.rejects(
    performPasswordChange(
      {
        userId: "user-1",
        currentPassword: "current-account-password",
        newPassword: "new-account-password",
        newEnvelope: existing.envelope,
      },
      harness.environment,
    ),
    /fresh vault envelope/i,
  );

  assert.equal(harness.commits(), 0);
  assert.equal(harness.state().passwordHash, passwordHash);
  assert.deepEqual(harness.state().envelope, existing.envelope);
  assert.deepEqual(harness.state().audit, []);
});

test("vault-envelope presence must match the account state", async () => {
  const passwordHash = await hashPassword("current-account-password");
  const existing = await createVaultEnvelope("current-account-password");
  const candidate = await createVaultEnvelope("new-account-password");

  const withEnvelope = createEnvironment({
    email: "user@example.com",
    passwordHash,
    envelope: existing.envelope,
    audit: [],
  });
  await assert.rejects(
    performPasswordChange(
      {
        userId: "user-1",
        currentPassword: "current-account-password",
        newPassword: "new-account-password",
        newEnvelope: null,
      },
      withEnvelope.environment,
    ),
    /vault envelope/i,
  );

  const withoutEnvelope = createEnvironment({
    email: "user@example.com",
    passwordHash,
    envelope: null,
    audit: [],
  });
  await assert.rejects(
    performPasswordChange(
      {
        userId: "user-1",
        currentPassword: "current-account-password",
        newPassword: "new-account-password",
        newEnvelope: candidate.envelope,
      },
      withoutEnvelope.environment,
    ),
    /vault envelope/i,
  );

  assert.equal(withEnvelope.commits(), 0);
  assert.equal(withoutEnvelope.commits(), 0);
});
