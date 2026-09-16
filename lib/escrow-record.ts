import type { EscrowPayload, VaultEnvelope } from "./vault-escrow";

const VAULT_VERSION = 1;
const ESCROW_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const GCM_IV_BYTES = 12;
const VAULT_CIPHERTEXT_BYTES = 48;
const MIN_ESCROW_CIPHERTEXT_BYTES = 17;
const MAX_ESCROW_CIPHERTEXT_BYTES = 4_096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function decodeStrictBase64(value: unknown): Uint8Array | null {
  if (typeof value !== "string" || value.length === 0 || value.length % 4 !== 0) return null;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return null;
  }

  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

export function parseVaultEnvelopeInput(value: unknown): VaultEnvelope {
  if (!isRecord(value)) throw new Error("Invalid vault envelope");

  const salt = decodeStrictBase64(value.salt);
  const iv = decodeStrictBase64(value.iv);
  const ciphertext = decodeStrictBase64(value.ciphertext);

  if (
    value.version !== VAULT_VERSION ||
    value.kdf !== "PBKDF2-SHA-256" ||
    value.iterations !== PBKDF2_ITERATIONS ||
    salt?.length !== SALT_BYTES ||
    iv?.length !== GCM_IV_BYTES ||
    ciphertext?.length !== VAULT_CIPHERTEXT_BYTES
  ) {
    throw new Error("Invalid vault envelope");
  }

  return {
    version: VAULT_VERSION,
    kdf: "PBKDF2-SHA-256",
    iterations: PBKDF2_ITERATIONS,
    salt: value.salt as string,
    iv: value.iv as string,
    ciphertext: value.ciphertext as string,
  };
}

export function parseEscrowPayloadInput(value: unknown): EscrowPayload {
  if (!isRecord(value)) throw new Error("Invalid escrow payload");

  const iv = decodeStrictBase64(value.iv);
  const ciphertext = decodeStrictBase64(value.ciphertext);

  if (
    value.version !== ESCROW_VERSION ||
    iv?.length !== GCM_IV_BYTES ||
    ciphertext === null ||
    ciphertext.length < MIN_ESCROW_CIPHERTEXT_BYTES ||
    ciphertext.length > MAX_ESCROW_CIPHERTEXT_BYTES
  ) {
    throw new Error("Invalid escrow payload");
  }

  return {
    version: ESCROW_VERSION,
    iv: value.iv as string,
    ciphertext: value.ciphertext as string,
  };
}
