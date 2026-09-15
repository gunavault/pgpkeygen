"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { normalizeEmail } from "@/lib/identity";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const LOGIN_ACCOUNT_LIMIT = 5;
const LOGIN_SOURCE_LIMIT = 30;
const LOGIN_GLOBAL_LIMIT = 500;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type LoginResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "ratelimited" };

export async function login(formData: FormData): Promise<LoginResult> {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const ip = await getClientIp();

  const globallyLimited = isRateLimited("login:global", LOGIN_GLOBAL_LIMIT, LOGIN_WINDOW_MS);
  const accountLimited = isRateLimited(`login:account:${email}`, LOGIN_ACCOUNT_LIMIT, LOGIN_WINDOW_MS);
  const sourceLimited = ip
    ? isRateLimited(`login:source:${ip}`, LOGIN_SOURCE_LIMIT, LOGIN_WINDOW_MS)
    : false;

  if (globallyLimited || accountLimited || sourceLimited) {
    return { ok: false, error: "ratelimited" };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
      redirectTo: "/dashboard",
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, error: "invalid" };
    }
    throw error;
  }
}
