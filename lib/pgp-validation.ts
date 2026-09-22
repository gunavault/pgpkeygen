import * as openpgp from "openpgp";

const MAX_PUBLIC_KEY_CHARS = 128_000;
const MAX_PRIVATE_KEY_CHARS = 512_000;

export type ValidatedKeyMetadata = {
  fingerprint: string;
  name: string;
  email: string;
  algorithm: string;
  expiresAt: Date | null;
};

function parseUserId(userId: string): { name: string; email: string } {
  const match = userId.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if (!match) throw new Error("PGP key must contain a primary name and email identity");
  return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
}

function describeAlgorithm(info: { algorithm: string; bits?: number; curve?: string }): string {
  if (info.bits) return `${info.algorithm.toUpperCase()} ${info.bits}`;
  if (info.curve) return `${info.algorithm} (${info.curve})`;
  return info.algorithm;
}

export async function validateKeyMaterial(
  publicKeyArmored: string,
  privateKeyArmored: string,
): Promise<ValidatedKeyMetadata> {
  if (
    publicKeyArmored.length > MAX_PUBLIC_KEY_CHARS ||
    privateKeyArmored.length > MAX_PRIVATE_KEY_CHARS
  ) {
    throw new Error("PGP key material is too large");
  }

  const [publicKey, privateKey] = await Promise.all([
    openpgp.readKey({ armoredKey: publicKeyArmored }),
    openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
  ]);

  if (privateKey.isDecrypted()) {
    throw new Error("Private key material must be encrypted before persistence");
  }

  const publicFingerprint = publicKey.getFingerprint();
  const privateFingerprint = privateKey.getFingerprint();
  if (publicFingerprint !== privateFingerprint) {
    throw new Error("Public and private material must represent the same key pair");
  }

  // Verifies the primary self-certification and returns the authoritative identity.
  const { user: primaryUser } = await publicKey.getPrimaryUser();
  const primaryUserId = primaryUser.userID?.userID;
  if (!primaryUserId) throw new Error("PGP key must contain a user identity");
  const identity = parseUserId(primaryUserId);

  const expiration = await publicKey.getExpirationTime();
  if (expiration === null) throw new Error("PGP key is revoked or invalid");

  return {
    fingerprint: publicFingerprint,
    ...identity,
    algorithm: describeAlgorithm(publicKey.getAlgorithmInfo()),
    expiresAt: expiration instanceof Date ? expiration : null,
  };
}
