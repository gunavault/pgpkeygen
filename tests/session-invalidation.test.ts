import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authSource = readFileSync(new URL("../auth.ts", import.meta.url), "utf8");
const accountActions = readFileSync(
  new URL("../app/dashboard/account/actions.ts", import.meta.url),
  "utf8",
);
const schemaSource = readFileSync(
  new URL("../lib/db/schema.ts", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL("../drizzle/0005_session_invalidation.sql", import.meta.url),
  "utf8",
);

test("session invalidation schema and authentication-boundary wiring stay present", () => {
  assert.match(schemaSource, /sessionsValidAfter: timestamp\("sessions_valid_after"/);
  assert.match(migrationSource, /ADD COLUMN "sessions_valid_after"/);
  assert.match(authSource, /sessionIssuedAt = Date\.now\(\)/);
  assert.match(authSource, /isSessionValidAfterCutoff/);
  assert.match(authSource, /users\.sessionsValidAfter/);
  assert.match(authSource, /users\.role/);
  assert.match(authSource, /!!session\?\.user\?\.id/);
});


test("session invalidation audit metadata contains no token or secret material", () => {
  const auditCalls = accountActions.match(
    /logAudit\([\s\S]{0,240}?"session\.invalidated"[\s\S]{0,240}?\)/g,
  );
  assert.ok(auditCalls && auditCalls.length >= 2);
  for (const call of auditCalls) {
    assert.doesNotMatch(
      call,
      /token|passwordHash|currentPassword|newPassword|vaultWrappedKey|escrowCiphertext/,
    );
  }
});
