"use server";

import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, passwordResets, pgpKeys, users } from "@/lib/db/schema";
import {
  NO_RECOVERY_CODE,
  NO_VAULT,
  recoveryEnvelopeColumns,
  recoveryEnvelopeFromRow,
  vaultEnvelopeColumns,
  vaultEnvelopeFromRow,
} from "@/lib/escrow-storage";
import { normalizeEmail } from "@/lib/identity";
import { hashPassword } from "@/lib/password";
import {
  beginPasswordReset,
  completeForcedReset,
  completeRecoveryReset,
  INVALID_RESET,
  PasswordResetError,
  type RedeemResetEnvironment,
  type ResetMode,
} from "@/lib/password-reset";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import type { VaultEnvelope } from "@/lib/vault-escrow";

const WINDOW_MS = 15 * 60 * 1000;

const environment: RedeemResetEnvironment = {
  now: () => new Date(),
  hashPassword,
  transaction: (callback) =>
    db.transaction((tx) =>
      callback({
        async findResetForUpdate(email) {
          const [account] = await tx
            .select({
              id: users.id,
              email: users.email,
              status: users.status,
              vaultWrappedKey: users.vaultWrappedKey,
              vaultKdfSalt: users.vaultKdfSalt,
              vaultKdfIv: users.vaultKdfIv,
              vaultKdfIterations: users.vaultKdfIterations,
              vaultWrapVersion: users.vaultWrapVersion,
              recoveryWrappedKey: users.recoveryWrappedKey,
              recoveryKdfSalt: users.recoveryKdfSalt,
              recoveryKdfIv: users.recoveryKdfIv,
              recoveryKdfIterations: users.recoveryKdfIterations,
              recoveryWrapVersion: users.recoveryWrapVersion,
              recoveryVerifierHash: users.recoveryVerifierHash,
            })
            .from(users)
            .where(eq(users.email, email))
            .for("update")
            .limit(1);
          if (!account) return null;
          const [reset] = await tx
            .select()
            .from(passwordResets)
            .where(eq(passwordResets.userId, account.id))
            .for("update")
            .limit(1);
          if (!reset) return null;
          return {
            reset: {
              id: reset.id,
              tokenHash: reset.tokenHash,
              mode: reset.mode,
              issuedBy: reset.issuedBy,
              expiresAt: reset.expiresAt,
              attempts: reset.attempts,
            },
            account: {
              id: account.id,
              email: account.email,
              status: account.status,
              vaultEnvelope: vaultEnvelopeFromRow(account),
              recoveryEnvelope: recoveryEnvelopeFromRow(account),
              recoveryVerifierHash: account.recoveryVerifierHash,
            },
          };
        },
        async recordFailure(resetId, attempts) {
          await tx.update(passwordResets).set({ attempts }).where(eq(passwordResets.id, resetId));
        },
        async deleteReset(resetId) {
          await tx.delete(passwordResets).where(eq(passwordResets.id, resetId));
        },
        async completeRecovery(userId, values) {
          await tx
            .update(users)
            .set({
              passwordHash: values.passwordHash,
              ...vaultEnvelopeColumns(values.vaultEnvelope),
              ...recoveryEnvelopeColumns(values.recoveryEnvelope),
              recoveryVerifierHash: values.recoveryVerifierHash,
              recoveryCreatedAt: values.at,
              sessionsValidAfter: values.at,
            })
            .where(eq(users.id, userId));
        },
        async completeForced(userId, values) {
          await tx
            .update(users)
            .set({ passwordHash: values.passwordHash, ...NO_VAULT, ...NO_RECOVERY_CODE, sessionsValidAfter: values.at })
            .where(eq(users.id, userId));
          const removed = await tx
            .update(pgpKeys)
            .set({ escrowCiphertext: null, escrowIv: null, escrowVersion: null })
            .where(and(eq(pgpKeys.userId, userId), isNotNull(pgpKeys.escrowVersion)))
            .returning({ id: pgpKeys.id });
          return removed.length;
        },
        async audit(email, action, details) {
          await tx.insert(auditLog).values({ actorEmail: email, action, details });
        },
      }),
    ),
};

async function limited(email: string | null): Promise<boolean> {
  const ip = await getClientIp();
  return (
    (email !== null && isRateLimited(`password-reset:account:${email}`, 10, WINDOW_MS)) ||
    (ip !== null && isRateLimited(`password-reset:source:${ip}`, 30, WINDOW_MS))
  );
}

export type ResetResult<T> = ({ ok: true } & T) | { ok: false; error: string };
const TOO_MANY = "Too many attempts. Please wait a few minutes.";

async function run<T>(email: string | null, action: () => Promise<T>): Promise<ResetResult<T>> {
  if (await limited(email)) return { ok: false, error: TOO_MANY };
  if (!email) return { ok: false, error: INVALID_RESET };
  try {
    return { ok: true, ...(await action()) };
  } catch (error) {
    if (error instanceof PasswordResetError) return { ok: false, error: error.message };
    console.error("password reset failed");
    return { ok: false, error: "Something went wrong. Nothing was changed." };
  }
}

export async function startReset(input: { email: string; token: string }) {
  const email = normalizeEmail(input.email);
  return run<{ mode: ResetMode; recoveryEnvelope: VaultEnvelope | null }>(email, () =>
    beginPasswordReset({ email: email!, token: input.token }, environment),
  );
}

export async function finishRecoveryReset(input: {
  email: string;
  token: string;
  verifier: string;
  newPassword: string;
  vaultEnvelope: unknown;
  recoveryEnvelope: unknown;
  recoveryVerifier: string;
}) {
  const email = normalizeEmail(input.email);
  return run<Record<string, never>>(email, async () => {
    await completeRecoveryReset({ ...input, email: email! }, environment);
    return {};
  });
}

export async function finishForcedReset(input: { email: string; token: string; newPassword: string }) {
  const email = normalizeEmail(input.email);
  return run<{ removedRecoveryCopies: number }>(email, () =>
    completeForcedReset({ ...input, email: email! }, environment),
  );
}
