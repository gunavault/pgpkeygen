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


export type ExpirableKey = {
  expiresAt: Date | null;
  createdAt: Date;
};

export function prioritizeKeysByExpiry<T extends ExpirableKey>(
  keys: readonly T[],
  now: Date = new Date(),
): Array<{ key: T; expiryStatus: KeyExpiryStatus }> {
  return keys
    .map((key) => ({
      key,
      expiryStatus: classifyKeyExpiry(key.expiresAt, now),
    }))
    .sort((left, right) => {
      const priority =
        expiryStatusPriority(left.expiryStatus) -
        expiryStatusPriority(right.expiryStatus);
      if (priority !== 0) return priority;

      return right.key.createdAt.getTime() - left.key.createdAt.getTime();
    });
}
