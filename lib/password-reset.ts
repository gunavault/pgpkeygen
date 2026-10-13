import { normalizeGroupedSecret } from "./recovery-code.ts";
import { parseVaultEnvelopeInput } from "./escrow-record.ts";
import { sameDigest, sha256Hex } from "./secret-hash.ts";
import type { VaultEnvelope } from "./vault-escrow.ts";

export type ResetMode = "recovery" | "forced";

export const RESET_TTL_MS = 60 * 60 * 1000;
export const MAX_RESET_ATTEMPTS = 5;
const VERIFIER_PATTERN = /^[0-9a-f]{64}$/;

/** Messages are safe to show: they never say which check failed. */
export class PasswordResetError extends Error {}

export const INVALID_RESET =
  "This reset is invalid or has expired. Ask your administrator for a new one.";

// ---------------------------------------------------------------------------
// Issuing (administrator)

export type ResetTarget = {
  id: string;
  email: string;
  role: string;
  status: string;
  hasRecoveryCode: boolean;
};

export type IssueResetTransaction = {
  findUserForUpdate: (userId: string) => Promise<ResetTarget | null>;
  /** Replaces any earlier reset for the same account. */
  saveReset: (row: {
    userId: string;
    tokenHash: string;
    mode: ResetMode;
    issuedBy: string;
    expiresAt: Date;
  }) => Promise<void>;
  audit: (actorEmail: string, target: string, details: string) => Promise<void>;
};

export type IssueResetEnvironment = {
  transaction: <T>(callback: (tx: IssueResetTransaction) => Promise<T>) => Promise<T>;
  now: () => Date;
  generateToken: () => string;
};

export async function issuePasswordReset(
  input: { actorId: string; targetUserId: string; mode: ResetMode },
  environment: IssueResetEnvironment,
): Promise<{ token: string; expiresAt: Date }> {
  if (input.mode !== "recovery" && input.mode !== "forced") {
    throw new PasswordResetError("Choose a reset type.");
  }
  if (!input.actorId || !input.targetUserId) throw new PasswordResetError("Invalid reset request.");
  if (input.actorId === input.targetUserId) {
    throw new PasswordResetError("Administrators cannot reset their own password here. Use Account → Change password.");
  }

  return environment.transaction(async (tx) => {
    const actor = await tx.findUserForUpdate(input.actorId);
    if (!actor || actor.role !== "admin" || actor.status !== "active") {
      throw new PasswordResetError("Only an active administrator can allow a password reset.");
    }
    const target = await tx.findUserForUpdate(input.targetUserId);
    if (!target) throw new PasswordResetError("Account not found.");
    if (target.status !== "active") {
      throw new PasswordResetError("Only active accounts can be reset. Approve the account first.");
    }
    if (input.mode === "recovery" && !target.hasRecoveryCode) {
      throw new PasswordResetError(
        "This user has no recovery code. Use a forced reset; their stored passphrase copies will be removed.",
      );
    }

    const token = environment.generateToken();
    const expiresAt = new Date(environment.now().getTime() + RESET_TTL_MS);
    await tx.saveReset({
      userId: target.id,
      tokenHash: sha256Hex(normalizeGroupedSecret(token)!),
      mode: input.mode,
      issuedBy: actor.email,
      expiresAt,
    });
    await tx.audit(actor.email, target.email, `mode ${input.mode}, valid 60 minutes`);
    return { token, expiresAt };
  });
}

// ---------------------------------------------------------------------------
// Redeeming (the user, not signed in)

export type PendingReset = {
  id: string;
  tokenHash: string;
  mode: string;
  issuedBy: string;
  expiresAt: Date;
  attempts: number;
};

export type ResetAccount = {
  id: string;
  email: string;
  status: string;
  vaultEnvelope: VaultEnvelope | null;
  recoveryEnvelope: VaultEnvelope | null;
  recoveryVerifierHash: string | null;
};

