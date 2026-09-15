"use client";

import { useVault } from "@/app/VaultProvider";
import { logout } from "./actions";

export function LogoutButton() {
  const { clearVaultKey } = useVault();

  async function signOutAction() {
    clearVaultKey();
    await logout();
  }

  return (
    <form action={signOutAction}>
      <button type="submit" className="btn btn-secondary btn-block">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m16 17 5-5-5-5" /><path d="M21 12H9" /><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        </svg>
        Sign out
      </button>
    </form>
  );
}
