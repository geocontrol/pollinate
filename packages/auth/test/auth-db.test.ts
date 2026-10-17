import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, organizations, sessions, users } from "@pollinate/db";
import {
  addMember,
  authenticate,
  changeRole,
  createOrganization,
  createSession,
  getOrgAccess,
  hashSessionToken,
  invalidateSession,
  listMembers,
  listUserOrgs,
  MembershipError,
  removeMember,
  validateSessionToken,
} from "../src/index";

// Runs as the restricted app role against the dev database (see README).
const APP_URL = process.env.DATABASE_URL ?? "postgres://pollinate_app:pollinate_app@localhost:5432/pollinate";

describe("auth against the database", () => {
  const { db, pool } = createDb(APP_URL);
  const suffix = randomUUID().slice(0, 8);
  const adminEmail = `admin-${suffix}@example.com`;
  const password = "a long test password";
  let orgId: string;
  let adminId: string;
  const createdEmails: string[] = [adminEmail];

  beforeAll(async () => {
    ({ organizationId: orgId } = await createOrganization(db, {
      name: "Test Org",
      slug: `test-${suffix}`,
      admin: { email: adminEmail, name: "Ada", initialPassword: password },
    }));
    adminId = (await authenticate(db, adminEmail, password))!;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(inArray(users.email, createdEmails));
    await pool.end();
  });

  describe("authenticate", () => {
    it("accepts the right password, case-insensitively on email", async () => {
      expect(adminId).toBeTruthy();
      expect(await authenticate(db, adminEmail.toUpperCase(), password)).toBe(adminId);
    });

    it("rejects a wrong password or unknown email", async () => {
      expect(await authenticate(db, adminEmail, "wrong password!!")).toBeNull();
      expect(await authenticate(db, `nobody-${suffix}@example.com`, password)).toBeNull();
    });
  });

  describe("sessions", () => {
    it("creates, validates and invalidates a session", async () => {
      const { token } = await createSession(db, adminId);
      const session = await validateSessionToken(db, token);
      expect(session?.user.email).toBe(adminEmail);
      expect(session?.renewed).toBe(false);

      await invalidateSession(db, token);
      expect(await validateSessionToken(db, token)).toBeNull();
    });

    it("stores only a hash of the token", async () => {
      const { token } = await createSession(db, adminId);
      const rows = await db.select().from(sessions).where(eq(sessions.userId, adminId));
      expect(rows.some((r) => r.id === token)).toBe(false);
      expect(rows.some((r) => r.id === hashSessionToken(token))).toBe(true);
    });

    it("rejects and removes expired sessions", async () => {
      const { token } = await createSession(db, adminId);
      await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.id, hashSessionToken(token)));
      expect(await validateSessionToken(db, token)).toBeNull();
      expect(await db.select().from(sessions).where(eq(sessions.id, hashSessionToken(token)))).toEqual([]);
    });

    it("extends sessions close to expiry", async () => {
      const { token } = await createSession(db, adminId);
      const soon = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.update(sessions).set({ expiresAt: soon }).where(eq(sessions.id, hashSessionToken(token)));
      const session = await validateSessionToken(db, token);
      expect(session?.renewed).toBe(true);
      expect(session!.expiresAt.getTime()).toBeGreaterThan(soon.getTime());
    });

    it("rejects unknown tokens", async () => {
      expect(await validateSessionToken(db, "not-a-real-token")).toBeNull();
    });
  });

  describe("memberships", () => {
    it("resolves org access by slug", async () => {
      const access = await getOrgAccess(db, adminId, `test-${suffix}`);
      expect(access).toEqual({ organization: expect.objectContaining({ id: orgId }), role: "org_admin" });
      expect(await getOrgAccess(db, adminId, "some-other-org")).toBeNull();
      expect((await listUserOrgs(db, adminId)).map((o) => o.organization.id)).toEqual([orgId]);
    });

    it("adds, re-roles and removes members", async () => {
      const email = `analyst-${suffix}@example.com`;
      createdEmails.push(email);
      const { userId, created } = await addMember(db, {
        organizationId: orgId,
        email,
        role: "analyst",
        initialPassword: "analyst password",
      });
      expect(created).toBe(true);
      await expect(addMember(db, { organizationId: orgId, email, role: "viewer" })).rejects.toThrow(/already a member/);

      await changeRole(db, orgId, userId, "viewer");
      expect((await listMembers(db, orgId)).find((m) => m.userId === userId)?.role).toBe("viewer");

      await removeMember(db, orgId, userId);
      expect((await listMembers(db, orgId)).map((m) => m.userId)).toEqual([adminId]);
    });

    it("requires a password for brand-new users", async () => {
      await expect(
        addMember(db, { organizationId: orgId, email: `nopw-${suffix}@example.com`, role: "viewer" }),
      ).rejects.toThrow(MembershipError);
    });

    it("never leaves an organisation without an admin", async () => {
      await expect(changeRole(db, orgId, adminId, "analyst")).rejects.toThrow(/at least one admin/);
      await expect(removeMember(db, orgId, adminId)).rejects.toThrow(/at least one admin/);
    });

    it("rejects a taken organisation slug", async () => {
      await expect(
        createOrganization(db, { name: "Dup", slug: `test-${suffix}`, admin: { email: adminEmail } }),
      ).rejects.toThrow(/already taken/);
    });
  });
});