export type RedeemResetTransaction = {
  findResetForUpdate: (email: string) => Promise<{ reset: PendingReset; account: ResetAccount } | null>;
  recordFailure: (resetId: string, attempts: number) => Promise<void>;
  deleteReset: (resetId: string) => Promise<void>;
  completeRecovery: (
    userId: string,
    values: {
      passwordHash: string;
      vaultEnvelope: VaultEnvelope;
      recoveryEnvelope: VaultEnvelope;
      recoveryVerifierHash: string;
      at: Date;
    },
  ) => Promise<void>;
  /** Clears the vault, the recovery code and every escrow record; returns how many escrow records were removed. */
  completeForced: (userId: string, values: { passwordHash: string; at: Date }) => Promise<number>;
  audit: (
    email: string,
    action: "password.reset" | "password.reset_forced" | "password.reset_failed",
    details: string,
  ) => Promise<void>;
};

export type RedeemResetEnvironment = {
  transaction: <T>(callback: (tx: RedeemResetTransaction) => Promise<T>) => Promise<T>;
  now: () => Date;
  hashPassword: (password: string) => Promise<string>;
};

type Outcome<T> = { ok: true; value: T } | { ok: false };

// Failures must be committed (attempt counts, deleting a spent reset), so the
// checks return an outcome instead of throwing inside the transaction.
async function checkReset(
  tx: RedeemResetTransaction,
  email: string,
  token: string,
  mode: ResetMode | "any",
  now: Date,
): Promise<{ reset: PendingReset; account: ResetAccount } | null> {
  const normalizedToken = normalizeGroupedSecret(token);
  if (!normalizedToken || !email) return null;

  const found = await tx.findResetForUpdate(email);
  if (!found) return null;
  const { reset, account } = found;

  if (reset.expiresAt.getTime() <= now.getTime() || reset.attempts >= MAX_RESET_ATTEMPTS) {
    await tx.deleteReset(reset.id);
    return null;
  }
  if (!sameDigest(sha256Hex(normalizedToken), reset.tokenHash)) {
    await failAttempt(tx, found, "wrong reset token");
    return null;
  }
  if ((mode !== "any" && reset.mode !== mode) || account.status !== "active") return null;
  return found;
}

async function failAttempt(
  tx: RedeemResetTransaction,
  found: { reset: PendingReset; account: ResetAccount },
  reason: string,
) {
  const attempts = found.reset.attempts + 1;
  if (attempts >= MAX_RESET_ATTEMPTS) {
    await tx.deleteReset(found.reset.id);
  } else {
    await tx.recordFailure(found.reset.id, attempts);
  }
  await tx.audit(found.account.email, "password.reset_failed", `${reason}; attempt ${attempts} of ${MAX_RESET_ATTEMPTS}`);
}

/** Step 1: the user proves they hold a valid token; recovery resets get the envelope to open. */
export async function beginPasswordReset(
  input: { email: string; token: string },
  environment: RedeemResetEnvironment,
): Promise<{ mode: ResetMode; recoveryEnvelope: VaultEnvelope | null }> {
  const outcome = await environment.transaction(async (tx): Promise<Outcome<{ mode: ResetMode; recoveryEnvelope: VaultEnvelope | null }>> => {
    const found = await checkReset(tx, input.email, input.token, "any", environment.now());
    if (!found) return { ok: false };
    if (found.reset.mode === "forced") return { ok: true, value: { mode: "forced", recoveryEnvelope: null } };
    if (found.reset.mode !== "recovery" || !found.account.recoveryEnvelope) return { ok: false };
    return { ok: true, value: { mode: "recovery", recoveryEnvelope: found.account.recoveryEnvelope } };
  });
  if (!outcome.ok) throw new PasswordResetError(INVALID_RESET);
  return outcome.value;
}

function assertNewPassword(password: string) {
  if (typeof password !== "string" || password.length < 8) {
    throw new PasswordResetError("Use a new password with at least 8 characters.");
  }
}

