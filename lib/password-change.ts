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
  auditPasswordChanged: (email: string) => Promise<void>;
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
  void input;
  void environment;
  throw new Error("Not implemented");
}
