import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareVerifiedVaultRewrap,
  verifyVaultEnvelopeContinuity,
} from "../lib/vault-rotation.ts";
import {
  createVaultEnvelope,
  unwrapVaultEnvelope,
  wrapEscrowSecret,
} from "../lib/vault-escrow.ts";

const CONTEXT = {
  userId: "11111111-1111-4111-8111-111111111111",
  fingerprint: "0123456789abcdef0123456789abcdef01234567",
};

test("verified password rotation preserves the same vault key and escrow access", async () => {
  const original = await createVaultEnvelope("old account password");
  const sample = await wrapEscrowSecret(
    original.vaultKey,
    "escrowed-passphrase",
    CONTEXT,
  );

  const rotated = await prepareVerifiedVaultRewrap(
    "old account password",
    "new account password",
    original.envelope,
    { payload: sample, context: CONTEXT },
  );

  await assert.rejects(
    unwrapVaultEnvelope("old account password", rotated),
    /unable to unlock vault/i,
  );
  assert.deepEqual(
    await unwrapVaultEnvelope("new account password", rotated),
    original.vaultKey,
  );
  assert.notEqual(rotated.salt, original.envelope.salt);
  assert.notEqual(rotated.iv, original.envelope.iv);
});

test("continuity verification rejects a well-formed envelope wrapping the wrong vault key", async () => {
  const original = await createVaultEnvelope("old account password");
  const wrongCandidate = await createVaultEnvelope("new account password");

  await assert.rejects(
    verifyVaultEnvelopeContinuity(
      original.vaultKey,
      "new account password",
      wrongCandidate.envelope,
      null,
    ),
    /vault continuity check failed/i,
  );
});

test("rotation aborts when the stored escrow sample is disconnected from the vault key", async () => {
  const original = await createVaultEnvelope("old account password");
  const otherVault = await createVaultEnvelope("other password");
  const mismatchedSample = await wrapEscrowSecret(
    otherVault.vaultKey,
    "escrowed-passphrase",
    CONTEXT,
  );

  await assert.rejects(
    prepareVerifiedVaultRewrap(
      "old account password",
      "new account password",
      original.envelope,
      { payload: mismatchedSample, context: CONTEXT },
    ),
    /vault continuity check failed/i,
  );
});
