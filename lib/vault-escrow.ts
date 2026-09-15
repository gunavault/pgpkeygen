const encoder = new TextEncoder();
const decoder = new TextDecoder();

const VAULT_ENVELOPE_VERSION = 1 as const;
const ESCROW_VERSION = 1 as const;
const PBKDF2_ITERATIONS = 600_000;
const VAULT_KEY_BYTES = 32;
const SALT_BYTES = 16;
const GCM_IV_BYTES = 12;
const VAULT_CIPHERTEXT_BYTES = VAULT_KEY_BYTES + 16; // AES-GCM authentication tag.

export type VaultEnvelope = {
  version: typeof VAULT_ENVELOPE_VERSION;
  kdf: "PBKDF2-SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

export type EscrowPayload = {
  version: typeof ESCROW_VERSION;
  iv: string;
  ciphertext: string;
};

export type EscrowContext = {
  userId: string;
  fingerprint: string;
};

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new Error("Invalid escrow encoding");
  }
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== VAULT_KEY_BYTES) throw new Error("Invalid vault key");
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function derivePasswordKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  if (!password) throw new Error("Account password is required");
  if (salt.length !== SALT_BYTES) throw new Error("Invalid vault salt");

  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(encoder.encode(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: toArrayBuffer(salt),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function validateEnvelope(envelope: VaultEnvelope): {
  salt: Uint8Array;
  iv: Uint8Array;
  ciphertext: Uint8Array;
} {
  if (
    envelope.version !== VAULT_ENVELOPE_VERSION ||
    envelope.kdf !== "PBKDF2-SHA-256" ||
    envelope.iterations !== PBKDF2_ITERATIONS
  ) {
    throw new Error("Unsupported vault envelope");
  }

  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  if (
    salt.length !== SALT_BYTES ||
    iv.length !== GCM_IV_BYTES ||
    ciphertext.length !== VAULT_CIPHERTEXT_BYTES
  ) {
    throw new Error("Invalid vault envelope");
  }

  return { salt, iv, ciphertext };
}

function aadFor(context: EscrowContext): Uint8Array {
  const userId = context.userId.trim();
  const fingerprint = context.fingerprint.trim().toLowerCase();
  if (!userId || !/^[0-9a-f]{40,64}$/i.test(fingerprint)) {
    throw new Error("Invalid escrow context");
  }

  return encoder.encode(`pgpkeygen:passphrase-escrow:v1\0${userId}\0${fingerprint}`);
}

export async function createVaultEnvelope(
  password: string,
): Promise<{ envelope: VaultEnvelope; vaultKey: Uint8Array }> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(GCM_IV_BYTES);
  const vaultKey = randomBytes(VAULT_KEY_BYTES);
  const passwordKey = await derivePasswordKey(password, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      passwordKey,
      toArrayBuffer(vaultKey),
    ),
  );

  return {
    vaultKey,
    envelope: {
      version: VAULT_ENVELOPE_VERSION,
      kdf: "PBKDF2-SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(ciphertext),
    },
  };
}

export async function unwrapVaultEnvelope(
  password: string,
  envelope: VaultEnvelope,
): Promise<Uint8Array> {
  try {
    const { salt, iv, ciphertext } = validateEnvelope(envelope);
    const passwordKey = await derivePasswordKey(password, salt);
    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: toArrayBuffer(iv) },
        passwordKey,
        toArrayBuffer(ciphertext),
      ),
    );
    if (plaintext.length !== VAULT_KEY_BYTES) throw new Error("Invalid vault key");
    return plaintext;
  } catch {
    throw new Error("Unable to unlock vault");
  }
}

export async function wrapEscrowSecret(
  vaultKey: Uint8Array,
  secret: string,
  context: EscrowContext,
): Promise<EscrowPayload> {
  if (!secret) throw new Error("Secret is required");
  const iv = randomBytes(GCM_IV_BYTES);
  const key = await importAesKey(vaultKey);
  const aad = aadFor(context);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      key,
      toArrayBuffer(encoder.encode(secret)),
    ),
  );

  return {
    version: ESCROW_VERSION,
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function unwrapEscrowSecret(
  vaultKey: Uint8Array,
  payload: EscrowPayload,
  context: EscrowContext,
): Promise<string> {
  try {
    if (payload.version !== ESCROW_VERSION) throw new Error("Unsupported escrow payload");
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);
    if (iv.length !== GCM_IV_BYTES || ciphertext.length < 17) {
      throw new Error("Invalid escrow payload");
    }

    const key = await importAesKey(vaultKey);
    const aad = aadFor(context);
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad),
      },
      key,
      toArrayBuffer(ciphertext),
    );
    return decoder.decode(plaintext);
  } catch {
    throw new Error("Unable to reveal escrowed secret");
  }
}
