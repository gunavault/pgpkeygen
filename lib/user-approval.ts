import type { AccountStatus } from "./account-status.ts";

export type ApprovalDecision = "approve" | "reject";

export type ApprovalUser = {
  id: string;
  email: string;
  role: string;
  status: string;
};

export type UserApprovalTransaction = {
  /** Reads the row and locks it for the rest of the transaction. */
  findUserForUpdate: (userId: string) => Promise<ApprovalUser | null>;
  setStatus: (userId: string, status: AccountStatus) => Promise<void>;
  audit: (actorEmail: string, action: "user.approved" | "user.rejected", target: string) => Promise<void>;
};

export type UserApprovalEnvironment = {
  transaction: <T>(callback: (tx: UserApprovalTransaction) => Promise<T>) => Promise<T>;
};

export type UserApprovalInput = {
  actorId: string;
  targetUserId: string;
  decision: ApprovalDecision;
};

export class UserApprovalError extends Error {}

const TRANSITIONS: Record<ApprovalDecision, { from: readonly string[]; to: AccountStatus }> = {
  approve: { from: ["pending", "rejected"], to: "active" },
  reject: { from: ["pending"], to: "rejected" },
};

/**
 * Approves or rejects a self-registered account. The acting administrator is
 * re-read inside the transaction, so a session whose role or status changed
 * since it was issued cannot act on stale authority.
 */
export async function decideUserApproval(
  input: UserApprovalInput,
  environment: UserApprovalEnvironment,
): Promise<AccountStatus> {
  if (!input.actorId || !input.targetUserId) {
    throw new UserApprovalError("Invalid approval request");
  }
  if (input.actorId === input.targetUserId) {
    throw new UserApprovalError("Administrators cannot change their own account status");
  }
  const transition = TRANSITIONS[input.decision];
  if (!transition) throw new UserApprovalError("Invalid approval decision");

  return environment.transaction(async (tx) => {
    const actor = await tx.findUserForUpdate(input.actorId);
    if (!actor || actor.role !== "admin" || actor.status !== "active") {
      throw new UserApprovalError("Only an active administrator can approve accounts");
    }

    const target = await tx.findUserForUpdate(input.targetUserId);
    if (!target) throw new UserApprovalError("Account not found");
    if (!transition.from.includes(target.status)) {
      throw new UserApprovalError(`Cannot ${input.decision} an account that is ${target.status}`);
    }

    await tx.setStatus(target.id, transition.to);
    await tx.audit(
      actor.email,
      input.decision === "approve" ? "user.approved" : "user.rejected",
      target.email,
    );
    return transition.to;
  });
}
