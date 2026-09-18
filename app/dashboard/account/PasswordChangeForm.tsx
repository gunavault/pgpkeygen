"use client";

import { useState } from "react";
import {
  changePassword,
  getPasswordChangeContext,
  type ChangePasswordResult,
} from "./actions";
import { prepareVerifiedVaultRewrap } from "@/lib/vault-rotation";

function messageFor(result: ChangePasswordResult): string {
  if (result.ok) return "";
  switch (result.error) {
    case "current-password":
      return "The current password is incorrect.";
    case "vault":
      return "The recovery vault could not be safely re-wrapped. Your password was not changed.";
    case "invalid":
      return "Use a new password with at least 8 characters.";
    default:
      return "Password change failed. Nothing was changed.";
  }
}

export function PasswordChangeForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");

    setError(null);
    setSuccess(false);

    if (newPassword.length < 8) {
      setError("Use a new password with at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new password confirmation does not match.");
      return;
    }

    setBusy(true);
    try {
      let context;
      try {
        context = await getPasswordChangeContext();
      } catch {
        setError("Unable to load the password-change context.");
        return;
      }

      let newEnvelope = null;
      if (context.envelope) {
        try {
          newEnvelope = await prepareVerifiedVaultRewrap(
            currentPassword,
            newPassword,
            context.envelope,
            context.sample,
          );
        } catch {
          setError(
            "The current password is incorrect or the recovery vault failed its continuity check. Nothing was changed.",
          );
          return;
        }
      }

      const result = await changePassword({
        currentPassword,
        newPassword,
        newEnvelope,
      });
      if (!result.ok) {
        setError(messageFor(result));
        return;
      }

      form.reset();
      setSuccess(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-lg">
      <div className="field">
        <label htmlFor="account-current-password">Current password</label>
        <input
          id="account-current-password"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="account-new-password">New password</label>
        <input
          id="account-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
      </div>

      <div className="field">
        <label htmlFor="account-confirm-password">Confirm new password</label>
        <input
          id="account-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="input"
        />
      </div>

      <p className="text-xs text-muted m-0">
        Changing your password does not sign out existing sessions yet. Session invalidation is
        handled separately from credential rotation.
      </p>

      {error && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </p>
      )}
      {success && (
        <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          Password changed. Your encrypted recovery copies remain bound to the same vault key.
        </p>
      )}

      <button type="submit" disabled={busy} className="btn btn-primary self-start">
        {busy ? "Changing password…" : "Change password"}
      </button>
    </form>
  );
}
