import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  deriveRecoveryVerifier,
  generateGroupedSecret,
  normalizeGroupedSecret,
  provisionRecoveryCode,
  unwrapWithRecoveryCode,
} from "../lib/recovery-code.ts";
import { parseVaultEnvelopeInput } from "../lib/escrow-record.ts";
import {
  createVaultEnvelope,
  unwrapEscrowSecret,
  unwrapVaultEnvelope,
  wrapEscrowSecret,
} from "../lib/vault-escrow.ts";

const context = { userId: "user-1", fingerprint: "a".repeat(40) };

test("a recovery code is 128 bits of Crockford base32 in groups of four", () => {
  const code = generateGroupedSecret();
  assert.match(code, /^([0-9A-HJKMNP-TV-Z]{4}-){6}[0-9A-HJKMNP-TV-Z]{2}$/);
  assert.notEqual(generateGroupedSecret(), code);
});

test("typing variations normalise to the same code; anything else is rejected", () => {
  const code = generateGroupedSecret();
  const canonical = code.replaceAll("-", "");
  assert.equal(normalizeGroupedSecret(code), canonical);
  assert.equal(normalizeGroupedSecret(` ${code.toLowerCase().replaceAll("-", " ")} `), canonical);
  assert.equal(normalizeGroupedSecret("O".repeat(26)), "0".repeat(26));
  assert.equal(normalizeGroupedSecret("il".repeat(13)), "1".repeat(26));
  assert.equal(normalizeGroupedSecret("U".repeat(26)), null, "U is not in the alphabet");
  assert.equal(normalizeGroupedSecret(canonical.slice(1)), null, "too short");
  assert.equal(normalizeGroupedSecret(42), null);
});

test("the recovery code opens the same vault key the password opens, and escrow still decrypts", async () => {
  const { envelope: passwordEnvelope, vaultKey } = await createVaultEnvelope("account-password-1");
  const escrow = await wrapEscrowSecret(vaultKey, "key passphrase", context);

  const provisioned = await provisionRecoveryCode(vaultKey, { payload: escrow, context });
  assert.doesNotThrow(() => parseVaultEnvelopeInput(provisioned.envelope), "server parser accepts it");

  const typed = provisioned.code.toLowerCase().replaceAll("-", " ");
  const fromCode = await unwrapWithRecoveryCode(typed, provisioned.envelope);
  const fromPassword = await unwrapVaultEnvelope("account-password-1", passwordEnvelope);
  assert.deepEqual(fromCode, fromPassword);
  assert.equal(await unwrapEscrowSecret(fromCode, escrow, context), "key passphrase");
});

test("a wrong recovery code cannot open the envelope", async () => {
  const { vaultKey } = await createVaultEnvelope("account-password-1");
  const provisioned = await provisionRecoveryCode(vaultKey, null);
  await assert.rejects(unwrapWithRecoveryCode(generateGroupedSecret(), provisioned.envelope), /Unable to unlock vault/);
  await assert.rejects(unwrapWithRecoveryCode("not a code", provisioned.envelope), /Unable to unlock vault/);
});

test("the verifier is stable for one code, differs between codes, and is not the code", async () => {
  const { vaultKey } = await createVaultEnvelope("account-password-1");
  const a = await provisionRecoveryCode(vaultKey, null);
  const b = await provisionRecoveryCode(vaultKey, null);
  assert.equal(a.verifier, await deriveRecoveryVerifier(a.code.toLowerCase()));
  assert.notEqual(a.verifier, b.verifier);
  assert.match(a.verifier, /^[0-9a-f]{64}$/);
  assert.ok(!a.verifier.includes(a.code.replaceAll("-", "").toLowerCase()));
});

test("the verifier is SHA-256 over a domain-separated code, not a plain hash of the code", async () => {
  const code = generateGroupedSecret();
  const normalized = normalizeGroupedSecret(code)!;
  const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
  const verifier = await deriveRecoveryVerifier(code);
  assert.equal(verifier, sha(`pgpkeygen:recovery-verifier:v1\0${normalized}`));
  assert.notEqual(verifier, sha(normalized));
});

test("no recovery code is made from a vault key that does not match the stored escrow", async () => {
  const mine = await createVaultEnvelope("account-password-1");
  const other = await createVaultEnvelope("account-password-1");
  const escrow = await wrapEscrowSecret(mine.vaultKey, "key passphrase", context);
  await assert.rejects(provisionRecoveryCode(other.vaultKey, { payload: escrow, context }), /Vault continuity check failed/);
});
