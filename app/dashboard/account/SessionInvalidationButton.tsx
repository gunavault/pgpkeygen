"use client";

import { useState } from "react";
import { useVault } from "@/app/VaultProvider";
import { logout } from "../actions";
import { invalidateAllSessions } from "./actions";

export function SessionInvalidationButton() {
  const { clearVaultKey } = useVault();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleInvalidate() {
    if (!confirm("Sign out every existing session, including this one?")) return;
    setBusy(true);
    setError(null);
    try {
      await invalidateAllSessions();
      clearVaultKey();
      await logout();
    } catch {
      setError("Unable to invalidate sessions.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={busy}
        onClick={handleInvalidate}
      >
        {busy ? "Signing out…" : "Sign out everywhere"}
      </button>
      {error && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
