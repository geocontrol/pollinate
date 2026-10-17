"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticate, createSession, invalidateSession, SESSION_COOKIE } from "@pollinate/auth";
import { safeNextPath, sessionCookieOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { str, type FormState } from "@/lib/form";
import { clearFailures, isRateLimited, recordFailure } from "@/lib/rate-limit";

const GENERIC_ERROR = "Incorrect email or password.";

export async function login(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email").toLowerCase();
  const password = form.get("password");
  if (!email || typeof password !== "string" || !password) return { error: "Enter your email and password." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limitKey = `${ip}|${email}`;
  if (isRateLimited(limitKey)) return { error: "Too many attempts. Try again in 15 minutes." };

  const userId = await authenticate(db, email, password);
  if (!userId) {
    recordFailure(limitKey);
    return { error: GENERIC_ERROR };
  }
  clearFailures(limitKey);

  const { token, expiresAt } = await createSession(db, userId);
  (await cookies()).set(SESSION_COOKIE, token, { ...sessionCookieOptions, expires: expiresAt });
  redirect(safeNextPath(form.get("next")) ?? "/orgs");
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await invalidateSession(db, token);
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