function freshAgainst(candidate: VaultEnvelope, previous: (VaultEnvelope | null)[]) {
  return previous.every((old) => !old || (old.salt !== candidate.salt && old.iv !== candidate.iv));
}

/** Step 2a: the recovery code opened the vault in the browser; store the re-wrapped envelopes. */
export async function completeRecoveryReset(
  input: {
    email: string;
    token: string;
    verifier: string;
    newPassword: string;
    vaultEnvelope: unknown;
    recoveryEnvelope: unknown;
    recoveryVerifier: string;
  },
  environment: RedeemResetEnvironment,
): Promise<void> {
  assertNewPassword(input.newPassword);
  let vaultEnvelope: VaultEnvelope;
  let recoveryEnvelope: VaultEnvelope;
  try {
    vaultEnvelope = parseVaultEnvelopeInput(input.vaultEnvelope);
    recoveryEnvelope = parseVaultEnvelopeInput(input.recoveryEnvelope);
  } catch {
    throw new PasswordResetError(INVALID_RESET);
  }
  if (
    !VERIFIER_PATTERN.test(input.verifier ?? "") ||
    !VERIFIER_PATTERN.test(input.recoveryVerifier ?? "") ||
    input.verifier === input.recoveryVerifier ||
    vaultEnvelope.salt === recoveryEnvelope.salt ||
    vaultEnvelope.iv === recoveryEnvelope.iv
  ) {
    throw new PasswordResetError(INVALID_RESET);
  }
  const passwordHash = await environment.hashPassword(input.newPassword);

  const outcome = await environment.transaction(async (tx): Promise<Outcome<null>> => {
    const now = environment.now();
    const found = await checkReset(tx, input.email, input.token, "recovery", now);
    if (!found) return { ok: false };
    const { reset, account } = found;

    if (!account.recoveryVerifierHash || !sameDigest(sha256Hex(input.verifier), account.recoveryVerifierHash)) {
      await failAttempt(tx, found, "wrong recovery code");
      return { ok: false };
    }
    const previous = [account.vaultEnvelope, account.recoveryEnvelope];
    if (!freshAgainst(vaultEnvelope, previous) || !freshAgainst(recoveryEnvelope, previous)) {
      return { ok: false };
    }

    await tx.completeRecovery(account.id, {
      passwordHash,
      vaultEnvelope,
      recoveryEnvelope,
      recoveryVerifierHash: sha256Hex(input.recoveryVerifier),
      at: now,
    });
    await tx.deleteReset(reset.id);
    await tx.audit(account.email, "password.reset", `with recovery code; allowed by ${reset.issuedBy}; new recovery code issued; all sessions signed out`);
    return { ok: true, value: null };
  });
  if (!outcome.ok) throw new PasswordResetError(INVALID_RESET);
}

/** Step 2b: no recovery code; the account gets a new password and loses its stored passphrase copies. */
export async function completeForcedReset(
  input: { email: string; token: string; newPassword: string },
  environment: RedeemResetEnvironment,
): Promise<{ removedRecoveryCopies: number }> {
  assertNewPassword(input.newPassword);
  const passwordHash = await environment.hashPassword(input.newPassword);

  const outcome = await environment.transaction(async (tx): Promise<Outcome<number>> => {
    const now = environment.now();
    const found = await checkReset(tx, input.email, input.token, "forced", now);
    if (!found) return { ok: false };
    const removed = await tx.completeForced(found.account.id, { passwordHash, at: now });
    await tx.deleteReset(found.reset.id);
    await tx.audit(
      found.account.email,
      "password.reset_forced",
      `without recovery code; allowed by ${found.reset.issuedBy}; ${removed} stored passphrase copies removed; all sessions signed out`,
    );
    return { ok: true, value: removed };
  });
  if (!outcome.ok) throw new PasswordResetError(INVALID_RESET);
  return { removedRecoveryCopies: outcome.value };
}
