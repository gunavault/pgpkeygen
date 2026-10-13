import { isActiveAccount } from "./account-status.ts";

export type CredentialUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  passwordHash: string;
};

export type CredentialCheckEnvironment = {
  findUserByEmail: (email: string) => Promise<CredentialUser | null>;
  verifyPassword: (password: string, hash: string) => Promise<boolean>;
  audit: (
    email: string,
    action: "login.failed" | "login.blocked" | "login.success",
    details?: string,
  ) => Promise<void>;
};

export type CredentialCheckResult =
  | { ok: true; user: { id: string; email: string; role: string } }
  | { ok: false; reason: "invalid" | "not_approved" };

/**
 * The approval check runs only after the password is verified: a caller who
 * does not know the password learns nothing about whether the account exists
 * or is waiting for approval.
 */
export async function checkCredentials(
  email: string,
  password: string,
  environment: CredentialCheckEnvironment,
): Promise<CredentialCheckResult> {
  const user = await environment.findUserByEmail(email);
  if (!user || !(await environment.verifyPassword(password, user.passwordHash))) {
    await environment.audit(email, "login.failed");
    return { ok: false, reason: "invalid" };
  }

  if (!isActiveAccount(user.status)) {
    await environment.audit(email, "login.blocked", `account ${user.status}`);
    return { ok: false, reason: "not_approved" };
  }

  await environment.audit(email, "login.success");
  return { ok: true, user: { id: user.id, email: user.email, role: user.role } };
}
