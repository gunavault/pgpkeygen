import assert from "node:assert/strict";
import test from "node:test";
import * as openpgp from "openpgp";

import { validateKeyMaterial } from "../lib/pgp-validation.ts";

async function generate(passphrase: string | undefined = "strong-test-passphrase") {
  return openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "Ada Lovelace", email: "ada@example.com" }],
    passphrase,
    keyExpirationTime: 3600,
    format: "armored",
  });
}

test("derives authoritative metadata from a matching encrypted key pair", async () => {
  const generated = await generate();
  const metadata = await validateKeyMaterial(generated.publicKey, generated.privateKey);

  const parsed = await openpgp.readKey({ armoredKey: generated.publicKey });
  assert.equal(metadata.fingerprint, parsed.getFingerprint());
  assert.equal(metadata.name, "Ada Lovelace");
  assert.equal(metadata.email, "ada@example.com");
  assert.ok(metadata.algorithm.length > 0);
  assert.ok(metadata.expiresAt instanceof Date);
});

test("rejects a private key that does not match the public key", async () => {
  const first = await generate();
  const second = await generate();

  await assert.rejects(
    validateKeyMaterial(first.publicKey, second.privateKey),
    /same key pair/i,
  );
});

test("rejects unencrypted private-key material", async () => {
  const generated = await generate(undefined);
  await assert.rejects(
    validateKeyMaterial(generated.publicKey, generated.privateKey),
    /encrypted/i,
  );
});

test("rejects oversized armored payloads before parsing", async () => {
  await assert.rejects(
    validateKeyMaterial("x".repeat(200_000), "y".repeat(600_000)),
    /too large/i,
  );
});
