import { isIP } from "node:net";

/**
 * Resolve a source address only when deployment configuration explicitly trusts
 * the reverse proxy to replace (not append untrusted client values to)
 * X-Forwarded-For. Direct clients are never allowed to opt themselves into
 * trusted forwarding by sending the header.
 */
export function resolveClientIp(forwardedFor: string | null, trustProxy: boolean): string | null {
  if (!trustProxy || !forwardedFor) return null;

  const candidate = forwardedFor.split(",", 1)[0]?.trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}
