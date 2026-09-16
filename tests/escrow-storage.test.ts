import assert from "node:assert/strict";
import test from "node:test";

import {
  escrowColumns,
  escrowPayloadFromRow,
  vaultEnvelopeColumns,
  vaultEnvelopeFromRow,
} from "../lib/escrow-storage.ts";

const envelope = {
  version: 1 as const,
  kdf: "PBKDF2-SHA-256" as const,
  iterations: 600_000,
  salt: Buffer.alloc(16, 1).toString("base64"),
  iv: Buffer.alloc(12, 2).toString("base64"),
  ciphertext: Buffer.alloc(48, 3).toString("base64"),
};

const payload = {
  version: 1 as const,
  iv: Buffer.alloc(12, 4).toString("base64"),
  ciphertext: Buffer.alloc(64, 5).toString("base64"),
};

test("vault envelope maps to opaque user columns and round-trips", () => {
  const columns = vaultEnvelopeColumns(envelope);
  assert.deepEqual(vaultEnvelopeFromRow(columns), envelope);
});

test("missing vault envelope is normal but partial state fails closed", () => {
  assert.equal(
    vaultEnvelopeFromRow({
      vaultWrappedKey: null,
      vaultKdfSalt: null,
      vaultKdfIv: null,
      vaultKdfIterations: null,
      vaultWrapVersion: null,
    }),
    null,
  );

  assert.throws(
    () => vaultEnvelopeFromRow({
      vaultWrappedKey: envelope.ciphertext,
      vaultKdfSalt: null,
      vaultKdfIv: envelope.iv,
      vaultKdfIterations: envelope.iterations,
      vaultWrapVersion: envelope.version,
    }),
    /incomplete vault envelope/i,
  );
});

test("opt-out escrow maps to all-null columns", () => {
  assert.deepEqual(escrowColumns(null), {
    escrowCiphertext: null,
    escrowIv: null,
    escrowVersion: null,
  });
});

test("per-key escrow maps to opaque columns and round-trips", () => {
  const columns = escrowColumns(payload);
  assert.deepEqual(escrowPayloadFromRow(columns), payload);
});

test("partial per-key escrow state fails closed", () => {
  assert.throws(
    () => escrowPayloadFromRow({ escrowCiphertext: payload.ciphertext, escrowIv: null, escrowVersion: 1 }),
    /incomplete escrow payload/i,
  );
});
