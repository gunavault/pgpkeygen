"use client";

import { useState, useTransition } from "react";
import { CopyButton } from "../../CopyButton";
import { allowPasswordReset } from "./actions";

/**
 * Admin control for a forgotten password. A recovery reset keeps the user's
 * stored passphrase copies but needs their recovery code; a forced reset
 * works without it and removes those copies.
 */
export function AllowResetButton({
  userId,
  email,
  hasRecoveryCode,
}: {
  userId: string;
  email: string;
  hasRecoveryCode: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ token: string; mode: string; expiresAt: string } | null>(null);

  function issue(mode: "recovery" | "forced") {
    if (
      mode === "forced" &&
      !window.confirm(
        `Forced reset for ${email}?\n\nThe user gets a new password but loses every stored passphrase copy in their recovery vault. Their PGP keys are kept. This cannot be undone.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await allowPasswordReset(userId, mode);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setIssued({ token: result.token, mode, expiresAt: result.expiresAt });
    });
  }

  if (issued) {
    return (
      <div className="flex flex-col items-end gap-1 text-xs max-w-xs" data-testid="reset-token-panel">
        <span className="text-muted">
          {issued.mode === "recovery" ? "Recovery reset" : "Forced reset"} token for {email}, valid 60 minutes, shown once:
        </span>
        <span className="mono text-[13px]" data-testid="reset-token">{issued.token}</span>
        <div className="flex items-center gap-2">
          <CopyButton text={issued.token} />
          <button type="button" className="lnk" onClick={() => { setIssued(null); setOpen(false); }}>Close</button>
        </div>
        <span className="text-muted">Give it to the user over a channel you trust. They open “Forgot password?” on the sign-in page.</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="lnk text-xs" onClick={() => setOpen(true)}>
        Allow reset
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending || !hasRecoveryCode}
          title={hasRecoveryCode ? "" : "This user has no recovery code"}
          onClick={() => issue("recovery")}
        >
          With recovery code
        </button>
        <button type="button" className="btn btn-secondary" disabled={pending} onClick={() => issue("forced")}>
          Forced reset
        </button>
        <button type="button" className="lnk" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {!hasRecoveryCode && <span className="text-muted">No recovery code: only a forced reset is possible.</span>}
      {error && <span style={{ color: "var(--color-accent-700)" }}>{error}</span>}
    </div>
  );
}
