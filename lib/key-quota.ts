const DEFAULT_MAX_KEYS_PER_USER = 50;

export function parseMaxKeysPerUser(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_KEYS_PER_USER;
}

export function canCreateKey(currentCount: number, maxKeys: number): boolean {
  return currentCount < maxKeys;
}
