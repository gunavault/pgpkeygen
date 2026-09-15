type RateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * Deterministic fixed-window rate-limit state with a hard key bound.
 *
 * This remains process-local, which is appropriate only for a single app
 * instance. The hard capacity prevents attacker-controlled keys from growing
 * memory without bound; when the store is full and no expired entries can be
 * reclaimed, new keys fail closed as limited.
 */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, RateLimitEntry>();
  private readonly now: () => number;
  private readonly maxEntries: number;

  constructor(now: () => number = Date.now, maxEntries = 5_000) {
    this.now = now;
    this.maxEntries = maxEntries;
  }

  get size(): number {
    return this.hits.size;
  }

  private reclaimExpired(now: number): void {
    for (const [key, entry] of this.hits) {
      if (now > entry.resetAt) this.hits.delete(key);
    }
  }

  isLimited(key: string, limit: number, windowMs: number): boolean {
    const now = this.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetAt) {
      if (!entry && this.hits.size >= this.maxEntries) {
        this.reclaimExpired(now);
        if (this.hits.size >= this.maxEntries) return true;
      }

      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    entry.count += 1;
    return entry.count > limit;
  }
}
