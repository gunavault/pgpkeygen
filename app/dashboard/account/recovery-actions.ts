"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { logAudit, type AuditWriter } from "@/lib/audit";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { recoveryEnvelopeColumns, recoveryEnvelopeFromRow, vaultEnvelopeFromRow } from "@/lib/escrow-storage";
import { verifyPassword } from "@/lib/password";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import {
  provisionAccountRecoveryCode,
  RecoveryProvisionError,
  type RecoveryProvisionEnvironment,
} from "@/lib/recovery-code-provision";
import { getPasswordChangeContext, type PasswordChangeContext } from "./actions";

const WINDOW_MS = 15 * 60 * 1000;

const recoveryProjection = {
  recoveryWrappedKey: users.recoveryWrappedKey,
  recoveryKdfSalt: users.recoveryKdfSalt,
  recoveryKdfIv: users.recoveryKdfIv,
  recoveryKdfIterations: users.recoveryKdfIterations,
  recoveryWrapVersion: users.recoveryWrapVersion,
};

/** The vault envelope and an escrow sample, to unlock and verify in the browser. */
export async function getRecoveryCodeContext(): Promise<PasswordChangeContext> {
  return getPasswordChangeContext();
}

export type CreateRecoveryCodeResult =
  | { ok: true }
  | { ok: false; error: "current-password" | "no-vault" | "ratelimited" | "server" };

export async function saveRecoveryCode(input: {
  currentPassword: string;
  envelope: unknown;
  verifier: string;
}): Promise<CreateRecoveryCodeResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const ip = await getClientIp();
  if (
    isRateLimited(`recovery-code:account:${userId}`, 5, WINDOW_MS) ||
    (ip && isRateLimited(`recovery-code:source:${ip}`, 30, WINDOW_MS))
  ) {
    return { ok: false, error: "ratelimited" };
  }

  const environment: RecoveryProvisionEnvironment = {
    verifyPassword,
    now: () => new Date(),
    transaction: (callback) =>
      db.transaction(async (tx) => {
        const writer: AuditWriter = { write: async (entry) => void (await tx.insert(auditLog).values(entry)) };
        return callback({
          async loadAccountForUpdate(id) {
            await tx.execute(sql`select ${users.id} from ${users} where ${users.id} = ${id} for update`);
            const [row] = await tx
              .select({
                email: users.email,
                passwordHash: users.passwordHash,
                vaultWrappedKey: users.vaultWrappedKey,
                vaultKdfSalt: users.vaultKdfSalt,
                vaultKdfIv: users.vaultKdfIv,
                vaultKdfIterations: users.vaultKdfIterations,
                vaultWrapVersion: users.vaultWrapVersion,
                ...recoveryProjection,
              })
              .from(users)
              .where(eq(users.id, id))
              .limit(1);
            if (!row) return null;
            return {
              email: row.email,
              passwordHash: row.passwordHash,
              vaultEnvelope: vaultEnvelopeFromRow(row),
              recoveryEnvelope: recoveryEnvelopeFromRow(row),
            };
          },
          async saveRecovery(id, values) {
            await tx
              .update(users)
              .set({
                ...recoveryEnvelopeColumns(values.envelope),
                recoveryVerifierHash: values.verifierHash,
                recoveryCreatedAt: values.at,
              })
              .where(eq(users.id, id));
          },
          async audit(email, details) {
            await logAudit(email, "recovery_code.created", undefined, details, writer);
          },
        });
      }),
  };

  try {
    await provisionAccountRecoveryCode({ userId, ...input }, environment);
  } catch (error) {
    if (error instanceof RecoveryProvisionError) {
      return { ok: false, error: error.reason === "invalid" ? "server" : error.reason };
    }
    console.error("recovery code: save failed");
    return { ok: false, error: "server" };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/account");
  return { ok: true };
}
