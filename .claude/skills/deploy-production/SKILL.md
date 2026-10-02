---
name: deploy-production
description: Deploy Kaaj to production, or run a production-only tool (verify-remote.sh, check-error-rates.mjs, error-report.mjs, prune-error-log.mjs). Use when the user asks to deploy, push migrations to the hosted project, or look at production errors.
---

# Deploying to production

```bash
./check                              # must be green
supabase db push                     # apply migrations to the hosted project
packages/database/tests/verify-remote.sh             # read-only verification against production
```

`supabase db push` is not reversible. Migrations go forward only. To correct a
mistake, write another migration. Do not roll back.

**WARNING: Do not run `verify-rls.sql` against production.** It adds a second
tenant and writes probe rows. `packages/database/tests/verify-remote.sh` is
the only test script that is safe against the production database. It starts
a read-only transaction. If the read-only setting did not take effect, the
script stops.

**Three more production-only tools are at the same level as
`verify-remote.sh`. `./check` runs none of them.** A local development
database does not have the quantity of production errors that these tools
examine:

- `packages/database/tests/check-error-rates.mjs` is read-only, and it uses
  the same read-only guard on its connection. It counts the errors in
  `app_error_log` in a recent time window. If the count is more than a limit
  in its committed `THRESHOLDS` registry, the script exits with a non-zero
  code. Use a cron job on a host to run it. To connect a real alert channel,
  change one function (`notifyOncall`). This change is not done yet.
- `packages/database/tests/error-report.mjs` is read-only. It shows the same
  data in a form for people to read. It has the commands
  `routes`/`tenants`/`trend`, and each command takes `--days` (the default is
  7). It also has `lookup <error_id>`, which finds the one row for an id that
  a user gave you. Use it for a weekly review, not as a threshold test.
- `scripts/prune-error-log.mjs` is the only script here that writes to
  production. It deletes the `app_error_log` rows that are older than
  `--days` (the default is 30). By default, it does a dry run and only prints
  the count. **WARNING:** A delete is not reversible. The script deletes rows
  only when you give `--execute`. It connects as the database owner, because
  `app_user` has no DELETE grant on this table.
