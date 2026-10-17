import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import {
  can,
  getOrgAccess,
  SESSION_COOKIE,
  validateSessionToken,
  type OrgAccess,
  type Permission,
  type SessionUser,
} from "@pollinate/auth";
import { db } from "./db";

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

/** The signed-in user for this request, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await validateSessionToken(db, token);
  return session?.user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export interface OrgContext extends OrgAccess {
  user: SessionUser;
}

/**
 * Resolves the organisation from the URL slug and checks membership.
 * Non-members get a 404, so organisation slugs cannot be probed.
 */
export const getOrgContext = cache(async (orgSlug: string): Promise<OrgContext> => {
  const user = await requireUser();
  const access = await getOrgAccess(db, user.id, orgSlug);
  if (!access) notFound();
  return { user, ...access };
});

/** For pages: 404 unless the user's role grants the permission. */
export async function requirePermission(orgSlug: string, permission: Permission): Promise<OrgContext> {
  const ctx = await getOrgContext(orgSlug);
  if (!can(ctx.role, permission)) notFound();
  return ctx;
}

export async function requirePlatformAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound();
  return user;
}

/** Only same-site relative paths, to prevent open redirects after login. */
export function safeNextPath(next: unknown): string | null {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return null;
  }
  return next;
}
