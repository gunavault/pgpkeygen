import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pgpKeys } from "@/lib/db/schema";
import { CopyButton } from "./CopyButton";
import { KeyActions } from "./KeyActions";

function fingerprintPretty(fp: string) {
  return (fp.match(/.{1,4}/g) || []).join(" ");
}

const kicker = { fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" as const, color: "var(--color-neutral-500)" };

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const keys = await db
    .select()
    .from(pgpKeys)
    .where(eq(pgpKeys.userId, userId))
    .orderBy(desc(pgpKeys.createdAt));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between">
        <div>
          <div style={{ ...kicker, marginBottom: 6, color: "var(--color-neutral-600)" }}>Vault</div>
          <h1 className="text-3xl m-0">Your keys</h1>
        </div>
        <Link href="/dashboard/generate" className="btn btn-primary whitespace-nowrap">
          New key
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
        </Link>
      </div>

      {keys.length === 0 && <p className="text-sm text-muted">No keys yet.</p>}

      {keys.length > 0 && (
        <div style={{ border: "1px solid var(--color-divider)" }}>
          {keys.map((key, i) => (
            <details key={key.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--color-divider)" }}>
              <summary className="keyrow flex items-center gap-3 cursor-pointer px-4 py-3.5">
                <span className="text-[14.5px] font-bold" style={{ fontFamily: "var(--font-heading)" }}>
                  {key.title}
                </span>
                {key.revokedAt && (
                  <span className="tag tag-accent" style={{ fontSize: 9.5 }}>
                    Revoked
                  </span>
                )}
                <span className="mono text-xs ml-auto text-muted">{key.email}</span>
              </summary>

              <div className="px-4 pb-5 pt-4" style={{ borderTop: "1px solid var(--color-divider)" }}>
                {key.details && <p className="text-sm text-muted">{key.details}</p>}

                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px]">
                  <div style={kicker}>Identity</div>
                  <div className="mono">
                    {key.name} &lt;{key.email}&gt;
                  </div>
                  <div style={kicker}>Algorithm</div>
                  <div>{key.algorithm}</div>
                  <div style={kicker}>Expires</div>
                  <div>{key.expiresAt ? key.expiresAt.toLocaleDateString() : "Never"}</div>
                  {key.revokedAt && (
                    <>
                      <div style={kicker}>Revoked</div>
                      <div>{key.revokedAt.toLocaleDateString()}</div>
                    </>
                  )}
                </div>

                <div className="mt-4">
                  <div style={{ ...kicker, marginBottom: 8 }}>Fingerprint</div>
                  <div
                    className="mono text-[13px] px-3.5 py-3"
                    style={{ background: "var(--color-neutral-200)", border: "1px solid var(--color-divider)", letterSpacing: ".03em", wordBreak: "break-all" }}
                  >
                    {fingerprintPretty(key.fingerprint)}
                  </div>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span style={kicker}>Public key</span>
                    <CopyButton text={key.publicKey} />
                  </div>
                  <pre
                    className="mono keyblock text-[11px] leading-[1.55] px-3.5 py-3 overflow-auto whitespace-pre-wrap m-0"
                    style={{ background: "var(--color-neutral-200)", border: "1px solid var(--color-divider)", maxHeight: 150, wordBreak: "break-all" }}
                  >
                    {key.publicKey}
                  </pre>
                </div>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span style={kicker}>Private key</span>
                    <CopyButton text={key.privateKey} />
                  </div>
                  <pre
                    className="mono keyblock text-[11px] leading-[1.55] px-3.5 py-3 overflow-auto whitespace-pre-wrap m-0"
                    style={{ background: "var(--color-neutral-900)", color: "var(--color-neutral-300)", border: "1px solid var(--color-neutral-900)", maxHeight: 150, wordBreak: "break-all" }}
                  >
                    {key.privateKey}
                  </pre>
                </div>

                <KeyActions
                  keyId={key.id}
                  isRevoked={!!key.revokedAt}
                  canRevoke={!!key.revocationCertificate}
                />
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
