"use client";

import { useState, useTransition } from "react";
import { deleteKey, revokeKey } from "./actions";

export function KeyActions({
  keyId,
  isRevoked,
  canRevoke,
}: {
  keyId: string;
  isRevoked: boolean;
  canRevoke: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleRevoke() {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeKey(keyId);
      } catch {
        setError("Failed to revoke key.");
      }
    });
  }

  function handleDelete() {
    if (!confirm("Delete this key permanently? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteKey(keyId);
      } catch {
        setError("Failed to delete key.");
      }
    });
  }

  return (
    <div className="mt-4 flex items-center gap-4 text-xs" style={{ color: "var(--color-accent-700)" }}>
      {!isRevoked && canRevoke && (
        <button type="button" onClick={handleRevoke} disabled={pending} className="lnk disabled:opacity-50">
          Revoke
        </button>
      )}
      <button type="button" onClick={handleDelete} disabled={pending} className="lnk disabled:opacity-50">
        Delete
      </button>
      {error && <span style={{ color: "var(--color-accent-700)" }}>{error}</span>}
    </div>
  );
}
