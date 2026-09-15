"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useVault } from "@/app/VaultProvider";
import {
  getVaultEnvelope,
  initializeVaultEnvelope,
} from "@/app/escrow/actions";
import {
  createVaultEnvelope,
  unwrapVaultEnvelope,
} from "@/lib/vault-escrow";
import { login } from "./actions";

type LoginError = "invalid" | "ratelimited" | "recovery" | null;

export function LoginForm({
  initialError = null,
  registered = false,
}: {
  initialError?: string | null;
  registered?: boolean;
}) {
  const router = useRouter();
  const { setVaultKey, clearVaultKey } = useVault();
  const [error, setError] = useState<LoginError>(
    initialError === "invalid" || initialError === "ratelimited" ? initialError : null,
  );
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const accountSecret = String(formData.get("password") ?? "");

    setBusy(true);
    setError(null);
    clearVaultKey();

    try {
      const result = await login(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      try {
        let envelope = await getVaultEnvelope();
        if (!envelope) {
          const created = await createVaultEnvelope(accountSecret);
          try {
            // Always trust the envelope returned by the atomic initializer. A
            // concurrent login may have initialized a different random vault key.
            envelope = await initializeVaultEnvelope(created.envelope);
          } finally {
            created.vaultKey.fill(0);
          }
        }

        const unlockedVaultKey = await unwrapVaultEnvelope(accountSecret, envelope);
        try {
          setVaultKey(unlockedVaultKey);
        } finally {
          unlockedVaultKey.fill(0);
        }
      } catch {
        // Authentication already succeeded. Recovery is optional, so continue
        // with a locked in-memory vault rather than blocking account access.
        clearVaultKey();
        setError("recovery");
      }

      form.reset();
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-[18px]" style={{ maxWidth: 340 }}>
      <div>
        <h2 className="m-0" style={{ fontSize: 28, marginBottom: 4 }}>
          Sign in
        </h2>
        <p className="text-sm m-0" style={{ color: "var(--color-neutral-600)" }}>
          Access your key vault.
        </p>
      </div>

      {registered && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          Account created. Sign in below.
        </p>
      )}
      {error === "ratelimited" && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          Too many attempts. Try again in a few minutes.
        </p>
      )}
      {error === "invalid" && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          Invalid email or password.
        </p>
      )}
      {error === "recovery" && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          Signed in, but the optional recovery vault could not be unlocked. You can continue without recovery and unlock it later with your account password.
        </p>
      )}

      <div className="field">
        <label htmlFor="li-email">Email</label>
        <input id="li-email" name="email" type="email" placeholder="you@example.com" required className="input" autoComplete="email" />
      </div>
      <div className="field">
        <label htmlFor="li-pass">Password</label>
        <input id="li-pass" name="password" type="password" placeholder="••••••••" required className="input" autoComplete="current-password" />
      </div>

      <button type="submit" disabled={busy} className="btn btn-primary btn-block">
        {busy ? "Signing in…" : "Sign in"}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </form>
  );
}
