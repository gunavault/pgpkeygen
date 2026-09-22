import { evaluateKeyImportPolicy, type KeyImportPolicyResult } from "./key-import-policy.ts";

export type KeyImportTransaction = {
  lockUser: (userId: string) => Promise<void>;
  hasDuplicateFingerprint: (
    userId: string,
    fingerprint: string,
  ) => Promise<boolean>;
  countKeys: (userId: string) => Promise<number>;
  insertKey: () => Promise<void>;
  auditImport: () => Promise<void>;
};

export type KeyImportTransactionEnvironment = {
  maxKeys: number;
  transaction: <T>(
    callback: (tx: KeyImportTransaction) => Promise<T>,
  ) => Promise<T>;
};

export type KeyImportTransactionInput = {
  userId: string;
  fingerprint: string;
};

export async function performKeyImportTransaction(
  input: KeyImportTransactionInput,
  environment: KeyImportTransactionEnvironment,
): Promise<KeyImportPolicyResult> {
  if (!input.userId || !input.fingerprint) {
    throw new Error("Invalid key import transaction");
  }

  return environment.transaction(async (tx) => {
    await tx.lockUser(input.userId);

    const duplicate = await tx.hasDuplicateFingerprint(
      input.userId,
      input.fingerprint,
    );
    const currentKeyCount = await tx.countKeys(input.userId);
    const policy = evaluateKeyImportPolicy(
      currentKeyCount,
      environment.maxKeys,
      duplicate,
    );

    if (policy !== "allowed") return policy;

    await tx.insertKey();
    await tx.auditImport();
    return "allowed";
  });
}
