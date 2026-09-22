import { canCreateKey } from "./key-quota.ts";

export type KeyImportPolicyResult = "allowed" | "duplicate" | "limit";

export function evaluateKeyImportPolicy(
  currentKeyCount: number,
  maxKeys: number,
  duplicateFingerprint: boolean,
): KeyImportPolicyResult {
  if (duplicateFingerprint) return "duplicate";
  if (!canCreateKey(currentKeyCount, maxKeys)) return "limit";
  return "allowed";
}
