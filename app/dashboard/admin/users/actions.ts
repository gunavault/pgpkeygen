"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
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
