import { headers } from "next/headers";
import { FixedWindowRateLimiter } from "./rate-limit-core";

// ponytail: in-memory fixed-window limiter, single-process only.
// Fine for a self-hosted internal app on one instance; move to Redis if you ever run more than one.
const limiter = new FixedWindowRateLimiter();

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  return limiter.isLimited(key, limit, windowMs);
}
