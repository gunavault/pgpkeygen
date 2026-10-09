"use client";

import { useState } from "react";
import { CopyButton } from "../CopyButton";
import { DownloadButton } from "../DownloadButton";

/** Shows a freshly made recovery code once, and only lets the user move on after they confirm they kept it. */
export function RecoveryCodeReveal({ code, onDone, doneLabel = "Done" }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const text = `pgpkeygen recovery code\n\n${code}\n\nKeep this somewhere safe and separate from your password. It is shown only once.\n`;

  return (
    <div className="flex flex-col gap-3 max-w-lg">
      <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
        Save this recovery code now. It is shown only once and cannot be shown again.
      </p>
      <div
        className="mono text-[15px] px-3.5 py-3"
        data-testid="recovery-code"
        style={{ background: "var(--color-neutral-200)", border: "1px solid var(--color-divider)", letterSpacing: ".06em", wordBreak: "break-all" }}
      >
        {code}
      </div>
      <div className="flex items-center gap-3">
        <CopyButton text={code} />
        <DownloadButton text={text} filename="pgpkeygen-recovery-code.txt" />
      </div>
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} style={{ marginTop: 3 }} />
        <span>I have stored this recovery code somewhere safe.</span>
      </label>
      <button type="button" className="btn btn-primary self-start" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}
