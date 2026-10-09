import { isActiveAccount } from "./account-status.ts";

export function isSessionValidAfterCutoff(
  issuedAtMs: number | null | undefined,
  sessionsValidAfter: Date | null,
): boolean {
  if (sessionsValidAfter === null) return true;
  if (
    typeof issuedAtMs !== "number" ||
    !Number.isFinite(issuedAtMs)
  ) {
    return false;
  }

  return issuedAtMs >= sessionsValidAfter.getTime();
}

/**
 * A session stays valid only while its account exists, is approved, and was
 * signed in after the account's last "sign out everywhere".
 */
export function isSessionAllowed(
  user: { status: string; sessionsValidAfter: Date | null } | null,
  issuedAtMs: number | null | undefined,
): boolean {
  if (!user || !isActiveAccount(user.status)) return false;
  return isSessionValidAfterCutoff(issuedAtMs, user.sessionsValidAfter);
}
