type RateLimitEntry = {
  count: number;
  resetAt: number;
};

/**
 * Deterministic fixed-window rate-limit state.
 *
 * Keeping time as a dependency makes the security behavior testable without
 * fake timers or framework mocks. Storage remains process-local for now; issue
 * #7 tracks replacing this with a deployment-safe bounded/shared design.
 */
export class FixedWindowRateLimiter {
  private readonly hits = new Map<string, RateLimitEntry>();
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  isLimited(key: string, limit: number, windowMs: number): boolean {
    const now = this.now();
    const entry = this.hits.get(key);

    if (!entry || now > entry.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return false;
    }

    entry.count += 1;
    return entry.count > limit;
  }
}
