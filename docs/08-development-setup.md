# Development Setup — Local and Remote Supabase

**Version:** 1.1
**Last Updated:** August 28, 2026

How to run Kaaj against a local Supabase stack, against the hosted project, and
how to keep the two from being confused for each other.

---

## Prerequisites

| Tool | Why |
|---|---|
| Docker | Runs the local Supabase stack |
| Supabase CLI ≥ 2.115 | `supabase start`, `db reset`, `db push` |
| Node LTS | The SvelteKit app |
| `psql` 17 | The database test harnesses |

---

## Repository layout

```
kaaj/
├── .github/workflows/     CI — must be at the ROOT; GitHub ignores it elsewhere
├── app/                   SvelteKit application
│   ├── .env.local         LOCAL stack values      (gitignored, loaded by Vite)
│   ├── .env.prod          REMOTE project values   (gitignored, NOT auto-loaded)
│   └── .env.example       Template, committed, no secrets
├── supabase/
│   ├── config.toml        Ports, auth settings, seed path
│   └── migrations/        MUST be a sibling of config.toml — see the note below
├── scripts/               Database verification harnesses
└── docs/data-models/      schema.sql (design), mock-data.sql (fixture)
```

> **Why `supabase/migrations/` sits beside `config.toml`:** the CLI resolves
> `migrations/` *relative to config.toml*. When the migrations lived under
> `app/supabase/` while config.toml was at the root, `supabase db reset` applied
> **zero** migrations and reported success. If you ever move one, move both.

---

## Local development

```bash
supabase start      # first run pulls images; prints all URLs and keys
cd app && npm install && npm run dev
```

| Service | URL |
|---|---|
| App | http://localhost:5173 |
| Supabase API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Mailpit (all outbound mail) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

`app/.env.local` already points at these and is loaded automatically by Vite.
The local stack uses fixed demo keys, identical on every machine, so nothing in
that file is secret.

### Everyday commands

```bash
supabase status                  # reprint URLs and keys
supabase stop                    # shut down, preserving data
supabase db reset                # rebuild from migrations + reseed the fixture
supabase migration new <name>    # create a timestamped migration
```

`db reset` is the one to reach for after changing a migration: it drops, replays
every migration from empty, and reseeds Northwind.

### Port conflicts

If another Supabase project is running locally, `supabase start` fails with
`port is already allocated`. Either stop it —

```bash
supabase stop --project-id <other-project>
```

— or give this project its own port block by editing the `port` entries in
`supabase/config.toml` (and updating `app/.env.local` to match).

---

## Remote (hosted) project

`app/.env.prod` holds the hosted project's credentials. **SvelteKit does not
load it automatically** — that is deliberate, so a stray `npm run dev` cannot
silently write to production.

To point the app at the cloud project for one run:

```bash
cd app && env $(grep -v '^#' .env.prod | xargs) npm run dev
```

For real deployments, put these values in the hosting platform's secret store
rather than shipping the file.

### Which environment am I talking to?

```bash
grep PUBLIC_SUPABASE_URL app/.env.local
# http://127.0.0.1:54321   → local
# https://<ref>.supabase.co → remote
```

### Pushing schema changes to the hosted project

```bash
supabase link --project-ref <ref>     # once per machine
supabase db push                      # apply pending migrations
```

Verify locally first. `db push` is not reversible: migrations are forward-only,
so a mistake is corrected by writing another migration, not by rolling back.

---

## Database tests

Five harnesses, all plain `psql` or bash. Run them against **local**, never against
production — except `verify-remote.sh`, which is built for it.

```bash
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

cd app && npm run db:verify        # everything below, in one command
```

Or individually:

```bash
# 1. Tenant isolation — 575 assertions across all tenant-scoped tables
psql "$DATABASE_URL" -v strict=1 -f scripts/verify-rls.sql

# 2. Specification — 167 assertions drawn from the module specs
psql "$DATABASE_URL" -v strict=1 -f docs/data-models/verify-stories.sql

# 3. Design invariants — 40 assertions from the ADRs
psql "$DATABASE_URL" -v strict=1 -f scripts/verify-invariants.sql

# 4. Structure snapshot — 4,152 catalog facts
scripts/db-snapshot.sh --check

# 5. Migrations apply cleanly to a throwaway cluster
scripts/verify-migrations.sh
```

