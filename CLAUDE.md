# Kaaj

Unified workplace management software for SMBs. Multi-tenant SaaS, competing
with Zoho and Odoo on integrated modules rather than depth in any one.

---

## ⚠️ Required before pushing

```bash
./check
```

**Everything must pass before you push, and always before deploying to
production.** Ten steps, about ten seconds. Non-zero exit means do not push.

```
./check          everything — run this before pushing
./check --db     database only
./check --app    application only
./check --quick  skip the build (fastest useful signal)
```

Needs the local stack running (`supabase start`). It finds `psql` and resolves
`DATABASE_URL` on its own — no shell setup required, and it works from any
directory in the repo.

### Deploying to production

```bash
./check                              # must be green
supabase db push                     # apply migrations to the hosted project
scripts/verify-remote.sh             # read-only verification against production
```

`supabase db push` is not reversible. Migrations are forward-only: a mistake is
corrected by writing another migration, never by rolling back.

**Never run `verify-rls.sql` against production** — it seeds a second tenant and
writes probe rows. `scripts/verify-remote.sh` is the only harness safe to point
at a live database; it forces a read-only transaction and aborts if that did not
take effect.

---

## What `./check` runs

| Step | Proves | Count |
|---|---|---|
| tenant isolation | every RLS policy actually filters, per table | 575 |
| specification | the schema answers the module specs | 167 |
| schema invariants | ADR design rules hold | 40 |
| structure snapshot | the schema is exactly what was committed | 4,152 facts |
| enum fixture | `expected-enums.sql` is current with `enumerations.json` | — |
| format / lint / typecheck / unit tests / build | the app | 8 tests |

These are complementary and none substitutes for another:

- **Isolation** proves policies work, but only where fixture rows reach — which
  is why it *fails* when a table has no fixture rather than passing vacuously.
- **Specification** proves the schema can answer the module specs. Its RLS
  checks are metadata-only; a policy of `USING(true)` passes them.
- **Invariants** prove rules hold, but say nothing about drift.
- **Snapshot** proves nothing changed, but cannot say whether it was right.

---

## Architecture in one paragraph

A **modular monolith**: SvelteKit is both frontend and backend
([ADR-004](docs/05-architecture-decisions.md)), modules are directories rather
than services ([ADR-001](docs/05-architecture-decisions.md)), and PostgreSQL is
the only datastore — search, job queue and cache included
([ADR-002](docs/05-architecture-decisions.md)). Supabase provides Postgres, Auth
and Storage ([ADR-008](docs/05-architecture-decisions.md)). Tenancy is shared
schema with `tenant_id`, isolated by row-level security
([ADR-003](docs/05-architecture-decisions.md)).

Full reasoning, including what was rejected and why, is in
[docs/05-architecture-decisions.md](docs/05-architecture-decisions.md).

---

## Layout

```
kaaj/
├── check                  ← run this before pushing
├── .github/workflows/     CI. Must live at the ROOT; GitHub ignores it elsewhere
├── app/                   SvelteKit application
├── supabase/
│   ├── config.toml        ← migrations/ MUST stay beside this
│   └── migrations/        the authoritative schema
├── scripts/               verification harnesses
└── docs/
    ├── 05-architecture-decisions.md   the ADRs
    ├── 08-development-setup.md        local + remote setup
    └── data-models/                   schema, fixture, snapshot
```

---

## Rules that are easy to get wrong

**Migrations, not `schema.sql`.** `docs/data-models/schema.sql` is the design
document: it issues no `GRANT`s, so no role can read anything, and it defines
`app.set_updated_at()` without wiring it to a trigger. Only
`supabase/migrations/` produces a working database. Build and test from there.

**`config.toml` and `migrations/` must be siblings.** The CLI resolves
`migrations/` relative to `config.toml`. When they were split,
`supabase db reset` applied **zero** migrations and reported success.

**Regenerate the snapshot only from a migration-built database.**

```bash
supabase db reset && npm --prefix app run db:snapshot
```

Generating from a hand-modified database bakes local experiments into the
baseline. This has already happened once: a manual `ALTER` left `invoices.total`
as `numeric(18,2)` when the migration says `numeric(15,2)`.

**Every exemption is a committed literal, never a filter.** The harnesses list
exempt tables and indexes by name with reasons. A new violation fails, and so
does removing a justified one — both require a reviewed edit. A `NOT IN` pattern
silently absorbs future violations, which is how a suite quietly stops testing
anything.

**Customization is data, never code.** Customers customize through rows, custom
field definitions and settings — never per-tenant schema changes or per-tenant
code. See [docs/06-customization-model.md](docs/06-customization-model.md).

**Custom fields must never feed payroll or accounting calculations.** They are
untyped and untested. A customer needing a custom allowance on a payslip is a
modelling gap to fix in the product, not a custom field.

**`PRIVATE_SUPABASE_SERVICE_ROLE` bypasses RLS entirely.** Server-side and
worker only — never in anything reachable from a request handler, and never in a
`PUBLIC_`-prefixed variable, which SvelteKit ships to the browser.

---

## Common tasks

```bash
supabase start                       # bring the local stack up
cd app && npm run dev                # http://localhost:5173

supabase migration new <name>        # new migration
supabase db reset                    # rebuild from migrations, reseed fixture
npm --prefix app run db:snapshot     # regenerate the snapshot after a change
npm --prefix app run db:enums        # regenerate the enum fixture

supabase status                      # URLs and keys
```

Studio is at http://127.0.0.1:54323 and all outbound mail is captured at
http://127.0.0.1:54324.

Local environment values live in `app/.env.local` and are loaded automatically.
Production values live in `app/.env.prod`, which is deliberately **not**
auto-loaded so a stray `npm run dev` cannot write to production. Both are
gitignored.
