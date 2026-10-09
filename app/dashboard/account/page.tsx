import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { appTimeZone, formatTimestamp } from "@/lib/display-time";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { RecoveryCodeSection } from "./RecoveryCodeSection";
import { SessionInvalidationButton } from "./SessionInvalidationButton";

export default async function AccountPage() {
  const session = await auth();
  const [row] = session?.user?.id
    ? await db.select({ recoveryCreatedAt: users.recoveryCreatedAt }).from(users).where(eq(users.id, session.user.id)).limit(1)
    : [];
  const recoveryCreatedAt = row?.recoveryCreatedAt ? formatTimestamp(row.recoveryCreatedAt, appTimeZone()) : null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div
          style={{
            fontSize: 11,
            letterSpacing: ".14em",
            textTransform: "uppercase",
            color: "var(--color-neutral-600)",
            marginBottom: 6,
          }}
        >
          Account
        </div>
        <h1 className="text-3xl m-0">Password</h1>
        <p className="text-sm text-muted mt-2 mb-0 max-w-2xl">
          Rotate your account password without re-encrypting each recovered PGP passphrase.
          The browser verifies that the same vault key survives the re-wrap before anything is
          committed.
        </p>
      </div>

      <PasswordChangeForm />

      <div style={{ height: 1, background: "var(--color-divider)" }} />

      <section className="flex flex-col gap-3 max-w-2xl" id="recovery-code">
        <div>
          <h2 className="text-xl m-0">Recovery code</h2>
          <p className="text-sm text-muted mt-2 mb-0">
            If you forget your password, an administrator can allow a reset, and this code lets you
            keep your stored passphrase copies. Only you hold it: the server keeps neither the code
            nor anything that reveals it.
          </p>
        </div>
        <RecoveryCodeSection createdAt={recoveryCreatedAt} />
      </section>

      <div style={{ height: 1, background: "var(--color-divider)" }} />

      <section className="flex flex-col gap-3 max-w-2xl">
        <div>
          <h2 className="text-xl m-0">Sessions</h2>
          <p className="text-sm text-muted mt-2 mb-0">
            Invalidate every session issued before now. This also signs out this browser.
          </p>
        </div>
        <SessionInvalidationButton />
      </section>
    </div>
  );
}
