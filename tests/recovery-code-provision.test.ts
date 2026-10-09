import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  provisionAccountRecoveryCode,
  RecoveryProvisionError,
  type RecoveryProvisionAccount,
  type RecoveryProvisionEnvironment,
} from "../lib/recovery-code-provision.ts";
import { sha256Hex } from "../lib/secret-hash.ts";
import type { VaultEnvelope } from "../lib/vault-escrow.ts";

const b64 = (n: number) => randomBytes(n).toString("base64");
const envelope = (): VaultEnvelope => ({
  version: 1,
  kdf: "PBKDF2-SHA-256",
  iterations: 600_000,
  salt: b64(16),
  iv: b64(12),
  ciphertext: b64(48),
});

function harness(account: Partial<RecoveryProvisionAccount> = {}) {
  let row: RecoveryProvisionAccount & { verifierHash: string | null } = {
    email: "u@example.test",
    passwordHash: "hash:right-password",
    vaultEnvelope: envelope(),
    recoveryEnvelope: null,
    verifierHash: null,
    ...account,
  };
  const audit: string[] = [];
  const environment: RecoveryProvisionEnvironment = {
    now: () => new Date("2026-10-09T08:00:00Z"),
    verifyPassword: async (password, hash) => hash === `hash:${password}`,
    async transaction(callback) {
      const staged = { ...row };
      const result = await callback({
        loadAccountForUpdate: async () => ({ ...staged }),
        saveRecovery: async (_id, v) => {
          staged.recoveryEnvelope = v.envelope;
          staged.verifierHash = v.verifierHash;
        },
        audit: async (email, details) => {
          audit.push(`${email} recovery_code.created (${details})`);
        },
      });
      row = staged;
      return result;
    },
  };
  return { environment, row: () => row, audit };
}

const input = (overrides: Record<string, unknown> = {}) => ({
  userId: "u1",
  currentPassword: "right-password",
  envelope: envelope(),
  verifier: randomBytes(32).toString("hex"),
  ...overrides,
});

const reason = (r: string) => (err: unknown) => err instanceof RecoveryProvisionError && err.reason === r;

test("a recovery code is stored as its envelope plus a hash of the verifier, and audited", async () => {
  const h = harness();
  const request = input();
  await provisionAccountRecoveryCode(request, h.environment);
  assert.deepEqual(h.row().recoveryEnvelope, request.envelope);
  assert.equal(h.row().verifierHash, sha256Hex(request.verifier));
  assert.notEqual(h.row().verifierHash, request.verifier);
  assert.deepEqual(h.audit, ["u@example.test recovery_code.created (first code)"]);
});

test("replacing a code is audited as such", async () => {
  const h = harness({ recoveryEnvelope: envelope() });
  await provisionAccountRecoveryCode(input(), h.environment);
  assert.match(h.audit[0]!, /replaced the previous code/);
});

test("the account password is required", async () => {
  const h = harness();
  await assert.rejects(provisionAccountRecoveryCode(input({ currentPassword: "wrong" }), h.environment), reason("current-password"));
  assert.equal(h.row().recoveryEnvelope, null);
});

test("an account without a vault cannot get a recovery code", async () => {
  const h = harness({ vaultEnvelope: null });
  await assert.rejects(provisionAccountRecoveryCode(input(), h.environment), reason("no-vault"));
});

test("malformed envelopes, verifiers and reused randomness are refused", async () => {
  const h = harness();
  await assert.rejects(provisionAccountRecoveryCode(input({ envelope: { nope: 1 } }), h.environment), reason("invalid"));
  await assert.rejects(provisionAccountRecoveryCode(input({ verifier: "abc" }), h.environment), reason("invalid"));
  const stale = { ...envelope(), salt: h.row().vaultEnvelope!.salt };
  await assert.rejects(provisionAccountRecoveryCode(input({ envelope: stale }), h.environment), reason("invalid"));
  assert.equal(h.row().recoveryEnvelope, null);
});
