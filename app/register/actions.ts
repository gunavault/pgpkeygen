"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/password";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function register(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const ip = await getClientIp();
  if (isRateLimited(`register:${ip}`, REGISTER_LIMIT, REGISTER_WINDOW_MS)) {
    redirect("/register?error=ratelimited");
  }

  if (!email || password.length < 8) {
    redirect("/register?error=invalid");
  }

  const role = ADMIN_EMAILS.includes(email) ? "admin" : "user";

  try {
    await db.insert(users).values({ email, passwordHash: hashPassword(password), role });
  } catch {
    redirect("/register?error=exists");
  }

  await logAudit(email, "user.registered", undefined, role === "admin" ? "role: admin" : undefined);

  redirect("/login?registered=1");
}
