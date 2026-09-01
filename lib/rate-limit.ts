import { headers } from "next/headers";

// ponytail: in-memory fixed-window limiter, single-process only.
// Fine for a self-hosted internal app on one instance; move to Redis if you ever run more than one.
const hits = new Map<string, { count: number; resetAt: number }>();

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count += 1;
  return entry.count > limit;
}
