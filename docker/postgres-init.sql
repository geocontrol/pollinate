-- Dev only: runs once when the Postgres volume is first created.
-- In production, provision pollinate_app through your infrastructure tooling.
-- NOBYPASSRLS + not owning any tables means row-level security always applies.
CREATE ROLE pollinate_app LOGIN PASSWORD 'pollinate_app' NOSUPERUSER NOBYPASSRLS;
GRANT CONNECT ON DATABASE pollinate TO pollinate_app;
GRANT USAGE ON SCHEMA public TO pollinate_app;
