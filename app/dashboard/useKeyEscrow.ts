"use client";

import { useVault } from "@/app/VaultProvider";
import { getVaultContext } from "@/app/escrow/actions";
import { wrapEscrowSecret } from "@/lib/vault-escrow";

export function useKeyEscrow() {
  const { vaultKey } = useVault();

  async function createEscrow(secret: string, fingerprint: string) {
    if (!vaultKey) {
      throw new Error("Recovery vault is locked. Sign out and sign in again.");
    }

    const context = await getVaultContext();
    if (!context.envelope) {
      throw new Error("Recovery vault is not initialized. Sign out and sign in again.");
    }

    return wrapEscrowSecret(vaultKey, secret, {
      userId: context.userId,
      fingerprint,
    });
  }

  return {
    recoveryAvailable: vaultKey !== null,
    createEscrow,
  };
}
