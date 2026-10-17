import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { SurveyDefinition } from "@pollinate/engine";

/*
 * Tenancy convention
 * ------------------
 * Platform tables (organizations, users, memberships) are global and are only
 * touched by the identity/admin modules.
 *
 * Every tenant table:
 *  - has a non-null `organization_id`;
 *  - has row-level security enabled and FORCED (see migrations/*_rls.sql), so
 *    rows are only visible when `app.current_org_id` matches — use withTenant();
 *  - references other tenant rows by (organization_id, id) composite keys, so a
 *    row can never point at another organisation's data.
 *
 * test/tenancy.test.ts fails if a table with organization_id lacks RLS.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Platform tables
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const membershipRole = pgEnum("membership_role", ["org_admin", "analyst", "viewer"]);

export const memberships = pgTable(
  "memberships",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: membershipRole("role").notNull(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] })],
);

// ---------------------------------------------------------------------------
// Tenant tables
// ---------------------------------------------------------------------------

export const surveyStatus = pgEnum("survey_status", ["draft", "active", "closed", "archived"]);

export const surveys = pgTable(
  "surveys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: surveyStatus("status").notNull().default("draft"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [unique("surveys_org_id_key").on(t.organizationId, t.id)],
);

/**
 * One row per version. A version is editable while `published_at` is null and
 * frozen once published; responses always reference a published version.
 */
export const surveyVersions = pgTable(
  "survey_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id").notNull(),
    surveyId: uuid("survey_id").notNull(),
    version: integer("version").notNull(),
    definition: jsonb("definition").$type<SurveyDefinition>().notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("survey_versions_survey_version_key").on(t.surveyId, t.version),
    unique("survey_versions_org_id_key").on(t.organizationId, t.id),
    foreignKey({
      name: "survey_versions_survey_fk",
      columns: [t.organizationId, t.surveyId],
      foreignColumns: [surveys.organizationId, surveys.id],
    }).onDelete("cascade"),
  ],
);
