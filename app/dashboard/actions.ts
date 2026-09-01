"use server";

import { and, eq } from "drizzle-orm";
import * as openpgp from "openpgp";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { pgpKeys } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { sendPassphraseEmail } from "@/lib/mail";

export async function saveKey(input: {
  title: string;
  details: string | null;
  name: string;
  email: string;
  algorithm: string;
  expiresAt: string | null;
  fingerprint: string;
  publicKey: string;
  privateKey: string;
  revocationCertificate: string;
  passphrase: string;
}): Promise<{ emailSent: boolean }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  if (
    !input.publicKey.includes("BEGIN PGP PUBLIC KEY") ||
    !input.privateKey.includes("BEGIN PGP PRIVATE KEY")
  ) {
    throw new Error("Invalid key material");
  }

  await db.insert(pgpKeys).values({
    userId: session.user.id,
    title: input.title,
    details: input.details,
    name: input.name,
    email: input.email,
    algorithm: input.algorithm,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    fingerprint: input.fingerprint,
    publicKey: input.publicKey,
    privateKey: input.privateKey,
    revocationCertificate: input.revocationCertificate,
  });

  const emailSent = await sendPassphraseEmail(session.user.email!, input.title, input.passphrase);

  await logAudit(
    session.user.email!,
    "key.generated",
    input.title,
    `fingerprint: ${input.fingerprint}; passphrase emailed: ${emailSent}`,
  );

  revalidatePath("/dashboard");
  return { emailSent };
}

export async function deleteKey(keyId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [deleted] = await db
    .delete(pgpKeys)
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)))
    .returning({ title: pgpKeys.title, fingerprint: pgpKeys.fingerprint });

  if (deleted) {
    await logAudit(session.user.email!, "key.deleted", deleted.title, `fingerprint: ${deleted.fingerprint}`);
  }

  revalidatePath("/dashboard");
}

export async function revokeKey(keyId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [key] = await db
    .select()
    .from(pgpKeys)
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)))
    .limit(1);

  if (!key) throw new Error("Not found");
  if (key.revokedAt) return;
  if (!key.revocationCertificate) {
    throw new Error("No revocation certificate stored for this key");
  }

  const publicKeyObj = await openpgp.readKey({ armoredKey: key.publicKey });
  const { publicKey: revokedPublicKey } = await openpgp.revokeKey({
    key: publicKeyObj,
    revocationCertificate: key.revocationCertificate,
  });

  await db
    .update(pgpKeys)
    .set({ publicKey: revokedPublicKey, revokedAt: new Date() })
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)));

  await logAudit(session.user.email!, "key.revoked", key.title, `fingerprint: ${key.fingerprint}`);

  revalidatePath("/dashboard");
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
