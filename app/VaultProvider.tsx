"use client";

import { createContext, useCallback, useContext, useState } from "react";

type VaultContextValue = {
  vaultKey: Uint8Array | null;
  setVaultKey: (vaultKey: Uint8Array) => void;
  clearVaultKey: () => void;
};

const VaultContext = createContext<VaultContextValue | null>(null);

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const [vaultKey, setVaultKeyState] = useState<Uint8Array | null>(null);

  const setVaultKey = useCallback((nextVaultKey: Uint8Array) => {
    setVaultKeyState((previous) => {
      previous?.fill(0);
      return Uint8Array.from(nextVaultKey);
    });
  }, []);

  const clearVaultKey = useCallback(() => {
    setVaultKeyState((previous) => {
      previous?.fill(0);
      return null;
    });
  }, []);

  return (
    <VaultContext.Provider value={{ vaultKey, setVaultKey, clearVaultKey }}>
      {children}
    </VaultContext.Provider>
  );
}

export function useVault(): VaultContextValue {
  const value = useContext(VaultContext);
  if (!value) throw new Error("useVault must be used inside VaultProvider");
  return value;
}
