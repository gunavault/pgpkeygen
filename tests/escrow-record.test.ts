import assert from "node:assert/strict";
import test from "node:test";

import {
  parseEscrowPayloadInput,
  parseVaultEnvelopeInput,
} from "../lib/escrow-record.ts";

const envelope = {
  version: 1,
  kdf: "PBKDF2-SHA-256",
  iterations: 600_000,
  salt: Buffer.alloc(16, 1).toString("base64"),
  iv: Buffer.alloc(12, 2).toString("base64"),
  ciphertext: Buffer.alloc(48, 3).toString("base64"),
};

const payload = {
  version: 1,
  iv: Buffer.alloc(12, 4).toString("base64"),
  ciphertext: Buffer.alloc(64, 5).toString("base64"),
};

test("accepts the known v1 opaque vault envelope shape", () => {
  assert.deepEqual(parseVaultEnvelopeInput(envelope), envelope);
});

test("rejects altered KDF parameters and malformed envelope sizes", () => {
  assert.throws(
    () => parseVaultEnvelopeInput({ ...envelope, iterations: 1 }),
    /invalid vault envelope/i,
  );
  assert.throws(
    () => parseVaultEnvelopeInput({ ...envelope, salt: Buffer.alloc(15).toString("base64") }),
    /invalid vault envelope/i,
  );
  assert.throws(
    () => parseVaultEnvelopeInput({ ...envelope, ciphertext: "not base64!!!" }),
    /invalid vault envelope/i,
  );
});

test("accepts bounded v1 per-key escrow payloads", () => {
  assert.deepEqual(parseEscrowPayloadInput(payload), payload);
});

test("rejects wrong IV sizes and arbitrary-size escrow blobs", () => {
  assert.throws(
    () => parseEscrowPayloadInput({ ...payload, iv: Buffer.alloc(11).toString("base64") }),
    /invalid escrow payload/i,
  );
  assert.throws(
    () => parseEscrowPayloadInput({ ...payload, ciphertext: Buffer.alloc(4_097).toString("base64") }),
    /invalid escrow payload/i,
  );
});

test("rejects partial or unknown record versions", () => {
  assert.throws(() => parseVaultEnvelopeInput({ ...envelope, version: 2 }), /invalid vault envelope/i);
  assert.throws(() => parseEscrowPayloadInput({ ...payload, version: 2 }), /invalid escrow payload/i);
  assert.throws(() => parseEscrowPayloadInput({ version: 1, iv: payload.iv }), /invalid escrow payload/i);
});
