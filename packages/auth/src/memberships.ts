import { and, asc, count, eq, sql } from "drizzle-orm";
import { memberships, organizations, users, type DbOrTx } from "@pollinate/db";
import { hashPassword } from "./password";
import type { Role } from "./permissions";

export interface OrgAccess {
  organization: { id: string; slug: string; name: string };
  role: Role;
}

/** The user's role in the organisation with this slug, or null if they are not a member. */
export async function getOrgAccess(db: DbOrTx, userId: string, orgSlug: string): Promise<OrgAccess | null> {
  const [row] = await db
    .select({
      organization: { id: organizations.id, slug: organizations.slug, name: organizations.name },
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(and(eq(memberships.userId, userId), eq(organizations.slug, orgSlug)));
  return row ?? null;
}

export async function listUserOrgs(db: DbOrTx, userId: string): Promise<OrgAccess[]> {
  return db
    .select({
      organization: { id: organizations.id, slug: organizations.slug, name: organizations.name },
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(organizations.name));
}

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  joinedAt: Date;
}

export async function listMembers(db: DbOrTx, organizationId: string): Promise<Member[]> {
  return db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(asc(users.email));
}

export class MembershipError extends Error {
  override name = "MembershipError";
}

export async function findUserByEmail(db: DbOrTx, email: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email.trim()})`);
  return user ?? null;
}

/**
 * Adds a user to an organisation, creating the user if needed. New users need
 * an initial password until invitation emails exist (Phase 3).
 */
export async function addMember(
  db: DbOrTx,
  input: { organizationId: string; email: string; name?: string; role: Role; initialPassword?: string },
): Promise<{ userId: string; created: boolean }> {
  return db.transaction(async (tx) => {
    let userId = (await findUserByEmail(tx, input.email))?.id;
    const created = userId === undefined;
    if (userId === undefined) {
      if (!input.initialPassword) throw new MembershipError("New users need an initial password");
      const [user] = await tx
        .insert(users)
        .values({
          email: input.email.trim(),
          name: input.name?.trim() || null,
          passwordHash: await hashPassword(input.initialPassword),
        })
        .returning({ id: users.id });
      userId = user!.id;
    }
    const inserted = await tx
      .insert(memberships)
      .values({ organizationId: input.organizationId, userId, role: input.role })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw new MembershipError(`${input.email} is already a member`);
    return { userId, created };
  });
}

/** Changes a member's role. Refuses to leave the organisation without an admin. */
export async function changeRole(db: DbOrTx, organizationId: string, userId: string, role: Role): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOrgMemberships(tx, organizationId);
    if (role !== "org_admin") await assertNotLastAdmin(tx, organizationId, userId);
    const updated = await tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)))
      .returning();
    if (updated.length === 0) throw new MembershipError("Member not found");
  });
}

/** Removes a member. Refuses to remove the last admin. */
export async function removeMember(db: DbOrTx, organizationId: string, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockOrgMemberships(tx, organizationId);
    await assertNotLastAdmin(tx, organizationId, userId);
    await tx
      .delete(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));
  });
}

/** Serialises admin changes per organisation so two concurrent demotions can't remove every admin. */
async function lockOrgMemberships(db: DbOrTx, organizationId: string) {
  await db.execute(sql`select 1 from ${organizations} where ${organizations.id} = ${organizationId} for update`);
}

async function assertNotLastAdmin(db: DbOrTx, organizationId: string, userId: string) {
  const [target] = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.userId, userId)));
  if (target?.role !== "org_admin") return;
  const [{ admins } = { admins: 0 }] = await db
    .select({ admins: count() })
    .from(memberships)
    .where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "org_admin")));
  if (admins <= 1) throw new MembershipError("An organisation must keep at least one admin");
}

/** Platform admin: creates an organisation with its first admin. */
export async function createOrganization(
  db: DbOrTx,
  input: { name: string; slug: string; admin: { email: string; name?: string; initialPassword?: string } },
): Promise<{ organizationId: string }> {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(organizations).where(eq(organizations.slug, input.slug));
    if (existing.length > 0) throw new MembershipError(`The address '${input.slug}' is already taken`);
    const [org] = await tx.insert(organizations).values({ name: input.name.trim(), slug: input.slug }).returning();
    await addMember(tx, {
      organizationId: org!.id,
      email: input.admin.email,
      name: input.admin.name,
      role: "org_admin",
      initialPassword: input.admin.initialPassword,
    });
    return { organizationId: org!.id };
  });
}

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/;
