"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { provisionRecoveryCode } from "@/lib/recovery-code";
import { unwrapVaultEnvelope } from "@/lib/vault-escrow";
import { getRecoveryCodeContext, saveRecoveryCode, type CreateRecoveryCodeResult } from "./recovery-actions";
import { RecoveryCodeReveal } from "./RecoveryCodeReveal";

function messageFor(result: CreateRecoveryCodeResult): string {
  if (result.ok) return "";
  switch (result.error) {
    case "current-password":
      return "The account password is incorrect.";
    case "no-vault":
      return "Your recovery vault is not set up yet. Sign out and sign in again, then retry.";
    case "ratelimited":
      return "Too many attempts. Please wait a few minutes.";
    default:
      return "The recovery code could not be saved. Nothing was changed.";
  }
}

export function RecoveryCodeSection({ createdAt }: { createdAt: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const currentPassword = String(new FormData(form).get("recoveryPassword") ?? "");
    setError(null);
    setBusy(true);

    let vaultKey: Uint8Array | null = null;
    try {
      const context = await getRecoveryCodeContext();
      if (!context.envelope) { setError(messageFor({ ok: false, error: "no-vault" })); return; }
      try {
        vaultKey = await unwrapVaultEnvelope(currentPassword, context.envelope);
      } catch {
        setError(messageFor({ ok: false, error: "current-password" }));
        return;
      }
      // The code is generated and the vault key wrapped here, in the browser.
      // Only the envelope and a verifier go to the server, never the code.
      const provisioned = await provisionRecoveryCode(vaultKey, context.sample);
      const result = await saveRecoveryCode({ currentPassword, envelope: provisioned.envelope, verifier: provisioned.verifier });
      if (!result.ok) { setError(messageFor(result)); return; }
      form.reset();
      setCode(provisioned.code);
    } catch {
      setError("The recovery code could not be created. Nothing was changed.");
    } finally {
      vaultKey?.fill(0);
      setBusy(false);
    }
  }

  if (code) {
    return <RecoveryCodeReveal code={code} onDone={() => { setCode(null); router.refresh(); }} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      <p className="text-sm m-0" data-testid="recovery-status">
        {createdAt
          ? `You have a recovery code (created ${createdAt}). Making a new one replaces it; the old code stops working.`
          : "You have no recovery code yet. Without one, a forgotten password means losing your stored passphrase copies."}
      </p>
      <div className="field">
        <label htmlFor="recovery-password">Account password</label>
        <input id="recovery-password" name="recoveryPassword" type="password" autoComplete="current-password" required className="input" />
      </div>
      {error && <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>{error}</p>}
      <button type="submit" disabled={busy} className="btn btn-primary self-start">
        {busy ? "Creating…" : createdAt ? "Create a new recovery code" : "Create recovery code"}
      </button>
    </form>
  );
}
