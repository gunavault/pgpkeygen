import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  beginPasswordReset,
  completeForcedReset,
  completeRecoveryReset,
  issuePasswordReset,
  MAX_RESET_ATTEMPTS,
  PasswordResetError,
  type IssueResetEnvironment,
  type RedeemResetEnvironment,
  type ResetMode,
} from "../lib/password-reset.ts";
import { generateGroupedSecret } from "../lib/recovery-code.ts";
import { sha256Hex } from "../lib/secret-hash.ts";
import type { VaultEnvelope } from "../lib/vault-escrow.ts";

const b64 = (n: number) => randomBytes(n).toString("base64");
const envelope = (): VaultEnvelope => ({
  version: 1,
  kdf: "PBKDF2-SHA-256",
  iterations: 600_000,
  salt: b64(16),
  iv: b64(12),
  ciphertext: b64(48),
});
const verifier = () => randomBytes(32).toString("hex");

type User = {
  id: string;
  email: string;
  role: string;
  status: string;
  passwordHash: string;
  vaultEnvelope: VaultEnvelope | null;
  recoveryEnvelope: VaultEnvelope | null;
  recoveryVerifierHash: string | null;
  escrowCount: number;
  sessionsValidAfter: Date | null;
};
type Reset = { id: string; userId: string; tokenHash: string; mode: ResetMode; issuedBy: string; expiresAt: Date; attempts: number };
type State = { users: Map<string, User>; resets: Map<string, Reset>; audit: string[] };

const clone = (s: State): State => ({
  users: new Map([...s.users].map(([k, v]) => [k, { ...v }])),
  resets: new Map([...s.resets].map(([k, v]) => [k, { ...v }])),
  audit: [...s.audit],
});

function harness() {
  const userVerifier = verifier();
  let state: State = { users: new Map(), resets: new Map(), audit: [] };
  const add = (u: Partial<User> & Pick<User, "id" | "email">) =>
    state.users.set(u.id, {
      role: "user",
      status: "active",
      passwordHash: "old-hash",
      vaultEnvelope: envelope(),
      recoveryEnvelope: envelope(),
      recoveryVerifierHash: sha256Hex(userVerifier),
      escrowCount: 3,
      sessionsValidAfter: null,
      ...u,
    });
  add({ id: "admin", email: "admin@example.test", role: "admin" });
  add({ id: "alice", email: "alice@example.test" });
  add({ id: "bob", email: "bob@example.test", recoveryEnvelope: null, recoveryVerifierHash: null });

  let clock = new Date("2026-10-09T08:00:00Z");
  const audit = (line: string) => line;

  const issueEnv: IssueResetEnvironment = {
    now: () => clock,
    generateToken: generateGroupedSecret,
    async transaction(callback) {
      const staged = clone(state);
      const result = await callback({
        findUserForUpdate: async (id) => {
          const u = staged.users.get(id);
          return u ? { id: u.id, email: u.email, role: u.role, status: u.status, hasRecoveryCode: !!u.recoveryEnvelope } : null;
        },
        saveReset: async (row) => {
          staged.resets.set(row.userId, { id: `r-${row.userId}-${staged.audit.length}`, attempts: 0, ...row });
        },
        audit: async (actor, target, details) => {
          staged.audit.push(audit(`${actor} password.reset_issued ${target} (${details})`));
        },
      });
      state = staged;
      return result;
    },
  };

  const redeemEnv: RedeemResetEnvironment = {
    now: () => clock,
    hashPassword: async (p) => `hash:${p}`,
    async transaction(callback) {
      const staged = clone(state);
      const result = await callback({
        findResetForUpdate: async (email) => {
          const u = [...staged.users.values()].find((x) => x.email === email);
          const r = u && staged.resets.get(u.id);
          return u && r ? { reset: { ...r }, account: { ...u } } : null;
        },
        recordFailure: async (id, attempts) => {
          for (const r of staged.resets.values()) if (r.id === id) r.attempts = attempts;
        },
        deleteReset: async (id) => {
          for (const [k, r] of staged.resets) if (r.id === id) staged.resets.delete(k);
        },
        completeRecovery: async (userId, v) => {
          Object.assign(staged.users.get(userId)!, {
            passwordHash: v.passwordHash,
            vaultEnvelope: v.vaultEnvelope,
            recoveryEnvelope: v.recoveryEnvelope,
            recoveryVerifierHash: v.recoveryVerifierHash,
            sessionsValidAfter: v.at,
          });
        },
        completeForced: async (userId, v) => {
          const u = staged.users.get(userId)!;
          const removed = u.escrowCount;
          Object.assign(u, {
            passwordHash: v.passwordHash,
            vaultEnvelope: null,
            recoveryEnvelope: null,
            recoveryVerifierHash: null,
            escrowCount: 0,
            sessionsValidAfter: v.at,
          });
          return removed;
        },
        audit: async (email, action, details) => {
          staged.audit.push(audit(`${email} ${action} (${details})`));
        },
      });
      state = staged;
      return result;
    },
  };

  return {
    issueEnv,
    redeemEnv,
    userVerifier,
    user: (id: string) => state.users.get(id)!,
    reset: (id: string) => state.resets.get(id),
    audit: () => state.audit,
    advance: (ms: number) => { clock = new Date(clock.getTime() + ms); },
    issue: (target: string, mode: ResetMode, actor = "admin") =>
      issuePasswordReset({ actorId: actor, targetUserId: target, mode }, issueEnv),
  };
}

