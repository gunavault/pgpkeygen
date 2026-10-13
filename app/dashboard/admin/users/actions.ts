"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, passwordResets, users } from "@/lib/db/schema";
import { generateGroupedSecret } from "@/lib/recovery-code";
import {
  issuePasswordReset,
  PasswordResetError,
  type IssueResetEnvironment,
  type ResetMode,
} from "@/lib/password-reset";
import {
  decideUserApproval,
  UserApprovalError,
  type ApprovalDecision,
  type UserApprovalEnvironment,
} from "@/lib/user-approval";

const environment: UserApprovalEnvironment = {
  transaction: (callback) =>
    db.transaction((tx) =>
      callback({
        async findUserForUpdate(userId) {
          const [row] = await tx
            .select({ id: users.id, email: users.email, role: users.role, status: users.status })
            .from(users)
            .where(eq(users.id, userId))
            .for("update")
            .limit(1);
          return row ?? null;
        },
        async setStatus(userId, status) {
          await tx.update(users).set({ status }).where(eq(users.id, userId));
        },
        async audit(actorEmail, action, target) {
          await tx.insert(auditLog).values({ actorEmail, action, target });
        },
      }),
    ),
};

export type ApprovalResult = { ok: true } | { ok: false; error: string };

async function decide(targetUserId: string, decision: ApprovalDecision): Promise<ApprovalResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { ok: false, error: "Only administrators can do this." };
  }

  try {
    await decideUserApproval({ actorId: session.user.id, targetUserId, decision }, environment);
  } catch (error) {
    if (error instanceof UserApprovalError) return { ok: false, error: error.message };
    console.error("user approval failed");
    return { ok: false, error: "Something went wrong. Try again." };
  }

  revalidatePath("/dashboard/admin/users");
  return { ok: true };
}

export async function approveUser(targetUserId: string): Promise<ApprovalResult> {
  return decide(targetUserId, "approve");
}

export async function rejectUser(targetUserId: string): Promise<ApprovalResult> {
  return decide(targetUserId, "reject");
}

const resetEnvironment: IssueResetEnvironment = {
  now: () => new Date(),
  generateToken: generateGroupedSecret,
  transaction: (callback) =>
    db.transaction((tx) =>
      callback({
        async findUserForUpdate(userId) {
          const [row] = await tx
            .select({
              id: users.id,
              email: users.email,
              role: users.role,
              status: users.status,
              recoveryCreatedAt: users.recoveryCreatedAt,
            })
            .from(users)
            .where(eq(users.id, userId))
            .for("update")
            .limit(1);
          return row
            ? { id: row.id, email: row.email, role: row.role, status: row.status, hasRecoveryCode: row.recoveryCreatedAt !== null }
            : null;
        },
        async saveReset(row) {
          await tx
            .insert(passwordResets)
            .values(row)
            .onConflictDoUpdate({
              target: passwordResets.userId,
              set: { tokenHash: row.tokenHash, mode: row.mode, issuedBy: row.issuedBy, expiresAt: row.expiresAt, attempts: 0, createdAt: new Date() },
            });
        },
        async audit(actorEmail, target, details) {
          await tx.insert(auditLog).values({ actorEmail, action: "password.reset_issued", target, details });
        },
      }),
    ),
};

export type AllowResetResult = { ok: true; token: string; expiresAt: string } | { ok: false; error: string };

/** Lets a user reset a forgotten password. The token is shown to the admin once, to hand over out of band. */
export async function allowPasswordReset(targetUserId: string, mode: ResetMode): Promise<AllowResetResult> {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "admin") {
    return { ok: false, error: "Only administrators can do this." };
  }
  try {
    const { token, expiresAt } = await issuePasswordReset(
      { actorId: session.user.id, targetUserId, mode },
      resetEnvironment,
    );
    return { ok: true, token, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    if (error instanceof PasswordResetError) return { ok: false, error: error.message };
    console.error("password reset: issue failed");
    return { ok: false, error: "Something went wrong. Try again." };
  }
}
