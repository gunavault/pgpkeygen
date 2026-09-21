import assert from "node:assert/strict";
import test from "node:test";
import * as openpgp from "openpgp";

import {
  keyExportFilenames,
  sanitizeKeyFilenamePart,
} from "../lib/key-export.ts";
import { verifyImportedKeyRecoverySecret } from "../lib/key-import-client.ts";
import { evaluateKeyImportPolicy } from "../lib/key-import-policy.ts";
import { validateKeyMaterial } from "../lib/pgp-validation.ts";

test("export filenames are conventional and sanitize crafted identity text", () => {
  const filenames = keyExportFilenames(
    "../../Ada \\ Lovelace / release signing",
    "0123 4567 89ab cdef 0011 2233 4455 6677 8899 aabb",
  );

  assert.equal(
    filenames.publicKey,
    "ada-lovelace-release-signing-445566778899AABB.pub.asc",
  );
  assert.equal(
    filenames.privateKey,
    "ada-lovelace-release-signing-445566778899AABB.sec.asc",
  );
  assert.equal(
    filenames.revocationCertificate,
    "ada-lovelace-release-signing-445566778899AABB.rev.asc",
  );

  for (const filename of Object.values(filenames)) {
    assert.doesNotMatch(filename, /[\\/]/);
    assert.doesNotMatch(filename, /\.\./);
  }

  assert.equal(sanitizeKeyFilenamePart("../../../"), "key");
});

test("import policy rejects duplicate fingerprints before quota and enforces quota", () => {
  assert.equal(evaluateKeyImportPolicy(50, 50, true), "duplicate");
  assert.equal(evaluateKeyImportPolicy(50, 50, false), "limit");
  assert.equal(evaluateKeyImportPolicy(49, 50, false), "allowed");
});

test("exported armored key material round-trips through authoritative import validation", async () => {
  const generated = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "Ada Lovelace", email: "ada@example.com" }],
    passphrase: "strong-round-trip-passphrase",
    keyExpirationTime: 3600,
    format: "armored",
  });

  const before = await validateKeyMaterial(
    generated.publicKey,
    generated.privateKey,
  );

  const filenames = keyExportFilenames(before.name, before.fingerprint);
  assert.match(filenames.publicKey, /\.pub\.asc$/);
  assert.match(filenames.privateKey, /\.sec\.asc$/);

  const after = await validateKeyMaterial(
    generated.publicKey,
    generated.privateKey,
  );

  assert.deepEqual(
    {
      fingerprint: after.fingerprint,
      name: after.name,
      email: after.email,
      algorithm: after.algorithm,
      expiresAt: after.expiresAt?.getTime() ?? null,
    },
    {
      fingerprint: before.fingerprint,
      name: before.name,
      email: before.email,
      algorithm: before.algorithm,
      expiresAt: before.expiresAt?.getTime() ?? null,
    },
  );
});


test("import recovery secret must decrypt the matching private key before escrow", async () => {
  const generated = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "Grace Hopper", email: "grace@example.com" }],
    passphrase: "correct-import-secret",
    format: "armored",
  });

  const parsed = await openpgp.readKey({ armoredKey: generated.publicKey });
  assert.equal(
    await verifyImportedKeyRecoverySecret(
      generated.publicKey,
      generated.privateKey,
      "correct-import-secret",
    ),
    parsed.getFingerprint(),
  );

  await assert.rejects(
    verifyImportedKeyRecoverySecret(
      generated.publicKey,
      generated.privateKey,
      "wrong-import-secret",
    ),
  );

  const other = await openpgp.generateKey({
    type: "curve25519",
    userIDs: [{ name: "Other User", email: "other@example.com" }],
    passphrase: "correct-import-secret",
    format: "armored",
  });

  await assert.rejects(
    verifyImportedKeyRecoverySecret(
      generated.publicKey,
      other.privateKey,
      "correct-import-secret",
    ),
    /same key pair/i,
  );
});
