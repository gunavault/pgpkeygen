import * as openpgp from "openpgp";

export async function verifyImportedKeyRecoverySecret(
  publicKeyArmored: string,
  privateKeyArmored: string,
  secret: string,
): Promise<string> {
  if (!secret) throw new Error("Recovery secret is required");

  const [publicKey, privateKey] = await Promise.all([
    openpgp.readKey({ armoredKey: publicKeyArmored }),
    openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
  ]);

  const publicFingerprint = publicKey.getFingerprint();
  if (publicFingerprint !== privateKey.getFingerprint()) {
    throw new Error("Public and private material must represent the same key pair");
  }

  await openpgp.decryptKey({
    privateKey,
    passphrase: secret,
  });

  return publicFingerprint;
}
