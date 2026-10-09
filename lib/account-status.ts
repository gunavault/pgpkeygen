export const ACCOUNT_STATUSES = ["pending", "active", "rejected"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

/** Self-registered accounts wait for an administrator. */
export const SELF_REGISTRATION_STATUS: AccountStatus = "pending";

/**
 * Only an explicitly active account may sign in or keep a session. Anything
 * else, including an unknown or missing value, is treated as not approved.
 */
export function isActiveAccount(status: string | null | undefined): boolean {
  return status === "active";
}
