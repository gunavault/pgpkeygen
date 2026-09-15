"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { normalizeEmail } from "@/lib/identity";
import { hashPassword } from "@/lib/password";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";
import { roleForSelfRegistration } from "@/lib/registration-policy";

const REGISTER_SOURCE_LIMIT = 10;
const REGISTER_GLOBAL_LIMIT = 100;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

export async function register(formData: FormData) {
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") ?? "");

  const ip = await getClientIp();
  const globallyLimited = isRateLimited("register:global", REGISTER_GLOBAL_LIMIT, REGISTER_WINDOW_MS);
  const sourceLimited = ip
    ? isRateLimited(`register:source:${ip}`, REGISTER_SOURCE_LIMIT, REGISTER_WINDOW_MS)
    : false;

  if (globallyLimited || sourceLimited) {
    redirect("/register?error=ratelimited");
  }

  if (!email || password.length < 8) {
    redirect("/register?error=invalid");
  }

  const role = roleForSelfRegistration(email);

  try {
    await db.insert(users).values({ email, passwordHash: await hashPassword(password), role });
  } catch (error) {
    if (isUniqueViolation(error)) {
      redirect("/register?error=exists");
    }

    console.error("register: database operation failed");
    redirect("/register?error=server");
  }

  await logAudit(email, "user.registered");

  redirect("/login?registered=1");
}
