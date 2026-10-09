import { createHash, timingSafeEqual } from "node:crypto";

// Reset tokens and recovery verifiers carry 128+ bits of randomness, so a fast
// hash is enough to keep the stored value useless on its own; there is nothing
// to brute-force that a slow KDF would protect.
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Constant-time comparison of two hex digests. */
export function sameDigest(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}
