import { eq } from "drizzle-orm";
import { users, type DbOrTx } from "@pollinate/db";
import { findUserByEmail } from "./memberships";
import { getDummyHash, hashPassword, needsRehash, verifyPassword } from "./password";

/**
 * Checks an email/password pair. Returns the user id, or null for any failure;
 * callers must show one generic message so emails cannot be enumerated.
 * Unknown emails still pay the cost of a hash comparison for the same reason.
 */
export async function authenticate(db: DbOrTx, email: string, password: string): Promise<string | null> {
  const user = await findUserByEmail(db, email);
  if (!user?.passwordHash) {
    await verifyPassword(password, await getDummyHash());
    return null;
  }
  if (!(await verifyPassword(password, user.passwordHash))) return null;

  if (needsRehash(user.passwordHash)) {
    await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));
  }
  return user.id;
}
