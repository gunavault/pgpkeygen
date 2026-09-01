import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pgpKeys } from "@/lib/db/schema";
import { CopyButton } from "./CopyButton";
import { KeyActions } from "./KeyActions";

export default async function DashboardPage() {
  const session = await auth();
  const userId = session!.user.id;

  const keys = await db
    .select()
    .from(pgpKeys)
    .where(eq(pgpKeys.userId, userId))
    .orderBy(desc(pgpKeys.createdAt));

  return (
    <div className="flex flex-col gap-3">
      {keys.length === 0 && <p className="text-sm text-zinc-500">No keys yet.</p>}
      {keys.map((key) => (
        <details key={key.id} className="border rounded p-3">
          <summary className="cursor-pointer font-medium">
            {key.title}
            {key.revokedAt && (
              <span className="ml-2 text-xs font-normal text-amber-600">(revoked)</span>
            )}
          </summary>

          {key.details && <p className="mt-2 text-sm">{key.details}</p>}

          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-zinc-500">
            <dt>Identity</dt>
            <dd>
              {key.name} &lt;{key.email}&gt;
            </dd>
            <dt>Algorithm</dt>
            <dd>{key.algorithm}</dd>
            <dt>Expires</dt>
            <dd>{key.expiresAt ? key.expiresAt.toLocaleDateString() : "Never"}</dd>
            <dt>Fingerprint</dt>
            <dd className="break-all">{key.fingerprint}</dd>
            {key.revokedAt && (
              <>
                <dt>Revoked</dt>
                <dd>{key.revokedAt.toLocaleDateString()}</dd>
              </>
            )}
          </dl>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-zinc-500">Public key:</p>
            <CopyButton text={key.publicKey} />
          </div>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{key.publicKey}</pre>

          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-zinc-500">Private key (passphrase-encrypted):</p>
            <CopyButton text={key.privateKey} />
          </div>
          <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{key.privateKey}</pre>

          <KeyActions
            keyId={key.id}
            isRevoked={!!key.revokedAt}
            canRevoke={!!key.revocationCertificate}
          />
        </details>
      ))}
    </div>
  );
}
