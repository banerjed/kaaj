# @kaaj/database

Everything that verifies the database. Not a JavaScript library — a package so
turbo can orchestrate its tasks and so these files stop being scattered between
`docs/` and `scripts/`.

```
fixtures/mock-data.sql   Northwind: 12 employees, 3 countries, self-verifying
tests/verify-rls.sql     575 tenant-isolation assertions across every table
tests/verify-stories.sql 167 assertions drawn from the module specs
tests/verify-invariants.sql  40 ADR design rules
tests/verify-remote.{sh,sql} read-only checks against a live database
scripts/db-snapshot.sh   generate/check the 4,152-fact structure snapshot
scripts/verify-migrations.sh  replay migrations into a throwaway cluster
snapshot/                the committed baseline; CI diffs against it
reference/schema.sql     DESIGN DOCUMENT — never build from it
```

**The migrations are not here.** They live in `supabase/migrations/` at the repo
root, because the Supabase CLI resolves them relative to `config.toml` and
searches only *upward* — at the root, `supabase start` works from any directory.

**`reference/schema.sql` is not the schema.** It issues no `GRANT`s and wires no
triggers. Only `supabase/migrations/` produces a working database.

## Running

```bash
./check --db                                  # everything, from the repo root
psql "$DATABASE_URL" -v strict=1 -f packages/database/tests/verify-rls.sql
```

`verify-invariants.sql` needs the enum fixture from `@kaaj/enums`:

```bash
pnpm --filter @kaaj/enums build
psql "$DATABASE_URL" -v strict=1 \
  -v enum_fixture="$PWD/packages/enums/dist/expected-enums.sql" \
  -f packages/database/tests/verify-invariants.sql
```

**Never point `verify-rls.sql` at production** — it seeds a second tenant and
writes probe rows. `tests/verify-remote.sh` is the only harness built for a live
database; it forces a read-only transaction and aborts if that did not take.
