# Development Setup — Local and Remote Supabase

**Version:** 2.0
**Last Updated:** August 28, 2026

How to run Kaaj against a local Supabase stack, against the hosted project, and
how to keep the two from being confused for each other.

---

## Quick start

```bash
./setup
```

One command from a fresh clone to a verified stack. It checks and installs
prerequisites, installs workspace dependencies, creates `apps/web/.env.local`
from the template, starts Supabase, confirms the fixture actually seeded, and
runs `./check`.

Use `./setup --check` first if you would rather see what it intends to install.

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

Turborepo monorepo, pnpm workspaces.

```
kaaj/
├── check                  Run everything. The pre-push gate.
├── turbo.json             Task graph; ./check and CI both drive it
├── .github/workflows/     CI — must be at the ROOT; GitHub ignores it elsewhere
├── supabase/              Must stay at the ROOT — the CLI searches UPWARD only
│   ├── config.toml        Ports, auth, and the seed path
│   └── migrations/        MUST be a sibling of config.toml — see below
├── apps/
│   └── web/               SvelteKit — frontend and backend
│       ├── .env.local     LOCAL values     (gitignored, loaded by Vite)
│       ├── .env.prod      REMOTE values    (gitignored, NOT auto-loaded)
│       └── .env.example   Template, committed, no secrets
├── packages/
│   ├── validation/        33 country-specific validators (@kaaj/validation)
│   ├── enums/             enumerations.json + SQL fixture generator
│   ├── database/          fixtures, harnesses, snapshot, schema reference
│   ├── eslint-config/     shared flat config
│   └── typescript-config/
└── docs/                  prose only
```

### Workspace commands

```bash
pnpm install                       # the whole workspace
pnpm dev                           # apps/web on :5173
pnpm turbo run build               # everything, cached
pnpm --filter @kaaj/web test       # one package
pnpm --filter @kaaj/enums build    # regenerate the enum fixture
```

**Packages are framework-agnostic** — plain TS/JS, no Svelte imports — so a
future mobile app can consume them regardless of what it is built with.

> **Why `supabase/` stays at the repo root, outside `packages/`:** the CLI
> searches *upward* for `config.toml`, never downward. At the root it works from
> any directory; under `packages/database/` it would only work from there and
> below. `migrations/` must also stay beside `config.toml` — when they were
> split, `supabase db reset` applied **zero** migrations and reported success.
>
> `config.toml` also points at the fixture by relative path
> (`[db.seed] sql_paths`). A wrong value there makes `db reset` report success
> against an *empty* database. After any move, check that
> `SELECT count(*) FROM employees` returns 12, not 0.

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

`apps/web/.env.local` already points at these and is loaded automatically by Vite.
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
`supabase/config.toml` (and updating `apps/web/.env.local` to match).

---

## Remote (hosted) project

`apps/web/.env.prod` holds the hosted project's credentials. **SvelteKit does not
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
grep PUBLIC_SUPABASE_URL apps/web/.env.local
# http://127.0.0.1:54321   → local
# https://<ref>.supabase.co → remote
```

### Building against production

The app reads whichever env file it is given. `PUBLIC_*` values are inlined at
build time, so the target is baked into the artifact — a build made with
`.env.local` cannot talk to production, and vice versa.

```bash
cd apps/web
env $(grep -vE '^#|^$' .env.prod | xargs) pnpm build    # production artifact
pnpm build                                              # local artifact
```

Verified: both produce a build whose output contains the corresponding Supabase
URL.

### Testing against production

Only one harness is safe to point at a live database:

```bash
SUPABASE_DB_URL="postgresql://...?sslmode=require" \
  packages/database/tests/verify-remote.sh
```

It forces `default_transaction_read_only` on the connection and aborts if that
did not take effect, and it refuses to report a pass if the connecting role
bypasses RLS — an unverifiable result is reported as unverified rather than
green.

**`SUPABASE_DB_URL` is deliberately a different variable from `DATABASE_URL`.**
`DATABASE_URL` points at the local stack everywhere else in the repo; if the
remote checker read it, running it after sourcing `.env.local` would silently
check local and report a meaningless pass. Targeting production has to be a
conscious act.

**Never run the other harnesses against production.** `verify-rls.sql` seeds a
second tenant and writes probe rows.

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
psql "$DATABASE_URL" -v strict=1 -f packages/database/tests/verify-rls.sql

# 2. Specification — 167 assertions drawn from the module specs
psql "$DATABASE_URL" -v strict=1 -f packages/database/tests/verify-stories.sql

# 3. Design invariants — 40 assertions from the ADRs.
#    Needs the enum fixture; there is no relative fallback, by design.
pnpm --filter @kaaj/enums build
psql "$DATABASE_URL" -v strict=1 \
  -v enum_fixture="$PWD/packages/enums/dist/expected-enums.sql" \
  -f packages/database/tests/verify-invariants.sql

# 4. Structure snapshot — 4,152 catalog facts
packages/database/scripts/db-snapshot.sh --check

# 5. Migrations apply cleanly to a throwaway cluster
packages/database/scripts/verify-migrations.sh
```

### Changing the schema

```bash
supabase migration new add_something     # write the migration
supabase db reset                        # rebuild from migrations
cd app && pnpm db:snapshot            # regenerate the snapshot
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
> and writes probe rows. `packages/database/tests/verify-remote.sh` is the only harness safe to
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

## On-premise installation

`./setup` is a **developer** bootstrap. It is deliberately not an on-premise
installer, and pointing it at a customer's infrastructure would seed their
database with the Northwind test fixture.

A real on-premise installer is deferred by
[ADR-007](./05-architecture-decisions.md#adr-007-defer-on-premise-deployment).
Three things would have to change first, and none is packaging:

1. **`apps/web` still uses `adapter-auto`.**
   [ADR-005](./05-architecture-decisions.md#adr-005-node-lts-as-the-runtime)
   calls for `adapter-node`, since an on-premise install is a long-running
   container rather than a serverless target.
2. **Authentication is hosted by Supabase.**
   [ADR-010](./05-architecture-decisions.md#adr-010-enterprise-sso-for-dedicated-tenants)
   records this as the real coupling: a customer's business data could sit on
   their infrastructure while their user identities do not. For a buyer whose
   requirement is custody, that defeats the point — see the residency discussion
   in [ADR-009](./05-architecture-decisions.md#adr-009-subdomain-routed-database-targets).
3. **There is no update path.** N installations on different versions need a
   versioned image plus a forward-only migration runner with per-installation
   version tracking, and expand/contract migrations throughout. That has to
   exist from the first customer, not be retrofitted.

What `./setup` *does* establish is the shape such an installer would take:
detect prerequisites, apply migrations, verify the result rather than assume it.
The parts it would drop are the demo credentials and the test fixture; the parts
it would add are the three above.

---

## Related documents

- [Architecture Decisions](./05-architecture-decisions.md) — ADR-003 tenancy,
  ADR-008 Supabase, ADR-009 per-request database routing
- [`app/` provenance](./07-app-provenance.md) — where the starter came from and
  what is planned to change
- [Technical Architecture](./architecture-technical.md)
