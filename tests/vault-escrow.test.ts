import assert from "node:assert/strict";
import test from "node:test";

import {
  createVaultEnvelope,
  rewrapVaultEnvelope,
  unwrapVaultEnvelope,
  wrapEscrowSecret,
  unwrapEscrowSecret,
} from "../lib/vault-escrow.ts";

const CONTEXT = {
  userId: "11111111-1111-4111-8111-111111111111",
  fingerprint: "0123456789abcdef0123456789abcdef01234567",
};

test("vault envelope round-trips a random vault key under the account password", async () => {
  const { envelope, vaultKey } = await createVaultEnvelope("correct horse battery staple");
  const unwrapped = await unwrapVaultEnvelope("correct horse battery staple", envelope);

  assert.deepEqual(unwrapped, vaultKey);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.kdf, "PBKDF2-SHA-256");
  assert.ok(envelope.iterations >= 600_000);
});

test("wrong account password fails closed when opening the vault envelope", async () => {
  const { envelope } = await createVaultEnvelope("correct password");

  await assert.rejects(
    unwrapVaultEnvelope("wrong password", envelope),
    /unable to unlock vault/i,
  );
});

test("new vault envelopes use independent salt and IV values", async () => {
  const first = await createVaultEnvelope("same password");
  const second = await createVaultEnvelope("same password");

  assert.notEqual(first.envelope.salt, second.envelope.salt);
  assert.notEqual(first.envelope.iv, second.envelope.iv);
});

test("password rotation rewraps the same vault key under the new password", async () => {
  const { envelope, vaultKey } = await createVaultEnvelope("old account password");
  const rotated = await rewrapVaultEnvelope(
    "old account password",
    "new account password",
    envelope,
  );

  await assert.rejects(
    unwrapVaultEnvelope("old account password", rotated),
    /unable to unlock vault/i,
  );
  assert.deepEqual(await unwrapVaultEnvelope("new account password", rotated), vaultKey);
  assert.notEqual(rotated.salt, envelope.salt);
  assert.notEqual(rotated.iv, envelope.iv);
});

test("escrowed secret round-trips under the random vault key", async () => {
  const { vaultKey } = await createVaultEnvelope("correct password");
  const wrapped = await wrapEscrowSecret(vaultKey, "pgp-key-passphrase", CONTEXT);
  const plaintext = await unwrapEscrowSecret(vaultKey, wrapped, CONTEXT);

  assert.equal(plaintext, "pgp-key-passphrase");
  assert.equal(wrapped.version, 1);
});

test("AAD binding rejects ciphertext transplanted to another key or user", async () => {
  const { vaultKey } = await createVaultEnvelope("correct password");
  const wrapped = await wrapEscrowSecret(vaultKey, "pgp-key-passphrase", CONTEXT);

  await assert.rejects(
    unwrapEscrowSecret(vaultKey, wrapped, {
      ...CONTEXT,
      fingerprint: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }),
    /unable to reveal escrowed secret/i,
  );

  await assert.rejects(
    unwrapEscrowSecret(vaultKey, wrapped, {
      ...CONTEXT,
      userId: "22222222-2222-4222-8222-222222222222",
    }),
    /unable to reveal escrowed secret/i,
  );
});

test("each escrowed secret uses a fresh AES-GCM IV", async () => {
  const { vaultKey } = await createVaultEnvelope("correct password");
  const first = await wrapEscrowSecret(vaultKey, "same secret", CONTEXT);
  const second = await wrapEscrowSecret(vaultKey, "same secret", CONTEXT);

  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ciphertext, second.ciphertext);
});
