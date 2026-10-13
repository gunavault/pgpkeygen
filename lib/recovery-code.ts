import { unwrapVaultEnvelope, wrapVaultKey } from "./vault-escrow.ts";
import type { VaultEnvelope } from "./vault-escrow.ts";
import { verifyVaultEnvelopeContinuity, type EscrowVerificationSample } from "./vault-rotation.ts";

// Crockford base32: no I, L, O or U, so a code read aloud or retyped survives
// the usual confusions (normalizeGroupedSecret maps O->0 and I/L->1).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SECRET_BYTES = 16; // 128 bits
const SECRET_CHARS = 26; // ceil(128 / 5)
const VERIFIER_DOMAIN = "pgpkeygen:recovery-verifier:v1\0";

const encoder = new TextEncoder();

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET.charAt((value << (5 - bits)) & 31);
  return out;
}

function group(chars: string): string {
  return chars.match(/.{1,4}/g)!.join("-");
}

/** A fresh 128-bit secret, shown as "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX". */
export function generateGroupedSecret(): string {
  const bytes = new Uint8Array(SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return group(toBase32(bytes));
}

/**
 * Canonical form of a typed recovery code or reset token: case, spaces and
 * dashes do not matter. Returns null for anything that cannot be one.
 */
export function normalizeGroupedSecret(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const compact = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (compact.length !== SECRET_CHARS) return null;
  for (const character of compact) {
    if (!ALPHABET.includes(character)) return null;
  }
  return compact;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Proof that the caller knows the recovery code, without the code itself.
 * Domain-separated from the envelope wrapping, which runs the code through
 * PBKDF2 with its own salt; the server stores only a hash of this value.
 */
export async function deriveRecoveryVerifier(code: string): Promise<string> {
  const normalized = normalizeGroupedSecret(code);
  if (!normalized) throw new Error("Invalid recovery code");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(VERIFIER_DOMAIN + normalized));
  return toHex(new Uint8Array(digest));
}

export type ProvisionedRecoveryCode = {
  /** Shown to the user once; never sent to the server. */
  code: string;
  envelope: VaultEnvelope;
  verifier: string;
};

/**
 * Wraps the unlocked vault key under a new recovery code and proves the new
 * envelope opens to the same key (and still decrypts an escrow sample)
 * before anything is sent to the server.
 */
export async function provisionRecoveryCode(
  vaultKey: Uint8Array,
  sample: EscrowVerificationSample | null,
): Promise<ProvisionedRecoveryCode> {
  const code = generateGroupedSecret();
  const normalized = normalizeGroupedSecret(code)!;
  const envelope = await wrapVaultKey(normalized, vaultKey);
  await verifyVaultEnvelopeContinuity(vaultKey, normalized, envelope, sample);
  return { code, envelope, verifier: await deriveRecoveryVerifier(code) };
}

/** Opens the vault key with a typed recovery code. */
export async function unwrapWithRecoveryCode(
  code: string,
  envelope: VaultEnvelope,
): Promise<Uint8Array> {
  const normalized = normalizeGroupedSecret(code);
  if (!normalized) throw new Error("Unable to unlock vault");
  return unwrapVaultEnvelope(normalized, envelope);
}
