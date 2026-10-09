import { parseEscrowPayloadInput, parseVaultEnvelopeInput } from "./escrow-record.ts";
import type { EscrowPayload, VaultEnvelope } from "./vault-escrow.ts";

export type VaultEnvelopeRow = {
  vaultWrappedKey: string | null;
  vaultKdfSalt: string | null;
  vaultKdfIv: string | null;
  vaultKdfIterations: number | null;
  vaultWrapVersion: number | null;
};

export type EscrowPayloadRow = {
  escrowCiphertext: string | null;
  escrowIv: string | null;
  escrowVersion: number | null;
};

export function vaultEnvelopeColumns(input: unknown): VaultEnvelopeRow {
  const envelope = parseVaultEnvelopeInput(input);
  return {
    vaultWrappedKey: envelope.ciphertext,
    vaultKdfSalt: envelope.salt,
    vaultKdfIv: envelope.iv,
    vaultKdfIterations: envelope.iterations,
    vaultWrapVersion: envelope.version,
  };
}

export function vaultEnvelopeFromRow(row: VaultEnvelopeRow): VaultEnvelope | null {
  const values = [
    row.vaultWrappedKey,
    row.vaultKdfSalt,
    row.vaultKdfIv,
    row.vaultKdfIterations,
    row.vaultWrapVersion,
  ];

  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) throw new Error("Incomplete vault envelope state");

  return parseVaultEnvelopeInput({
    version: row.vaultWrapVersion,
    kdf: "PBKDF2-SHA-256",
    iterations: row.vaultKdfIterations,
    salt: row.vaultKdfSalt,
    iv: row.vaultKdfIv,
    ciphertext: row.vaultWrappedKey,
  });
}

export function escrowColumns(input: unknown | null): EscrowPayloadRow {
  if (input === null || input === undefined) {
    return {
      escrowCiphertext: null,
      escrowIv: null,
      escrowVersion: null,
    };
  }

  const payload = parseEscrowPayloadInput(input);
  return {
    escrowCiphertext: payload.ciphertext,
    escrowIv: payload.iv,
    escrowVersion: payload.version,
  };
}

export function escrowPayloadFromRow(row: EscrowPayloadRow): EscrowPayload | null {
  const values = [row.escrowCiphertext, row.escrowIv, row.escrowVersion];
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) throw new Error("Incomplete escrow payload state");

  return parseEscrowPayloadInput({
    version: row.escrowVersion,
    iv: row.escrowIv,
    ciphertext: row.escrowCiphertext,
  });
}

export type RecoveryEnvelopeRow = {
  recoveryWrappedKey: string | null;
  recoveryKdfSalt: string | null;
  recoveryKdfIv: string | null;
  recoveryKdfIterations: number | null;
  recoveryWrapVersion: number | null;
};

/** The recovery-code envelope uses the vault envelope's format and parser. */
export function recoveryEnvelopeColumns(input: unknown): RecoveryEnvelopeRow {
  const row = vaultEnvelopeColumns(input);
  return {
    recoveryWrappedKey: row.vaultWrappedKey,
    recoveryKdfSalt: row.vaultKdfSalt,
    recoveryKdfIv: row.vaultKdfIv,
    recoveryKdfIterations: row.vaultKdfIterations,
    recoveryWrapVersion: row.vaultWrapVersion,
  };
}

export function recoveryEnvelopeFromRow(row: RecoveryEnvelopeRow): VaultEnvelope | null {
  return vaultEnvelopeFromRow({
    vaultWrappedKey: row.recoveryWrappedKey,
    vaultKdfSalt: row.recoveryKdfSalt,
    vaultKdfIv: row.recoveryKdfIv,
    vaultKdfIterations: row.recoveryKdfIterations,
    vaultWrapVersion: row.recoveryWrapVersion,
  });
}

export const NO_RECOVERY_CODE = {
  recoveryWrappedKey: null,
  recoveryKdfSalt: null,
  recoveryKdfIv: null,
  recoveryKdfIterations: null,
  recoveryWrapVersion: null,
  recoveryVerifierHash: null,
  recoveryCreatedAt: null,
} as const;

export const NO_VAULT = {
  vaultWrappedKey: null,
  vaultKdfSalt: null,
  vaultKdfIv: null,
  vaultKdfIterations: null,
  vaultWrapVersion: null,
} as const;
