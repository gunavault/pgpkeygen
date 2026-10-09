import assert from "node:assert/strict";
import test from "node:test";

import {
  decideUserApproval,
  UserApprovalError,
  type ApprovalUser,
  type UserApprovalEnvironment,
} from "../lib/user-approval.ts";

function createHarness(seed: ApprovalUser[], options: { auditFails?: boolean } = {}) {
  let rows = new Map(seed.map((user) => [user.id, { ...user }]));
  let audit: string[] = [];

  const environment: UserApprovalEnvironment = {
    async transaction(callback) {
      const staged = new Map([...rows].map(([id, user]) => [id, { ...user }]));
      const stagedAudit = [...audit];
      const result = await callback({
        async findUserForUpdate(userId) {
          const user = staged.get(userId);
          return user ? { ...user } : null;
        },
        async setStatus(userId, status) {
          staged.get(userId)!.status = status;
        },
        async audit(actorEmail, action, target) {
          if (options.auditFails) throw new Error("audit insert failed");
          stagedAudit.push(`${actorEmail} ${action} ${target}`);
        },
      });
      rows = staged;
      audit = stagedAudit;
      return result;
    },
  };

  return { environment, status: (id: string) => rows.get(id)?.status, audit: () => audit };
}

const admin: ApprovalUser = { id: "admin", email: "admin@example.test", role: "admin", status: "active" };
const newcomer: ApprovalUser = { id: "new", email: "new@example.test", role: "user", status: "pending" };

test("an admin approves a pending account and the approval is audited", async () => {
  const h = createHarness([admin, newcomer]);
  const result = await decideUserApproval({ actorId: "admin", targetUserId: "new", decision: "approve" }, h.environment);
  assert.equal(result, "active");
  assert.equal(h.status("new"), "active");
  assert.deepEqual(h.audit(), ["admin@example.test user.approved new@example.test"]);
});

test("an admin rejects a pending account, and can approve it later", async () => {
  const h = createHarness([admin, newcomer]);
  await decideUserApproval({ actorId: "admin", targetUserId: "new", decision: "reject" }, h.environment);
  assert.equal(h.status("new"), "rejected");
  await decideUserApproval({ actorId: "admin", targetUserId: "new", decision: "approve" }, h.environment);
  assert.equal(h.status("new"), "active");
  assert.deepEqual(h.audit(), [
    "admin@example.test user.rejected new@example.test",
    "admin@example.test user.approved new@example.test",
  ]);
});

test("a non-admin cannot approve anyone", async () => {
  const other: ApprovalUser = { id: "other", email: "o@example.test", role: "user", status: "active" };
  const h = createHarness([other, newcomer]);
  await assert.rejects(
    decideUserApproval({ actorId: "other", targetUserId: "new", decision: "approve" }, h.environment),
    UserApprovalError,
  );
  assert.equal(h.status("new"), "pending");
  assert.deepEqual(h.audit(), []);
});

test("an admin whose own account is no longer active cannot approve", async () => {
  const h = createHarness([{ ...admin, status: "rejected" }, newcomer]);
  await assert.rejects(
    decideUserApproval({ actorId: "admin", targetUserId: "new", decision: "approve" }, h.environment),
    UserApprovalError,
  );
  assert.equal(h.status("new"), "pending");
});

test("an admin cannot change their own status", async () => {
  const h = createHarness([admin]);
  await assert.rejects(
    decideUserApproval({ actorId: "admin", targetUserId: "admin", decision: "reject" }, h.environment),
    /cannot change their own account status/,
  );
  assert.equal(h.status("admin"), "active");
});

test("an active account cannot be rejected through the approval flow", async () => {
  const active: ApprovalUser = { id: "act", email: "a@example.test", role: "user", status: "active" };
  const h = createHarness([admin, active]);
  await assert.rejects(
    decideUserApproval({ actorId: "admin", targetUserId: "act", decision: "reject" }, h.environment),
    UserApprovalError,
  );
  assert.equal(h.status("act"), "active");
});

test("a failed audit write rolls the status change back", async () => {
  const h = createHarness([admin, newcomer], { auditFails: true });
  await assert.rejects(
    decideUserApproval({ actorId: "admin", targetUserId: "new", decision: "approve" }, h.environment),
  );
  assert.equal(h.status("new"), "pending");
});
