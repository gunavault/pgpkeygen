import {
  rewrapVaultEnvelope,
  unwrapEscrowSecret,
  unwrapVaultEnvelope,
} from "./vault-escrow.ts";
import type { EscrowContext, EscrowPayload, VaultEnvelope } from "./vault-escrow.ts";

export type EscrowVerificationSample = {
  payload: EscrowPayload;
  context: EscrowContext;
};

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}

export async function verifyVaultEnvelopeContinuity(
  expectedVaultKey: Uint8Array,
  newPassword: string,
  candidateEnvelope: VaultEnvelope,
  sample: EscrowVerificationSample | null,
): Promise<void> {
  let candidateVaultKey: Uint8Array | null = null;
  try {
    candidateVaultKey = await unwrapVaultEnvelope(newPassword, candidateEnvelope);
    if (!sameBytes(expectedVaultKey, candidateVaultKey)) {
      throw new Error("Vault continuity check failed");
    }

    if (sample) {
      await unwrapEscrowSecret(candidateVaultKey, sample.payload, sample.context);
    }
  } catch {
    throw new Error("Vault continuity check failed");
  } finally {
    candidateVaultKey?.fill(0);
  }
}

export async function prepareVerifiedVaultRewrap(
  currentPassword: string,
  newPassword: string,
  envelope: VaultEnvelope,
  sample: EscrowVerificationSample | null,
): Promise<VaultEnvelope> {
  const expectedVaultKey = await unwrapVaultEnvelope(currentPassword, envelope);
  try {
    const candidateEnvelope = await rewrapVaultEnvelope(
      currentPassword,
      newPassword,
      envelope,
    );
    await verifyVaultEnvelopeContinuity(
      expectedVaultKey,
      newPassword,
      candidateEnvelope,
      sample,
    );
    return candidateEnvelope;
  } finally {
    expectedVaultKey.fill(0);
  }
}
