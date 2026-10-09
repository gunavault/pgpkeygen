import { parseVaultEnvelopeInput } from "./escrow-record.ts";
import { sha256Hex } from "./secret-hash.ts";
import type { VaultEnvelope } from "./vault-escrow.ts";

export type RecoveryProvisionAccount = {
  email: string;
  passwordHash: string;
  vaultEnvelope: VaultEnvelope | null;
  recoveryEnvelope: VaultEnvelope | null;
};

export type RecoveryProvisionTransaction = {
  loadAccountForUpdate: (userId: string) => Promise<RecoveryProvisionAccount | null>;
  saveRecovery: (
    userId: string,
    values: { envelope: VaultEnvelope; verifierHash: string; at: Date },
  ) => Promise<void>;
  audit: (email: string, details: string) => Promise<void>;
};

export type RecoveryProvisionEnvironment = {
  transaction: <T>(callback: (tx: RecoveryProvisionTransaction) => Promise<T>) => Promise<T>;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  now: () => Date;
};

export class RecoveryProvisionError extends Error {
  readonly reason: "current-password" | "no-vault" | "invalid";

  constructor(reason: "current-password" | "no-vault" | "invalid") {
    super(reason);
    this.reason = reason;
  }
}

/**
 * Stores a recovery-code envelope the browser built from the unlocked vault
 * key. Like a password change, the server cannot open the envelope; it checks
 * the account password, the envelope's shape and fresh randomness, and keeps
 * only a hash of the code's verifier.
 */
export async function provisionAccountRecoveryCode(
  input: { userId: string; currentPassword: string; envelope: unknown; verifier: string },
  environment: RecoveryProvisionEnvironment,
): Promise<void> {
  let envelope: VaultEnvelope;
  try {
    envelope = parseVaultEnvelopeInput(input.envelope);
  } catch {
    throw new RecoveryProvisionError("invalid");
  }
  if (!input.userId || !/^[0-9a-f]{64}$/.test(input.verifier ?? "")) {
    throw new RecoveryProvisionError("invalid");
  }

  await environment.transaction(async (tx) => {
    const account = await tx.loadAccountForUpdate(input.userId);
    if (!account) throw new RecoveryProvisionError("invalid");
    if (!(await environment.verifyPassword(input.currentPassword ?? "", account.passwordHash))) {
      throw new RecoveryProvisionError("current-password");
    }
    if (!account.vaultEnvelope) throw new RecoveryProvisionError("no-vault");

    for (const previous of [account.vaultEnvelope, account.recoveryEnvelope]) {
      if (previous && (previous.salt === envelope.salt || previous.iv === envelope.iv)) {
        throw new RecoveryProvisionError("invalid");
      }
    }

    await tx.saveRecovery(input.userId, {
      envelope,
      verifierHash: sha256Hex(input.verifier),
      at: environment.now(),
    });
    await tx.audit(account.email, account.recoveryEnvelope ? "replaced the previous code" : "first code");
  });
}
