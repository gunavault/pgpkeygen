"use client";

import { useState, useTransition } from "react";
import { approveUser, rejectUser, type ApprovalResult } from "./actions";

export function UserApprovalButtons({
  userId,
  email,
  status,
}: {
  userId: string;
  email: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ApprovalResult>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  }

  const canApprove = status === "pending" || status === "rejected";
  const canReject = status === "pending";
  if (!canApprove && !canReject) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {canApprove && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(() => approveUser(userId))}
          >
            Approve
          </button>
        )}
        {canReject && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Reject ${email}? They will not be able to sign in.`)) {
                run(() => rejectUser(userId));
              }
            }}
          >
            Reject
          </button>
        )}
      </div>
      {error && (
        <span className="text-xs" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
