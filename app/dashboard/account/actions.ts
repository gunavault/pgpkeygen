"use server";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { logAudit, type AuditWriter } from "@/lib/audit";
import { db } from "@/lib/db";
import { auditLog, pgpKeys, users } from "@/lib/db/schema";
import { escrowPayloadFromRow, vaultEnvelopeColumns, vaultEnvelopeFromRow } from "@/lib/escrow-storage";
import {
  handlePasswordChangeRequest,
  type ChangePasswordResult,
  type PasswordChangeRequestEnvironment,
} from "@/lib/password-change-request";
export type { ChangePasswordResult };
import { hashPassword, verifyPassword } from "@/lib/password";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import type { EscrowVerificationSample } from "@/lib/vault-rotation";
import type { VaultEnvelope } from "@/lib/vault-escrow";

const envelopeProjection = {
  vaultWrappedKey: users.vaultWrappedKey,
  vaultKdfSalt: users.vaultKdfSalt,
  vaultKdfIv: users.vaultKdfIv,
  vaultKdfIterations: users.vaultKdfIterations,
  vaultWrapVersion: users.vaultWrapVersion,
};

export type PasswordChangeContext = {
  envelope: VaultEnvelope | null;
  sample: EscrowVerificationSample | null;
};

export async function getPasswordChangeContext(): Promise<PasswordChangeContext> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [user] = await db.select(envelopeProjection).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) throw new Error("Account not found");
  const envelope = vaultEnvelopeFromRow(user);
  if (!envelope) return { envelope: null, sample: null };

  const [key] = await db
    .select({ title: pgpKeys.title, fingerprint: pgpKeys.fingerprint, escrowCiphertext: pgpKeys.escrowCiphertext, escrowIv: pgpKeys.escrowIv, escrowVersion: pgpKeys.escrowVersion })
    .from(pgpKeys)
    .where(and(eq(pgpKeys.userId, session.user.id), isNotNull(pgpKeys.escrowVersion)))
    .orderBy(desc(pgpKeys.createdAt))
    .limit(1);

  if (!key) return { envelope, sample: null };
  const payload = escrowPayloadFromRow(key);
  if (!payload) throw new Error("Recovery sample unavailable");

  await logAudit(session.user.email!, "recovery.accessed", key.title, `fingerprint: ${key.fingerprint}`);
  return { envelope, sample: { payload, context: { userId: session.user.id, fingerprint: key.fingerprint } } };
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  newEnvelope: unknown | null;
}): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new Error("Unauthorized");

  const ip = await getClientIp();

  const environment: PasswordChangeRequestEnvironment = {
    verifyPassword,
    hashPassword,
    isRateLimited,
    async auditPasswordChangeFailed(email) {
      await logAudit(email, "password.change_failed");
    },
    transaction: (callback) => db.transaction(async (tx) => {
      const transactionAuditWriter: AuditWriter = {
        async write(entry) {
          await tx.insert(auditLog).values(entry);
        },
      };
      return callback({
        async loadAccountForUpdate(userId) {
          await tx.execute(
            sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`,
          );
          const [row] = await tx
            .select({
              email: users.email,
              passwordHash: users.passwordHash,
              ...envelopeProjection,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (!row) return null;
          return {
            email: row.email,
            passwordHash: row.passwordHash,
            envelope: vaultEnvelopeFromRow(row),
          };
        },
        async updateCredentials(userId, passwordHash, envelope) {
          if (envelope) {
            await tx
              .update(users)
              .set({ passwordHash, ...vaultEnvelopeColumns(envelope) })
              .where(eq(users.id, userId));
            return;
          }
          await tx
            .update(users)
            .set({ passwordHash })
            .where(eq(users.id, userId));
        },
        async auditPasswordChanged(email) {
          await logAudit(
            email,
            "password.changed",
            undefined,
            undefined,
            transactionAuditWriter,
          );
        },
      });
    }),
  };

  return handlePasswordChangeRequest(
    {
      userId: session.user.id,
      actorEmail: session.user.email,
      sourceIp: ip,
    },
    input,
    environment,
  );
}
