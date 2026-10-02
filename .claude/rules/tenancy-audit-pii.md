---
paths:
  - "apps/web/src/routes/**/*.server.ts"
  - "apps/web/src/lib/server/**"
  - "apps/web/src/hooks.server.ts"
  - "supabase/migrations/**"
---

# Tenancy, audit, disclosure and PII rules

Claude Code loads this file when it reads server code or a migration.

## Tenancy, audit and disclosure

**Every `withTenant` takes `actorFrom(locals)`, never `locals.tenantId`.**
Visibility policies use the role and the identity of the user. Thus a bare
tenant id returns zero rows. No error occurs. The result is only a wrong
number ([L42](docs/10-lessons-learned.md)). `./check`
enforces this rule.

**An audit entry makes a copy of a value. Protect the copy in the same
way.** `audit_log` had no RLS policy. Thus, when the application started to
audit pay changes, every employee could read every pay change in the
organization ([L55](docs/10-lessons-learned.md)).

Now `audit_log` has a visibility policy. HR, payroll, an auditor and the
owner see all entries. All other users see only entries about themselves, or
entries that record their own actions. For each new write, ask: **who can
read what this writes?**

**Every write is classified in `apps/web/src/lib/server/audit/register.ts`,
and `./check` fails on one that is not.** The rule below was only prose for
months, and 3 of 26 actions obeyed it ([L54](docs/10-lessons-learned.md)).
Each audit entry obeys these rules:

- `changes` is `Record<string, {from, to}>` with STRING values. A JSON number
  returns as a float64, and nobody can correct this table.
- `action` comes from a closed set.
- `entityType` names the table.
- Prose goes in `reason`. Never mix prose with values, because redaction
  matches field NAMES.
- `audit.diff()` records only the fields that changed. Do not hide the one
  changed field among twenty unchanged fields. In a table that nobody can
  prune, that is the same as no record.

**If someone can later ask for the reason for a write, the write records an
audit entry in the SAME transaction.** Use `$lib/server/audit`. Examples are
approvals, pay changes, role grants and erasures. If the application writes
the entry afterwards, or as best effort, the trail records only what the
application believed. Then the trail and the real data become different
exactly when the difference is important ([L40](docs/10-lessons-learned.md)).

`audit_log` allows only INSERT and SELECT. A correction is a new row. Pass
the fields that changed, never a dump of the row. Nobody can delete from the
table, so all data that you write there stays there forever.

**Enforce a flag that controls who sees a value at the point where the code
READS the data. Keep the controlled value out of the returned type.**
Examples are `is_anonymous`, the `status` of a review, and `pii.reveal`. In
each example, the value is in the row next to the flag. Thus a page that
renders the value makes the promise false, with no error
([L39](docs/10-lessons-learned.md)).

Resolve the flag in SQL (`CASE WHEN ... THEN NULL`), not after the query. If
a repository gets the value and then removes it, the value is already in a
result set, a log line and a heap dump. Also add the fixture row that
triggers the rule. If you do not add it, no test examines the rule.

## PII and secrets

**Encrypt PII in the application, never in SQL. Always encrypt it through
`$lib/server/pii`.** `sealField` and `openField` are the only write path and
the only read path. They bind each ciphertext to
`tenant | table | column | row`. Thus nobody can move a value between rows
or tenants. If a call site assembles that binding itself, it will eventually
make an error.

- **Never add a plaintext PII column.** `./check` has four `pii/*` rules, and
  they fail on exactly this. A new PII column must have encryption, or it must
  be in `_pii_pending` in `verify-invariants.sql` with a reason. That is a
  committed literal, as all other exemptions here are.
- **Never index a PII column.** A btree keeps each value readable in its data
  pages. If you drop the column, the data pages still hold the values.
- **Keys are per EMPLOYEE.** GDPR Art. 17 gives a right to each individual. A
  key for the full tenant cannot satisfy that right. Erasure destroys the key.
  The destroyed key also makes the backups unreadable, and
  `UPDATE ... SET NULL` never changes the backups.
- **Do not implement the `DERIVE_KEY(org_prefix + org_4digit_code)` of the
  spec.** It has approximately 13 bits, and both inputs are in the database
  that it protects. It is a *label* for the key. Refer to
  [docs/13-pii-encryption.md](docs/13-pii-encryption.md).
- **Keep the backup of `PRIVATE_PII_KEK` separate from the database.** If the
  key is lost, all encrypted fields become unreadable. This is intentional.

**`PRIVATE_SUPABASE_SERVICE_ROLE` bypasses all of RLS:** every RLS policy,
every tenant predicate and every visibility rule. Code **imports** it. Code
never puts it on `locals`. Before, it was on `event.locals` for every request.
Then any handler could get it with one line of code, and it looked like
ordinary state of the request.

`./check`'s `service role quarantined` step holds a committed list of the
five files that may import it. None of these files is under `(app)`. The
step fails on a new importer and on a removed justification. It also fails
on any `.svelte` file that uses the key at all, because that would send the
key to the browser. Never put the key in a `PUBLIC_` variable. SvelteKit
sends `PUBLIC_` variables to the browser by design.

**Only the finance function can see accounting rows.** `invoices`,
`payments`, `bank_accounts` and twelve more tables have RESTRICTIVE RLS
policies with the role as the key. `finance_admin`, `auditor` and the base
admins can read. `auditor` does not write.

The application already refused, but RLS did not. Thus one absent
`requireCan` was sufficient to disclose the full ledger of the organization.
`row-visibility.test.ts` asserts both halves: the refused actor gets zero
rows, AND the permitted actor still gets rows.