const rejectsInvalid = (p: Promise<unknown>) => assert.rejects(p, PasswordResetError);

function recoveryInput(h: ReturnType<typeof harness>, token: string, overrides: Record<string, unknown> = {}) {
  return {
    email: "alice@example.test",
    token,
    verifier: h.userVerifier,
    newPassword: "brand-new-password",
    vaultEnvelope: envelope(),
    recoveryEnvelope: envelope(),
    recoveryVerifier: verifier(),
    ...overrides,
  };
}

// --- issuing ---------------------------------------------------------------

test("an admin issues a reset; only a hash of the token is stored and it is audited", async () => {
  const h = harness();
  const { token, expiresAt } = await h.issue("alice", "recovery");
  assert.match(token, /^([0-9A-Z]{4}-){6}[0-9A-Z]{2}$/);
  assert.equal(h.reset("alice")!.tokenHash, sha256Hex(token.replaceAll("-", "")));
  assert.notEqual(h.reset("alice")!.tokenHash, token);
  assert.equal(expiresAt.toISOString(), "2026-10-09T09:00:00.000Z");
  assert.match(h.audit().at(-1)!, /admin@example\.test password\.reset_issued alice@example\.test \(mode recovery/);
});

test("only an active admin can issue, never for themselves, never for inactive accounts", async () => {
  const h = harness();
  await rejectsInvalid(h.issue("bob", "forced", "alice"));
  await rejectsInvalid(h.issue("admin", "forced", "admin"));
  h.user("alice").status = "pending";
  await rejectsInvalid(h.issue("alice", "forced"));
  h.user("alice").status = "active";
  h.user("admin").status = "rejected";
  await rejectsInvalid(h.issue("alice", "forced"));
  assert.equal(h.reset("alice"), undefined);
});

test("a recovery reset is refused for an account without a recovery code", async () => {
  const h = harness();
  await assert.rejects(h.issue("bob", "recovery"), /no recovery code/);
  await h.issue("bob", "forced");
});

test("issuing again replaces the earlier token", async () => {
  const h = harness();
  const first = await h.issue("alice", "recovery");
  const second = await h.issue("alice", "recovery");
  await rejectsInvalid(beginPasswordReset({ email: "alice@example.test", token: first.token }, h.redeemEnv));
  const ok = await beginPasswordReset({ email: "alice@example.test", token: second.token }, h.redeemEnv);
  assert.equal(ok.mode, "recovery");
});

// --- beginning ------------------------------------------------------------

test("a valid token reveals its mode; recovery resets also get the recovery envelope", async () => {
  const h = harness();
  const a = await h.issue("alice", "recovery");
  const b = await h.issue("bob", "forced");
  const ra = await beginPasswordReset({ email: "alice@example.test", token: a.token.toLowerCase().replaceAll("-", " ") }, h.redeemEnv);
  assert.equal(ra.mode, "recovery");
  assert.deepEqual(ra.recoveryEnvelope, h.user("alice").recoveryEnvelope);
  const rb = await beginPasswordReset({ email: "bob@example.test", token: b.token }, h.redeemEnv);
  assert.deepEqual(rb, { mode: "forced", recoveryEnvelope: null });
});

test("wrong tokens are counted, and the reset is destroyed after the limit", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  for (let i = 1; i < MAX_RESET_ATTEMPTS; i += 1) {
    await rejectsInvalid(beginPasswordReset({ email: "alice@example.test", token: generateGroupedSecret() }, h.redeemEnv));
    assert.equal(h.reset("alice")!.attempts, i, "a failed attempt is committed, not rolled back");
  }
  await rejectsInvalid(beginPasswordReset({ email: "alice@example.test", token: generateGroupedSecret() }, h.redeemEnv));
  assert.equal(h.reset("alice"), undefined);
  await rejectsInvalid(beginPasswordReset({ email: "alice@example.test", token }, h.redeemEnv));
  assert.match(h.audit().at(-1)!, /password\.reset_failed .*attempt 5 of 5/);
});

test("a reset already at the attempt limit refuses even the correct token", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  h.reset("alice")!.attempts = MAX_RESET_ATTEMPTS;
  await rejectsInvalid(beginPasswordReset({ email: "alice@example.test", token }, h.redeemEnv));
  assert.equal(h.reset("alice"), undefined, "the spent reset is removed");
});

