"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { verifyImportedKeyRecoverySecret } from "@/lib/key-import-client";
import { RecoveryOptInControl } from "./RecoveryOptInControl";
import { importKey } from "./actions";
import { useKeyEscrow } from "./useKeyEscrow";

export function ImportKeyForm() {
  const router = useRouter();
  const { recoveryAvailable, createEscrow } = useKeyEscrow();
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [recoveryEnabled, setRecoveryEnabled] = useState(false);
  const [recoverySecret, setRecoverySecret] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus("Validating imported key material…");

    try {
      let escrow: Awaited<ReturnType<typeof createEscrow>> | null = null;

      if (recoveryEnabled) {
        if (!recoveryAvailable || !recoverySecret) {
          setStatus("Recovery is unavailable or the private-key passphrase is missing.");
          return;
        }

        const fingerprint = await verifyImportedKeyRecoverySecret(
          publicKey,
          privateKey,
          recoverySecret,
        );

        escrow = await createEscrow(recoverySecret, fingerprint);
      }

      const result = await importKey({
        title,
        details: details || null,
        publicKey,
        privateKey,
        escrow,
      });

      if (!result.ok) {
        if (result.error === "duplicate") {
          setStatus("This key fingerprint is already in your vault.");
        } else if (result.error === "limit") {
          setStatus("Your key limit has been reached.");
        } else if (result.error === "invalid") {
          setStatus("The imported key pair is invalid or does not meet the vault requirements.");
        } else {
          setStatus("The key could not be imported.");
        }
        return;
      }

      setRecoverySecret("");
      setStatus("Key imported successfully.");
      router.push("/dashboard");
      router.refresh();
    } catch {
      setStatus(
        recoveryEnabled
          ? "Import failed. Confirm the private-key passphrase and key material."
          : "Import failed while validating the key material.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-3xl m-0">Import key</h1>
        <p className="text-sm text-muted mt-2 mb-0">
          Paste an existing encrypted OpenPGP key pair. Metadata is derived from the key material on the server.
        </p>
      </div>

      <div className="field">
        <label htmlFor="import-title">Title</label>
        <input
          id="import-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Existing signing key"
          required
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="import-details">
          Details <span className="normal-case text-muted font-normal">— optional</span>
        </label>
        <textarea
          id="import-details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={2}
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="import-public">Public key armor</label>
        <textarea
          id="import-public"
          value={publicKey}
          onChange={(event) => setPublicKey(event.target.value)}
          rows={9}
          required
          className="input mono text-xs"
          placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
        />
      </div>

      <div className="field">
        <label htmlFor="import-private">Encrypted private key armor</label>
        <textarea
          id="import-private"
          value={privateKey}
          onChange={(event) => setPrivateKey(event.target.value)}
          rows={11}
          required
          className="input mono text-xs"
          placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
        />
      </div>

      <RecoveryOptInControl
        enabled={recoveryEnabled}
        available={recoveryAvailable}
        onChange={(enabled) => {
          setRecoveryEnabled(enabled);
          if (!enabled) setRecoverySecret("");
        }}
      />

      {recoveryEnabled && (
        <div className="field">
          <label htmlFor="import-recovery-secret">Private-key passphrase</label>
          <input
            id="import-recovery-secret"
            type="password"
            value={recoverySecret}
            onChange={(event) => setRecoverySecret(event.target.value)}
            required
            className="input mono"
            autoComplete="off"
          />
          <p className="text-xs text-muted m-0 mt-2">
            This is verified and wrapped in your browser only. The plaintext is never sent to the server.
          </p>
        </div>
      )}

      {status && <p className="text-[12.5px] text-muted m-0">{status}</p>}

      <div>
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Importing…" : "Import key"}
        </button>
      </div>
    </form>
  );
}
