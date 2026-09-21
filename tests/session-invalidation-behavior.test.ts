import assert from "node:assert/strict";
import test from "node:test";

import {
  performSessionInvalidation,
  type SessionInvalidationEnvironment,
} from "../lib/session-invalidation.ts";

type State = {
  sessionsValidAfter: Date | null;
  audit: string[];
};

function createHarness(options: { auditFails?: boolean } = {}) {
  let current: State = { sessionsValidAfter: null, audit: [] };
  let commits = 0;

  const environment: SessionInvalidationEnvironment = {
    now: () => new Date("2026-09-21T12:00:00.500Z"),
    async transaction(callback) {
      const staged: State = {
        sessionsValidAfter: current.sessionsValidAfter
          ? new Date(current.sessionsValidAfter)
          : null,
        audit: [...current.audit],
      };

      const result = await callback({
        async advanceCutoff(_userId, cutoff) {
          staged.sessionsValidAfter = new Date(cutoff);
        },
        async auditInvalidated(email, reason) {
          if (options.auditFails) throw new Error("Audit insert failed");
          staged.audit.push(`${email}:${reason}`);
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
  };
}

test("manual session invalidation advances the cutoff and audits in one transaction", async () => {
  const harness = createHarness();

  await performSessionInvalidation(
    {
      userId: "user-1",
      actorEmail: "user@example.com",
      reason: "user requested sign out everywhere",
    },
    harness.environment,
  );

  assert.equal(harness.commits(), 1);
  assert.equal(
    harness.state().sessionsValidAfter?.toISOString(),
    "2026-09-21T12:00:00.500Z",
  );
  assert.deepEqual(harness.state().audit, [
    "user@example.com:user requested sign out everywhere",
  ]);
});

test("manual invalidation rolls back the cutoff when its audit write fails", async () => {
  const harness = createHarness({ auditFails: true });

  await assert.rejects(
    performSessionInvalidation(
      {
        userId: "user-1",
        actorEmail: "user@example.com",
        reason: "user requested sign out everywhere",
      },
      harness.environment,
    ),
    /audit insert failed/i,
  );

  assert.equal(harness.commits(), 0);
  assert.equal(harness.state().sessionsValidAfter, null);
  assert.deepEqual(harness.state().audit, []);
});
