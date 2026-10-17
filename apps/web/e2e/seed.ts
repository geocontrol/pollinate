/**
 * Seeds (or with --teardown, removes) isolated e2e data in the dev database.
 * Run by Playwright's global setup/teardown via tsx.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { inArray, like } from "drizzle-orm";
import { createOrganization, hashPassword } from "@pollinate/auth";
import { createDb, organizations, users } from "@pollinate/db";

export interface E2EState {
  suffix: string;
  password: string;
  adminEmail: string;
  orgSlug: string;
  orgName: string;
  otherOrgSlug: string;
}

const STATE_FILE = new URL("./.state.json", import.meta.url);
const url = process.env.DATABASE_URL ?? "postgres://pollinate_app:pollinate_app@localhost:5432/pollinate";
const { db, pool } = createDb(url);

async function seed() {
  const suffix = randomUUID().slice(0, 8);
  const password = "e2e password long enough";
  const state: E2EState = {
    suffix,
    password,
    adminEmail: `e2e-admin-${suffix}@example.com`,
    orgSlug: `e2e-${suffix}`,
    orgName: `E2E Org ${suffix}`,
    otherOrgSlug: `e2e-other-${suffix}`,
  };
  await db.insert(users).values({
    email: state.adminEmail,
    name: "E2E Admin",
    passwordHash: await hashPassword(password),
    isPlatformAdmin: true,
  });
  await createOrganization(db, { name: state.orgName, slug: state.orgSlug, admin: { email: state.adminEmail } });
  await createOrganization(db, {
    name: "Someone else's org",
    slug: state.otherOrgSlug,
    admin: { email: `e2e-other-${suffix}@example.com`, initialPassword: password },
  });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function teardown() {
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2EState;
  await db.delete(organizations).where(like(organizations.slug, `%${state.suffix}%`));
  const seeded = await db.select({ id: users.id }).from(users).where(like(users.email, `%${state.suffix}%`));
  if (seeded.length) await db.delete(users).where(inArray(users.id, seeded.map((u) => u.id)));
  rmSync(STATE_FILE);
}

const run = process.argv.includes("--teardown") ? teardown : seed;
run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