### Changing the schema

```bash
supabase migration new add_something     # write the migration
supabase db reset                        # rebuild from migrations
cd app && npm run db:snapshot            # regenerate the snapshot
# commit the migration AND the snapshot together
```

**Always `db reset` before regenerating.** Generating from a hand-modified
database bakes local experiments into the baseline — this happened while the
script was being written: a manual `ALTER` left `invoices.total` as
`numeric(18,2)` when the migration says `numeric(15,2)`, and the first snapshot
recorded the wrong value. The next rebuild caught it, which is the system
working, but it is easier to avoid.

If `enumerations.json` changes, regenerate its fixture too:

```bash
cd app && npm run db:enums
```

`-v strict=1` makes a failure exit non-zero, which is what CI uses.

> **Never run `verify-rls.sql` against production.** It seeds a second tenant
> and writes probe rows. `scripts/verify-remote.sh` is the only harness safe to
> point at a live database — it forces a read-only transaction and aborts if
> that did not take effect.

### What each proves

| Harness | Proves | Notably does *not* prove |
|---|---|---|
| `verify-rls.sql` | Every policy actually filters, per table | Anything about tables with no fixture rows — which is why it fails if one appears |
| `verify-stories.sql` | Schema and fixture answer the module specs | That policies work; its RLS checks are metadata only |
| `verify-invariants.sql` | Design rules hold: index prefixes, enum conformance, closed Data API | That the schema is *unchanged* — that is the snapshot's job |
| `db-snapshot.sh` | The schema is exactly what was committed | That any of it is *correct* — only that it has not moved |
| `verify-migrations.sh` | Migrations replay from empty | The hosted database's current state |

The last two are complementary and neither substitutes for the other: the
invariants prove rules hold but say nothing about drift; the snapshot proves
nothing changed but cannot say whether it was right to begin with.

They also assert opposite role postures, deliberately: `verify-stories.sql`
requires a BYPASSRLS role (under `FORCE ROW LEVEL SECURITY` even the table owner
sees nothing, so every data check would fail confusingly), while
`verify-rls.sql` requires that `app_user` does *not* bypass, or its isolation
checks would pass vacuously.

---

## Environment variables

| Variable | Local | Remote |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | `https://<ref>.supabase.co` |
| `PUBLIC_SUPABASE_ANON_KEY` | fixed demo key | Dashboard → Settings → API |
| `PRIVATE_SUPABASE_SERVICE_ROLE` | fixed demo key | Dashboard → Settings → API |
| `DATABASE_URL` | local Postgres | Settings → Database → session pooler |

`PRIVATE_SUPABASE_SERVICE_ROLE` **bypasses RLS entirely**. It belongs only in
server-side code and the worker — never in anything reachable from a request
handler, and never in a `PUBLIC_`-prefixed variable, which SvelteKit ships to
the browser.

---

## Troubleshooting

**`supabase db reset` applies no migrations** — `config.toml` and `migrations/`
are not siblings.

**`permission denied to set role "app_user"`** — PostgreSQL 16+ requires
`set_option` on the membership, which a plain `GRANT` does not confer:

```sql
GRANT app_user TO postgres WITH SET TRUE;
```

`verify-rls.sql` does this automatically when it can.

**Isolation tests all pass suspiciously** — check `app_user` does not bypass RLS:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = 'app_user';
```

Both flags must be `false`. `verify-rls.sql` asserts this before doing anything.

**Everything returns 0 rows as a non-superuser** — expected. Every table has
`FORCE ROW LEVEL SECURITY`, which binds the owner too. Set a tenant claim:

```sql
BEGIN;
  SET LOCAL ROLE app_user;
  SET LOCAL request.jwt.claims = '{"app_metadata":{"tenant_id":"<uuid>"}}';
  SELECT count(*) FROM employees;
COMMIT;
```

The fixture prints the Northwind tenant id when it loads.

---

## Related documents

- [Architecture Decisions](./05-architecture-decisions.md) — ADR-003 tenancy,
  ADR-008 Supabase, ADR-009 per-request database routing
- [`app/` provenance](./07-app-provenance.md) — where the starter came from and
  what is planned to change
- [Technical Architecture](./architecture-technical.md)
