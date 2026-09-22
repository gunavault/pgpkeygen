import assert from "node:assert/strict";
import test from "node:test";

import {
  performKeyImportTransaction,
  type KeyImportTransactionEnvironment,
} from "../lib/key-import-transaction.ts";

type State = {
  inserted: number;
  audit: string[];
};

function createHarness(options: {
  count?: number;
  duplicate?: boolean;
  auditFails?: boolean;
} = {}) {
  let current: State = { inserted: 0, audit: [] };
  let commits = 0;
  const calls: string[] = [];

  const environment: KeyImportTransactionEnvironment = {
    maxKeys: 50,
    async transaction(callback) {
      const staged: State = { inserted: current.inserted, audit: [...current.audit] };

      const result = await callback({
        async lockUser(userId) {
          calls.push(`lock:${userId}`);
        },
        async hasDuplicateFingerprint(userId, fingerprint) {
          calls.push(`duplicate:${userId}:${fingerprint}`);
          return options.duplicate ?? false;
        },
        async countKeys(userId) {
          calls.push(`count:${userId}`);
          return options.count ?? 0;
        },
        async insertKey() {
          calls.push("insert");
          staged.inserted += 1;
        },
        async auditImport() {
          calls.push("audit");
          if (options.auditFails) throw new Error("Audit insert failed");
          staged.audit.push("key.imported");
        },
      });

      current = staged;
      commits += 1;
      return result;
    },
  };

  return {
    environment,
    state: () => current,
    commits: () => commits,
    calls,
  };
}

test("key import locks the user before duplicate/quota checks, then inserts and audits atomically", async () => {
  const harness = createHarness({ count: 49 });

  assert.equal(
    await performKeyImportTransaction(
      { userId: "user-1", fingerprint: "ABCDEF" },
      harness.environment,
    ),
    "allowed",
  );

  assert.equal(harness.commits(), 1);
  assert.equal(harness.state().inserted, 1);
  assert.deepEqual(harness.state().audit, ["key.imported"]);
  assert.deepEqual(harness.calls, [
    "lock:user-1",
    "duplicate:user-1:ABCDEF",
    "count:user-1",
    "insert",
    "audit",
  ]);
});

test("duplicate fingerprint refuses import before insert", async () => {
  const harness = createHarness({ duplicate: true, count: 49 });

  assert.equal(
    await performKeyImportTransaction(
      { userId: "user-1", fingerprint: "ABCDEF" },
      harness.environment,
    ),
    "duplicate",
  );

  assert.equal(harness.commits(), 1);
  assert.equal(harness.state().inserted, 0);
  assert.deepEqual(harness.state().audit, []);
  assert.deepEqual(harness.calls, [
    "lock:user-1",
    "duplicate:user-1:ABCDEF",
    "count:user-1",
  ]);
});

test("quota refuses import before insert", async () => {
  const harness = createHarness({ count: 50 });

  assert.equal(
    await performKeyImportTransaction(
      { userId: "user-1", fingerprint: "ABCDEF" },
      harness.environment,
    ),
    "limit",
  );

  assert.equal(harness.commits(), 1);
  assert.equal(harness.state().inserted, 0);
  assert.deepEqual(harness.state().audit, []);
});

test("audit failure rolls back the imported row", async () => {
  const harness = createHarness({ count: 49, auditFails: true });

  await assert.rejects(
    performKeyImportTransaction(
      { userId: "user-1", fingerprint: "ABCDEF" },
      harness.environment,
    ),
    /audit insert failed/i,
  );

  assert.equal(harness.commits(), 0);
  assert.equal(harness.state().inserted, 0);
  assert.deepEqual(harness.state().audit, []);
});
