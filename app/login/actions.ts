"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const ip = await getClientIp();

  if (isRateLimited(`login:${ip}:${email}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    redirect("/login?error=ratelimited");
  }

  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect("/login?error=invalid");
    }
    throw error;
  }
}
