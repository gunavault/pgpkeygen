export const EXPIRING_SOON_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type KeyExpiryStatus = "expired" | "expiring" | "healthy" | "never";

export function classifyKeyExpiry(
  expiresAt: Date | null,
  now: Date = new Date(),
): KeyExpiryStatus {
  if (expiresAt === null) return "never";

  const remainingMs = expiresAt.getTime() - now.getTime();
  if (remainingMs <= 0) return "expired";
  if (remainingMs <= EXPIRING_SOON_DAYS * MS_PER_DAY) return "expiring";
  return "healthy";
}

export function expiryStatusPriority(status: KeyExpiryStatus): number {
  switch (status) {
    case "expired":
      return 0;
    case "expiring":
      return 1;
    case "healthy":
      return 2;
    case "never":
      return 3;
  }
}
