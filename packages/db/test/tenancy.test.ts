import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, organizations, surveys, surveyVersions, withTenant, type Db } from "../src/index";
import type { SurveyDefinition } from "@pollinate/engine";

// Requires the dev database: `npm run db:up && npm run db:migrate -w @pollinate/db`.
const APP_URL = process.env.DATABASE_URL ?? "postgres://pollinate_app:pollinate_app@localhost:5432/pollinate";
const OWNER_URL =
  process.env.DATABASE_OWNER_URL ?? "postgres://pollinate_owner:pollinate_owner@localhost:5432/pollinate";

/** Drizzle wraps driver errors ("Failed query: ..."); the Postgres reason is on `cause`. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  type PgError = Error & { constraint?: string };
  const err = await promise.then(
    () => null,
    (e: unknown) => e as PgError & { cause?: PgError },
  );
  expect(err, "expected the query to fail").not.toBeNull();
  const cause: PgError = err!.cause ?? err!;
  expect(`${cause.message} ${cause.constraint ?? ""}`).toMatch(pattern);
}

const definition: SurveyDefinition = {
  schemaVersion: 1,
  title: "T",
  pages: [{ id: "p", questions: [{ id: "q", type: "text", prompt: "Q", required: false, multiline: false }], next: [] }],
};

describe("tenant isolation (row-level security)", () => {
  const app = createDb(APP_URL);
  const owner = createDb(OWNER_URL);
  const db: Db = app.db;
  let orgA: string;
  let orgB: string;
  let surveyA: string;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    [{ id: orgA }, { id: orgB }] = await db
      .insert(organizations)
      .values([
        { slug: `a-${suffix}`, name: "Org A" },
        { slug: `b-${suffix}`, name: "Org B" },
      ])
      .returning({ id: organizations.id }) as [{ id: string }, { id: string }];

    surveyA = await withTenant(db, orgA, async (tx) => {
      const [row] = await tx.insert(surveys).values({ organizationId: orgA, title: "A's survey" }).returning();
      return row!.id;
    });
  });

  afterAll(async () => {
    await owner.db.delete(organizations).where(sql`${organizations.id} in (${orgA}, ${orgB})`);
    await Promise.all([app.pool.end(), owner.pool.end()]);
  });

  it("enables and forces RLS on every table with an organization_id column", async () => {
    const { rows } = await owner.pool.query<{ table_name: string; rls: boolean; forced: boolean }>(`
      select c.relname as table_name, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join information_schema.columns col
        on col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'organization_id'
      where c.relkind = 'r'
        and c.relname not in ('memberships') -- platform table, see schema.ts
    `);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => !r.rls || !r.forced).map((r) => r.table_name)).toEqual([]);
  });

  it("shows a tenant its own rows", async () => {
    const rows = await withTenant(db, orgA, (tx) => tx.select().from(surveys));
    expect(rows.map((r) => r.id)).toEqual([surveyA]);
  });

  it("hides other tenants' rows", async () => {
    const rows = await withTenant(db, orgB, (tx) => tx.select().from(surveys));
    expect(rows).toEqual([]);
  });

  it("shows nothing without a tenant context", async () => {
    expect(await db.select().from(surveys)).toEqual([]);
  });

  it("rejects writes without a tenant context", async () => {
    await expectDbError(db.insert(surveys).values({ organizationId: orgA, title: "No context" }), /row-level security/);
  });

  it("rejects inserting rows for another tenant", async () => {
    await expectDbError(
      withTenant(db, orgB, (tx) => tx.insert(surveys).values({ organizationId: orgA, title: "Sneaky" })),
      /row-level security/,
    );
  });

  it("cannot update or delete another tenant's rows", async () => {
    const updated = await withTenant(db, orgB, (tx) =>
      tx.update(surveys).set({ title: "Hacked" }).where(eq(surveys.id, surveyA)).returning(),
    );
    const deleted = await withTenant(db, orgB, (tx) => tx.delete(surveys).where(eq(surveys.id, surveyA)).returning());
    expect(updated).toEqual([]);
    expect(deleted).toEqual([]);
    const [row] = await withTenant(db, orgA, (tx) => tx.select().from(surveys).where(eq(surveys.id, surveyA)));
    expect(row!.title).toBe("A's survey");
  });

  it("cannot reference another tenant's survey from a child row", async () => {
    await expectDbError(
      withTenant(db, orgB, (tx) =>
        tx.insert(surveyVersions).values({ organizationId: orgB, surveyId: surveyA, version: 1, definition }),
      ),
      /survey_versions_survey_fk/,
    );
  });

  it("stores and reads back a survey definition", async () => {
    const version = await withTenant(db, orgA, async (tx) => {
      await tx.insert(surveyVersions).values({ organizationId: orgA, surveyId: surveyA, version: 1, definition });
      const [row] = await tx.select().from(surveyVersions).where(eq(surveyVersions.surveyId, surveyA));
      return row!;
    });
    expect(version.definition).toEqual(definition);
  });

  it("does not leak the tenant context to later queries on the pool", async () => {
    await withTenant(db, orgA, (tx) => tx.select().from(surveys));
    const { rows } = await app.pool.query("select app_current_org_id() as org");
    expect(rows[0].org).toBeNull();
    expect(await db.select().from(surveys)).toEqual([]);
  });
});
