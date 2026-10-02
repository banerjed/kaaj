# What `./check` runs

| Step | Proves | Count |
|---|---|---|
| tenant isolation | each RLS policy filters the rows, for each table | 803 |
| specification | the schema can answer the specifications of the modules | 173 |
| schema invariants | the ADR design rules are true, and a bad claim fails closed | 165 |
| structure snapshot | the schema is the same as the committed schema | 4,989 lines |
| enum fixture | `expected-enums.sql` agrees with `enumerations.json` | — |
| authorization | each form action has a guard; the application code contains no DELETE | 215 |
| actor | each `withTenant` gets the actor, not only a tenant id | — |
| no backtick in SQL | no `--` comment in a `tx\`...\`` template contains a backtick | — |
| no query inside a loop | no `tx`...`` /`tx.unsafe` call is in a loop or in an iteration callback (an N+1 query pattern on large data) | 5 exemptions |
| tables classified by scale | each table is `SCALE_SENSITIVE` or `NOT_SCALE_SENSITIVE`, with a reason | 43 + 92 |
| no unprotected fallback | no protected column uses `COALESCE` to get the value of an open column | — |
| every table classified | each table is row-scoped (the step compares this with its policies), per-column, tenant-wide, or exposed-pending. Each column of each per-column table has a classification | 138 tables, 0 exposed |
| writes are audited | each action is in the audit register, in one of its two lists | 85 + 122 |
| refusals have a message | each constraint that a form can violate gives a sentence as its answer | 54 |
| service role quarantined | only the files in a committed list bypass RLS. Each table that the service role can reach has a real grant, not only an exemption from RLS | 7 files |
| product name not hardcoded | the product name occurs one time, in config.ts | — |
| fixtures are complete | no column of a base table is empty in the fixture | — |
| dedicated targets | each dedicated-tier row in `tenant_registry` resolves to a real database that the step can reach and that has the correct migrations (ADR-009) | — |
| security | authorization, PII and tenant isolation, in both test suites | 558 |
| format / lint / typecheck / unit tests / build | each workspace package, through turbo | 1,482 tests |
| front-page load | the step signs in as a real user, loads `/employees` 5×, and fails if the MEDIAN load time is more than 50ms (`apps/web/scripts/verify-front-page-load.mjs`) | 50ms |
| pages within budget (`--all`) | each page × each perf actor costs the database no more queries or data pages than `budgets.tsv` permits. Each page also takes no more time than in the last run on this machine | 640 |

**These counts do not stay correct.** They are in this file for a reason. If
nobody can examine a number, nobody can dispute the claim that it makes. If a
count changes, correct it, or delete the column. The last verification of
these counts was on 2026-10-02.

These steps add to each other. No step can replace another step:

- **Isolation** proves that the policies work. But it proves this only for the
  tables that have fixture rows. For this reason, it *fails* when a table has
  no fixture rows. It does not pass when it has nothing to test.
- **Specification** proves that the schema can answer the module
  specifications. Its RLS tests examine only metadata. A policy of
  `USING(true)` passes them.
- **Invariants** prove that the rules are true. They do not find drift
  (changes that nobody intended).
- **Snapshot** proves that nothing changed. It cannot tell you if the
  committed schema was correct.
