import { createHash, randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { sessions, users, type DbOrTx } from "@pollinate/db";
import { SESSION_TTL_MS } from "./session-constants";

export { SESSION_COOKIE, SESSION_TTL_MS } from "./session-constants";

/** Sessions used within this window of expiry are extended (sliding expiry). */
const RENEW_WITHIN_MS = 15 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
}

export interface ValidSession {
  sessionId: string;
  expiresAt: Date;
  user: SessionUser;
  /** True when expiry was extended and the cookie should be re-issued. */
  renewed: boolean;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(db: DbOrTx, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashSessionToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(db: DbOrTx, token: string): Promise<ValidSession | null> {
  const sessionId = hashSessionToken(token);
  const [row] = await db
    .select({
      expiresAt: sessions.expiresAt,
      user: { id: users.id, email: users.email, name: users.name, isPlatformAdmin: users.isPlatformAdmin },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, sessionId));

  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  let expiresAt = row.expiresAt;
  let renewed = false;
  if (expiresAt.getTime() - now < RENEW_WITHIN_MS) {
    expiresAt = new Date(now + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId));
    renewed = true;
  }
  return { sessionId, expiresAt, user: row.user, renewed };
}

export async function invalidateSession(db: DbOrTx, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashSessionToken(token)));
}

/** Logs a user out everywhere, e.g. after a password change. */
export async function invalidateUserSessions(db: DbOrTx, userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function deleteExpiredSessions(db: DbOrTx): Promise<number> {
  const deleted = await db.delete(sessions).where(sql`${sessions.expiresAt} <= now()`).returning({ id: sessions.id });
  return deleted.length;
}
