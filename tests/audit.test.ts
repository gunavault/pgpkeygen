import assert from "node:assert/strict";
import test from "node:test";

import { logAudit, type AuditEntry } from "../lib/audit.ts";

test("logAudit can use a transaction-scoped writer without changing event shape", async () => {
  const entries: AuditEntry[] = [];

  await logAudit(
    "user@example.com",
    "password.changed",
    undefined,
    undefined,
    {
      async write(entry) {
        entries.push(entry);
      },
    },
  );

  assert.deepEqual(entries, [
    {
      actorEmail: "user@example.com",
      action: "password.changed",
      target: undefined,
      details: undefined,
    },
  ]);
});
