"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { normalizeEmail } from "@/lib/identity";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const LOGIN_ACCOUNT_LIMIT = 5;
const LOGIN_SOURCE_LIMIT = 30;
const LOGIN_GLOBAL_LIMIT = 500;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function login(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");
  const ip = await getClientIp();

  const globallyLimited = isRateLimited("login:global", LOGIN_GLOBAL_LIMIT, LOGIN_WINDOW_MS);
  const accountLimited = isRateLimited(`login:account:${email}`, LOGIN_ACCOUNT_LIMIT, LOGIN_WINDOW_MS);
  const sourceLimited = ip
    ? isRateLimited(`login:source:${ip}`, LOGIN_SOURCE_LIMIT, LOGIN_WINDOW_MS)
    : false;

  if (globallyLimited || accountLimited || sourceLimited) {
    redirect("/login?error=ratelimited");
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=invalid");
    }
    throw error;
  }
}
