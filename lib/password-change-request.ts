import { parseVaultEnvelopeInput } from "./escrow-record.ts";
import {
  performPasswordChange,
  type PasswordChangeEnvironment,
} from "./password-change.ts";
import type { VaultEnvelope } from "./vault-escrow.ts";

const PASSWORD_CHANGE_ACCOUNT_LIMIT = 5;
const PASSWORD_CHANGE_SOURCE_LIMIT = 30;
const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

export type PasswordChangeRequestContext = {
  userId: string;
  actorEmail: string;
  sourceIp: string | null;
};

export type PasswordChangeRequestInput = {
  currentPassword: string;
  newPassword: string;
  newEnvelope: unknown | null;
};

export type ChangePasswordResult =
  | { ok: true }
  | {
      ok: false;
      error: "invalid" | "current-password" | "vault" | "ratelimited" | "server";
    };

export type PasswordChangeRequestEnvironment = PasswordChangeEnvironment & {
  isRateLimited: (key: string, limit: number, windowMs: number) => boolean;
  auditPasswordChangeFailed: (email: string) => Promise<void>;
};

export async function handlePasswordChangeRequest(
  context: PasswordChangeRequestContext,
  input: PasswordChangeRequestInput,
  environment: PasswordChangeRequestEnvironment,
): Promise<ChangePasswordResult> {
  const accountLimited = environment.isRateLimited(
    `password-change:account:${context.userId}`,
    PASSWORD_CHANGE_ACCOUNT_LIMIT,
    PASSWORD_CHANGE_WINDOW_MS,
  );
  const sourceLimited = context.sourceIp
    ? environment.isRateLimited(
        `password-change:source:${context.sourceIp}`,
        PASSWORD_CHANGE_SOURCE_LIMIT,
        PASSWORD_CHANGE_WINDOW_MS,
      )
    : false;

  if (accountLimited || sourceLimited) {
    return { ok: false, error: "ratelimited" };
  }

  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;
  if (
    typeof currentPassword !== "string" ||
    typeof newPassword !== "string" ||
    !currentPassword ||
    newPassword.length < 8
  ) {
    return { ok: false, error: "invalid" };
  }

  let newEnvelope: VaultEnvelope | null;
  try {
    newEnvelope =
      input.newEnvelope === null
        ? null
        : parseVaultEnvelopeInput(input.newEnvelope);
  } catch {
    return { ok: false, error: "vault" };
  }

  try {
    await performPasswordChange(
      {
        userId: context.userId,
        currentPassword,
        newPassword,
        newEnvelope,
      },
      environment,
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof Error) {
      if (/current password/i.test(error.message)) {
        try {
          await environment.auditPasswordChangeFailed(context.actorEmail);
        } catch {
          console.error("password change failure audit failed");
        }
        return { ok: false, error: "current-password" };
      }
      if (/vault envelope|fresh vault envelope/i.test(error.message)) {
        return { ok: false, error: "vault" };
      }
    }

    console.error("password change failed");
    return { ok: false, error: "server" };
  }
}
