# Accounting conformance suite

The executable half of
[docs/34-accounting-conformance-spec-V1.md](../../../docs/34-accounting-conformance-spec-V1.md).
Read the spec first; this file only says where things are and how to run them.

```
pnpm db:acs:cluster up|rebuild|status|stop    the suite's own Postgres cluster (port 54350)
pnpm db:acs seed                              load ACS_GOLDEN_SEED_V1
pnpm db:acs run [ids...] [--nightly]          run every scenario, or GL-001 'AR-*' ...; --nightly adds gate-B ones
pnpm db:acs verify                            run every invariant against the current state
pnpm db:acs report                            the certification output of the last run
pnpm db:acs audit                             rewrite spec section 31: every scenario, its state, its fixture
pnpm db:acs migrate <ref>                     spec section 23: E2E at <ref>'s migrations, migrate to HEAD, compare
```

A first run on a machine: `pnpm db:acs:cluster up && pnpm db:acs seed && pnpm db:acs run`.

## Where things are

| Path | What |
|---|---|
| `cluster.sh` | The cluster. A copy of `perf/cluster.sh` with its own port, database and data directory, for the same reasons. |
| `capabilities.json` | The capability register (spec 3.2). A scenario of a `not_implemented` module or listed by id reports `NOT_IMPLEMENTED`. |
| `seed/*.sql` | The golden seed: one tenant, two actors, the chart, parties, tax rates, exchange rates, twelve open periods. |
| `scenarios/<module>/<ID>.yaml` | One fixture per scenario. The file name is the id. The fixture is the specification. |
| `invariants/<ID>.sql` | One file per global invariant; `$1` is the tenant id; zero rows means it holds. |
| `acs.mjs` | The command above. |
| `apps/web/src/lib/server/accounting/conformance/` | The runner: a vitest file (`acs.conformance.ts`) that the app's own vite config resolves, so the engine can be imported. `ops.ts` is the only file that imports the engine. Not matched by `vite.config.ts`, so `./check` never needs this cluster. |

## How a scenario runs

`run` starts vitest with `APP_DATABASE_URL` pointed at the cluster as its owner.
Each scenario opens one `withTenant` transaction as the seeded owner, runs every
action in its own savepoint (so a refused action leaves the transaction usable,
as a throw inside `withTenant` leaves production untouched), checks the
expected journal lines after each action, runs every invariant as the cluster
owner (`RESET ROLE`, so no row policy hides a row), checks the final documents,
balances and subledgers, and rolls the transaction back.

Balances and expected journal lines are in functional currency, debit minus
credit (spec 8.2 and 8.4). A fixture gives every tax amount explicitly: the
engine stores the tax a caller passes and computes none (the form computes it),
so the rounding rule in spec 8.3 is applied by the fixture author.

## Fixture shapes

| Shape | Field | Runs as |
|---|---|---|
| actions | `actions` | one rolled-back transaction, a savepoint per action |
| metamorphic | `sequences` | each sequence as above, end states compared |
| concurrent | `concurrent` with `isolation: database` | setup commits, lanes run at once in their own transactions |
| failure injection | `inject` with `isolation: database` | a trigger raises on the nth write while the marked action runs |
| database check | `sql` | a file under `db/` as the owner; zero rows pass |
| migration | `procedure: migration` | the result `pnpm db:acs migrate <ref>` recorded |

`E2E-GLD-001` compares its reports with `golden/*.json`; a missing golden file is captured with `ACS_WRITE_GOLDEN=1`, then reviewed and committed.

## Adding a scenario

1. Write `scenarios/<module>/<ID>.yaml` by hand from the accounting rule, never
   from what the engine produces. Every amount is a quoted string.
2. If the engine has no operation for it, add the id to `capabilities.json`
   with the reason, so it reports `NOT_IMPLEMENTED` rather than failing.
3. If it needs a new `op`, add it to `ops.ts` and to the table in spec 20.3.
4. `pnpm db:acs run <ID>`.
