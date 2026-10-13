"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RecoveryCodeReveal } from "@/app/dashboard/account/RecoveryCodeReveal";
import { SecretTag } from "@/app/SecretTag";
import { deriveRecoveryVerifier, normalizeGroupedSecret, provisionRecoveryCode, unwrapWithRecoveryCode } from "@/lib/recovery-code";
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
    // Both secrets share a format; the likeliest slip is pasting the reset
    // token again. Say so instead of a bare "does not open your vault".
    const typed = normalizeGroupedSecret(code);
    if (typed && typed === normalizeGroupedSecret(step.token)) {
      setError("That is the reset token from your administrator, which you already used in step 1. Here, enter your own recovery code: the one you saved when you created it.");
      return;
    }

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

  // Each step's form carries its own key. The steps share a layout, so
  // without one React reuses the previous step's inputs and the email typed
  // in step one shows up in the recovery code field.
  //
  // Password managers also take the text input just before a new-password
  // field for the username and may autofill the saved email into it. The
  // read-only account field gives them the real username, which keeps them
  // out of the recovery code and files the new password under the right
  // account.
  const accountField = (email: string) => (
    <div className="field"><label htmlFor="reset-account">Account</label><input id="reset-account" name="username" type="email" autoComplete="username" value={email} readOnly className="input" /></div>
  );

  const passwordFields = (
    <>
      <div className="field"><label htmlFor="reset-new">New password</label><input id="reset-new" name="newPassword" type="password" autoComplete="new-password" minLength={8} required className="input" /></div>
      <div className="field"><label htmlFor="reset-confirm">Confirm new password</label><input id="reset-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className="input" /></div>
    </>
  );

  const steps = (current: 1 | 2, second: string) => (
    <ol className="steps m-0 p-0" aria-label="Reset steps">
      <li aria-current={current === 1 ? "step" : undefined} data-done={current > 1 ? "" : undefined}>1 · Reset token</li>
      <li aria-current={current === 2 ? "step" : undefined}>2 · {second}</li>
    </ol>
  );

  const tokenAccepted = (email: string) => (
    <p className="text-sm m-0" data-testid="token-accepted">
      <span aria-hidden="true">✓ </span>Reset token accepted for <strong>{email}</strong>.
    </p>
  );

  if (step.kind === "new-code") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm m-0">
          Your password is reset and your stored passphrase copies are kept. Your old recovery code no longer
          works. Below is your <strong>new recovery code</strong>.
        </p>
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
      <form key="recovery" onSubmit={handleRecovery} className="flex flex-col gap-4">
        {steps(2, "Recovery code and new password")}
        {tokenAccepted(step.email)}
        {accountField(step.email)}
        <div className="secret-panel secret-panel-recovery">
          <SecretTag kind="recovery" />
          <div className="field">
            <label htmlFor="reset-code">Your recovery code</label>
            <input id="reset-code" name="recoveryCode" autoComplete="off" autoCapitalize="characters" spellCheck={false} required className="input mono" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" aria-describedby="reset-code-help" />
          </div>
          <p id="reset-code-help" className="secret-help">
            The code you saved yourself when you created it under Account, for example in
            {" "}<span className="mono">pgpkeygen-recovery-code.txt</span>. Not the reset token from step 1.
          </p>
        </div>
        <p className="text-sm m-0" style={{ color: "var(--color-neutral-700)" }}>Choose a new password. Your stored passphrase copies are kept.</p>
        {passwordFields}
        {error && <p className="text-sm m-0" role="alert" style={errorStyle}>{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary self-start">{busy ? "Resetting…" : "Reset password"}</button>
      </form>
    );
  }

  if (step.kind === "forced") {
    return (
      <form key="forced" onSubmit={handleForced} className="flex flex-col gap-4">
        {steps(2, "New password")}
        {tokenAccepted(step.email)}
        <p className="text-sm m-0" style={errorStyle}>
          Your administrator allowed a reset without a recovery code, so you do not need one. Your PGP keys are
          kept, but every passphrase copy stored in your recovery vault will be removed. Keys you still know the
          passphrase for keep working.
        </p>
        {accountField(step.email)}
        {passwordFields}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="acknowledge" required style={{ marginTop: 3 }} />
          <span>I understand my stored passphrase copies will be removed.</span>
        </label>
        {error && <p className="text-sm m-0" role="alert" style={errorStyle}>{error}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary self-start">{busy ? "Resetting…" : "Reset password"}</button>
      </form>
    );
  }

  return (
    <form key="token" onSubmit={handleToken} className="flex flex-col gap-4">
      {steps(1, "Recovery code and new password")}
      <div className="flex flex-col gap-3 text-sm" data-testid="reset-needs">
        <p className="m-0">A password reset uses two different codes. They look alike, so check which one you are typing:</p>
        <ul className="secret-list">
          <li>
            <SecretTag kind="token" />
            <span>Ask your administrator for it. It works once and expires after 60 minutes. <strong>Needed now.</strong></span>
          </li>
          <li className="secret-list-recovery">
            <SecretTag kind="recovery" />
            <span>The code you saved yourself. Needed in step 2, unless your administrator chose a reset without it.</span>
          </li>
        </ul>
      </div>
      <div className="field"><label htmlFor="reset-email">Email</label><input id="reset-email" name="email" type="email" autoComplete="email" required className="input" /></div>
      <div className="secret-panel">
        <SecretTag kind="token" />
        <div className="field">
          <label htmlFor="reset-token">Reset token</label>
          <input id="reset-token" name="token" autoComplete="off" autoCapitalize="characters" spellCheck={false} required className="input mono" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" aria-describedby="reset-token-help" />
        </div>
        <p id="reset-token-help" className="secret-help">The one-time token your administrator just gave you, not your recovery code.</p>
      </div>
      {error && (
        <p className="text-sm m-0" role="alert" style={errorStyle}>
          {error}
          {!error.startsWith("Too many") && " Make sure you entered the reset token from your administrator, not your own recovery code."}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary self-start">{busy ? "Checking…" : "Continue"}</button>
    </form>
  );
}
