import { headers } from "next/headers";
import { resolveClientIp } from "./client-ip";
import { FixedWindowRateLimiter } from "./rate-limit-core";

// Process-local by design. A bounded store protects single-instance deployments
// from unbounded attacker-controlled keys. Multi-replica deployments must use a
// shared external limiter before scaling the app horizontally.
const limiter = new FixedWindowRateLimiter();

export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const trustProxy = process.env.TRUST_PROXY_HEADERS === "true";
  return resolveClientIp(h.get("x-forwarded-for"), trustProxy);
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  return limiter.isLimited(key, limit, windowMs);
}
