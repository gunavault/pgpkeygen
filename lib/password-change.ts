import type { VaultEnvelope } from "./vault-escrow.ts";

export type PasswordChangeAccount = {
  email: string;
  passwordHash: string;
  envelope: VaultEnvelope | null;
};

export type PasswordChangeTransaction = {
  loadAccountForUpdate: (userId: string) => Promise<PasswordChangeAccount | null>;
  updateCredentials: (
    userId: string,
    passwordHash: string,
    envelope: VaultEnvelope | null,
  ) => Promise<void>;
  invalidateSessions: (userId: string) => Promise<void>;
  auditPasswordChanged: (email: string) => Promise<void>;
  auditSessionsInvalidated: (email: string) => Promise<void>;
};

export type PasswordChangeEnvironment = {
  transaction: <T>(
    callback: (tx: PasswordChangeTransaction) => Promise<T>,
  ) => Promise<T>;
  verifyPassword: (password: string, passwordHash: string) => Promise<boolean>;
  hashPassword: (password: string) => Promise<string>;
};

export type PasswordChangeInput = {
  userId: string;
  currentPassword: string;
  newPassword: string;
  newEnvelope: VaultEnvelope | null;
};

export async function performPasswordChange(
  input: PasswordChangeInput,
  environment: PasswordChangeEnvironment,
): Promise<void> {
  if (!input.userId || !input.currentPassword || input.newPassword.length < 8) {
    throw new Error("Invalid password change request");
  }

  await environment.transaction(async (tx) => {
    const account = await tx.loadAccountForUpdate(input.userId);
    if (!account) throw new Error("Account not found");

    const currentPasswordValid = await environment.verifyPassword(
      input.currentPassword,
      account.passwordHash,
    );
    if (!currentPasswordValid) {
      throw new Error("Current password is incorrect");
    }

    const storedEnvelope = account.envelope;
    const candidateEnvelope = input.newEnvelope;
    if ((storedEnvelope === null) !== (candidateEnvelope === null)) {
      throw new Error("Vault envelope state does not match account");
    }

    if (storedEnvelope && candidateEnvelope) {
      if (
        candidateEnvelope.salt === storedEnvelope.salt ||
        candidateEnvelope.iv === storedEnvelope.iv
      ) {
        throw new Error("Fresh vault envelope randomness is required");
      }
    }

    const newPasswordHash = await environment.hashPassword(input.newPassword);
    await tx.updateCredentials(input.userId, newPasswordHash, candidateEnvelope);
    await tx.invalidateSessions(input.userId);
    await tx.auditPasswordChanged(account.email);
    await tx.auditSessionsInvalidated(account.email);
  });
}
