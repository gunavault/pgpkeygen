"use client";

export function RecoveryOptInControl({
  enabled,
  available,
  onChange,
}: {
  enabled: boolean;
  available: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="field">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!available}
          onChange={(event) => onChange(event.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span className="text-sm font-semibold">Enable encrypted passphrase recovery for this key</span>
      </label>
      <p className="text-xs text-muted m-0 mt-2">
        Enabling recovery makes your account password the single point of failure for this key&apos;s confidentiality. A stolen database can be attacked offline. Leave this off for the strictest separation.
      </p>
      {!available && (
        <p className="text-xs text-muted m-0 mt-2">
          Recovery is locked because the in-memory vault key is unavailable. Sign out and sign in again to unlock it; strict no-recovery key creation still works normally.
        </p>
      )}
    </div>
  );
}
