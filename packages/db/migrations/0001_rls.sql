-- Tenant isolation via row-level security.
--
-- The app connects as pollinate_app (see docker/postgres-init.sql), which owns
-- no tables and has NOBYPASSRLS, so these policies always apply to it. FORCE
-- additionally applies them to the table owner, as defence in depth.
--
-- withTenant() sets app.current_org_id per transaction. When it is unset the
-- setting reads as NULL, the comparison is NULL, and no rows are visible.

-- Helper: the organisation of the current transaction, or NULL.
CREATE FUNCTION app_current_org_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.current_org_id', true), '')::uuid $$;
--> statement-breakpoint

-- Runtime role privileges. Platform tables (organizations, users, memberships)
-- are not RLS-protected; only the identity/admin modules may query them.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pollinate_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_org_id() TO pollinate_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pollinate_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pollinate_app;
--> statement-breakpoint

ALTER TABLE "surveys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "surveys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "surveys"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
--> statement-breakpoint

ALTER TABLE "survey_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "survey_versions" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "survey_versions"
  USING (organization_id = app_current_org_id())
  WITH CHECK (organization_id = app_current_org_id());
