"use server";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { logAudit, type AuditWriter } from "@/lib/audit";
import { db } from "@/lib/db";
import { auditLog, pgpKeys, users } from "@/lib/db/schema";
import { parseVaultEnvelopeInput } from "@/lib/escrow-record";
import { escrowPayloadFromRow, vaultEnvelopeColumns, vaultEnvelopeFromRow } from "@/lib/escrow-storage";
import { performPasswordChange, type PasswordChangeEnvironment } from "@/lib/password-change";
import { hashPassword, verifyPassword } from "@/lib/password";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import type { EscrowVerificationSample } from "@/lib/vault-rotation";
import type { VaultEnvelope } from "@/lib/vault-escrow";

const PASSWORD_CHANGE_ACCOUNT_LIMIT = 5;
const PASSWORD_CHANGE_SOURCE_LIMIT = 30;
const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

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

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "current-password" | "vault" | "ratelimited" | "server" };

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
  const actorEmail = session.user.email;

  const ip = await getClientIp();
  const accountLimited = isRateLimited(`password-change:account:${session.user.id}`, PASSWORD_CHANGE_ACCOUNT_LIMIT, PASSWORD_CHANGE_WINDOW_MS);
  const sourceLimited = ip ? isRateLimited(`password-change:source:${ip}`, PASSWORD_CHANGE_SOURCE_LIMIT, PASSWORD_CHANGE_WINDOW_MS) : false;
  if (accountLimited || sourceLimited) return { ok: false, error: "ratelimited" };

  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || newPassword.length < 8) {
    return { ok: false, error: "invalid" };
  }

  let newEnvelope: VaultEnvelope | null;
  try {
    newEnvelope = input.newEnvelope === null ? null : parseVaultEnvelopeInput(input.newEnvelope);
  } catch {
    return { ok: false, error: "vault" };
  }

  const environment: PasswordChangeEnvironment = {
    verifyPassword,
    hashPassword,
    transaction: (callback) => db.transaction(async (tx) => {
      const transactionAuditWriter: AuditWriter = { async write(entry) { await tx.insert(auditLog).values(entry); } };
      return callback({
        async loadAccountForUpdate(userId) {
          await tx.execute(sql`select ${users.id} from ${users} where ${users.id} = ${userId} for update`);
          const [row] = await tx.select({ email: users.email, passwordHash: users.passwordHash, ...envelopeProjection }).from(users).where(eq(users.id, userId)).limit(1);
          if (!row) return null;
          return { email: row.email, passwordHash: row.passwordHash, envelope: vaultEnvelopeFromRow(row) };
        },
        async updateCredentials(userId, passwordHash, envelope) {
          if (envelope) {
            await tx
              .update(users)
              .set({
                passwordHash,
                sessionsValidAfter: new Date(),
                ...vaultEnvelopeColumns(envelope),
              })
              .where(eq(users.id, userId));
            return;
          }
          await tx
            .update(users)
            .set({ passwordHash, sessionsValidAfter: new Date() })
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
          await logAudit(
            email,
            "session.invalidated",
            undefined,
            "reason: password change",
            transactionAuditWriter,
          );
        },
      });
    }),
  };

  try {
    await performPasswordChange({ userId: session.user.id, currentPassword, newPassword, newEnvelope }, environment);
    return { ok: true };
  } catch (error) {
    if (error instanceof Error) {
      if (/current password/i.test(error.message)) {
        try {
          await logAudit(actorEmail, "password.change_failed");
        } catch {
          console.error("password change failure audit failed");
        }
        return { ok: false, error: "current-password" };
      }
      if (/vault envelope|fresh vault envelope/i.test(error.message)) return { ok: false, error: "vault" };
    }
    console.error("password change failed");
    return { ok: false, error: "server" };
  }
}


export async function invalidateAllSessions(): Promise<void> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new Error("Unauthorized");
  const userId = session.user.id;
  const actorEmail = session.user.email;

  await db.transaction(async (tx) => {
    const transactionAuditWriter: AuditWriter = {
      async write(entry) {
        await tx.insert(auditLog).values(entry);
      },
    };

    await tx
      .update(users)
      .set({ sessionsValidAfter: new Date() })
      .where(eq(users.id, userId));

    await logAudit(
      actorEmail,
      "session.invalidated",
      undefined,
      "reason: user requested sign out everywhere",
      transactionAuditWriter,
    );
  });
}
