import assert from "node:assert/strict";
import test from "node:test";
import * as openpgp from "openpgp";

import { validateKeyMaterial } from "../lib/pgp-validation.ts";

async function generate(passphrase: string | null = "strong-test-passphrase") {
  return openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "Ada Lovelace", email: "ada@example.com" }],
    ...(passphrase === null ? {} : { passphrase }),
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

test("derives identity from the primary user instead of packet order", async () => {
  const generated = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [
      { name: "Legacy Contact", email: "old@acme.test" },
      { name: "Acme Client", email: "ops@acme.test" },
    ],
    passphrase: "strong-test-passphrase",
    format: "armored",
  });

  const parsed = await openpgp.readKey({ armoredKey: generated.publicKey });
  const { user: primaryUser } = await parsed.getPrimaryUser();
  const primaryUserId = primaryUser.userID?.userID;
  assert.ok(primaryUserId);

  const metadata = await validateKeyMaterial(generated.publicKey, generated.privateKey);
  const match = primaryUserId.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  assert.ok(match);
  assert.equal(metadata.name, match[1].trim());
  assert.equal(metadata.email, match[2].trim().toLowerCase());
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
  const generated = await generate(null);
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


test("accepts an already-expired but otherwise valid encrypted key pair", async () => {
  const generated = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "Expired Record", email: "expired@example.com" }],
    passphrase: "strong-test-passphrase",
    date: new Date(Date.now() - 2 * 60 * 60 * 1000),
    keyExpirationTime: 60 * 60,
    format: "armored",
  });

  const metadata = await validateKeyMaterial(
    generated.publicKey,
    generated.privateKey,
  );

  assert.ok(metadata.expiresAt instanceof Date);
  assert.ok(metadata.expiresAt.getTime() < Date.now());
});