test("an expired token fails and is removed; a token for another email fails", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  await rejectsInvalid(beginPasswordReset({ email: "bob@example.test", token }, h.redeemEnv));
  h.advance(60 * 60 * 1000);
  await rejectsInvalid(beginPasswordReset({ email: "alice@example.test", token }, h.redeemEnv));
  assert.equal(h.reset("alice"), undefined);
});

// --- recovery reset -------------------------------------------------------

test("a recovery reset stores the new password and envelopes, signs out sessions, and is single-use", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  const input = recoveryInput(h, token);
  await completeRecoveryReset(input, h.redeemEnv);

  const alice = h.user("alice");
  assert.equal(alice.passwordHash, "hash:brand-new-password");
  assert.deepEqual(alice.vaultEnvelope, input.vaultEnvelope);
  assert.deepEqual(alice.recoveryEnvelope, input.recoveryEnvelope);
  assert.equal(alice.recoveryVerifierHash, sha256Hex(input.recoveryVerifier), "the old code stops working");
  assert.equal(alice.escrowCount, 3, "stored passphrase copies are kept");
  assert.ok(alice.sessionsValidAfter);
  assert.equal(h.reset("alice"), undefined);
  assert.match(h.audit().at(-1)!, /alice@example\.test password\.reset \(with recovery code; allowed by admin@example\.test/);

  await rejectsInvalid(completeRecoveryReset(recoveryInput(h, token), h.redeemEnv));
});

test("a wrong recovery code is refused, counted, and changes nothing", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  const before = { ...h.user("alice") };
  await rejectsInvalid(completeRecoveryReset(recoveryInput(h, token, { verifier: verifier() }), h.redeemEnv));
  assert.deepEqual(h.user("alice"), before);
  assert.equal(h.reset("alice")!.attempts, 1);
  assert.match(h.audit().at(-1)!, /wrong recovery code/);
});

test("a reset token only works for the kind of reset the admin chose", async () => {
  const h = harness();
  const recovery = await h.issue("alice", "recovery");
  await rejectsInvalid(completeForcedReset({ email: "alice@example.test", token: recovery.token, newPassword: "brand-new-password" }, h.redeemEnv));
  assert.equal(h.user("alice").escrowCount, 3, "a recovery token cannot wipe escrow");

  const forced = await h.issue("bob", "forced");
  await rejectsInvalid(completeRecoveryReset({ ...recoveryInput(h, forced.token), email: "bob@example.test" }, h.redeemEnv));
});

test("reused envelope randomness is refused", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  const stale = { ...envelope(), salt: h.user("alice").vaultEnvelope!.salt };
  await rejectsInvalid(completeRecoveryReset(recoveryInput(h, token, { recoveryEnvelope: stale }), h.redeemEnv));
  assert.equal(h.user("alice").passwordHash, "old-hash");
});

test("an account that is no longer active cannot be reset", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  h.user("alice").status = "rejected";
  await rejectsInvalid(completeRecoveryReset(recoveryInput(h, token), h.redeemEnv));
  assert.equal(h.user("alice").passwordHash, "old-hash");
});

test("if the audit write fails, the reset rolls back and stays usable", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "recovery");
  const auditFails: RedeemResetEnvironment = {
    ...h.redeemEnv,
    transaction: (callback) =>
      h.redeemEnv.transaction((tx) =>
        callback({
          ...tx,
          audit: async () => {
            throw new Error("audit insert failed");
          },
        }),
      ),
  };
  await assert.rejects(completeRecoveryReset(recoveryInput(h, token), auditFails), /audit insert failed/);
  assert.equal(h.user("alice").passwordHash, "old-hash");
  assert.ok(h.reset("alice"), "the reset is still there to retry");
});

// --- forced reset ---------------------------------------------------------

test("a forced reset sets the password and removes the vault, recovery code and every escrow copy", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "forced");
  const result = await completeForcedReset({ email: "alice@example.test", token, newPassword: "brand-new-password" }, h.redeemEnv);
  assert.deepEqual(result, { removedRecoveryCopies: 3 });
  const alice = h.user("alice");
  assert.equal(alice.passwordHash, "hash:brand-new-password");
  assert.equal(alice.vaultEnvelope, null);
  assert.equal(alice.recoveryEnvelope, null);
  assert.equal(alice.escrowCount, 0);
  assert.ok(alice.sessionsValidAfter);
  assert.match(h.audit().at(-1)!, /password\.reset_forced \(without recovery code; allowed by admin@example\.test; 3 stored passphrase copies removed/);
});

test("a short new password is refused before any state changes", async () => {
  const h = harness();
  const { token } = await h.issue("alice", "forced");
  await assert.rejects(
    completeForcedReset({ email: "alice@example.test", token, newPassword: "short" }, h.redeemEnv),
    /at least 8 characters/,
  );
  assert.ok(h.reset("alice"));
  assert.equal(h.reset("alice")!.attempts, 0);
});
