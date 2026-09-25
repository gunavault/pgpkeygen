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
