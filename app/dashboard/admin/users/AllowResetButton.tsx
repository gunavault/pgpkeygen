"use client";

import { useEffect, useState, useTransition } from "react";
import { CopyButton } from "../../CopyButton";
import { SecretTag } from "@/app/SecretTag";
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

  const close = () => { setIssued(null); setOpen(false); setError(null); };

  useEffect(() => {
    if (!open && !issued) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { setIssued(null); setOpen(false); setError(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, issued]);

  const trigger = (
    <button type="button" className="lnk text-xs" onClick={() => setOpen(true)}>
      Allow reset
    </button>
  );

  if (!open && !issued) return trigger;

  return (
    <>
      {trigger}
      <div className="dialog-backdrop" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
        <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`reset-title-${userId}`}>
          {issued ? (
            <div className="flex flex-col gap-3" data-testid="reset-token-panel">
              <h3 id={`reset-title-${userId}`}>Reset token for {email}</h3>
              <div className="secret-panel">
                <SecretTag kind="token" />
                <p className="text-sm m-0">
                  {issued.mode === "recovery" ? "Recovery reset" : "Forced reset"}. Valid 60 minutes, works once,
                  shown only now:
                </p>
                <div className="secret-value" data-testid="reset-token">{issued.token}</div>
                <div className="flex items-center gap-3"><CopyButton text={issued.token} /></div>
              </div>
              <p className="text-sm m-0">
                Give it to the user over a channel you trust. They open <strong>“Forgot password?”</strong> on the
                sign-in page and enter it in step 1.
              </p>
              <p className="text-sm m-0" style={{ color: "var(--color-neutral-700)" }}>
                {issued.mode === "recovery"
                  ? "This is not their recovery code. In step 2 they also enter their own recovery code, which only they have. You cannot see it or send it to them."
                  : "They do not need a recovery code for this reset. Their stored passphrase copies will be removed; their PGP keys are kept."}
              </p>
              <button type="button" className="btn btn-secondary self-start" onClick={close}>Close</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h3 id={`reset-title-${userId}`}>Allow a password reset for {email}</h3>
              <p className="text-sm m-0" style={{ color: "var(--color-neutral-700)" }}>
                You get a one-time <strong>reset token</strong> to give to the user. Choose what happens to their
                stored passphrase copies:
              </p>
              <div className="choice">
                <button
                  type="button"
                  className="btn btn-primary self-start"
                  disabled={pending || !hasRecoveryCode}
                  onClick={() => issue("recovery")}
                >
                  With recovery code
                </button>
                <p>
                  {hasRecoveryCode
                    ? "Keeps their stored passphrase copies. After your reset token, they enter their own recovery code."
                    : "Not possible: this user has never created a recovery code."}
                </p>
              </div>
              <div className="choice">
                <button type="button" className="btn btn-secondary self-start" disabled={pending} onClick={() => issue("forced")}>
                  Forced reset
                </button>
                <p>No recovery code needed. Their stored passphrase copies are removed; their PGP keys are kept.</p>
              </div>
              {error && <p className="text-sm m-0" role="alert" style={{ color: "var(--color-accent-700)" }}>{error}</p>}
              <button type="button" className="lnk self-start" onClick={close}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
