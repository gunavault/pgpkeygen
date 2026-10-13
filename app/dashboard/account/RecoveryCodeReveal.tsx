"use client";

import { useState } from "react";
import { CopyButton } from "../CopyButton";
import { DownloadButton } from "../DownloadButton";
import { SecretTag } from "@/app/SecretTag";

/** Shows a freshly made recovery code once, and only lets the user move on after they confirm they kept it. */
export function RecoveryCodeReveal({ code, onDone, doneLabel = "Done" }: { code: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const text = `pgpkeygen RECOVERY CODE (yours, not a reset token)\n\n${code}\n\n` +
    "Keep this somewhere safe and separate from your password. It is shown only once.\n" +
    "Your administrator never sees it and cannot give it back to you.\n\n" +
    "If you forget your password: ask your administrator for a reset token, open\n" +
    "\"Forgot password?\" on the sign-in page, enter the reset token, then this code.\n";

  return (
    <div className="flex flex-col gap-3 max-w-lg">
      <div className="secret-panel secret-panel-recovery">
        <SecretTag kind="recovery" />
        <p className="text-sm m-0" style={{ color: "var(--color-accent-800)", fontWeight: 600 }}>
          Save this recovery code now. It is shown only once and cannot be shown again.
        </p>
        <div className="secret-value" data-testid="recovery-code">{code}</div>
        <div className="flex items-center gap-3">
          <CopyButton text={code} />
          <DownloadButton text={text} filename="pgpkeygen-recovery-code.txt" />
        </div>
        <p className="secret-help">
          Only you have this code; your administrator never sees it. If you forget your password, you will need
          it together with a one-time reset token from your administrator.
        </p>
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
