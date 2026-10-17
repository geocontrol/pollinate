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
apps/       web (Next.js) and worker — coming next
```

## Getting started

Requires Node 22+ and Docker (or Podman).

```sh
npm install
npm run db:up        # Postgres 17 on localhost:5432
npm run db:migrate
npm test             # engine unit tests + db tenancy tests (needs the database)
npm run typecheck
```

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
