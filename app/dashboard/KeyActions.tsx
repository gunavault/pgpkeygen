"use client";

import { useState, useTransition } from "react";
import {
  deleteKey,
  forgetLegacyRevocationCertificate,
  getLegacyRevocationCertificate,
  revokeKey,
} from "./actions";

export function KeyActions({
  keyId,
  isRevoked,
  hasLegacyCertificate,
}: {
  keyId: string;
  isRevoked: boolean;
  hasLegacyCertificate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);
  const [certificate, setCertificate] = useState("");
  const [legacyExported, setLegacyExported] = useState(false);

  function handleRevoke() {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await revokeKey(keyId, certificate.trim() || null);
      } catch {
        setError("Failed to revoke key. Check that the certificate belongs to this key.");
      }
    });
  }

  function handleLoadLegacy() {
    setError(null);
    startTransition(async () => {
      try {
        const legacy = await getLegacyRevocationCertificate(keyId);
        if (!legacy) {
          setError("No legacy certificate is stored for this key.");
          return;
        }
        setCertificate(legacy);
        setLegacyExported(true);
        setShowRevoke(true);
      } catch {
        setError("Failed to load the legacy certificate.");
      }
    });
  }

  function handleForgetLegacy() {
    if (!legacyExported) return;
    if (!confirm("Remove the server copy? Confirm only after saving the certificate somewhere safe.")) return;
    setError(null);
    startTransition(async () => {
      try {
        await forgetLegacyRevocationCertificate(keyId);
        setError("Server copy removed. Keep your exported certificate safe.");
      } catch {
        setError("Failed to remove the server copy.");
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
    <div className="mt-4 flex flex-col gap-3 text-xs" style={{ color: "var(--color-accent-700)" }}>
      <div className="flex items-center gap-4">
        {!isRevoked && (
          <button type="button" onClick={() => setShowRevoke((value) => !value)} disabled={pending} className="lnk disabled:opacity-50">
            Revoke
          </button>
        )}
        {hasLegacyCertificate && (
          <button type="button" onClick={handleLoadLegacy} disabled={pending} className="lnk disabled:opacity-50">
            Export legacy revocation certificate
          </button>
        )}
        {hasLegacyCertificate && legacyExported && (
          <button type="button" onClick={handleForgetLegacy} disabled={pending} className="lnk disabled:opacity-50">
            Remove server copy
          </button>
        )}
        <button type="button" onClick={handleDelete} disabled={pending} className="lnk disabled:opacity-50">
          Delete
        </button>
      </div>

      {!isRevoked && showRevoke && (
        <div className="flex flex-col gap-2 max-w-2xl">
          <label htmlFor={`revoke-${keyId}`} className="text-muted">
            Paste the revocation certificate you saved when this key was generated.
          </label>
          <textarea
            id={`revoke-${keyId}`}
            value={certificate}
            onChange={(event) => setCertificate(event.target.value)}
            rows={7}
            className="input mono text-xs"
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK----- …"
          />
          <button type="button" onClick={handleRevoke} disabled={pending || (!certificate.trim() && !hasLegacyCertificate)} className="btn btn-secondary self-start">
            Confirm revocation
          </button>
        </div>
      )}

      {legacyExported && (
        <p className="text-muted m-0">
          Copy the certificate shown above to safe local storage before removing the server copy.
        </p>
      )}
      {error && <span style={{ color: "var(--color-accent-700)" }}>{error}</span>}
    </div>
  );
}
