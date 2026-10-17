# Pollinate

A multi-tenant survey engine: branching surveys, unique resumable links per
recipient, recipient forwarding with lineage tracking, an analyst dashboard,
LLM-assisted analysis with citations back to individual responses, and a
report tool.

## Layout

```
packages/
  engine/   Survey definition schema, branching evaluator, validation (pure TS — runs in browser and server)
  db/       Drizzle schema, migrations, tenant-scoped access (Postgres row-level security)
  auth/     Passwords, sessions, memberships and role permissions
apps/
  web/      Next.js staff app: sign-in, organisation picker, members, platform admin
```

## Getting started

Requires Node 22+ and Docker (or Podman).

```sh
npm install
npm run db:up        # Postgres 17 on localhost:5432
npm run db:migrate

# Create your platform admin (prompts for a password) and a first organisation
npm run bootstrap -- --email you@example.com --name "Your Name" --org-name "Acme Ltd" --org-slug acme

npm run dev          # http://localhost:3000
```

Tests:

```sh
npm test             # unit + database integration tests (needs the database)
npm run test:e2e     # Playwright browser tests against a production build
npm run typecheck
```

First-time e2e setup: `npx playwright install chromium` (from `apps/web`).

Connection strings are in `.env.example`. Migrations run as `pollinate_owner`;
the app connects as `pollinate_app`, which row-level security always applies to.

## Key concepts

**Survey definitions** (`packages/engine/src/schema.ts`) are JSON: ordered pages
of questions (`single_choice`, `multiple_choice`, `text`, `rating`, `number`)
with branching:

- `visibleWhen` on a question or page — shown only when the condition holds
- `next` rules on a page — `skip_to` a later page or `end_survey`, first match wins

`validateDefinition()` must report no errors before a version is published. It
guarantees conditions only reference earlier questions and skips only go
forward, so every path terminates.

`computePath(definition, answers)` is the single source of truth for a
respondent's route. Answers to questions that branching has hidden are kept but
reported as `inapplicableQuestionIds` and never influence branching or analysis.

**Tenancy.** Every tenant table carries `organization_id`, has forced RLS, and
references other tenant rows by `(organization_id, id)`. Access tenant data only
via `withTenant(db, orgId, tx => ...)`. A test fails if a table with
`organization_id` is missing RLS.

**Staff access.** Organisations live in the URL (`/o/<slug>/...`). Pages call
`getOrgContext` / `requirePermission` (`apps/web/src/lib/auth.ts`); non-members
get a 404. Server actions are public endpoints, so every action re-checks
permission itself. Roles: **Admin** (members, settings), **Analyst** (surveys,
analysis, reports), **Viewer** (read-only) — see `packages/auth/src/permissions.ts`.
Platform admins create organisations but see no organisation's data unless
they are a member.

**Sessions.** A random 256-bit token in an httpOnly cookie; only its SHA-256 is
stored. 30-day sliding expiry. Passwords use scrypt (N=2^16, r=8, p=2).
Login attempts are rate-limited in memory — per process, so move it to shared
storage before running more than one web instance.
