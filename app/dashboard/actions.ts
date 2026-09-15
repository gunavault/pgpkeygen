"use server";

import { and, eq } from "drizzle-orm";
import * as openpgp from "openpgp";
import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { pgpKeys } from "@/lib/db/schema";
import { logAudit } from "@/lib/audit";
import { validateKeyMaterial } from "@/lib/pgp-validation";
import { chooseRevocationCertificate } from "@/lib/revocation-policy";

export async function saveKey(input: {
  title: string;
  details: string | null;
  publicKey: string;
  privateKey: string;
}): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const title = input.title.trim();
  const details = input.details?.trim() || null;
  if (!title || title.length > 255 || (details?.length ?? 0) > 4_000) {
    throw new Error("Invalid key metadata");
  }

  const metadata = await validateKeyMaterial(input.publicKey, input.privateKey);

  await db.insert(pgpKeys).values({
    userId: session.user.id,
    title,
    details,
    name: metadata.name,
    email: metadata.email,
    algorithm: metadata.algorithm,
    expiresAt: metadata.expiresAt,
    fingerprint: metadata.fingerprint,
    publicKey: input.publicKey,
    privateKey: input.privateKey,
  });

  await logAudit(session.user.email!, "key.generated", title, `fingerprint: ${metadata.fingerprint}`);

  revalidatePath("/dashboard");
}

export async function getLegacyRevocationCertificate(keyId: string): Promise<string | null> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [key] = await db
    .select({ revocationCertificate: pgpKeys.revocationCertificate })
    .from(pgpKeys)
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)))
    .limit(1);

  if (!key) throw new Error("Not found");
  return key.revocationCertificate;
}

export async function forgetLegacyRevocationCertificate(keyId: string): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await db
    .update(pgpKeys)
    .set({ revocationCertificate: null })
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)));

  revalidatePath("/dashboard");
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

export async function revokeKey(keyId: string, suppliedCertificate: string | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const [key] = await db
    .select()
    .from(pgpKeys)
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)))
    .limit(1);

  if (!key) throw new Error("Not found");
  if (key.revokedAt) return;

  const revocationCertificate = chooseRevocationCertificate(
    suppliedCertificate,
    key.revocationCertificate,
  );

  const publicKeyObj = await openpgp.readKey({ armoredKey: key.publicKey });
  const { publicKey: revokedPublicKey } = await openpgp.revokeKey({
    key: publicKeyObj,
    revocationCertificate,
  });

  await db
    .update(pgpKeys)
    .set({ publicKey: revokedPublicKey, revokedAt: new Date(), revocationCertificate: null })
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, session.user.id)));

  await logAudit(session.user.email!, "key.revoked", key.title, `fingerprint: ${key.fingerprint}`);

  revalidatePath("/dashboard");
}

export async function logout() {
  await signOut({ redirectTo: "/login" });
}
