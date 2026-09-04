import test from "node:test";
import assert from "node:assert/strict";
import type { ExportableKey } from "./export-keys";
import {
  formatKeyForExport,
  exportKeysToJSON,
  exportKeysToCSV,
} from "./export-keys";

const sampleKeys: ExportableKey[] = [
  {
    id: "key-1",
    title: "Primary Key",
    details: "Work email key",
    name: "Alice Smith",
    email: "alice@example.com",
    algorithm: "ECC (Curve25519)",
    fingerprint: "A1B2C3D4E5F67890",
    publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js\n\n...key1...\n-----END PGP PUBLIC KEY BLOCK-----",
    expiresAt: null,
    revokedAt: null,
    createdAt: new Date("2025-01-01T10:00:00.000Z"),
  },
  {
    id: "key-2",
    title: 'Secondary "Special" Key, with comma',
    details: null,
    name: "Bob Jones",
    email: "bob@example.com",
    algorithm: "RSA 4096",
    fingerprint: "1234567890ABCDEF",
    publicKey: "-----BEGIN PGP PUBLIC KEY BLOCK-----\nVersion: OpenPGP.js\n\n...key2...\n-----END PGP PUBLIC KEY BLOCK-----",
    expiresAt: new Date("2026-01-01T10:00:00.000Z"),
    revokedAt: new Date("2025-02-01T10:00:00.000Z"),
    createdAt: new Date("2024-06-01T10:00:00.000Z"),
  },
];

test("formatKeyForExport computes status and ISO dates correctly", () => {
  const activeFormatted = formatKeyForExport(sampleKeys[0]);
  assert.equal(activeFormatted.status, "Active");
  assert.equal(activeFormatted.expiresAt, null);
  assert.equal(activeFormatted.revokedAt, null);
  assert.equal(activeFormatted.createdAt, "2025-01-01T10:00:00.000Z");

  const revokedFormatted = formatKeyForExport(sampleKeys[1]);
  assert.equal(revokedFormatted.status, "Revoked");
  assert.equal(revokedFormatted.expiresAt, "2026-01-01T10:00:00.000Z");
  assert.equal(revokedFormatted.revokedAt, "2025-02-01T10:00:00.000Z");
  assert.equal(revokedFormatted.details, "");
});

test("exportKeysToJSON formats keys as valid JSON array", () => {
  const emptyJson = exportKeysToJSON([]);
  assert.equal(emptyJson, "[]");

  const json = exportKeysToJSON(sampleKeys);
  const parsed = JSON.parse(json);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].title, "Primary Key");
  assert.equal(parsed[0].status, "Active");
  assert.equal(parsed[1].title, 'Secondary "Special" Key, with comma');
  assert.equal(parsed[1].status, "Revoked");
});

test("exportKeysToCSV generates correct header and escaped values", () => {
  const csv = exportKeysToCSV(sampleKeys);

  // Headers match
  assert.ok(
    csv.startsWith(
      '"ID","Title","Details","Name","Email","Algorithm","Fingerprint","Status","Expires At","Revoked At","Created At","Public Key"'
    )
  );

  // Key 1 data exists
  assert.match(csv, /"key-1"/);
  assert.match(csv, /"Primary Key"/);
  assert.match(csv, /"Active"/);

  // Key 2 data properly escapes inner quotes: Secondary "Special" Key -> Secondary ""Special"" Key
  assert.match(csv, /"Secondary ""Special"" Key, with comma"/);
  assert.match(csv, /"Revoked"/);
});
