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
    <div className="mt-3 flex items-center gap-3">
      {!isRevoked && canRevoke && (
        <button
          type="button"
          onClick={handleRevoke}
          disabled={pending}
          className="text-xs text-amber-600 underline disabled:opacity-50"
        >
          Revoke
        </button>
      )}
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="text-xs text-red-600 underline disabled:opacity-50"
      >
        Delete
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
