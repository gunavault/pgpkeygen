"use client";

import { useId, useState, useTransition } from "react";
import type { EscrowContext, EscrowPayload, VaultEnvelope } from "@/lib/vault-escrow";
import { unwrapEscrowSecret, unwrapVaultEnvelope } from "@/lib/vault-escrow";
import { CopyButton } from "./CopyButton";

type RecoveryRecord = {
  envelope: VaultEnvelope;
  payload: EscrowPayload;
  context: EscrowContext;
};

export function LocalRecoveryPrompt({
  record,
  onClose,
}: {
  record: RecoveryRecord;
  onClose: () => void;
}) {
  const fieldId = useId();
  const passwordId = `${fieldId}-account-password`;
  const recoveredId = `${fieldId}-recovered-passphrase`;
  const [pending, startTransition] = useTransition();
  const [accountPassword, setAccountPassword] = useState("");
  const [recoveredSecret, setRecoveredSecret] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleReveal() {
    if (!accountPassword) {
      setError("Enter your account password to reveal this recovery copy.");
      return;
    }

    setError(null);
    setRecoveredSecret("");
    startTransition(async () => {
      let unlockedVaultKey: Uint8Array | null = null;
      try {
        unlockedVaultKey = await unwrapVaultEnvelope(accountPassword, record.envelope);
        const plaintext = await unwrapEscrowSecret(unlockedVaultKey, record.payload, record.context);
        setRecoveredSecret(plaintext);
        setAccountPassword("");
      } catch {
        setRecoveredSecret("");
        setError("Unable to reveal the recovery copy. Check your account password and try again.");
      } finally {
        unlockedVaultKey?.fill(0);
      }
    });
  }

  function close() {
    setAccountPassword("");
    setRecoveredSecret("");
    setError(null);
    onClose();
  }

  return (
    <div className="flex flex-col gap-2 max-w-xl">
      <label htmlFor={passwordId} className="text-muted">
        Re-enter your account password. It is used only in this browser to unlock the encrypted recovery copy.
      </label>
      <input
        id={passwordId}
        type="password"
        autoComplete="current-password"
        value={accountPassword}
        onChange={(event) => setAccountPassword(event.target.value)}
        className="input"
      />
      <div className="flex gap-2">
        <button type="button" onClick={handleReveal} disabled={pending || !accountPassword} className="btn btn-secondary">
          {pending ? "Unlocking…" : "Reveal"}
        </button>
        <button type="button" onClick={close} disabled={pending} className="btn btn-secondary">
          Cancel
        </button>
      </div>

      {recoveredSecret && (
        <div className="field mt-2">
          <label htmlFor={recoveredId}>Recovered passphrase</label>
          <div className="flex gap-2 items-center">
            <input id={recoveredId} value={recoveredSecret} readOnly className="input mono flex-1" />
            <CopyButton text={recoveredSecret} />
            <button type="button" className="btn btn-secondary" onClick={() => setRecoveredSecret("")}>Hide</button>
          </div>
        </div>
      )}
      {error && <span style={{ color: "var(--color-accent-700)" }}>{error}</span>}
    </div>
  );
}
