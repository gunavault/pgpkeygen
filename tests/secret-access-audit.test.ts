import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const auditSource = readFileSync(new URL("../lib/audit.ts", import.meta.url), "utf8");
const escrowActionsSource = readFileSync(
  new URL("../app/escrow/actions.ts", import.meta.url),
  "utf8",
);
const dashboardActionsSource = readFileSync(
  new URL("../app/dashboard/actions.ts", import.meta.url),
  "utf8",
);

function functionSource(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next === -1 ? source.length : next);
}

test("audit action union includes approved secret-access events", () => {
  for (const action of [
    "recovery.accessed",
    "recovery.enabled",
    "revocation.exported",
    "revocation.forgotten",
  ]) {
    assert.match(auditSource, new RegExp(`["']${action.replace(".", "\\.")}["']`));
  }

  assert.doesNotMatch(auditSource, /recovery\.revealed/);
});

test("recovery access and enablement are audited with metadata only", () => {
  const getKeyEscrow = functionSource(escrowActionsSource, "getKeyEscrow");
  assert.match(
    getKeyEscrow,
    /logAudit\([^;]*"recovery\.accessed"[^;]*key\.title[^;]*key\.fingerprint[^;]*\)/s,
  );

  const recoveryAuditCall =
    getKeyEscrow.match(/logAudit\([^;]*"recovery\.accessed"[^;]*\)/s)?.[0] ?? "";
  assert.doesNotMatch(
    recoveryAuditCall,
    /payload|ciphertext|escrowIv|escrowCiphertext|envelope|vaultWrappedKey|vaultKdf/i,
  );

  const saveKey = functionSource(dashboardActionsSource, "saveKey");
  assert.match(
    saveKey,
    /logAudit\([^;]*"recovery\.enabled"[^;]*title[^;]*metadata\.fingerprint[^;]*\)/s,
  );
  const enableAuditCall =
    saveKey.match(/logAudit\([^;]*"recovery\.enabled"[^;]*\)/s)?.[0] ?? "";
  assert.doesNotMatch(enableAuditCall, /ciphertext|escrowIv|escrowCiphertext|privateKey|publicKey/i);
});

test("legacy revocation access and deletion are audited without certificate material", () => {
  const exported = functionSource(dashboardActionsSource, "getLegacyRevocationCertificate");
  assert.match(
    exported,
    /logAudit\([^;]*"revocation\.exported"[^;]*key\.title[^;]*key\.fingerprint[^;]*\)/s,
  );
  const exportAuditCall =
    exported.match(/logAudit\([^;]*"revocation\.exported"[^;]*\)/s)?.[0] ?? "";
  assert.doesNotMatch(exportAuditCall, /revocationCertificate|certificate/i);

  const forgotten = functionSource(dashboardActionsSource, "forgetLegacyRevocationCertificate");
  assert.match(
    forgotten,
    /logAudit\([^;]*"revocation\.forgotten"[^;]*forgotten\.title[^;]*forgotten\.fingerprint[^;]*\)/s,
  );
  const forgetAuditCall =
    forgotten.match(/logAudit\([^;]*"revocation\.forgotten"[^;]*\)/s)?.[0] ?? "";
  assert.doesNotMatch(forgetAuditCall, /revocationCertificate|certificate/i);
});
