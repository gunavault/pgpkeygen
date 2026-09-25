export type SessionInvalidationTransaction = {
  advanceCutoff: (userId: string, cutoff: Date) => Promise<void>;
  auditInvalidated: (email: string, reason: string) => Promise<void>;
};

export type SessionInvalidationEnvironment = {
  now: () => Date;
  transaction: <T>(
    callback: (tx: SessionInvalidationTransaction) => Promise<T>,
  ) => Promise<T>;
};

export type SessionInvalidationInput = {
  userId: string;
  actorEmail: string;
  reason: string;
};

export async function performSessionInvalidation(
  input: SessionInvalidationInput,
  environment: SessionInvalidationEnvironment,
): Promise<void> {
  if (!input.userId || !input.actorEmail || !input.reason) {
    throw new Error("Invalid session invalidation request");
  }

  const cutoff = environment.now();

  await environment.transaction(async (tx) => {
    await tx.advanceCutoff(input.userId, cutoff);
    await tx.auditInvalidated(input.actorEmail, input.reason);
  });
}
