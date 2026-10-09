"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecoveryCodeReveal } from "@/app/dashboard/account/RecoveryCodeReveal";
import { deriveRecoveryVerifier, provisionRecoveryCode, unwrapWithRecoveryCode } from "@/lib/recovery-code";
import { wrapVaultKey, type VaultEnvelope } from "@/lib/vault-escrow";
import { verifyVaultEnvelopeContinuity } from "@/lib/vault-rotation";
import { finishForcedReset, finishRecoveryReset, startReset } from "./actions";

type Step =
  | { kind: "token" }
  | { kind: "recovery"; email: string; token: string; envelope: VaultEnvelope }
  | { kind: "forced"; email: string; token: string }
  | { kind: "new-code"; code: string }
  | { kind: "done"; removed: number | null };

const errorStyle = { color: "var(--color-accent-700)" };

export function ResetPasswordForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "token" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function readPasswords(data: FormData): string | null {
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword.length < 8) { setError("Use a new password with at least 8 characters."); return null; }
    if (newPassword !== String(data.get("confirmPassword") ?? "")) { setError("The new password confirmation does not match."); return null; }
    return newPassword;
  }

  async function handleToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const token = String(data.get("token") ?? "");
    setError(null);
    setBusy(true);
    try {
      const result = await startReset({ email, token });
      if (!result.ok) { setError(result.error); return; }
      setStep(
        result.mode === "recovery" && result.recoveryEnvelope
          ? { kind: "recovery", email, token, envelope: result.recoveryEnvelope }
          : { kind: "forced", email, token },
      );
    } finally { setBusy(false); }
  }

  async function handleRecovery(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "recovery") return;
    const data = new FormData(event.currentTarget);
    setError(null);
    const newPassword = readPasswords(data);
    if (!newPassword) return;
    const code = String(data.get("recoveryCode") ?? "");

    setBusy(true);
    let vaultKey: Uint8Array | null = null;
    try {
      try {
        vaultKey = await unwrapWithRecoveryCode(code, step.envelope);
      } catch {
        setError("That recovery code does not open your vault. Check it and try again.");
        return;
      }
      // Everything secret happens here: the vault key is re-wrapped under the
      // new password and a new recovery code, and both are checked to open to
      // the same key before anything is sent.
      const vaultEnvelope = await wrapVaultKey(newPassword, vaultKey);
      await verifyVaultEnvelopeContinuity(vaultKey, newPassword, vaultEnvelope, null);
      const next = await provisionRecoveryCode(vaultKey, null);
      const result = await finishRecoveryReset({
        email: step.email,
        token: step.token,
        verifier: await deriveRecoveryVerifier(code),
        newPassword,
        vaultEnvelope,
        recoveryEnvelope: next.envelope,
        recoveryVerifier: next.verifier,
      });
      if (!result.ok) { setError(result.error); return; }
      setStep({ kind: "new-code", code: next.code });
    } catch {
      setError("The reset could not be completed. Nothing was changed.");
    } finally {
      vaultKey?.fill(0);
      setBusy(false);
    }
  }

  async function handleForced(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step.kind !== "forced") return;
    const data = new FormData(event.currentTarget);
    setError(null);
    const newPassword = readPasswords(data);
    if (!newPassword) return;
    setBusy(true);
    try {
      const result = await finishForcedReset({ email: step.email, token: step.token, newPassword });
      if (!result.ok) { setError(result.error); return; }
      setStep({ kind: "done", removed: result.removedRecoveryCopies });
    } finally { setBusy(false); }
  }

  const passwordFields = (
    <>
      <div className="field"><label htmlFor="reset-new">New password</label><input id="reset-new" name="newPassword" type="password" autoComplete="new-password" minLength={8} required className="input" /></div>
      <div className="field"><label htmlFor="reset-confirm">Confirm new password</label><input id="reset-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className="input" /></div>
    </>
  );

  if (step.kind === "new-code") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm m-0">Your password is reset and your stored passphrase copies are kept. Your old recovery code no longer works; this is your new one.</p>
        <RecoveryCodeReveal code={step.code} doneLabel="Go to sign in" onDone={() => router.push("/login")} />
      </div>
    );
  }

  if (step.kind === "done") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm m-0" data-testid="reset-done">
          Your password is reset. Your PGP keys are still in your vault
          {step.removed ? `, but ${step.removed} stored passphrase ${step.removed === 1 ? "copy was" : "copies were"} removed` : ""}.
          Sign in, then create a new recovery code under Account.
        </p>
        <button type="button" className="btn btn-primary self-start" onClick={() => router.push("/login")}>Go to sign in</button>
      </div>
    );
  }

  if (step.kind === "recovery") {
    return (
      <form onSubmit={handleRecovery} className="flex flex-col gap-4">
        <p className="text-sm m-0">Enter the recovery code you saved and choose a new password. Your stored passphrase copies are kept.</p>
        <div className="field"><label htmlFor="reset-code">Recovery code</label><input id="reset-code" name="recoveryCode" autoComplete="off" required className="input mono" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" /></div>
        {passwordFields}
        {error && <p className="text-sm m-0" style={errorStyle}>{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary self-start">{busy ? "Resetting…" : "Reset password"}</button>
      </form>
    );
  }

  if (step.kind === "forced") {
    return (
      <form onSubmit={handleForced} className="flex flex-col gap-4">
        <p className="text-sm m-0" style={errorStyle}>
          Your administrator allowed a reset without a recovery code. Your PGP keys are kept, but every
          passphrase copy stored in your recovery vault will be removed. Keys you still know the
          passphrase for keep working.
        </p>
        {passwordFields}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="acknowledge" required style={{ marginTop: 3 }} />
          <span>I understand my stored passphrase copies will be removed.</span>
        </label>
        {error && <p className="text-sm m-0" style={errorStyle}>{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary self-start">{busy ? "Resetting…" : "Reset password"}</button>
      </form>
    );
  }

  return (
    <form onSubmit={handleToken} className="flex flex-col gap-4">
      <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
        Ask an administrator to allow a password reset. They will give you a reset token, valid for 60 minutes.
      </p>
      <div className="field"><label htmlFor="reset-email">Email</label><input id="reset-email" name="email" type="email" autoComplete="email" required className="input" /></div>
      <div className="field"><label htmlFor="reset-token">Reset token</label><input id="reset-token" name="token" autoComplete="off" required className="input mono" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" /></div>
      {error && <p className="text-sm m-0" style={errorStyle}>{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary self-start">{busy ? "Checking…" : "Continue"}</button>
    </form>
  );
}
