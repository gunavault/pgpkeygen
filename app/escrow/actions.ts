"use server";

import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { pgpKeys, users } from "@/lib/db/schema";
import {
  escrowPayloadFromRow,
  vaultEnvelopeColumns,
  vaultEnvelopeFromRow,
} from "@/lib/escrow-storage";

const envelopeProjection = {
  vaultWrappedKey: users.vaultWrappedKey,
  vaultKdfSalt: users.vaultKdfSalt,
  vaultKdfIv: users.vaultKdfIv,
  vaultKdfIterations: users.vaultKdfIterations,
  vaultWrapVersion: users.vaultWrapVersion,
};

async function authenticatedUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  return session.user.id;
}

export async function getVaultEnvelope() {
  const userId = await authenticatedUserId();
  const [row] = await db
    .select(envelopeProjection)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) throw new Error("Account not found");
  return vaultEnvelopeFromRow(row);
}

export async function initializeVaultEnvelope(input: unknown) {
  const userId = await authenticatedUserId();
  const values = vaultEnvelopeColumns(input);

  const [created] = await db
    .update(users)
    .set(values)
    .where(
      and(
        eq(users.id, userId),
        isNull(users.vaultWrapVersion),
        isNull(users.vaultWrappedKey),
        isNull(users.vaultKdfSalt),
        isNull(users.vaultKdfIv),
        isNull(users.vaultKdfIterations),
      ),
    )
    .returning(envelopeProjection);

  if (created) {
    const envelope = vaultEnvelopeFromRow(created);
    if (!envelope) throw new Error("Vault initialization failed");
    return envelope;
  }

  const [existing] = await db
    .select(envelopeProjection)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) throw new Error("Account not found");

  const envelope = vaultEnvelopeFromRow(existing);
  if (!envelope) throw new Error("Vault initialization failed");
  return envelope;
}

export async function getKeyEscrow(keyId: string) {
  const userId = await authenticatedUserId();
  const [key] = await db
    .select({
      fingerprint: pgpKeys.fingerprint,
      escrowCiphertext: pgpKeys.escrowCiphertext,
      escrowIv: pgpKeys.escrowIv,
      escrowVersion: pgpKeys.escrowVersion,
    })
    .from(pgpKeys)
    .where(and(eq(pgpKeys.id, keyId), eq(pgpKeys.userId, userId)))
    .limit(1);

  if (!key) throw new Error("Not found");
  const payload = escrowPayloadFromRow(key);
  if (!payload) return null;

  const [user] = await db
    .select(envelopeProjection)
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error("Account not found");

  const envelope = vaultEnvelopeFromRow(user);
  if (!envelope) throw new Error("Recovery envelope unavailable");

  return {
    envelope,
    payload,
    context: {
      userId,
      fingerprint: key.fingerprint,
    },
  };
}
