import type { EscrowContext, EscrowPayload, VaultEnvelope } from "./vault-escrow.ts";

export type EscrowVerificationSample = {
  payload: EscrowPayload;
  context: EscrowContext;
};

export async function verifyVaultEnvelopeContinuity(
  expectedVaultKey: Uint8Array,
  newPassword: string,
  candidateEnvelope: VaultEnvelope,
  sample: EscrowVerificationSample | null,
): Promise<void> {
  void expectedVaultKey;
  void newPassword;
  void candidateEnvelope;
  void sample;
  throw new Error("Not implemented");
}

export async function prepareVerifiedVaultRewrap(
  currentPassword: string,
  newPassword: string,
  envelope: VaultEnvelope,
  sample: EscrowVerificationSample | null,
): Promise<VaultEnvelope> {
  void currentPassword;
  void newPassword;
  void envelope;
  void sample;
  throw new Error("Not implemented");
}
