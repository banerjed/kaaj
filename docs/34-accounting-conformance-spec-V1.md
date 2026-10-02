# Accounting Conformance Specification

**Profile:** `ACS-US-ACCRUAL-1.0`
**Status:** Draft v1.3 (2026-10-02). The runner, the seed and a fixture for every catalog scenario exist; `packages/database/conformance/README.md` says how to run them. Section 31 lists every scenario's state. Section 32 explains every failure: what the engine does instead of what this specification requires. The build does not conform yet: 179 scenarios pass, 19 fail, 121 are not implemented, 11 are not run in the pull-request gate.
**Language:** ASD-STE100 Issue 8. Accounting words (debit, credit, journal, accrual) are technical names. Software words (runner, fixture, tenant) are technical names.
**Purpose:** This specification defines the tests that show that the accounting engine is correct. The tests are independent of the user interface.

This specification uses these words with these meanings:

- **must** — a requirement. A build that does not obey a "must" sentence does not conform.
- **can** — a permitted option. The build is not required to do it.
- **does / is** — a statement of fact about the design.

The specification does not use "should", "shall", "may", "might" or "could".

---

## 1. Terms

Every word in this list has one meaning in this document. Do not use a different word for the same thing.

| Term | Meaning |
|---|---|
| **Engine** | The accounting code in `apps/web/src/lib/server/accounting/` and the database schema in `supabase/migrations/`. The engine is the thing under test. |
| **Runner** | The test program that reads fixtures, calls the engine, and compares results. The runner is not part of the engine. |
| **Fixture** | One declarative file that defines one scenario: the start state, the actions, and the expected result. The fixture format is in section 20. |
| **Scenario** | One test, identified by an ID such as `AR-008`. One fixture defines one scenario. |
| **Invariant** | A rule that must be true after every successful action, in every scenario. Invariants are in section 9. |
| **Golden seed** | The versioned start state `ACS_GOLDEN_SEED_V1`: one tenant, its chart of accounts, and its master data. Sections 5 to 7 define it. |
| **Conformance database** | The Postgres database that holds the golden seed and that the runner writes to. Section 4 defines it. |
| **Action** | One call to one engine write operation, for example `invoice.post`. |
| **Journal entry** | One header row and two or more line rows. Each line has one account and either a debit amount or a credit amount. |
| **Posted** | A journal entry whose status is `posted`. Only posted journal entries change account balances. |
| **Account balance** | `sum(debit) − sum(credit)` over all posted lines of that account, in functional currency. A credit balance is negative. Section 8.2 defines this. |
| **Functional currency** | The currency of the tenant's books. In this profile it is USD. |
| **Transaction currency** | The currency of one document. It can differ from the functional currency. |
| **Subledger** | A total that the engine computes from documents, not from journal lines: a customer's receivable, a vendor's payable, the tax owed. |
| **Control account** | The general ledger account that a subledger must agree with: `ACCOUNTS_RECEIVABLE` for customer receivables. |
| **Refused** | The engine rejected an action, raised an error, and wrote nothing. |
| **Capability register** | The committed list of which modules the engine implements. Section 3.2 defines it. |
| **Result** | The outcome of one scenario: `PASS`, `FAIL`, `NOT_IMPLEMENTED` or `ERROR`. Section 2.2 defines them. |

---

## 2. Definition of Conformance

### 2.1 The ten conditions

A build conforms to this profile only if all ten conditions are true:

1. Every scenario in an implemented module has the result `PASS`.
2. Every invariant in section 9 is true after every successful action, in every scenario.
3. Every expected journal entry matches the actual journal entry exactly. Section 8.4 defines "exactly".
4. Every subledger agrees with its control account to the cent.
5. Every expected report figure matches the actual report figure to the cent.
6. A refused action writes nothing. No journal line, no document change, no subledger change.
7. A repeated action does not post a second time.
8. A posted journal entry does not change and is not deleted.
9. Every database-level test in section 18 passes.
10. No scenario reads the system clock, a live exchange rate, a live tax rate, or production data.

The specification tests accounting state. It does not test the user interface.

### 2.2 Results

The runner gives each scenario exactly one result:

| Result | Meaning | Effect on a gate |
|---|---|---|
| `PASS` | Every expectation in the fixture is true and every invariant is true. | None. |
| `FAIL` | One or more expectations or invariants are false. Or the engine refused an action that the fixture expected to succeed. Or the engine accepted an action that the fixture expected it to refuse. | Blocks the gate. |
| `NOT_IMPLEMENTED` | The scenario's module is listed as not implemented in the capability register. The runner did not execute the scenario. | Does not block the gate. The gate report lists it. |
| `ERROR` | The runner did not execute the scenario because of an environment fault. For example, the conformance database was not reachable. | Blocks the gate. |

A scenario with the result `NOT_IMPLEMENTED` is a known gap, not a pass. A conformance claim names only the implemented modules.

---

## 3. Scope

### 3.1 Modules

This profile has these modules. Each module has a prefix. Every scenario ID starts with its module prefix.

| Prefix | Module | Catalog section |
|---|---|---|
| `GL` | General ledger | 10.1 |
| `AR` | Accounts receivable, customer credits, customer payments | 10.2 |
| `AP` | Accounts payable, vendor credits, vendor payments | 10.3 |
| `BANK` | Bank transactions, matching, reconciliation | 10.4 |
| `TAX` | Sales tax | 10.5 |
| `FX` | Foreign currency | 10.6 |
| `INV` | Inventory and cost of goods sold | 10.7 |
| `ACC` | Accruals and prepayments | 10.8 |
| `DEF` | Deferred revenue | 10.9 |
| `FA` | Fixed assets and depreciation | 10.10 |
| `CLOSE` | Period close, year-end close | 10.11 |
| `META` | Metamorphic tests | 11 |
| `RPT` | Reports | 12 |
| `CON` | Concurrency and idempotency | 13 |
| `FAIL` | Atomicity and failure injection | 14 |
| `AUD` | Audit trail | 15 |
| `NUM` | Precision and pathological numbers | 16 |
| `PROP` | Property and state-machine tests | 17 |
| `DB` | Database-level tests | 18 |
| `E2E` | Golden end-to-end state | 19 |
| `MIG` | Migration conformance | 23 |

### 3.2 Capability register

The file `packages/database/conformance/capabilities.json` lists every module and gives each one the value `implemented` or `not_implemented`. A `not_implemented` entry carries a reason.

Rules:

- Every module in section 3.1 must have an entry. The runner refuses to start if one is missing.
- The runner gives the result `NOT_IMPLEMENTED` to every scenario of a `not_implemented` module.
- Changing a module to `implemented` is a reviewed change. The same pull request must make every scenario of that module `PASS`.
- Never set a module to `not_implemented` to make a gate green.

The register as of 2026-10-02 is below, confirmed against the engine by the first run. The file also lists the per-scenario exceptions of section 3.3; the file, not this table, is what the runner reads.

| Module | Initial value | Reason |
|---|---|---|
| `GL`, `AR`, `AP`, `BANK`, `TAX`, `ACC`, `CLOSE`, `RPT`, `AUD`, `NUM`, `FAIL`, `DB`, `META` | `implemented` | The engine has the write operations these modules need. |
| `FX` | `implemented` | Settlement gain and loss post. Revaluation is report-only; scenarios `FX-009` to `FX-012` are `NOT_IMPLEMENTED` through a per-scenario entry (section 3.3). |
| `CON` | `implemented` | Concurrent writes are testable. The engine has no idempotency key; scenarios `CON-001`, `CON-002`, `CON-009` and `CON-010` are `NOT_IMPLEMENTED` through a per-scenario entry. |
| `INV` | `not_implemented` | The engine has no inventory tables. |
| `DEF` | `not_implemented` | The engine has no deferred-revenue schedule that posts revenue. |
| `FA` | `not_implemented` | The engine has no fixed-asset register. |
| `PROP`, `E2E`, `MIG` | `implemented` | These depend on the runner, not on new engine features. |

### 3.3 Per-scenario exceptions

The same file can list single scenario IDs as `not_implemented`, each with a reason. The runner gives those scenarios the result `NOT_IMPLEMENTED`. Every other rule for modules applies to a per-scenario entry.

### 3.4 Not in this profile

These are not tested in this profile:

- ASC 606 and IFRS 15 revenue recognition
- Leases
- Consolidation
- Payroll
- 1099 reporting
- Country-specific VAT and GST
- Manufacturing
- Landed cost
- Intercompany accounting
- Cash-basis reporting
- Nonprofit and fund accounting

This profile does not claim full conformance with US GAAP or IFRS.

---

## 4. Test Environment

### 4.1 Three environments

| Environment | Purpose | Data | Where |
|---|---|---|---|
| Performance tenant | Load, latency, scale | Large generated dataset | `packages/database/perf/`, its own cluster on port 54349 |
| Conformance database | Accounting correctness | The golden seed: small, deterministic, versioned | `packages/database/conformance/`, its own cluster on port 54350 |
| Shared local stack | Development, `./check`, unit tests | The Northwind fixture | `supabase start`, port 54322 |

### 4.2 The conformance cluster

The conformance database runs in its own Postgres cluster. It does not run inside the shared Supabase stack. The design copies `packages/database/perf/cluster.sh` exactly, for the same two reasons:

- `supabase db reset`, run by any session in any worktree, drops every database in the shared stack.
- Conformance writes must never land under another session's `./check` or unit tests.

| Setting | Value | Environment variable to override |
|---|---|---|
| Script | `packages/database/conformance/cluster.sh` | — |
| Port | `54350` | `KAAJ_ACS_PORT` |
| Database | `kaaj_acs` | `KAAJ_ACS_DB` |
| Data directory | `~/.kaaj/acs-pgdata` | `KAAJ_ACS_PGDATA` |
| Socket directory | `~/.kaaj/acs-sock` | `KAAJ_ACS_SOCKDIR` |
| Migrations | `supabase/migrations/`, the same files as the shared stack | — |

Commands:

```text
pnpm db:acs:cluster up        start the cluster; create and migrate on first use
pnpm db:acs:cluster rebuild   drop the database, create it, migrate it
pnpm db:acs:cluster status    running? migrated to which migration?
pnpm db:acs:cluster stop

pnpm db:acs seed              load ACS_GOLDEN_SEED_V1 into an empty database
pnpm db:acs run [ids...]      run every scenario, or the named ones
pnpm db:acs verify            run every invariant against the current state
pnpm db:acs report            print the certification output (section 26)
pnpm db:acs audit             regenerate the per-scenario audit table (section 31)
pnpm db:acs migrate <ref>     section 23, against the migrations at <ref>
```

Rules:

- The runner connects only to the conformance database. The runner refuses to start if the connection string does not point at `127.0.0.1` on the conformance port. There is no override.
- `rebuild` followed by `seed` restores `ACS_GOLDEN_SEED_V1`. Nothing else restores it.
- The golden seed is applied by SQL files in `packages/database/conformance/seed/`. The files are deterministic: every id is `md5('acs:<kind>:<n>')::uuid`, as the performance tenant does.
- The seed uses the `postgres` superuser of the conformance cluster to load data. Scenarios run as `app_user` through the engine's `withTenant`, with the conformance tenant's owner as actor, unless a fixture names a different actor.
- The conformance tenant does not accumulate state. Section 4.3 defines when the seed is restored.
- The runner is a vitest file, `apps/web/src/lib/server/accounting/conformance/acs.conformance.ts`, with its own config `apps/web/vitest.acs.config.ts`. It lives in the app, not in `packages/database`, because the engine imports `$env` and `$lib`, which only the app's vite config resolves. `vite.config.ts`'s include pattern does not match it, so `./check` never needs this cluster.
- `run` starts the runner with `APP_DATABASE_URL` set to the cluster's owner connection. Every action runs under `SET LOCAL ROLE app_user` with the actor's claims, exactly as `withTenant` does in production. Every invariant runs under `RESET ROLE`, so no row policy hides a row from the check.
- The fixture directory, the seed, the invariants and the register stay in `packages/database/conformance/`. `ops.ts` in the runner directory is the only file that imports the engine.

### 4.3 Isolation of scenarios

The runner isolates scenarios in one of two ways. Each fixture declares which, in its `isolation` field.

| `isolation` | Behaviour | Used by |
|---|---|---|
| `transaction` (default) | The runner opens one database transaction, runs every action and every check inside it, then rolls the transaction back. The database is unchanged afterwards. Each action runs in its own savepoint, so a refused action leaves the transaction usable. | Every deterministic scenario in sections 10, 12, 15 and 16, and each sequence of a section 11 scenario. |
| `database` | The runner restores the golden seed, runs every action in its own committed transaction, runs the checks, then restores the golden seed again. | `CON-*`, `FAIL-*`, `E2E-*`, `DB-012`. |

A `transaction` scenario cannot test a commit. A scenario that needs a commit declares `isolation: database`.

A fixture has one of five bodies, and the body decides how the runner executes it:

| Body | Field | Runner behaviour |
|---|---|---|
| Actions | `actions` | Section 10: run in order, judged one by one. |
| Sequences | `sequences` | Section 11: each named sequence runs as its own `transaction` scenario from the seed; the end states are compared. |
| Lanes | `actions` then `concurrent` | Section 13: the setup actions commit; then every lane runs in its own transaction at the same time. |
| Injection | `inject` and `actions` | Section 14: a trigger on the named table raises on the nth write while an action marked `inject: true` runs. |
| SQL | `sql` | Section 18: a file under `db/` run as the owner; zero rows means pass. |
| Procedure | `procedure: migration` | Section 23: the result `pnpm db:acs migrate` recorded for this step. |

### 4.4 Recommended flow

```text
ACS_GOLDEN_SEED_V1
        |
        +---- restore ---- pull-request run        (Gate A)
        |
        +---- restore ---- nightly run             (Gate B)
        |
        +---- restore ---- release-candidate run   (Gate C)
        |
        +---- restore ---- developer local run
```

---

## 5. Canonical Conformance Tenant

Every deterministic run starts from `ACS_GOLDEN_SEED_V1`.

### 5.1 Company

```yaml
company:
  id: ACS_US_001
  name: ACS Conformance Corporation
  functional_currency: USD
  fiscal_year_start: 2026-01-01
  fiscal_year_end: 2026-12-31
  accounting_basis: accrual
  inventory_method: perpetual
  periods: twelve monthly periods, 2026-01 to 2026-12, all open
```

### 5.2 Determinism rules

No scenario depends on:

- the system clock. Every date is in the fixture.
- a live exchange rate. Every rate is in section 7.5.
- a live or production tax setting. Every rate is in section 7.4.
- an external service. If a scenario needs one, the fixture gives the fixed response.
- random data without a persisted seed. Section 17 gives the rule for generated data.
- the state of any production tenant.

Every date, tax rate, exchange rate and expected outcome is an explicit value in a fixture.

---

## 6. Canonical Chart of Accounts

Every scenario names an account by its **semantic ID**, never by its production code or its database id. The runner maps a semantic ID to the account row in the conformance tenant through the `code` column.

| Code | Semantic ID | Name | Type | Normal balance |
|---|---|---|---|---|
| 1000 | `OPERATING_BANK` | Operating Bank | asset | debit |
| 1020 | `SAVINGS_BANK` | Savings Bank | asset | debit |
| 1030 | `EUR_BANK` | EUR Bank | asset | debit |
| 1100 | `ACCOUNTS_RECEIVABLE` | Accounts Receivable | asset | debit |
| 1150 | `ALLOWANCE_DOUBTFUL` | Allowance for Doubtful Accounts | asset | credit |
| 1200 | `INPUT_TAX_RECOVERABLE` | Input Tax Recoverable | asset | debit |
| 1210 | `INVENTORY` | Inventory | asset | debit |
| 1250 | `INVENTORY_CLEARING` | Inventory Clearing | asset | debit |
| 1300 | `PREPAID_EXPENSES` | Prepaid Expenses | asset | debit |
| 1400 | `EQUIPMENT` | Equipment | asset | debit |
| 1410 | `FURNITURE` | Furniture | asset | debit |
| 1490 | `ACCUMULATED_DEPRECIATION` | Accumulated Depreciation | asset | credit |
| 2000 | `ACCOUNTS_PAYABLE` | Accounts Payable | liability | credit |
| 2150 | `ACCRUED_EXPENSES` | Accrued Expenses | liability | credit |
| 2200 | `SALES_TAX_PAYABLE` | Sales Tax Payable | liability | credit |
| 2250 | `CUSTOMER_DEPOSITS` | Customer Deposits | liability | credit |
| 2300 | `DEFERRED_REVENUE` | Deferred Revenue | liability | credit |
| 2400 | `CORPORATE_CARD` | Corporate Credit Card | liability | credit |
| 3000 | `RETAINED_EARNINGS` | Retained Earnings | equity | credit |
| 3100 | `COMMON_STOCK` | Common Stock | equity | credit |
| 4000 | `SERVICE_REVENUE` | Service Revenue | revenue | credit |
| 4100 | `PRODUCT_REVENUE` | Product Revenue | revenue | credit |
| 4150 | `SALES_RETURNS` | Sales Returns and Allowances | revenue | debit |
| 4200 | `REALIZED_FX_GAIN_LOSS` | Realized FX Gain/Loss | revenue | credit |
| 5000 | `COGS` | Cost of Goods Sold | expense | debit |
| 5500 | `BAD_DEBT_EXPENSE` | Bad Debt Expense | expense | debit |
| 6000 | `RENT_EXPENSE` | Rent Expense | expense | debit |
| 6100 | `OFFICE_EXPENSE` | Office Expense | expense | debit |
| 6200 | `INSURANCE_EXPENSE` | Insurance Expense | expense | debit |
| 6300 | `DEPRECIATION_EXPENSE` | Depreciation Expense | expense | debit |
| 6500 | `BANK_FEES` | Bank Fees | expense | debit |
| 7020 | `UNREALIZED_FX_GAIN` | Unrealized FX Gain | revenue | credit |
| 7030 | `UNREALIZED_FX_LOSS` | Unrealized FX Loss | expense | debit |
| 7100 | `GAIN_ON_DISPOSAL` | Gain on Disposal of Assets | revenue | credit |
| 7110 | `LOSS_ON_DISPOSAL` | Loss on Disposal of Assets | expense | debit |
| 8000 | `INTEREST_INCOME` | Interest Income | revenue | credit |
| 9000 | `INACTIVE_ACCOUNT` | Inactive Test Account | expense | debit |

The engine hardcodes ten codes in `ACCOUNTS` (`accounting.repo.ts` and `payables.repo.ts`). They are 1000 cash, 1100 receivable, 1200 input tax, 2000 payable and 2150 accrued liabilities. They are also 2200 tax payable, 3000 retained earnings, 4000 revenue, 4200 FX gain and loss, and 5500 bad debt. The seed keeps those codes. `REALIZED_FX_GAIN_LOSS` is one netted account: a gain is a credit line on it and a loss is a debit line. Two reserved names resolve to ids that exist in no tenant, so the engine does the refusing: `NO_SUCH_ACCOUNT` and `NO_SUCH_TAX`.

Rules:

- `INACTIVE_ACCOUNT` has `is_active = false` in the seed. Scenario `GL-007` uses it. No other scenario uses it.
- The seed does not post an opening balance. Every account balance is zero at the start of every scenario, except where a fixture's `given` block posts one.
- The "Type" column decides which report line an account belongs to. Section 12 depends on it.

---

## 7. Canonical Master Data

### 7.1 Customers

| ID | Name | Currency | Payment terms |
|---|---|---|---|
| `CUST-001` | Acme Corporation | USD | 30 days |
| `CUST-002` | Globex Corporation | USD | 30 days |
| `CUST-003` | Europa GmbH | EUR | 30 days |
| `CUST-004` | Sterling Ltd | GBP | 30 days |
| `CUST-005` | Exempt Foundation | USD | 30 days, tax-exempt |
| `CUST-006` | Nippon KK | JPY | 30 days |

### 7.2 Vendors

| ID | Name | Currency | Payment terms |
|---|---|---|---|
| `VEND-001` | SupplyCo | USD | 30 days |
| `VEND-002` | Euro Supplier GmbH | EUR | 30 days |

### 7.3 Products

| ID | Selling price | Cost | Inventory item | Revenue account |
|---|---|---|---|---|
| `ITEM-A` | 100.00 | 60.00 | yes | `PRODUCT_REVENUE` |
| `ITEM-B` | 50.00 | 20.00 | yes | `PRODUCT_REVENUE` |
| `ITEM-C` | 0.10 | 0.04 | yes | `PRODUCT_REVENUE` |
| `SERVICE-A` | 100.00 | — | no | `SERVICE_REVENUE` |
| `SERVICE-B` | 250.00 | — | no | `SERVICE_REVENUE` |

Prices and costs are in USD. "Cost" is the purchase cost the seed uses for inventory scenarios.

### 7.4 Tax rates

| ID | Rate | Kind | Liability account |
|---|---|---|---|
| `TAX-0` | 0% | exclusive | `SALES_TAX_PAYABLE` |
| `TAX-8` | 8% | exclusive | `SALES_TAX_PAYABLE` |
| `TAX-8-I` | 8% | inclusive | `SALES_TAX_PAYABLE` |
| `TAX-5` | 5% | exclusive | `SALES_TAX_PAYABLE` |

"Exclusive" means the tax is added to the line amount. "Inclusive" means the line amount already contains the tax. Section 8.3 gives the arithmetic.

### 7.5 Exchange rates

Every rate is the number of USD for one unit of the foreign currency.

| Date | Pair | Rate |
|---|---|---|
| 2026-01-01 | EUR/USD | 1.200000 |
| 2026-01-31 | EUR/USD | 1.250000 |
| 2026-02-15 | EUR/USD | 1.300000 |
| 2026-03-01 | EUR/USD | 1.150000 |
| 2026-01-01 | GBP/USD | 1.400000 |
| 2026-01-31 | GBP/USD | 1.350000 |
| 2026-01-01 | JPY/USD | 0.006500 |

Rules:

- The rate for a date is the rate of the latest row on or before that date.
- A date before 2026-01-01 has no rate. An action that needs one is refused.
- These values are never replaced with market rates.

---

## 8. Numeric Rules

### 8.1 Precision

- Every money amount is a decimal with exactly 2 decimal places.
- Every exchange rate is a decimal with exactly 6 decimal places.
- Every quantity is a decimal with at most 4 decimal places.
- Every tax rate is a decimal with at most 4 decimal places, expressed as a fraction: 8% is `0.0800`.
- No test and no engine code path converts a money amount to a binary floating-point number. In TypeScript, money is a `string`. In SQL, money is `NUMERIC`.

### 8.2 Sign convention

Every balance in a fixture, in a report comparison, and in an invariant uses one convention:

```text
balance(account) = sum(debit_amount) − sum(credit_amount)
```

over the posted journal lines of that account, in functional currency.

Consequences:

- An asset or expense account with a normal balance is positive.
- A liability, equity or revenue account with a normal balance is negative.
- The accounting equation is `sum over all accounts of balance(account) = 0`.

A fixture never writes a balance in "natural" sign. `SERVICE_REVENUE: -100` is correct; `SERVICE_REVENUE: 100` is wrong.

### 8.3 Rounding

The engine rounds once, at one place, with one rule:

- **Rule:** round half away from zero, to 2 decimal places. `0.125` becomes `0.13`. `-0.125` becomes `-0.13`. `0.124` becomes `0.12`.
- **Line tax, exclusive:** `line_tax = round(line_amount × rate)`. Each line rounds on its own.
- **Line tax, inclusive:** `line_tax = round(line_amount × rate ÷ (1 + rate))`. `taxable_base = line_amount − line_tax`.
- **Document tax:** `document_tax = sum(line_tax)`. The sum is not rounded again.
- **Document total, exclusive:** `total = sum(line_amount) + document_tax`.
- **Document total, inclusive:** `total = sum(line_amount)`.
- **Functional-currency amount:** `base = round(transaction_amount × rate)`. Round each part (subtotal, tax) on its own, then sum the rounded parts. Never round the sum.
- **Allocation of one amount across N parts:** each part is `round(amount ÷ N)`. The last part receives `amount − sum(other parts)`. No cent is lost.

The canonical rounding case, three units of `ITEM-C` at 8% exclusive, has two defined answers:

| Document | Lines | Line tax | Document tax | Scenario |
|---|---|---|---|---|
| One line, quantity 3 | `0.30` | `round(0.024) = 0.02` | `0.02` | `TAX-010` |
| Three lines, quantity 1 each | `0.10`, `0.10`, `0.10` | `round(0.008) = 0.01` each | `0.03` | `TAX-011` |

Both answers are correct. The fixture states which document shape it uses.

The engine computes no tax: it stores the `tax_amount` a caller gives on each line, and the invoice form computes it. A fixture therefore gives `tax_amount` on every line whose rate is not `TAX-0`, computed by this rule. The runner refuses a taxed line without it.

### 8.4 Exact match

"Exactly" has one meaning for a journal entry:

1. The expected lines and the actual lines are compared as multisets. Order does not matter.
2. One line is the triple `(semantic account ID, debit, credit)`, in functional currency. Amounts are compared as decimal strings at 2 decimal places. `100` and `100.00` are equal. `100.00` and `100.01` are not. The engine can post a settlement entirely in USD, or in the transaction currency with a stored rate. Both representations give the same functional-currency lines. Only those lines are compared.
3. Every expected line must have exactly one actual line, and every actual line must have exactly one expected line. An extra actual line is a `FAIL`. A missing actual line is a `FAIL`.
4. Every actual line has either `debit > 0` or `credit > 0`, never both, never neither.
5. The actual entry has the expected `status`, `date`, `source_type` and, when the fixture gives one, `source` document.

"Exactly" has one meaning for a balance, a subledger figure or a report figure: the decimal strings are equal at 2 decimal places.

### 8.5 Currencies

- A money amount always travels with its currency.
- A journal line records the transaction amount, the transaction currency, the exchange rate, and the functional-currency amount.
- Account balances in section 8.2 are functional-currency balances.
- A document's outstanding amount is kept in its transaction currency. The functional-currency outstanding amount is a derived figure.

---

## 9. Global Accounting Invariants

The runner checks every invariant in this section after every action whose result is `ok`, in every scenario. A fixture cannot switch an invariant off. An invariant that reads a table of a `not_implemented` module is skipped and reported as `NOT_IMPLEMENTED`. The register in section 3.2 lists these. Today they are `INV-INV-001` to `INV-INV-003`, `INV-FX-004` and `INV-SYS-001`. A fixture that tests an intermediate transaction boundary (`FAIL-*`) states, in the action, the point at which the runner checks.

Each invariant has: an ID; a statement; the check the runner performs. The runner performs the check as SQL against the conformance database. It connects as the `postgres` superuser, so that no row policy hides a row from the check.

### 9.1 Journal invariants

**INV-JRN-001 — Balanced journal.**
Statement: for every posted journal entry, `sum(debit_amount) = sum(credit_amount)` and `sum(base_debit_amount) = sum(base_credit_amount)`.
Check: group `journal_entry_lines` by entry; no group has a non-zero difference.

**INV-JRN-002 — Meaningful journal.**
Statement: every posted journal entry has two or more lines. Every line has either `debit_amount > 0` or `credit_amount > 0`, not both and not neither.
Check: no posted entry has fewer than two lines; no line violates the rule.

**INV-JRN-003 — Posted journal is immutable.**
Statement: after a journal entry is posted, no column of its header changes and no column of its lines changes. The one exception is `status`, which the engine's own reverse or void operation sets to `reversed` or `void`.
Check: the first time the runner sees a posted entry, it records a hash of the header and the lines. On every later check it compares the hash.

**INV-JRN-004 — Posted journal persists.**
Statement: a posted journal entry is never deleted.
Check: every entry id the runner has seen as posted still exists.

**INV-JRN-005 — Reversal links to its original.**
Statement: every reversing entry carries the id of the entry it reverses. The original carries the id of its reversal.
Check: every entry with `status = 'reversed'` has exactly one entry that names it as reversed, and that entry names the original.

**INV-JRN-006 — Reversal is symmetric.**
Statement: for an original entry and its reversal, the multiset of original lines equals the multiset of reversal lines with debit and credit exchanged.
Check: the per-account net of the two entries together is zero.

**INV-JRN-007 — Accounts are valid.**
Statement: every journal line references an account that exists in the tenant and that was active at posting time.
Check: every `account_id` resolves to an account of the same tenant; no line references `INACTIVE_ACCOUNT`.

**INV-JRN-008 — Posting metadata is present.**
Statement: every posted journal entry has a posting date, a source type, a posting actor, a posting timestamp, and a stable entry number.
Check: none of `entry_date`, `source_type`, `posted_by`, `posted_at`, `entry_number` is null.

### 9.2 General ledger invariants

**INV-GL-001 — Accounting equation.**
Statement: `sum over all accounts of balance(account) = 0`. This is the same as `Assets = Liabilities + Equity + (Revenue − Expenses)`.
Check: the total of `base_debit_amount − base_credit_amount` over all posted lines is zero.

**INV-GL-002 — Balances derive from lines.**
Statement: every stored or cached balance (`gl_daily_balances`, a report total) equals the sum of the posted lines it summarises.
Check: recompute each cached figure from `journal_entry_lines`; every figure agrees.

**INV-GL-003 — Draft has no effect.**
Statement: a draft document or draft journal entry has no posted journal lines.
Check: no posted line has a source document whose status is `draft`.

**INV-GL-004 — A refused action has no effect.**
Statement: a refused action leaves every table unchanged.
Check: before an action the fixture expects to be refused, the runner records the row count and a content hash of every accounting table. After the action it compares them.

**INV-GL-006 — No posting after a close.**
Statement: a posted entry dated in a closed period was posted before that period closed.
Check: no posted entry has `posted_at` later than the `closed_at` of the period its date falls in. Two connections racing a close against a posting (`CON-008`) are judged by this invariant.

**INV-GL-005 — Cancellation is traceable.**
Statement: a cancelled or voided document keeps its original journal entry and adds a reversing entry. No journal line disappears.
Check: every document with status `void` has its original posted entry with `status = 'reversed'` and a linked reversal.

### 9.3 Accounts receivable invariants

**INV-AR-001 — AR control reconciles.**
Statement: `balance(ACCOUNTS_RECEIVABLE) = sum over customers of functional-currency receivable`.
Check: compare the account balance with `sum(base_amount_due)` over invoices that are not `draft` and not `void`.

**INV-AR-002 — Invoice outstanding equation.**
Statement: for every invoice, `total − amount_paid − amount_credited − amount_written_off = amount_due`, in transaction currency.
Check: no invoice violates the equation.

**INV-AR-003 — Customer balance reconciles.**
Statement: for every customer, the customer's balance equals the sum of `amount_due` over that customer's open invoices, minus that customer's unapplied credits and unapplied receipts.
Check: no customer violates the equation.

**INV-AR-004 — Allocation is bounded.**
Statement: the sum of allocations to an invoice never exceeds the invoice total. A receipt larger than the invoice leaves the excess as an unapplied receipt.
Check: no invoice has `amount_paid + amount_credited > total`; no allocation is negative.

### 9.4 Accounts payable invariants

**INV-AP-001 — AP control reconciles.**
Statement: `balance(ACCOUNTS_PAYABLE) = −(sum over vendors of functional-currency payable)`.
Check: compare the account balance with `sum(base_amount_due)` over bills that are approved and not `void`.

**INV-AP-002 — Bill outstanding equation.**
Statement: for every bill, `total − amount_paid − amount_credited = amount_due`, in transaction currency.
Check: no bill violates the equation.

### 9.5 Cash invariants

**INV-CASH-001 — One cash effect per payment.**
Statement: every posted payment has exactly one journal line on a bank or cash account, and that line's amount is the payment amount.
Check: for every payment, count the journal lines that cite that payment as source and sit on an account with code `1000` to `1099`. The count is one.

**INV-CASH-002 — Matching does not move cash.**
Statement: matching a bank transaction to an existing payment creates no journal entry.
Check: the number of posted entries before and after a match is equal.

**INV-CASH-003 — Transfer conserves cash.**
Statement: a transfer between two bank accounts does not change `sum of balance over all bank and cash accounts`.
Check: compare the sum before and after the transfer.

### 9.6 Tax invariants

**INV-TAX-001 — Tax subledger reconciles.**
Statement: `−balance(SALES_TAX_PAYABLE) = sum(tax_total) over posted sales documents − sum(tax_total) over posted credit notes − sum of tax paid to the authority`.
Check: compute both sides; they are equal.

**INV-TAX-002 — Exclusive tax.**
Statement: for every exclusive-tax document, `total = subtotal + tax_total`.
Check: no document violates the equation.

**INV-TAX-003 — Inclusive tax.**
Statement: for every inclusive-tax document, `total = subtotal` and `subtotal = taxable_base + tax_total`.
Check: no document violates the equation.

### 9.7 Inventory invariants

**INV-INV-001 — Inventory reconciles.**
Statement: `balance(INVENTORY) = sum over items of (quantity on hand × unit cost)`.
Check: compute both sides; they are equal.

**INV-INV-002 — Quantity is traceable.**
Statement: every change to quantity on hand has one inventory movement row.
Check: `sum(movement quantity) = quantity on hand`, per item.

**INV-INV-003 — A sale posts both halves.**
Statement: a posted sale of an inventory item posts a revenue entry and a cost entry.
Check: every posted invoice line for an inventory item has a matching `COGS` line.

### 9.8 Foreign-currency invariants

**INV-FX-001 — Transaction amount persists.**
Statement: the transaction-currency amount of a document never changes because a rate changes.
Check: the runner hashes `(currency, total)` per document at posting and compares later.

**INV-FX-002 — Functional amount uses the document's rate.**
Statement: `base_total = round(subtotal × exchange_rate) + round(tax_total × exchange_rate)`, where `exchange_rate` is the rate stored on the document.
Check: no document violates the equation.

**INV-FX-003 — Settlement difference is realized.**
Statement: a payment can settle a foreign-currency document at a rate that differs from the document's rate. The difference posts to `REALIZED_FX_GAIN_LOSS`, as a credit for a gain and a debit for a loss, and to no other account.
Check: for every such payment, the entry has exactly one line on that account. The line amount is `|round(amount × settlement_rate) − round(amount × document_rate)|`.

**INV-FX-004 — Revaluation is unrealized.**
Statement: a revaluation of an open balance posts to `UNREALIZED_FX_GAIN` or `UNREALIZED_FX_LOSS` and to the control account, and to no other account.
Check: every entry with `source_type = 'revaluation'` has lines only on those accounts.

### 9.9 Reporting invariants

**INV-RPT-001 — Trial balance balances.**
Statement: `sum(debit column) = sum(credit column)` on the trial balance, for every as-of date.
Check: run the trial balance; compare the two totals.

**INV-RPT-002 — Net income reconciles.**
Statement: income statement net income for a period equals the movement in `RETAINED_EARNINGS` plus current-period earnings for that period.
Check: compute both; they are equal.

**INV-RPT-003 — Balance sheet balances.**
Statement: `total assets = total liabilities + total equity`, with current-period earnings included in equity.
Check: run the balance sheet; compare.

**INV-RPT-004 — Drill-down agrees.**
Statement: the sum of the lines behind a report figure equals the report figure.
Check: for every report line, sum the ledger lines that the drill-down returns; compare.

**INV-RPT-005 — Presentation does not change totals.**
Statement: changing a report's grouping, filter order, or currency display does not change any underlying balance.
Check: run the report with two groupings; the account-level totals are identical.

### 9.10 System invariants

**INV-SYS-001 — Idempotent posting.**
Statement: two requests with the same idempotency key produce one posting.
Check: no two posted entries share an idempotency key.

**INV-SYS-002 — No orphan lines.**
Statement: every journal line belongs to an existing header.
Check: no `journal_entry_lines` row has an `entry_id` that is absent from `journal_entries`.

**INV-SYS-003 — Document and posting agree.**
Statement: a document whose status says it is posted has a posted journal entry. A document whose status says it is not posted has none.
Check: no document violates the rule, per document type.

**INV-SYS-004 — Journal atomicity.**
Statement: a journal entry is either fully present, with all its lines, or absent.
Check: no posted header has zero lines; no header is in a status that is not in the enumeration.

**INV-SYS-005 — Decimal arithmetic.**
Statement: every monetary column is `NUMERIC`. No monetary column is `real`, `double precision` or `float`.
Check: `information_schema.columns`; the `money/numeric-not-float` invariant of `./check` is the same test.

---

## 10. Deterministic Scenario Catalog

Every scenario in this section has one fixture file. The fixture is the complete definition of the scenario: the catalog row is a summary. If the catalog row and the fixture disagree, the fixture is wrong, and the fixture must be corrected.

Every row states the required result. Where the draft v1 gave a choice ("reject or corrective workflow"), this revision chooses one. The choice is in the row.

### 10.1 General ledger — `GL-*`

| ID | Actions | Required result |
|---|---|---|
| `GL-001` | Post one manual journal: `Dr OFFICE_EXPENSE 100 / Cr OPERATING_BANK 100`, dated 2026-01-10. | `OFFICE_EXPENSE = 100`, `OPERATING_BANK = -100`. |
| `GL-002` | Post one manual journal with three lines: `Dr RENT_EXPENSE 700`, `Dr OFFICE_EXPENSE 300`, `Cr OPERATING_BANK 1000`. | The three balances are `700`, `300`, `-1000`. |
| `GL-003` | Post one manual journal with ten lines: nine debits of `11.11` to `OFFICE_EXPENSE` and one credit of `99.99` to `OPERATING_BANK`. | `OFFICE_EXPENSE = 99.99`. |
| `GL-004` | Attempt a journal with `Dr OFFICE_EXPENSE 100 / Cr OPERATING_BANK 99`. | Refused. No header row, no line row. |
| `GL-005` | Attempt a journal where every line is `0.00`. | Refused. No header row. |
| `GL-006` | Attempt a journal with one line on an account id that does not exist. | Refused. |
| `GL-007` | Attempt a journal with one line on `INACTIVE_ACCOUNT`. | Refused. |
| `GL-008` | Create a draft journal. Do not post. | Every balance is `0`. No posted line. |
| `GL-009` | Create a draft journal with amount `100`. Change the amount to `150`. Post. | Balances show `150`. No line shows `100`. |
| `GL-010` | Post a journal. Attempt to change a line amount and the header. | The statements change no row (the op reports `rows = 0`): row-level security hides a posted entry from `UPDATE`. The posted lines are unchanged. |
| `GL-011` | Post a journal. Attempt to delete it. | Refused. The entry still exists. |
| `GL-012` | Post `Dr OFFICE_EXPENSE 100 / Cr OPERATING_BANK 100`. Reverse it, dated the same day. | A second posted entry with the lines exchanged. Both balances are `0`. Original status is `reversed`. INV-JRN-005 and INV-JRN-006 hold. |
| `GL-013` | Post, reverse, then attempt to reverse the reversal. | Refused. A reversal is not reversible. The balances remain `0`. |
| `GL-014` | Post a journal dated 2026-12-31, in the open period 2026-12, on fixture date 2026-01-15. | Accepted. The period is open; the date being later than other postings is not a refusal. |
| `GL-015` | Post a journal with 100 lines: 99 debits of `1.01` and one credit of `99.99`. | `OFFICE_EXPENSE = 99.99`. 100 line rows exist. |
| `GL-016` | Post `Dr OFFICE_EXPENSE 0.01 / Cr OPERATING_BANK 0.01`. | Balances are `0.01` and `-0.01`. |
| `GL-017` | Post `Dr OFFICE_EXPENSE 999999999.99 / Cr OPERATING_BANK 999999999.99`. | Balances are exact. No overflow, no rounding. |
| `GL-018` | Post an invoice. | The journal entry carries `source_type = 'invoice'` and the invoice id. The invoice page's drill-down returns that entry. The entry's source link returns that invoice. |
| `GL-019` | Attempt a journal with one line only, carrying both a debit and a credit of `100`. | Refused. |
| `GL-020` | Attempt a journal with a line on an account of another tenant. | Refused. INV-JRN-007 holds. |

### 10.2 Accounts receivable — `AR-*`

Every `AR-*` scenario uses `CUST-001` unless the row names another customer. Every invoice is dated 2026-01-10 unless the row names another date.

Expected journal entries for the two base scenarios:

**AR-001 — Basic invoice.** One line, `SERVICE-A`, quantity 1, `TAX-0`.

```text
Dr ACCOUNTS_RECEIVABLE   100.00
    Cr SERVICE_REVENUE           100.00

invoice.status      = sent
invoice.amount_due  = 100.00
customer receivable = 100.00
ACCOUNTS_RECEIVABLE = 100.00
SERVICE_REVENUE     = -100.00
```

**AR-002 — Taxable invoice.** One line, `SERVICE-A`, quantity 1, `TAX-8`.

```text
Dr ACCOUNTS_RECEIVABLE   108.00
    Cr SERVICE_REVENUE           100.00
    Cr SALES_TAX_PAYABLE           8.00
```

| ID | Actions | Required result |
|---|---|---|
| `AR-003` | Invoice with two lines, both `SERVICE-A`, quantity 1 each. | One credit line `SERVICE_REVENUE 200`. Not two lines of `100`. |
| `AR-004` | Invoice with one `SERVICE-A` line and one `ITEM-A` line. | Two credit lines: `SERVICE_REVENUE 100`, `PRODUCT_REVENUE 100`. |
| `AR-005` | Invoice to `CUST-005` with `TAX-8` on the line; then invoice to `CUST-005` with `TAX-0`. | The first is refused with `customer_tax_exempt`. The second posts with no tax line. |
| `AR-006` | Invoice, one line `108.00`, `TAX-8-I`. | `Cr SERVICE_REVENUE 100.00`, `Cr SALES_TAX_PAYABLE 8.00`, `Dr ACCOUNTS_RECEIVABLE 108.00`. `invoice.total = 108.00`. |
| `AR-007` | AR-001, then receive `100` on 2026-01-15. | `invoice.status = paid`, `amount_due = 0`. Entry: `Dr OPERATING_BANK 100 / Cr ACCOUNTS_RECEIVABLE 100`. |
| `AR-008` | AR-001, then receive `30`. | `status = partial`, `amount_due = 70`. `ACCOUNTS_RECEIVABLE = 70`. |
| `AR-009` | AR-001, receive `30`, receive `70`. | `status = paid`, `amount_due = 0`. Two payment entries. |
| `AR-010` | AR-001, receive `120` allocated to the invoice. | Allocation is `100`. The excess `20` is an unapplied receipt on the customer. `ACCOUNTS_RECEIVABLE = 0`, `CUSTOMER_DEPOSITS = -20`, `OPERATING_BANK = 120`. INV-AR-004 holds. |
| `AR-011` | Receive `100` with no invoice. | `CUSTOMER_DEPOSITS = -100`. `ACCOUNTS_RECEIVABLE = 0`. The customer balance is `-100`. |
| `AR-012` | AR-011, then AR-001, then apply the unapplied `100` to the invoice. | `status = paid`. `CUSTOMER_DEPOSITS = 0`. `ACCOUNTS_RECEIVABLE = 0`. The application posts `Dr CUSTOMER_DEPOSITS 100 / Cr ACCOUNTS_RECEIVABLE 100`. |
| `AR-013` | Two invoices of `100`. Receive `100` allocated to invoice 1. Move the allocation to invoice 2. | Invoice 1 `amount_due = 100`, invoice 2 `amount_due = 0`. The bank balance is unchanged at `100`. The reallocation posts no cash line. |
| `AR-014` | AR-001, then attempt to allocate `150` to the `100` invoice. | Refused. `amount_due = 100`. INV-AR-004 holds. |
| `AR-015` | AR-001, then credit note for `100`. | `amount_due = 0`. Entry: `Dr SERVICE_REVENUE 100 / Cr ACCOUNTS_RECEIVABLE 100`. `status = credited`, never `paid`: no money was received. |
| `AR-016` | AR-001, then credit note for `40`. | `amount_due = 60`. `status = sent`: a credit changes the status only when it settles the invoice. |
| `AR-017` | AR-001, credit `40`, receive `60`. | `amount_due = 0`, `status = paid`, `ACCOUNTS_RECEIVABLE = 0`. |
| `AR-018` | AR-007, then refund `100`. | `OPERATING_BANK = 0`. Entry: `Dr ACCOUNTS_RECEIVABLE 100 / Cr OPERATING_BANK 100`. `amount_due = 100`, `status = sent`. |
| `AR-019` | AR-007, then refund `30`. | `OPERATING_BANK = 70`, `amount_due = 30`, `status = partial`. |
| `AR-020` | Three invoices: `100`, `200`, `300`. One receipt of `600` allocated across them. | All three `paid`. One payment entry: `Dr OPERATING_BANK 600`, then `Cr ACCOUNTS_RECEIVABLE 100`, `200`, `300`, one credit line per invoice. Three allocation rows. |
| `AR-021` | AR-001, then four receipts of `25`. | `paid`. Four payment entries. `amount_due = 0`. |
| `AR-022` | 100 invoices of `1.00` each, to `CUST-002`. | `ACCOUNTS_RECEIVABLE = 100.00`. Customer balance `100.00`. The customer-balance page reports `100.00` from SQL, not from a page sum. |
| `AR-023` | Receive `50` as a deposit on 2026-01-05. Invoice `100` on 2026-01-10. | `CUSTOMER_DEPOSITS = -50`, `ACCOUNTS_RECEIVABLE = 100`. Not applied until an action applies it. |
| `AR-024` | AR-023, then apply the deposit. | `amount_due = 50`, `status = partial`, `CUSTOMER_DEPOSITS = 0`, `ACCOUNTS_RECEIVABLE = 50`. |
| `AR-025` | Create a draft invoice, then void it. | `status = void`. No journal entry exists. A void is for a draft only. |
| `AR-026` | AR-007, then void the payment. | `OPERATING_BANK = 0`, `amount_due = 100`, `status = sent`. A reversing entry for the payment exists. |
| `AR-027` | AR-001, receive `99`, write off `1`. | `amount_due = 0`, `status = written_off`. Entry: `Dr BAD_DEBT_EXPENSE 1 / Cr ACCOUNTS_RECEIVABLE 1`. |
| `AR-028` | AR-001, write off `100`. | `status = written_off`, `BAD_DEBT_EXPENSE = 100`, `ACCOUNTS_RECEIVABLE = 0`. |
| `AR-029` | Invoice dated 2025-12-15, in no defined period. | Accepted. A date in no period is not refused. The entry's `accounting_period` is `2025-12`. |
| `AR-030` | AR-001 dated 2026-01-10. Attempt a receipt dated 2026-01-05 against it. | Refused. A payment date before the invoice date is refused. |
| `AR-031` | AR-007, then attempt a second receipt of `1` against the paid invoice. | Refused. INV-AR-004 holds. |
| `AR-032` | AR-001, then attempt a credit note for `150`. | Refused with `over_credit`. A credit cannot exceed `amount_due`. |
| `AR-033` | AR-001, then attempt to void the issued invoice. | Refused with `wrong_status`. An issued invoice is reversed with a credit note, never voided. |
| `AR-034` | Create a draft invoice, then attempt a receipt against it. | Refused with `wrong_status`. |

### 10.3 Accounts payable — `AP-*`

Every `AP-*` scenario uses `VEND-001` unless the row names another vendor. Every bill is dated 2026-01-10.

**AP-001 — Basic expense bill.** One line, `OFFICE_EXPENSE`, `100`, `TAX-0`. Approve.

```text
Dr OFFICE_EXPENSE        100.00
    Cr ACCOUNTS_PAYABLE          100.00

bill.amount_due   = 100.00
vendor payable    = 100.00
ACCOUNTS_PAYABLE  = -100.00
```

**AP-002 — Pay bill.** AP-001, then pay `100` on 2026-01-20.

```text
Dr ACCOUNTS_PAYABLE      100.00
    Cr OPERATING_BANK            100.00
```

| ID | Actions | Required result |
|---|---|---|
| `AP-003` | AP-001, pay `40`. | `amount_due = 60`, `ACCOUNTS_PAYABLE = -60`. |
| `AP-004` | AP-001, pay `40`, pay `60`. | `amount_due = 0`. Two payment entries. |
| `AP-005` | Two bills, `100` and `200`. One payment of `300` across both. | Both `amount_due = 0`. One payment entry of `300`. Two allocation rows. |
| `AP-006` | AP-001, vendor credit `100`. | `amount_due = 0`. Entry: `Dr ACCOUNTS_PAYABLE 100 / Cr OFFICE_EXPENSE 100`. |
| `AP-007` | AP-001, vendor credit `30`. | `amount_due = 70`. |
| `AP-008` | AP-001, attempt vendor credit `150`. | Refused. A credit cannot exceed `amount_due`. |
| `AP-009` | Pay `100` to the vendor with no bill. | Unapplied vendor payment. `ACCOUNTS_PAYABLE = 100` (a debit balance). `OPERATING_BANK = -100`. |
| `AP-010` | AP-009, then AP-001, then apply the prepayment. | `amount_due = 0`. `ACCOUNTS_PAYABLE = 0`. No new cash line. |
| `AP-011` | AP-001, void the bill. | A reversing entry. `OFFICE_EXPENSE = 0`, `ACCOUNTS_PAYABLE = 0`. |
| `AP-012` | AP-002, void the payment. | `amount_due = 100`. `OPERATING_BANK = 0`. A reversing entry for the payment. |
| `AP-013` | Bill, one line `100`, `TAX-8`. | `Dr OFFICE_EXPENSE 108 / Cr ACCOUNTS_PAYABLE 108`. In this US profile, sales tax paid on a purchase is not recoverable. It is part of the expense. The entry has no tax line. `bill.tax_total = 8.00` is stored for the record. |
| `AP-014` | Bill for 1 × `ITEM-A` at `60`. | `Dr INVENTORY 60 / Cr ACCOUNTS_PAYABLE 60`. `NOT_IMPLEMENTED` while `INV` is not implemented. |
| `AP-015` | Pay `100` on 2026-01-05 as a prepayment. Enter a bill of `100` dated 2026-01-10. Apply. | Same end state as AP-010. |
| `AP-016` | AP-001, then attempt a second bill from the same vendor with the same vendor invoice number. | Refused by the unique index (`pg:23505` at the engine boundary). The page's constraint registry names the field. |
| `AP-017` | 100 bills of `1.00` each. | `ACCOUNTS_PAYABLE = -100.00`. The vendor-balance page reports `100.00` from SQL. |
| `AP-018` | Two bills of `100`. Pay `100` against bill 1. Move the allocation to bill 2. | Bill 1 `amount_due = 100`, bill 2 `amount_due = 0`. Bank unchanged. |
| `AP-019` | AP-002, then the vendor refunds `100`. | `OPERATING_BANK = 0`. Entry: `Dr OPERATING_BANK 100 / Cr ACCOUNTS_PAYABLE 100`. `amount_due = 100`. |
| `AP-020` | Attempt to approve a bill whose lines total `0.00`. | Refused. |
| `AP-021` | AP-001, then attempt to pay `150`. | Refused with `overpayment`. INV-AP-002 holds. |
| `AP-022` | AP-001 approved by the owner, then the owner attempts to pay it. | Refused with `self_approval`. The approver must not also pay. Every other `AP-*` payment is made by the finance actor. |
| `AP-023` | Create a draft bill, then attempt to pay it. | Refused with `wrong_status`. |

### 10.4 Cash and banking — `BANK-*`

Every bank transaction in these scenarios is created by the fixture through the engine's statement-import operation, with a fixed statement file in the fixture.

| ID | Actions | Required result |
|---|---|---|
| `BANK-001` | AR-007. | `OPERATING_BANK = 100`. One cash line. |
| `BANK-002` | AP-002. | `OPERATING_BANK = -100`. One cash line. |
| `BANK-003` | Transfer `500` from `OPERATING_BANK` to `SAVINGS_BANK`. | `OPERATING_BANK = -500`, `SAVINGS_BANK = 500`. Total cash unchanged. INV-CASH-003 holds. |
| `BANK-004` | Transfer `100` from `CASH` to `OPERATING_BANK`. | `CASH = -100`, `OPERATING_BANK = 100`. |
| `BANK-005` | Record a bank fee of `15`. | `Dr BANK_FEES 15 / Cr OPERATING_BANK 15`. |
| `BANK-006` | Record interest of `2.50`. | `Dr OPERATING_BANK 2.50 / Cr INTEREST_INCOME 2.50`. |
| `BANK-007` | AR-007. Import a statement line of `+100` dated 2026-01-15. Match it to the payment. | Transaction status `matched`. No new journal entry. INV-CASH-002 holds. |
| `BANK-008` | AP-002. Import `-100`. Match to the vendor payment. | Same as BANK-007. |
| `BANK-009` | BANK-007, then reconcile the statement. | Transaction status `reconciled`. No new journal entry. `OPERATING_BANK = 100`. |
| `BANK-010` | BANK-009, then undo the reconciliation. | Status returns to `matched`. No journal entry. Balance unchanged. |
| `BANK-011` | Import `-150`. Split it: `100` to `OFFICE_EXPENSE`, `50` to `RENT_EXPENSE`. | One entry: `Dr OFFICE_EXPENSE 100`, `Dr RENT_EXPENSE 50`, `Cr OPERATING_BANK 150`. |
| `BANK-012` | Two invoices to two customers, `60` and `40`. Import `+100`. Split across both. | Both `paid`. One cash line of `100`. |
| `BANK-013` | Import the same statement twice. | The second import creates no new transaction rows. The import reports `0 new, N duplicate`. |
| `BANK-014` | Import two lines with the same date, amount and description. | Two transaction rows. Same values are not the same transaction when they are in one statement. |
| `BANK-015` | Set an opening bank balance of `1000` dated 2026-01-01. | `Dr OPERATING_BANK 1000 / Cr RETAINED_EARNINGS 1000`. |
| `BANK-016` | BANK-015, AR-007, AP-002. Start a reconciliation with statement ending balance `1000`. | The reconciliation shows a difference of `0.00` after both transactions are matched. |
| `BANK-017` | AP-002. Statement does not contain the `-100`. Reconcile with ending balance `0`. | The reconciliation lists the payment as outstanding. Difference `0.00`. |
| `BANK-018` | AR-007. Statement does not contain the `+100`. | The reconciliation lists the receipt as in transit. Difference `0.00`. |
| `BANK-019` | BANK-016, then complete the reconciliation. | Every matched transaction is `reconciled`. No journal entry. |
| `BANK-020` | BANK-016 with statement ending balance `999`. | The reconciliation reports a difference of `1.00`. Completion is refused while the difference is not `0.00`. |
| `BANK-021` | Attempt to match one bank transaction to a payment of a different amount. | Refused. |
| `BANK-022` | Attempt to match one payment to two bank transactions. | Refused. The second match is refused. |

### 10.5 Sales tax — `TAX-*`

| ID | Actions | Required result |
|---|---|---|
| `TAX-001` | Invoice `100`, `TAX-8`. | Tax `8.00`. Same as AR-002. |
| `TAX-002` | Invoice `108`, `TAX-8-I`. | Tax `8.00`, revenue `100.00`. Same as AR-006. |
| `TAX-003` | Invoice to `CUST-005`, `TAX-8`. | Tax `0.00`. Same as AR-005. |
| `TAX-004` | Invoice: line 1 `100` `TAX-8`; line 2 `100` `TAX-0`. | Tax `8.00`, total `208.00`. |
| `TAX-005` | Invoice: line `100`, discount `10`, `TAX-8`. | Taxable `90.00`, tax `7.20`, total `97.20`. The discount is applied before tax. |
| `TAX-006` | TAX-001, then credit note `108` with the same tax rate. | `Dr SERVICE_REVENUE 100`, `Dr SALES_TAX_PAYABLE 8`, `Cr ACCOUNTS_RECEIVABLE 108`. `SALES_TAX_PAYABLE = 0`. |
| `TAX-007` | TAX-001, then credit note `54`. | Tax on the credit is `4.00`. `SALES_TAX_PAYABLE = -4.00`. |
| `TAX-008` | TAX-001, receive `108`, refund `108`. | `SALES_TAX_PAYABLE = -8.00`. A refund of cash does not change tax. |
| `TAX-009` | Invoice: line `0.07`, `TAX-8`. | Tax `round(0.0056) = 0.01`. Total `0.08`. |
| `TAX-010` | Invoice: one line, `ITEM-C`, quantity 3, `TAX-8`. | Line `0.30`, tax `0.02`, total `0.32`. |
| `TAX-011` | Invoice: three lines, `ITEM-C`, quantity 1 each, `TAX-8`. | Tax `0.03`, total `0.33`. |
| `TAX-012` | Invoice: line 1 `100` `TAX-8`; line 2 `100` `TAX-5`. | Two tax lines in the entry: `8.00` and `5.00`, each carrying its `tax_rate_id`. Total `213.00`. |
| `TAX-013` | TAX-001. Change `TAX-8` to 9%. Invoice `100` with `TAX-8`. | The first invoice still has tax `8.00`. The second has `9.00`. |
| `TAX-014` | TAX-013, then read the first invoice. | `tax_total = 8.00`. The stored figure does not change. |
| `TAX-015` | TAX-001, TAX-004, TAX-006. Run the tax liability report. | The report total equals `−balance(SALES_TAX_PAYABLE)` = `8.00`. INV-TAX-001 holds. |
| `TAX-016` | Attempt an invoice line with tax `NO_SUCH_TAX`. | Refused by the foreign key (`pg:23503`). |

### 10.6 Foreign currency — `FX-*`

**FX-001 — EUR invoice.** `CUST-003`, 2026-01-01, one line `SERVICE-A`, `EUR 100`, `TAX-0`. Rate `1.200000`.

```text
Dr ACCOUNTS_RECEIVABLE   EUR 100.00   base 120.00
    Cr SERVICE_REVENUE   EUR 100.00   base 120.00

invoice.amount_due      = EUR 100.00
invoice.base_amount_due = USD 120.00
ACCOUNTS_RECEIVABLE     = 120.00
```

**FX-002 — Settlement at a different rate.** FX-001, then receive `EUR 100` on 2026-01-31 into `EUR_BANK`. Rate `1.250000`.

```text
Dr EUR_BANK              EUR 100.00   base 125.00
    Cr ACCOUNTS_RECEIVABLE EUR 100.00 base 120.00
    Cr REALIZED_FX_GAIN_LOSS           base   5.00
```

A receivable settled at a higher rate is a gain. A receivable settled at a lower rate is a loss. A payable is the opposite: a higher rate is a loss and a lower rate is a gain.

| ID | Actions | Required result |
|---|---|---|
| `FX-003` | FX-002. | `REALIZED_FX_GAIN_LOSS = -5.00`. |
| `FX-004` | FX-001, receive on 2026-03-01 at `1.150000`. | `REALIZED_FX_GAIN_LOSS = 5.00`. `EUR_BANK = 115.00`. |
| `FX-005` | Bill `VEND-002`, `EUR 100`, 2026-01-01. Pay 2026-03-01 at `1.150000`. | `REALIZED_FX_GAIN_LOSS = -5.00`. The payable settled for fewer USD. |
| `FX-006` | Same bill. Pay 2026-01-31 at `1.250000`. | `REALIZED_FX_GAIN_LOSS = 5.00`. |
| `FX-007` | FX-001, receive `EUR 40` on 2026-01-31. | `ACCOUNTS_RECEIVABLE = 72.00` (`60 × 1.20`). `REALIZED_FX_GAIN_LOSS = -2.00`. `amount_due = EUR 60`. |
| `FX-008` | FX-001, receive `EUR 40` on 2026-01-31, receive `EUR 60` on 2026-02-15 at `1.300000`. | Gain lines `2.00` and `6.00`. `REALIZED_FX_GAIN_LOSS = -8.00`. `ACCOUNTS_RECEIVABLE = 0`. `amount_due = 0`. |
| `FX-009` | FX-001. Revalue AR as of 2026-01-31. | Entry: `Dr ACCOUNTS_RECEIVABLE 5.00 / Cr UNREALIZED_FX_GAIN 5.00`. `NOT_IMPLEMENTED` per section 3.2. |
| `FX-010` | FX-005 bill. Revalue AP as of 2026-01-31. | Entry: `Dr UNREALIZED_FX_LOSS 5.00 / Cr ACCOUNTS_PAYABLE 5.00`. `NOT_IMPLEMENTED`. |
| `FX-011` | FX-009, then settle on 2026-02-15 at `1.300000`. | The revaluation reverses on 2026-02-01. Realized gain is `10.00`, measured from the document rate, not from the revalued rate. `NOT_IMPLEMENTED`. |
| `FX-012` | FX-009, then run the revaluation reversal on 2026-02-01. | The unrealized entry is reversed. `UNREALIZED_FX_GAIN = 0`. `NOT_IMPLEMENTED`. |
| `FX-013` | FX-001, credit note `EUR 100` on 2026-01-31. | The credit uses the invoice's rate `1.200000`, not the rate of its own date. `ACCOUNTS_RECEIVABLE = 0`. No FX gain. |
| `FX-014` | Receive `EUR 100` from `CUST-003` on 2026-01-01 with no invoice. Invoice `EUR 100` on 2026-01-31. Apply. | The application uses the deposit's rate. `REALIZED_FX_GAIN_LOSS = 5.00`: the receivable was booked at `125` and settled with cash booked at `120`. |
| `FX-015` | BANK-003 pattern between `OPERATING_BANK` and `EUR_BANK`: transfer `USD 120` to `EUR_BANK` as `EUR 100` on 2026-01-01. | `EUR_BANK` holds `EUR 100`, base `120.00`. Total cash in base is unchanged. |
| `FX-016` | Invoice `JPY 10000` to `CUST-006` at `0.006500`. | `base = 65.00`. `JPY` has 0 decimal places; `amount_due = JPY 10000`, never `10000.00`. |
| `FX-017` | Invoice `EUR 100` with a rate the fixture sets to `1.234567`. | `base = 123.46`. The stored rate is `1.234567`, not truncated. |
| `FX-018` | FX-001. Add a new rate row for 2026-01-01 of `1.210000`. Read the invoice. | `invoice.exchange_rate = 1.200000`. `base_total = 120.00`. A document keeps the rate it was posted with. |
| `FX-019` | FX-001. Run the balance sheet with display currency EUR. | Every journal line is unchanged. Every stored balance is unchanged. Only the displayed figures differ. |
| `FX-020` | FX-001, then attempt to receive `USD 100` against the EUR invoice. | Refused. The payment currency must equal the invoice currency. |
| `FX-021` | Attempt an invoice in EUR dated 2025-12-31, before any rate exists. | Refused. The refusal names the missing rate. |

### 10.7 Inventory and cost of goods sold — `INV-*`

The whole module is `NOT_IMPLEMENTED` as of 2026-10-02. The scenarios are specified so the module can be built against them.

**INV-001 — Purchase inventory.** Bill `VEND-001`, 1 × `ITEM-A` at `60`.

```text
Dr INVENTORY              60.00
    Cr ACCOUNTS_PAYABLE          60.00

ITEM-A quantity on hand = 1
```

**INV-002 — Sell inventory.** INV-001, then invoice `CUST-001`, 1 × `ITEM-A` at `100`.

```text
Dr ACCOUNTS_RECEIVABLE   100.00
    Cr PRODUCT_REVENUE           100.00

Dr COGS                   60.00
    Cr INVENTORY                 60.00

ITEM-A quantity on hand = 0
```

| ID | Actions | Required result |
|---|---|---|
| `INV-003` | Buy 5 × `ITEM-A`. Sell 3. | `INVENTORY = 120`, `COGS = 180`, quantity `2`. |
| `INV-004` | INV-003, customer returns 1. | Credit note `100`. `INVENTORY = 180`, `COGS = 120`, quantity `3`. |
| `INV-005` | INV-002, customer returns 1. | `INVENTORY = 60`, `COGS = 0`, quantity `1`. |
| `INV-006` | INV-001, return 1 to the vendor. | Vendor credit `60`. `INVENTORY = 0`, quantity `0`. |
| `INV-007` | Adjust `ITEM-A` up by 2 at cost `60`. | `Dr INVENTORY 120 / Cr COGS 120`. Quantity `+2`. |
| `INV-008` | INV-003, adjust down by 1. | `Dr COGS 60 / Cr INVENTORY 60`. Quantity `1`. |
| `INV-009` | Attempt an invoice line with quantity `0`. | Refused. |
| `INV-010` | Attempt to sell 1 × `ITEM-A` with quantity on hand `0`. | Refused. Negative inventory is not permitted in this profile. |
| `INV-011` | Buy 2 into warehouse A, 3 into warehouse B. | Quantity per warehouse `2` and `3`. Total `5`. `INVENTORY = 300`. |
| `INV-012` | INV-011, transfer 1 from A to B. | Per warehouse `1` and `4`. No journal entry. |
| `INV-013` | INV-012. | `INVENTORY = 300`, unchanged. |
| `INV-014` | INV-001, write off 1 unit. | `Dr COGS 60 / Cr INVENTORY 60`. Quantity `0`. |
| `INV-015` | INV-001, vendor credit of `10` on the bill with no return. | `INVENTORY = 50`. Unit cost becomes `50`. Quantity `1`. |
| `INV-016` | INV-002, credit note with `restock = true`. | Same as INV-005. |
| `INV-017` | INV-002, credit note with `restock = false`. | `INVENTORY = 0`, `COGS = 60`. The unit is not returned to stock. |
| `INV-018` | INV-003. | `balance(INVENTORY) = 2 × 60`. INV-INV-001 holds. |
| `INV-019` | INV-001 dated 2026-01-10. Sale dated 2026-01-05. | Refused. A sale before the stock exists is refused. |
| `INV-020` | INV-003, close January. Attempt an adjustment dated 2026-01-20. | Refused. |
| `INV-021` | INV-002, then attempt to post the same invoice again. | Refused. Quantity stays `0`. No second COGS entry. |
| `INV-022` | INV-002, then void the invoice. | COGS entry reversed. `INVENTORY = 60`. Quantity `1`. |

### 10.8 Accruals and prepayments — `ACC-*`

**Canonical prepayment.** Pay `1200` to `VEND-001` for twelve months of insurance on 2026-01-01.

```text
Initial:
Dr PREPAID_EXPENSES    1200.00
    Cr OPERATING_BANK          1200.00

Each month, on the last day of the month:
Dr INSURANCE_EXPENSE    100.00
    Cr PREPAID_EXPENSES         100.00

After the twelfth recognition:
PREPAID_EXPENSES  = 0.00
INSURANCE_EXPENSE = 1200.00
```

| ID | Actions | Required result |
|---|---|---|
| `ACC-001` | Accrue `500` of rent for period 2026-01. | Two entries in one call: `Dr RENT_EXPENSE 500 / Cr ACCRUED_EXPENSES 500` dated 2026-01-31, and its reversal dated 2026-02-01. Both are `is_adjusting = true`. |
| `ACC-002` | ACC-001. | `ACCRUED_EXPENSES = 0` as of 2026-02-01. `RENT_EXPENSE = 500` for January and `-500` for February. |
| `ACC-003` | Accrue revenue `300` on 2026-01-31. | `Dr ACCOUNTS_RECEIVABLE 300 / Cr SERVICE_REVENUE 300`, `is_adjusting = true`. |
| `ACC-004` | ACC-003, reverse on 2026-02-01. | Net `0` over the two months. |
| `ACC-005` | The canonical prepayment, initial entry only. | `PREPAID_EXPENSES = 1200`. |
| `ACC-006` | ACC-005, then post the amortization due on 2026-01-31. | `INSURANCE_EXPENSE = 100`, `PREPAID_EXPENSES = 1100`. |
| `ACC-007` | ACC-005, then post every amortization through 2026-12-31. | Twelve entries. `PREPAID_EXPENSES = 0`, `INSURANCE_EXPENSE = 1200`. |
| `ACC-008` | Prepayment `1200` starting 2026-01-16, twelve months. | This profile uses the half-month convention. A schedule that starts after the 15th recognises `50.00` in the first month, `100.00` in each of the next eleven months, and `50.00` in the thirteenth. The fixture states every month's figure. Day-count proration is not used. |
| `ACC-009` | ACC-006, then change the schedule's remaining months from 11 to 5. | Five future entries of `220.00`. The posted January entry is unchanged. |
| `ACC-010` | ACC-006, attempt to change the January entry. | Refused. |
| `ACC-011` | ACC-006, cancel the schedule on 2026-02-01. | No further entries post. `PREPAID_EXPENSES = 1100`. A cancellation does not reverse posted entries. |
| `ACC-012` | ACC-006. | `balance(PREPAID_EXPENSES) = sum over schedules of unamortized amount`. |
| `ACC-013` | ACC-005, then run `post due amortizations` twice for 2026-01-31. | One entry, not two. The second run reports `0 posted`. |
| `ACC-014` | ACC-001, then run reversals twice for 2026-02-01. | One reversal, not two. |

### 10.9 Deferred revenue — `DEF-*`

The whole module is `NOT_IMPLEMENTED` as of 2026-10-02.

**Canonical contract.** `CUST-001` pays `1200` on 2026-01-01 for twelve months of `SERVICE-A`.

```text
Initial:
Dr OPERATING_BANK      1200.00
    Cr DEFERRED_REVENUE        1200.00

Each month:
Dr DEFERRED_REVENUE     100.00
    Cr SERVICE_REVENUE          100.00
```

| ID | Actions | Required result |
|---|---|---|
| `DEF-001` | Initial entry. | `DEFERRED_REVENUE = -1200`. `SERVICE_REVENUE = 0`. |
| `DEF-002` | DEF-001, recognise January. | `DEFERRED_REVENUE = -1100`, `SERVICE_REVENUE = -100`. |
| `DEF-003` | DEF-001, recognise all twelve. | `DEFERRED_REVENUE = 0`, `SERVICE_REVENUE = -1200`. |
| `DEF-004` | DEF-001, recognise five months. | `DEFERRED_REVENUE = -700`. |
| `DEF-005` | DEF-004, cancel the remaining service with a refund of `700`. | `DEFERRED_REVENUE = 0`, `OPERATING_BANK = 500`. |
| `DEF-006` | DEF-004, refund `350` and keep the service for the remaining months at `50` a month. | `DEFERRED_REVENUE = -350`. Seven future entries of `50`. |
| `DEF-007` | DEF-002, change the remaining schedule from 11 months to 10. | Ten future entries of `110`. January unchanged. |
| `DEF-008` | DEF-002, attempt to change January's entry. | Refused. |
| `DEF-009` | DEF-004. | `−balance(DEFERRED_REVENUE) = sum of unrecognised schedule amounts`. |
| `DEF-010` | DEF-001. | `sum of every schedule line = 1200.00`, the contract amount. |

### 10.10 Fixed assets — `FA-*`

The whole module is `NOT_IMPLEMENTED` as of 2026-10-02.

**Canonical asset.** Buy equipment for `12000` on 2026-01-01. Useful life 60 months. Residual value `0`. Straight-line.

```text
Initial:
Dr EQUIPMENT           12000.00
    Cr OPERATING_BANK          12000.00

Each month:
Dr DEPRECIATION_EXPENSE   200.00
    Cr ACCUMULATED_DEPRECIATION   200.00
```

| ID | Actions | Required result |
|---|---|---|
| `FA-001` | Initial entry. | `EQUIPMENT = 12000`. |
| `FA-002` | FA-001, depreciate January. | `ACCUMULATED_DEPRECIATION = -200`. Net book value `11800`. |
| `FA-003` | FA-001, depreciate twelve months. | `ACCUMULATED_DEPRECIATION = -2400`. |
| `FA-004` | FA-001, depreciate sixty months. | `ACCUMULATED_DEPRECIATION = -12000`. Net book value `0`. |
| `FA-005` | FA-004, run depreciation for a sixty-first month. | No entry is created. The run reports `0 posted`. `ACCUMULATED_DEPRECIATION` stays at `-12000`. |
| `FA-006` | Buy on 2026-01-16. | Half-month convention, as ACC-008: January depreciation `100.00`, then `200.00` a month, then `100.00` in the sixty-first month. The fixture states every month. |
| `FA-007` | FA-002, dispose for `11800` on 2026-02-01. | `Dr OPERATING_BANK 11800`, `Dr ACCUMULATED_DEPRECIATION 200`, `Cr EQUIPMENT 12000`. No gain, no loss. |
| `FA-008` | FA-002, dispose for `12000`. | `Cr GAIN_ON_DISPOSAL 200`. |
| `FA-009` | FA-002, dispose for `11000`. | `Dr LOSS_ON_DISPOSAL 800`. |
| `FA-010` | FA-001, void the purchase. | A reversing entry. `EQUIPMENT = 0`. The asset register row has status `void`. |
| `FA-011` | FA-003. | `−balance(ACCUMULATED_DEPRECIATION) = sum over assets of accumulated depreciation`. |
| `FA-012` | FA-003. | `balance(EQUIPMENT) = sum over assets of cost`. |

### 10.11 Period close — `CLOSE-*`

| ID | Actions | Required result |
|---|---|---|
| `CLOSE-001` | Post a journal dated 2026-01-15 while 2026-01 is open. | Accepted. |
| `CLOSE-002` | Close 2026-01. | `accounting_periods.status = closed` for 2026-01. An audit entry records the close. |
| `CLOSE-003` | CLOSE-002, attempt an invoice dated 2026-01-20. | Refused. The refusal names the period. |
| `CLOSE-004` | CLOSE-002, attempt a manual journal dated 2026-01-20. | Refused. |
| `CLOSE-005` | GL-001, CLOSE-002, attempt to void the January journal. | Refused. A reversal dated in a closed period is refused. |
| `CLOSE-006` | CLOSE-002, post a journal dated 2026-02-01. | Accepted. |
| `CLOSE-007` | CLOSE-002, reopen 2026-01 as the owner. | `status = open`. |
| `CLOSE-008` | CLOSE-007. | An audit entry records the reopen, the actor and the reason. |
| `CLOSE-009` | CLOSE-007, post a January journal, close again. | Accepted, then `closed`. |
| `CLOSE-010` | Post revenue `1000` and expense `400` in 2026. Run year-end close on 2026-12-31. | `RETAINED_EARNINGS = -600`. Every revenue and expense account is `0` after the close entry. The close entry has `source_type = 'year_end_close'` and three lines. |
| `CLOSE-011` | CLOSE-010, then read balances as of 2027-01-01. | `RETAINED_EARNINGS = -600`. `SERVICE_REVENUE = 0`. |
| `CLOSE-012` | CLOSE-010, then post an expense dated 2027-01-15. | Balances as of 2026-12-31 are unchanged. |
| `CLOSE-013` | CLOSE-002, attempt an invoice dated 2026-01-31 from a form that defaults to today. | Refused. The date, not the form, decides. |
| `CLOSE-014` | GL-001 dated 2026-01-15. Close 2026-01. Reverse the journal dated 2026-02-01. | Accepted. The reversal is in an open period. January balances are unchanged. |
| `CLOSE-015` | CLOSE-002. | Every journal entry and line dated in January is byte-for-byte unchanged by the close. The close writes no journal entry. |
| `CLOSE-016` | CLOSE-002, attempt to close 2026-01 again. | Refused. The refusal says the period is already closed. No audit row is written. |
| `CLOSE-017` | Attempt to close 2026-03 while 2026-02 is open. | Refused. Periods close in order. |
| `CLOSE-018` | Attempt year-end close while 2026-12 is open. | Refused. Every period of the year must be closed first. |

---

## 11. Metamorphic Tests — `META-*`

A metamorphic test runs two sequences that are economically equivalent and requires the same end state. The runner runs each sequence from the golden seed and compares the two end states.

"The same end state" means: every account balance is equal, every report figure is equal, and every subledger figure is equal. The number of journal entries can differ.

| ID | Sequence A | Sequence B | Equal |
|---|---|---|---|
| `META-001` | AR-001, credit note `100`. | Nothing. | Every account balance. Both documents remain in sequence A's audit trail. |
| `META-002` | AR-007, refund `100`. | AR-001. | Every account balance. |
| `META-003` | GL-001, reverse it. | Nothing. | Every account balance. Two entries exist in A. |
| `META-004` | AR-001, receive `100`. | AR-001, receive `20`, `30`, `50`. | Cash, AR, revenue, tax, balance sheet, income statement. |
| `META-005` | Invoice one line `SERVICE-A` × 1 at `100`, `TAX-8`. | Invoice two lines `SERVICE-A` × 1 at `50` each, `TAX-8`. | Every account balance. Both have tax `8.00`. |
| `META-006` | AP-001, pay `100`. | AP-001, pay `60`, pay `40`. | Every account balance. |
| `META-007` | AR-020. | Three invoices, three receipts of `100`, `200`, `300`. | Every account balance. |
| `META-008` | TAX-010. | TAX-011. | **Not equal.** The tax differs by `0.01`. This test asserts the difference is exactly `0.01`, to show the rounding rule is applied per line. |

---

## 12. Reports — `RPT-*`

Every report scenario starts from a fixture that posts distinctive amounts, so a misclassified balance is visible. The fixture `RPT-BASE` posts: revenue `1111.11`, expense `222.22`, an invoice outstanding `333.33`, a bill outstanding `444.44`, a bank balance `555.55`, and tax payable `66.66`.

| ID | Actions | Required result |
|---|---|---|
| `RPT-001` | Trial balance on the untouched golden seed. | Every row is `0.00`. Debit total `0.00`, credit total `0.00`. |
| `RPT-002` | RPT-BASE, trial balance as of 2026-01-31. | Each account shows its fixture figure in the correct column. The columns are gross: an account's `debits` is the sum of its debit lines and `credits` the sum of its credit lines, so `ACCOUNTS_RECEIVABLE` shows `1166.67` and `833.34`, not a net `333.33`. |
| `RPT-003` | RPT-002. | Debit total equals credit total: `2888.89` each. |
| `RPT-004` | RPT-BASE, balance sheet as of 2026-01-31. | Assets `=` liabilities `+` equity, where equity includes current-period earnings `888.89`. |
| `RPT-005` | RPT-BASE, income statement for 2026-01. | Net income `888.89`. |
| `RPT-006` | RPT-BASE. | Balance sheet retained earnings `+` current-period earnings `=` opening retained earnings `+` income statement net income. |
| `RPT-007` | RPT-BASE, AR aging as of 2026-01-31. | Aging total `333.33` `=` `balance(ACCOUNTS_RECEIVABLE)`. |
| `RPT-008` | RPT-BASE, AP aging. | Aging total `444.44` `=` `−balance(ACCOUNTS_PAYABLE)`. |
| `RPT-009` | RPT-BASE, customer statement for `CUST-001`. | Closing balance `333.33`. |
| `RPT-010` | RPT-BASE, vendor statement for `VEND-001`. | Closing balance `444.44`. |
| `RPT-011` | RPT-BASE, tax liability report. | `66.66` `=` `−balance(SALES_TAX_PAYABLE)`. |
| `RPT-012` | Inventory valuation report. | `=` `balance(INVENTORY)`. `NOT_IMPLEMENTED` while `INV` is. |
| `RPT-013` | Fixed-asset report. | `=` `balance(EQUIPMENT)` and `balance(ACCUMULATED_DEPRECIATION)`. `NOT_IMPLEMENTED` while `FA` is. |
| `RPT-014` | RPT-BASE, cash report. | `555.55` `=` sum of bank and cash account balances. |
| `RPT-015` | Post two journals tagged with cost centres `A` and `B`. Run the cost-centre report. | `A + B` `=` the GL total of the accounts used. |
| `RPT-016` | Post two invoices on projects `P1` and `P2`. Run the project report. | `P1 + P2` `=` the GL revenue total. |
| `RPT-017` | Post on 2026-01-31 and 2026-02-01. Run the income statement for 2026-01. | The 2026-01-31 entry is included. The 2026-02-01 entry is not. |
| `RPT-018` | Post on 2026-01-15 and 2026-02-15. Balance sheet as of 2026-01-31. | Only the January entry is included. |
| `RPT-019` | Income statement 2026-02 with comparative 2026-01. | The comparative column equals a standalone 2026-01 run. |
| `RPT-020` | RPT-BASE, trial balance with `include zero balances = true`. | Every account in section 6 appears. With `false`, only accounts with a non-zero balance appear. Totals are equal either way. |
| `RPT-021` | Post `0.005`-producing figures: invoice `EUR 0.01` at `1.234567`. | Report shows `0.01`, the stored rounded base. No report rounds a second time. |
| `RPT-022` | RPT-002, drill down on `SERVICE_REVENUE`. | The lines returned sum to `1111.11`. |
| `RPT-023` | RPT-002, export the trial balance as CSV. | Every figure in the file equals the figure on the page. |
| `RPT-024` | Run RPT-002 twice. | Byte-for-byte identical output. |
| `RPT-025` | RPT-BASE, cash-flow statement for 2026-01. | Net change in cash `555.55` `=` the movement in bank and cash balances. |

---

## 13. Concurrency and Idempotency — `CON-*`

Every `CON-*` scenario declares `isolation: database`. The runner opens two or more connections and starts the actions within 10 milliseconds of each other. The fixture states the number of connections.

Concurrency tests are accounting correctness tests. They are not performance tests.

**CON-001 — Duplicate invoice request.** Send `invoice.create` twice with the same `Idempotency-Key`. Required: one invoice, one posting, one AR increase. `NOT_IMPLEMENTED` per section 3.2.

**CON-002 — Duplicate payment callback.** The payment gateway sends the same success callback five times. Required: one cash receipt, one journal entry. `NOT_IMPLEMENTED` per section 3.2.

| ID | Actions | Required result |
|---|---|---|
| `CON-003` | Two connections post the same draft journal at the same time. | One posted entry. The second post is refused. |
| `CON-004` | Two connections each receive `100` against the same `100` invoice at the same time. | One allocation of `100`. The second receipt is refused. `amount_paid = 100`. `OPERATING_BANK = 100`. |
| `CON-005` | Two connections match the same bank transaction to the same payment. | One match. The second is refused. |
| `CON-006` | One connection applies a credit of `100`, another receives `100`, against the same `100` invoice. | Exactly one of the two succeeds. `amount_due = 0`. INV-AR-004 holds. |
| `CON-007` | One connection voids an invoice while another receives a payment against it. | Either the void wins and the payment is refused, or the payment wins and the void is refused. Never both. |
| `CON-008` | One connection closes 2026-01 while another posts a January journal. | Either the close wins and the post is refused, or the post wins and the close completes after it. Never a posted January entry in a closed period that the close did not see. |
| `CON-009` | The client times out after sending `invoice.create`. The client retries with the same key. | One invoice. `NOT_IMPLEMENTED` per section 3.2. |
| `CON-010` | The database commits; the HTTP response is lost; the client retries with the same key. | One invoice. `NOT_IMPLEMENTED` per section 3.2. |
| `CON-011` | The runner kills the connection before `COMMIT`. | Nothing is written. INV-GL-004 holds. |
| `CON-012` | The runner kills the connection after `COMMIT`. | Everything is written. The entry is complete. |
| `CON-013` | Two connections each sell the last unit of `ITEM-A`. | One sale. `NOT_IMPLEMENTED` while `INV` is. |
| `CON-014` | Two connections run the depreciation job for January. | One entry. `NOT_IMPLEMENTED` while `FA` is. |
| `CON-015` | Two connections run the deferred-revenue job for January. | One entry. `NOT_IMPLEMENTED` while `DEF` is. |
| `CON-016` | Two connections run `post due amortizations` for 2026-01-31. | One entry. The second reports `0 posted`. |
| `CON-017` | Two connections post two different balanced journals at the same time. | Two posted entries. Neither deadlocks. Both entry numbers are distinct and sequential. |
| `CON-018` | Twenty connections each post one journal in a batch. | Twenty posted entries. No deadlock. `gl_daily_balances` agrees with the lines. |

---

## 14. Atomicity and Failure Injection — `FAIL-*`

Every `FAIL-*` scenario declares `isolation: database`. The runner injects a failure at one write boundary. The fixture names the boundary. The runner injects the failure with a Postgres trigger on the named table. The trigger raises an exception when a session variable is set. The fixture creates the trigger. The runner drops it afterwards.

The required result for every `FAIL-*` scenario is the same:

```text
every document            = unchanged
every journal table       = unchanged
every subledger figure    = unchanged
every balance             = unchanged
```

or the entire action succeeds and every check for the un-failed version of the action holds. There is no third outcome.

The engine must never produce:

```text
invoice.status = sent      and   no posted journal entry
journal header exists      and   lines are missing
journal header exists      and   only one side of the entry exists
```

| ID | Boundary | Action |
|---|---|---|
| `FAIL-001` | Insert of the invoice header | AR-001 |
| `FAIL-002` | Insert of the second invoice line | AR-003 |
| `FAIL-003` | Insert of the journal header | AR-001 |
| `FAIL-004` | Insert of the first journal line | AR-001 |
| `FAIL-005` | Insert of the second journal line | AR-001 |
| `FAIL-006` | Update of the invoice totals after posting | AR-001 |
| `FAIL-007` | Insert of the payment allocation | AR-007 |
| `FAIL-008` | Update of `gl_daily_balances` | GL-001 |
| `FAIL-009` | Update of the invoice status | AR-007 |
| `FAIL-010` | The `COMMIT` itself (the runner kills the connection) | AR-001 |
| `FAIL-011` | Insert of the audit log row | CLOSE-002 |
| `FAIL-012` | Insert of the reversing journal header | GL-012 |

---

## 15. Audit Trail — `AUD-*`

| ID | Actions | Required result |
|---|---|---|
| `AUD-001` | AR-001. | `invoices.created_by` is the actor's id. |
| `AUD-002` | AR-001. | `journal_entries.posted_by` is the actor's id. |
| `AUD-003` | AR-001. | `journal_entries.posted_at` equals the database `now()` of the transaction, not the fixture date. |
| `AUD-004` | AR-001. | From the journal entry, `source_type` and `source_id` resolve to the invoice. |
| `AUD-005` | AR-007. | The payment entry's `source_id` resolves to the payment. |
| `AUD-006` | GL-012. | The reversal names the original. The original names the reversal. |
| `AUD-007` | AR-015. | The credit note row names the invoice. |
| `AUD-008` | AR-020. | Three allocation rows, each naming the payment and one invoice, summing to `600`. |
| `AUD-009` | CLOSE-007. | One `audit_log` row with `action = 'reopen'`, `entity_type = 'accounting_periods'`, the actor, and the reason text. |
| `AUD-010` | GL-010. | The refused change writes no `audit_log` row that claims a change. |
| `AUD-011` | FX-018. | The invoice's stored rate is `1.200000` after the new rate row is added. |
| `AUD-012` | TAX-014. | The invoice's stored `tax_total` is `8.00` after the rate changes. |
| `AUD-013` | AR-025. | The voided invoice row still exists with `status = void`. Its original entry still exists. |
| `AUD-014` | Run AR-001, AR-008, AR-016, AR-027 in that order. | Reading `journal_entries` ordered by `entry_number` reproduces the sequence. No gap in `entry_number`. |
| `AUD-015` | Every write in sections 10 to 14. | Every write that `apps/web/src/lib/server/audit/register.ts` lists as audited has one `audit_log` row in the same transaction. |

---

## 16. Precision and Pathological Numbers — `NUM-*`

| ID | Actions | Required result |
|---|---|---|
| `NUM-001` | Invoice `0.01`. | `ACCOUNTS_RECEIVABLE = 0.01`. |
| `NUM-002` | Invoice `999999999.99`. | Exact. |
| `NUM-003` | 1000 invoices of `0.01` to `CUST-002`. | `ACCOUNTS_RECEIVABLE = 10.00`, exactly. Never `9.99` or `10.000000000000002`. Gate B only (`gate: nightly`): a thousand postings into one account-day take minutes, see section 16.1. |
| `NUM-004` | Receive `100` across three invoices of `33.33`, `33.33`, `33.34`. | Allocations `33.33`, `33.33`, `33.34`. Sum `100.00`. No cent is lost. |
| `NUM-005` | 10000 journals of `Dr OFFICE_EXPENSE 0.1 / Cr OPERATING_BANK 0.1`. | `OFFICE_EXPENSE = 1000.00`, exactly. Gate B only (`gate: nightly`): ten thousand postings take minutes. |
| `NUM-006` | Attempt an invoice line of `0.00`. | Refused. |
| `NUM-007` | Attempt an invoice line of `-100`. | Refused by the column's CHECK constraint (`pg:23514`). A negative amount is entered as a credit note, never as a negative line. |
| `NUM-008` | Invoice `9999999999999.99` (thirteen integer digits, the column maximum for `numeric(15,2)`). | Exact. |
| `NUM-009` | Attempt an invoice line of `100.001`. | Refused. The reader rejects a third decimal. It does not round silently. |
| `NUM-010` | Invoice `EUR 1` at `1.234567`. | `base = 1.23`. |
| `NUM-011` | Bill for 1 unit at unit cost `0.3333`. | Line amount `0.33`. |
| `NUM-012` | Invoice for `2.5` hours of `SERVICE-A` at `100`. | Line amount `250.00`. Quantity stored as `2.5000`. |
| `NUM-013` | Invoice `9007199254740993.00`. | Refused by the column size, with a field error, not a 500. The value is one above `2^53`, the point at which a float64 round-trip loses it. |
| `NUM-014` | Read the balance of an account after NUM-005. | The TypeScript value is the string `"1000.00"`. It is not a `number`. |

---

### 16.1 Posting volume

`NUM-003` and `NUM-005` post a thousand and ten thousand lines into one account on one day. On 2026-10-02 the engine took 572 seconds for the thousand. It had not finished the ten thousand after 14 minutes. The cause is `gl_daily_balances`. It is recomputed from every line of the account-day on every insert, so the cost of a day grows with the square of its lines. Both scenarios carry `gate: nightly` until that is changed, and the pull-request gate reports them `NOT_RUN`.

---

## 17. Property and State-Machine Tests — `PROP-*`

### 17.1 What they do

The deterministic catalog is layer one. Layer two generates sequences of actions and checks every invariant after every action.

The runner has a simplified model of accounting state: balances per account, outstanding per document, and status per document. For every generated action:

```text
1. Generate the next action from the current model state.
2. Apply the action to the model.
3. Apply the action to the engine.
4. Compare the model and the engine.
5. Run every invariant in section 9.
```

A difference in step 4 or a failure in step 5 is a `FAIL`.

### 17.2 Generated actions

The generator chooses from this set, with the stated weights:

| Action | Weight | Precondition |
|---|---|---|
| Create and post an invoice | 20 | — |
| Receive a partial payment | 15 | An open invoice exists |
| Receive a full payment | 10 | An open invoice exists |
| Credit note | 8 | An open invoice exists |
| Apply an unapplied receipt | 5 | An unapplied receipt exists |
| Refund | 5 | A paid invoice exists |
| Void a payment | 4 | A payment exists |
| Void an invoice | 3 | An invoice with no payment exists |
| Create and approve a bill | 15 | — |
| Pay a bill | 10 | An open bill exists |
| Post a manual journal | 5 | — |
| Close the current period | 1 | — |
| Attempt a write in a closed period | 2 | A closed period exists; expected refused |
| Attempt an over-allocation | 2 | An open invoice exists; expected refused |

Amounts are drawn from `0.01` to `9999.99` with a bias toward amounts that end in `.33`, `.67`, `.99` and `.01`.

### 17.3 Determinism

- Every run has a 32-bit seed. The runner prints the seed at the start.
- The same seed produces the same sequence.
- A failure persists: the seed, the full sequence, the shrunk sequence, the model state, the engine state, and the invariant or comparison that failed. The runner writes these to `packages/database/conformance/failures/<seed>.json`. The file is committed when the failure is turned into a deterministic scenario.
- Every failure found by a property run must become a deterministic scenario in section 10 before the fix is merged.

### 17.4 Sizes

| Run | Sequences | Actions per sequence |
|---|---|---|
| Pull request | 100 | 20 |
| Nightly | 10000 | 20 to 100 |
| Release candidate | 10000 | 20 to 100 |

### 17.5 Failure report

```text
ACCOUNTING PROPERTY TEST FAILED

Seed: 728466291

Minimal sequence:
1. Invoice 83.17
2. Receive 31.22
3. Credit 14.87
4. Receive 31.22 again

Invariant failed:
INV-AR-001  balance(ACCOUNTS_RECEIVABLE) = 37.08 ; sum(customer receivable) = 5.86
```

---

## 18. Database-Level Tests — `DB-*`

These tests run as SQL against the conformance database. They do not use TypeScript. Many of them are already in `./check`; where they are, the `DB-*` test calls the same SQL file and does not restate it.

| ID | Statement | Check |
|---|---|---|
| `DB-001` | `journal_entry_lines.entry_id` has a foreign key to `journal_entries`. | `pg_constraint`. |
| `DB-002` | `journal_entry_lines.account_id` has a foreign key to `chart_of_accounts`. | `pg_constraint`. |
| `DB-003` | Every monetary column is `NUMERIC`. | The `money/numeric-not-float` invariant of `./check`. |
| `DB-004` | `journal_entries.status` accepts only `draft`, `posted`, `void`, `reversed`. | An `UPDATE` to `'other'` is refused. |
| `DB-005` | A posted journal entry with zero lines cannot exist. | A constraint or trigger refuses it. |
| `DB-006` | A posted journal entry whose lines do not balance cannot be committed. | A deferred constraint trigger refuses the `COMMIT`. |
| `DB-007` | `journal_entries.source_id`, when present, resolves to a row of the table that `source_type` names. | A query per `source_type`. |
| `DB-008` | A duplicate idempotency key is refused by a unique index. | `NOT_IMPLEMENTED` per section 3.2. |
| `DB-009` | Each of these is unique per tenant: invoice number; bill number; journal entry number; vendor invoice number per vendor. | `pg_indexes`. |
| `DB-010` | `accounting_periods` have no overlap and no gap within a fiscal year. | A query over the seed's twelve periods. |
| `DB-011` | Every accounting table has `tenant_isolation` and passes `verify-rls.sql`. | The `tenant isolation` step of `./check`, run against the conformance database. |
| `DB-012` | A posting that fails after the header insert leaves no header. | `FAIL-004`, observed at the SQL level. |
| `DB-013` | `gl_daily_balances` agrees with `journal_entry_lines` after every write. | The `ledger/daily-balances-agree` invariant of `./check`. |
| `DB-014` | A posted journal entry refuses `UPDATE` to any column except `status`. | A trigger refuses it. `GL-010` at the SQL level. |
| `DB-015` | A posted journal entry refuses `DELETE`. | `app_user` has no `DELETE` grant; a trigger refuses the owner. `GL-011` at the SQL level. |

Do not rely on TypeScript alone for a guarantee the database can enforce.

---

## 19. Golden End-to-End Financial State — `E2E-*`

`E2E-GLD-001` exercises most modules in one sequence. It declares `isolation: database`.

Start: owner funds the company with `100000` on 2026-01-01: `Dr OPERATING_BANK 100000 / Cr COMMON_STOCK 100000`.

Then, in this order, with every amount and date in the fixture:

```text
 1. Buy inventory                      (NOT_IMPLEMENTED: skipped, recorded)
 2. Buy a fixed asset                  (NOT_IMPLEMENTED: skipped, recorded)
 3. Pay prepaid insurance 1200         ACC-005
 4. Receive a vendor bill 500          AP-001 pattern
 5. Pay the vendor 200                 AP-003 pattern
 6. Issue a taxable invoice 108        AR-002
 7. Sell inventory                     (NOT_IMPLEMENTED: skipped, recorded)
 8. Receive 50 against the invoice     AR-008 pattern
 9. Credit note 10.80                  AR-016 pattern
10. Receive the remaining 47.20        AR-009 pattern
11. Enter a EUR invoice 100            FX-001
12. Revalue the EUR receivable         (NOT_IMPLEMENTED: skipped, recorded)
13. Settle the EUR receivable          FX-002
14. Accrue rent 500                    ACC-001
15. Recognise January insurance 100    ACC-006
16. Depreciate                         (NOT_IMPLEMENTED: skipped, recorded)
17. Receive a deferred prepayment      (NOT_IMPLEMENTED: skipped, recorded)
18. Recognise January revenue          (NOT_IMPLEMENTED: skipped, recorded)
19. Reconcile the bank statement       BANK-019 pattern
20. Close January                      CLOSE-002
```

The runner compares the entire accounting state with these committed files in `packages/database/conformance/golden/`:

```text
trial-balance.json
balance-sheet.json
income-statement.json
cash-flow.json
ar-aging.json
ap-aging.json
tax-liability.json
journal-ledger.json
inventory-valuation.json     (empty while INV is NOT_IMPLEMENTED)
fixed-assets.json            (empty while FA is NOT_IMPLEMENTED)
```

Rules:

- A difference in any file is a `FAIL`.
- A change to an accounting code path that changes a golden file must update the file in the same pull request. The diff of the golden file is the review artefact.
- A skipped step is recorded in the output as `SKIPPED (NOT_IMPLEMENTED)`. When its module becomes implemented, the step runs and the golden files are regenerated in the same pull request.

---

## 20. Fixture Format

A fixture is one YAML file. The file is the complete definition of the scenario.

### 20.1 Example

```yaml
id: AR-008
title: Partial customer payment
version: 1
profile: ACS-US-ACCRUAL-1.0
module: AR
isolation: transaction

given:
  customer: CUST-001

actions:
  - op: invoice.create
    as: INV1
    args:
      customer: CUST-001
      date: 2026-01-10
      lines:
        - item: SERVICE-A
          quantity: 1
          unit_price: "100.00"
          tax: TAX-0

  - op: invoice.post
    args:
      invoice: INV1
    expect:
      result: ok
      journal:
        - { account: ACCOUNTS_RECEIVABLE, debit: "100.00", credit: "0.00" }
        - { account: SERVICE_REVENUE,     debit: "0.00",   credit: "100.00" }

  - op: payment.receive
    as: PAY1
    args:
      customer: CUST-001
      date: 2026-01-15
      amount: "30.00"
      currency: USD
      bank: OPERATING_BANK
      allocate:
        - { invoice: INV1, amount: "30.00" }
    expect:
      result: ok
      journal:
        - { account: OPERATING_BANK,      debit: "30.00", credit: "0.00" }
        - { account: ACCOUNTS_RECEIVABLE, debit: "0.00",  credit: "30.00" }

expect:
  documents:
    INV1:
      status: partial
      total: "100.00"
      amount_paid: "30.00"
      amount_due: "70.00"
  balances:
    OPERATING_BANK: "30.00"
    ACCOUNTS_RECEIVABLE: "70.00"
    SERVICE_REVENUE: "-100.00"
  subledger:
    customers:
      CUST-001: "70.00"
  invariants:
    - INV-JRN-001
    - INV-GL-001
    - INV-AR-001
    - INV-AR-002
```

### 20.2 Fields

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | The scenario ID. Must equal the file name without extension. Must start with a module prefix from section 3.1. |
| `title` | yes | One line. |
| `version` | yes | Integer. Increment when the expected result changes. |
| `profile` | yes | `ACS-US-ACCRUAL-1.0`. |
| `module` | yes | The module prefix. Must equal the prefix of `id`. |
| `isolation` | no | `transaction` (default) or `database`. Section 4.3. |
| `actor` | no | A role name from the seed. Default: the tenant owner. |
| `given` | no | Named master-data handles from the golden seed. Can also contain `balances`, a map of semantic ID to amount, which the runner posts as one opening journal dated 2026-01-01 before the first action. |
| `actions` | yes | An ordered list. Each item has `op`, optional `as`, optional `args`, optional `expect`. |
| `actions[].op` | yes | One operation from section 20.3. |
| `actions[].as` | no | A handle. Later `args` and the final `expect` refer to the created row by this handle. |
| `actions[].args` | no | The operation's arguments. Every amount is a quoted decimal string. Every date is `YYYY-MM-DD`. |
| `actions[].expect.result` | no | `ok` (default) or `refused`. If `refused`, the runner checks INV-GL-004 around the action. |
| `actions[].expect.refusal` | no | The refusal code the engine must raise. Required when `result` is `refused`. |
| `actions[].expect.journal` | no | The exact lines of the journal entry this action posts, in functional currency. Section 8.4 defines the comparison. An action that posts two entries (an accrual with its reversal) gives `journals`, a list of line lists. |
| `actions[].expect.value` | no | Values the op reports, compared one by one: `rows`, `posted`, `reversal_date`, `entry_number`, `status`. |
| `actions[].args.lines[].tax_amount` | when `tax` is not `TAX-0` | The line's tax, computed by section 8.3. |
| `expect.documents` | no | Per handle: a map of column name to expected value. |
| `expect.balances` | no | Per semantic account ID: the expected balance under section 8.2. Every account not listed must be `0.00`. |
| `expect.subledger` | no | `customers`, `vendors`, `tax`, `inventory`: per handle, the expected figure. |
| `expect.reports` | no | Per report name: a map of line to expected figure. |
| `expect.invariants` | yes | The invariants whose failure is most informative for this scenario. The runner runs every invariant regardless. The list cannot be empty. |
| `gate` | no | `pr` (default) or `nightly`. Section 22. |
| `actions[].repeat` | no | Run the op this many times. Invariants are checked once afterwards; a report op reports `identical` across the runs. |
| `actions[].actor` | no | The actor for this action: `owner` or `finance`. |
| `actions[].inject` | no | Section 14: the fixture's trigger is armed for this action only. |
| `actions[].abort` | no | Throw after the op, so the transaction never commits; the refusal code is `acs:aborted`. |
| `sequences` | no | Section 11: a map of name to action list. Two or more. |
| `concurrent` | no | Section 13: a list of lanes, each `{ actor?, actions, abort? }`, run at the same time after `actions`. |
| `inject` | no | Section 14: `{ table, op, nth }`. |
| `sql` | no | Section 18: a path under the conformance directory. |
| `golden` | no | Section 19: report names to compare with `golden/<name>.json`. |
| `expect.balances_as_of` | no | Per date: a balances map, read over entries dated on or before that date. |
| `expect.journals_total` | no | The number of journal entries in the tenant at the end. |
| `expect.subledger.schedules` | no | Per schedule handle: the unamortized amount. |
| `expect.equal` | no | Section 11: which of `balances`, `customers`, `vendors` must be identical across the sequences. |
| `expect.differ` | no | Section 11: accounts whose balance differs by exactly this amount, second sequence minus first. |
| `expect.lanes` | no | Section 13: `{ succeeded, refused }`, counts of lanes that committed and that did not. |
| `expect.unchanged` | no | Section 14: every tenant table has the same row count after the refused action as before it. |
| `expect.rows` | no | Section 18: the number of rows the SQL file returns; default `0`. |
| A value of the form `@owner` | — | In `expect.documents`, the user id of that actor. |
| A value of the form `@ref:INV1` | — | In `expect.documents`, the id the handle `INV1` resolved to. |

Rules:

- Every amount in a fixture is a quoted string. The runner refuses a fixture with a bare YAML number in an amount field.
- Every expected journal gives explicit `debit` and `credit`. The runner refuses a signed single amount.
- A fixture refers to an account only by semantic ID. The runner refuses a numeric code or a UUID.

### 20.3 Operations

The runner implements each operation as one call to one engine function. The mapping lives in `packages/database/conformance/runner/ops.ts` and is the only file that imports the engine.

| `op` | Engine operation | State |
|---|---|---|
| `journal.post` | `recordManualJournalEntry` | implemented |
| `journal.attempt_update`, `journal.attempt_delete` | raw `UPDATE` and `DELETE` as `app_user`, reporting rows changed or the refusal | implemented |
| `ledger.sequence`, `ledger.balance_type` | SQL over `journal_entries` and `journal_entry_lines`, for `AUD-014` and `NUM-014` | implemented |
| `bank.transfer`, `bank.fee`, `bank.interest`, `bank.opening_balance` | `recordManualJournalEntry` with the lines the spec gives | implemented |
| `bank.import`, `bank.match` | `importStatement`, `matchBankTransaction` | implemented |
| `invoice.create`, `invoice.post`, `invoice.issue_new`, `invoice.void`, `invoice.credit`, `invoice.write_off` | `createInvoice`, `issueInvoice`, both, `voidInvoice`, `recordCreditMemo`, `recordWriteOff` | implemented |
| `payment.receive`, `payment.receive_batch` | `recordPayment`, `recordLockboxPayment` | implemented |
| `bill.create`, `bill.approve`, `bill.create_and_approve`, `bill.pay`, `bill.pay_batch` | `createBill`, `approveBill`, both, `recordVendorPayment`, `payBillsInBatch` | implemented |
| `tax.create_rate`, `fx.set_rate` | `createTaxRate`; an `exchange_rates` insert as the owner (the service role's write) | implemented |
| `period.close`, `period.reopen`, `year.close` | `closePeriod`, `reopenPeriod`, `yearEndClose` | implemented |
| `accrual.create` | `recordAccrual` (posts the accrual and its reversal) | implemented |
| `amortization.create`, `amortization.post_due` | `createAmortizationSchedule`, `postDueAmortizations` (`repeat` runs it N times) | implemented |
| `report.trial_balance`, `report.trial_balance_comparison`, `report.balance_sheet`, `report.income_statement`, `report.income_statement_comparison`, `report.ar_aging`, `report.tax_liability`, `report.customer_statement`, `report.cash_flow`, `report.control_tie_out`, `report.drill_down` | the report functions of `accounting.repo.ts`; values only, nothing written | implemented |
| `journal.reverse`, `payment.apply`, `payment.reallocate`, `payment.refund`, `payment.void`, `bill.void`, `bill.credit`, `bill.prepay`, `bill.refund`, `bank.split`, `bank.reconcile`, `bank.unmatch`, `fx.revalue`, `amortization.update`, `amortization.cancel`, `report.export_csv`, `inventory.*`, `asset.*`, `deferred.*` | no engine operation exists | reserved: `NOT_IMPLEMENTED` through the register |

An `op` that is not in this table is a runner error, not a `FAIL`.

---

## 21. Independence Rule

The expected result in a fixture is never computed by the engine.

Not permitted:

```ts
const actual = postInvoice(invoice)
const expected = calculateInvoicePosting(invoice)   // shares code with postInvoice
```

Permitted:

```yaml
expect:
  journal:
    - { account: ACCOUNTS_RECEIVABLE, debit: "108.00", credit: "0.00" }
    - { account: SERVICE_REVENUE,     debit: "0.00",   credit: "100.00" }
    - { account: SALES_TAX_PAYABLE,   debit: "0.00",   credit: "8.00" }
```

Rules:

- The fixture is the specification. A person writes every expected figure by hand, from the accounting rule.
- The runner imports the engine in exactly one file, `ops.ts`, to call write operations. The runner never imports the engine to compute an expectation.
- The runner's invariant checks are SQL. They never call an engine function.
- The runner's model in section 17 is a separate implementation. It never imports the engine.
- `packages/spec-tests` keeps its own authorizer for the same reason. The same rule applies here.

---

## 22. Release Gates

### 22.1 Gate A — Pull request

Runs on every pull request that touches `apps/web/src/lib/server/accounting/`, `supabase/migrations/`, or `packages/database/conformance/`.

```text
every deterministic scenario in sections 10, 11, 12, 15, 16    (transaction isolation)
every invariant in section 9
every DB-* test in section 18
100 property sequences of 20 actions
```

A `FAIL` or `ERROR` blocks the merge. A `NOT_IMPLEMENTED` does not block; the report lists it. A fixture marked `gate: nightly` reports `NOT_RUN` here and runs in Gate B.

Target duration: under 3 minutes.

### 22.2 Gate B — Nightly on main

```text
everything in Gate A, with `pnpm db:acs run --nightly`
every fixture marked gate: nightly
10000 property sequences of 20 to 100 actions
E2E-GLD-001 with golden-file comparison
```

A `FAIL` or `ERROR` opens an issue and blocks the next release candidate.

### 22.3 Gate C — Release candidate

On a freshly created conformance cluster:

```text
1. pnpm db:acs:cluster rebuild
2. pnpm db:acs seed
3. everything in Gate B
4. every MIG-* test in section 23
5. pnpm db:acs verify
6. pnpm db:acs report
```

A release does not get accounting certification if any mandatory check has the result `FAIL` or `ERROR`.

---

## 23. Migration Conformance — `MIG-*`

Accounting history is sensitive to database migrations. For every migration that touches an accounting table:

| ID | Step |
|---|---|
| `MIG-001` | Rebuild the conformance cluster at the previous release's migration set. |
| `MIG-002` | Load the golden seed and run `E2E-GLD-001` with commits. |
| `MIG-003` | Record the trial balance, every report in section 19, and a hash of every accounting table. |
| `MIG-004` | Apply the new migrations. |
| `MIG-005` | Re-run every report. |
| `MIG-006` | Compare every balance. |
| `MIG-007` | Compare every document status. |
| `MIG-008` | Compare AR and AP aging. |
| `MIG-009` | Compare inventory valuation (`NOT_IMPLEMENTED` while `INV` is). |
| `MIG-010` | Compare every `audit_log` row: none removed, none changed. |

`pnpm db:acs migrate <ref>` performs the ten steps against a second database, `kaaj_acs_mig`. That database is built from the migrations present at `<ref>`. The command writes each step's result to `results/migration.json`, and the runner reports `MIG-*` from that file. Unless the migration's commit message states that it changes accounting behaviour, and names the scenario IDs whose fixtures it updates:

```text
financial state before migration = financial state after migration
```

"Equal" means cent-for-cent for every monetary figure, and byte-for-byte for every stored journal line.

---

## 24. Repository Layout

```text
packages/database/conformance/
  README.md                      how to run it
  cluster.sh                     the cluster (section 4.2)
  capabilities.json              the capability register (section 3.2)
  acs.mjs                        pnpm db:acs seed|run|verify|report|drop
  seed/
    00_helpers.sql               _acs.u(kind, n), _acs.tenant()
    10_company.sql               tenant, location, two actors, twelve periods
    20_chart.sql                 chart of accounts, bank accounts
    30_parties.sql               customers, vendors
    40_tax_fx.sql                tax rates, exchange rates
  scenarios/
    gl/        GL-001.yaml ...
    ar/ ap/ bank/ tax/ fx/ inv/ acc/ def/ fa/ close/ meta/ rpt/ con/ fail/ aud/ num/
  invariants/
    INV-JRN-001.sql ...          one SQL file per invariant; zero rows when it holds
  db/
    DB-001.sql ...               section 18, one SQL file per check; $1 is the tenant id
  golden/
    trial-balance.json ...       section 19, captured with ACS_WRITE_GOLDEN=1 and reviewed
  failures/                      section 17.3
  results/                       last-run.json, migration.json; ignored by git

apps/web/
  vitest.acs.config.ts           the runner's config: the app config with include replaced
  src/lib/server/accounting/conformance/
    acs.conformance.ts           one vitest case per fixture
    ops.ts                       the only file that imports the engine (section 21)
    fixtures.ts                  YAML loading and validation (section 20)
    handles.ts                   semantic ids → seeded rows; the account code map
    invariants.ts                runs invariants/*.sql as the cluster owner
    decimal.ts                   section 8.4 comparison, as BigInt cents
    seed.ts                      restores the golden seed for a database-isolated scenario
```

Every scenario file name equals its `id`. The runner refuses a file whose name and `id` differ.

---

## 25. Size

Section 31.1 holds the count of scenarios per module and the state of each. This section does not repeat those numbers, so the two cannot disagree.

The count is not the goal. The goal is one scenario per economically distinct behaviour.

---

## 26. Certification Output

`pnpm db:acs report` prints:

```text
+------------------------------------------------------+
| ACCOUNTING CONFORMANCE: PASS                         |
|                                                      |
| Profile:    ACS-US-ACCRUAL-1.0                       |
| Seed:       ACS_GOLDEN_SEED_V1                       |
| Build:      5fc5608                                  |
| Run:        2026-10-02T14:00:00Z  Gate C             |
|                                                      |
| Deterministic scenarios:   266 PASS  0 FAIL          |
|                             60 NOT_IMPLEMENTED       |
| Invariants:                 37 / 37   5 NOT_IMPL     |
| Database tests:             14 / 14   1 NOT_IMPL     |
| Golden files:               10 / 10                  |
| Property sequences:      10000 / 10000  seed 1337    |
| Migration:                   9 / 9    1 NOT_IMPL     |
|                                                      |
| Not implemented: INV, DEF, FA; FX-009..012;          |
|                  CON-001,002,009,010; DB-008         |
+------------------------------------------------------+
```

The first line is `PASS` only when every count of `FAIL` and `ERROR` is zero. The output always lists the `NOT_IMPLEMENTED` set, so a reader sees what the `PASS` does not cover.

---

## 27. Implementation Order

1. `cluster.sh`, `capabilities.json`, the seed files (sections 4, 5, 6, 7).
2. The runner's fixture loader, `ops.ts`, `compare.ts`, and the invariant SQL files (sections 8, 9, 20).
3. `GL-*` (section 10.1).
4. `AR-*`.
5. `AP-*`.
6. `BANK-*`.
7. `TAX-*`.
8. `FX-*`.
9. `ACC-*`.
10. `CLOSE-*`.
11. `RPT-*`.
12. `NUM-*`, `AUD-*`, `META-*`.
13. `FAIL-*`.
14. `CON-*`.
15. `DB-*`.
16. `E2E-GLD-001` and the golden files.
17. `PROP-*`.
18. `MIG-*`.
19. `INV-*`, `DEF-*`, `FA-*`, as each module is built.

---

## 28. First Milestone

Before the full catalog, make these 62 scenarios `PASS`:

```text
GL-001 GL-002 GL-004 GL-005 GL-006 GL-007 GL-010 GL-011 GL-012 GL-016 GL-017 GL-018
AR-001 AR-002 AR-005 AR-006 AR-007 AR-008 AR-009 AR-010 AR-014 AR-015 AR-016 AR-018 AR-020 AR-025 AR-027 AR-031
AP-001 AP-002 AP-003 AP-005 AP-006 AP-011 AP-016 AP-020 AP-021
BANK-003 BANK-007 BANK-009 BANK-013
TAX-001 TAX-002 TAX-004 TAX-006 TAX-010 TAX-011 TAX-012
FX-001 FX-002 FX-004 FX-005 FX-007 FX-020
ACC-001 ACC-002 ACC-005 ACC-006 ACC-013
CLOSE-002 CLOSE-003 CLOSE-005 CLOSE-010
NUM-003 NUM-004
FAIL-003 FAIL-005
```

Each of these fixtures gives every field in section 20.2, including `expect.balances` with every non-zero account.

This set is the executable core of the profile. Section 31 holds the state of every scenario.

---

## 29. References

Sources for implementation patterns and cross-checks:

- Odoo accounting tests
- ERPNext and Frappe accounting tests
- pgTAP, for database-level assertions
- fast-check, for property and model-based testing in TypeScript
- hledger and Beancount, as optional independent ledger validators

This specification is owned by the application. An external engine is a secondary check. It is not the definition of this application's accounting semantics.

---

## 30. Guiding Principle

The test suite describes, independently of the engine, the economic result the engine must produce.

If the engine's logic and the expected-result logic share one implementation, the test is not an independent check.

The fixture corpus is therefore the executable accounting specification of the product.

---

## 31. Audit of Every Scenario

This section is the proof behind section 26's counts. It lists every scenario ID that sections 10 to 23 name. For each, it gives the state, the fixture file, and the engine functions that fixture calls. A reader can take any row to its fixture and from the fixture to the engine function.

<!-- audit:begin -->

Generated by `pnpm db:acs audit` on 2026-10-02 from the catalog above, `capabilities.json`, the fixtures in `packages/database/conformance/scenarios/` and the last run (`results/last-run.json`, build 5fc5608, 2026-10-02T10:24:01.559Z). Do not edit by hand; rerun the command.

Status values: `PASS` and `FAIL` are the last run's result. `NOT_IMPLEMENTED` is a register entry with its reason. `NO_FIXTURE` is a catalog scenario whose fixture does not exist yet. `NOT_RUN` has a fixture the last run did not include.

### 31.1 Totals per module

| Module | Scenarios | PASS | FAIL | NOT_IMPLEMENTED | NO_FIXTURE | NOT_RUN |
|---|---:|---:|---:|---:|---:|---:|
| GL | 20 | 15 | 1 | 4 | 0 | 0 |
| AR | 34 | 23 | 2 | 9 | 0 | 0 |
| AP | 23 | 11 | 1 | 11 | 0 | 0 |
| BANK | 22 | 12 | 1 | 9 | 0 | 0 |
| TAX | 16 | 13 | 2 | 1 | 0 | 0 |
| FX | 21 | 13 | 2 | 6 | 0 | 0 |
| INV | 22 | 0 | 0 | 22 | 0 | 0 |
| ACC | 14 | 6 | 1 | 7 | 0 | 0 |
| DEF | 10 | 0 | 0 | 10 | 0 | 0 |
| FA | 12 | 0 | 0 | 12 | 0 | 0 |
| CLOSE | 18 | 13 | 2 | 3 | 0 | 0 |
| META | 8 | 7 | 0 | 1 | 0 | 0 |
| RPT | 25 | 17 | 0 | 8 | 0 | 0 |
| CON | 18 | 4 | 5 | 9 | 0 | 0 |
| FAIL | 12 | 10 | 0 | 2 | 0 | 0 |
| AUD | 15 | 12 | 0 | 3 | 0 | 0 |
| NUM | 14 | 10 | 0 | 2 | 0 | 2 |
| DB | 15 | 12 | 2 | 1 | 0 | 0 |
| E2E | 1 | 1 | 0 | 0 | 0 | 0 |
| MIG | 10 | 0 | 0 | 1 | 0 | 9 |
| **Total** | **330** | **179** | **19** | **121** | **0** | **11** |

### 31.2 Every scenario

| ID | Status | Fixture | Engine functions the fixture calls | Note |
|---|---|---|---|---|
| `GL-001` | PASS | `scenarios/gl/GL-001.yaml` | recordManualJournalEntry |  |
| `GL-002` | PASS | `scenarios/gl/GL-002.yaml` | recordManualJournalEntry |  |
| `GL-003` | PASS | `scenarios/gl/GL-003.yaml` | recordManualJournalEntry |  |
| `GL-004` | PASS | `scenarios/gl/GL-004.yaml` | recordManualJournalEntry |  |
| `GL-005` | PASS | `scenarios/gl/GL-005.yaml` | recordManualJournalEntry |  |
| `GL-006` | PASS | `scenarios/gl/GL-006.yaml` | recordManualJournalEntry |  |
| `GL-007` | FAIL | `scenarios/gl/GL-007.yaml` | recordManualJournalEntry | action 1 journal.post: succeeded, expected refusal inactive_account |
| `GL-008` | NOT_IMPLEMENTED | — | — | No draft journal entry exists; recordManualJournalEntry posts at once. |
| `GL-009` | NOT_IMPLEMENTED | — | — | No draft journal entry exists. |
| `GL-010` | PASS | `scenarios/gl/GL-010.yaml` | recordManualJournalEntry, UPDATE journal_entry_lines / journal_entries as app_user |  |
| `GL-011` | PASS | `scenarios/gl/GL-011.yaml` | recordManualJournalEntry, DELETE journal_entries as app_user |  |
| `GL-012` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists for a posted journal entry. |
| `GL-013` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists. |
| `GL-014` | PASS | `scenarios/gl/GL-014.yaml` | recordManualJournalEntry |  |
| `GL-015` | PASS | `scenarios/gl/GL-015.yaml` | recordManualJournalEntry |  |
| `GL-016` | PASS | `scenarios/gl/GL-016.yaml` | recordManualJournalEntry |  |
| `GL-017` | PASS | `scenarios/gl/GL-017.yaml` | recordManualJournalEntry |  |
| `GL-018` | PASS | `scenarios/gl/GL-018.yaml` | createInvoice, issueInvoice |  |
| `GL-019` | PASS | `scenarios/gl/GL-019.yaml` | recordManualJournalEntry |  |
| `GL-020` | PASS | `scenarios/gl/GL-020.yaml` | recordManualJournalEntry |  |
| `AR-001` | PASS | `scenarios/ar/AR-001.yaml` | createInvoice, issueInvoice |  |
| `AR-002` | PASS | `scenarios/ar/AR-002.yaml` | createInvoice, issueInvoice |  |
| `AR-003` | PASS | `scenarios/ar/AR-003.yaml` | createInvoice, issueInvoice |  |
| `AR-004` | FAIL | `scenarios/ar/AR-004.yaml` | createInvoice, issueInvoice | action 2 invoice.post: missing line: SERVICE_REVENUE Dr 0.00 Cr 100.00 |
| `AR-005` | PASS | `scenarios/ar/AR-005.yaml` | createInvoice, issueInvoice |  |
| `AR-006` | PASS | `scenarios/ar/AR-006.yaml` | createInvoice, issueInvoice |  |
| `AR-007` | PASS | `scenarios/ar/AR-007.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AR-008` | PASS | `scenarios/ar/AR-008.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AR-009` | PASS | `scenarios/ar/AR-009.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AR-010` | NOT_IMPLEMENTED | — | — | recordPayment refuses an amount above amount_due; no unapplied customer receipt exists. |
| `AR-011` | NOT_IMPLEMENTED | — | — | No unapplied customer receipt exists; every payment names an invoice. |
| `AR-012` | NOT_IMPLEMENTED | — | — | No unapplied customer receipt exists. |
| `AR-013` | NOT_IMPLEMENTED | — | — | No payment reallocation operation exists. |
| `AR-014` | PASS | `scenarios/ar/AR-014.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AR-015` | PASS | `scenarios/ar/AR-015.yaml` | createInvoice, issueInvoice, recordCreditMemo |  |
| `AR-016` | PASS | `scenarios/ar/AR-016.yaml` | createInvoice, issueInvoice, recordCreditMemo |  |
| `AR-017` | PASS | `scenarios/ar/AR-017.yaml` | createInvoice, issueInvoice, recordCreditMemo, recordPayment |  |
| `AR-018` | NOT_IMPLEMENTED | — | — | No customer refund operation exists. |
| `AR-019` | NOT_IMPLEMENTED | — | — | No customer refund operation exists. |
| `AR-020` | PASS | `scenarios/ar/AR-020.yaml` | createInvoice, issueInvoice, recordLockboxPayment |  |
| `AR-021` | PASS | `scenarios/ar/AR-021.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AR-022` | PASS | `scenarios/ar/AR-022.yaml` | createInvoice, issueInvoice |  |
| `AR-023` | NOT_IMPLEMENTED | — | — | No customer deposit exists. |
| `AR-024` | NOT_IMPLEMENTED | — | — | No customer deposit exists. |
| `AR-025` | PASS | `scenarios/ar/AR-025.yaml` | createInvoice, voidInvoice |  |
| `AR-026` | NOT_IMPLEMENTED | — | — | No void-payment operation exists. |
| `AR-027` | PASS | `scenarios/ar/AR-027.yaml` | createInvoice, issueInvoice, recordPayment, recordWriteOff |  |
| `AR-028` | PASS | `scenarios/ar/AR-028.yaml` | createInvoice, issueInvoice, recordWriteOff |  |
| `AR-029` | PASS | `scenarios/ar/AR-029.yaml` | createInvoice, issueInvoice |  |
| `AR-030` | FAIL | `scenarios/ar/AR-030.yaml` | createInvoice, issueInvoice, recordPayment | action 3 payment.receive: succeeded, expected refusal payment_before_invoice |
| `AR-031` | PASS | `scenarios/ar/AR-031.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AR-032` | PASS | `scenarios/ar/AR-032.yaml` | createInvoice, issueInvoice, recordCreditMemo |  |
| `AR-033` | PASS | `scenarios/ar/AR-033.yaml` | createInvoice, issueInvoice, voidInvoice |  |
| `AR-034` | PASS | `scenarios/ar/AR-034.yaml` | createInvoice, recordPayment |  |
| `AP-001` | PASS | `scenarios/ap/AP-001.yaml` | createBill, approveBill |  |
| `AP-002` | PASS | `scenarios/ap/AP-002.yaml` | createBill, approveBill, recordVendorPayment |  |
| `AP-003` | PASS | `scenarios/ap/AP-003.yaml` | createBill, approveBill, recordVendorPayment |  |
| `AP-004` | PASS | `scenarios/ap/AP-004.yaml` | createBill, approveBill, recordVendorPayment |  |
| `AP-005` | PASS | `scenarios/ap/AP-005.yaml` | createBill, approveBill, payBillsInBatch |  |
| `AP-006` | NOT_IMPLEMENTED | — | — | No vendor credit operation exists. |
| `AP-007` | NOT_IMPLEMENTED | — | — | No vendor credit operation exists. |
| `AP-008` | NOT_IMPLEMENTED | — | — | No vendor credit operation exists. |
| `AP-009` | NOT_IMPLEMENTED | — | — | No vendor prepayment exists; every vendor payment names a bill. |
| `AP-010` | NOT_IMPLEMENTED | — | — | No vendor prepayment exists. |
| `AP-011` | NOT_IMPLEMENTED | — | — | No void-bill operation exists for an approved bill. |
| `AP-012` | NOT_IMPLEMENTED | — | — | No void-vendor-payment operation exists. |
| `AP-013` | FAIL | `scenarios/ap/AP-013.yaml` | createBill, approveBill | action 2 bill.approve: missing line: OFFICE_EXPENSE Dr 108.00 Cr 0.00 |
| `AP-014` | NOT_IMPLEMENTED | — | — | INV is not implemented. |
| `AP-015` | NOT_IMPLEMENTED | — | — | No vendor prepayment exists. |
| `AP-016` | PASS | `scenarios/ap/AP-016.yaml` | createBill, approveBill |  |
| `AP-017` | PASS | `scenarios/ap/AP-017.yaml` | createBill, approveBill |  |
| `AP-018` | NOT_IMPLEMENTED | — | — | No payment reallocation operation exists. |
| `AP-019` | NOT_IMPLEMENTED | — | — | No vendor refund operation exists. |
| `AP-020` | PASS | `scenarios/ap/AP-020.yaml` | createBill, approveBill |  |
| `AP-021` | PASS | `scenarios/ap/AP-021.yaml` | createBill, approveBill, recordVendorPayment |  |
| `AP-022` | PASS | `scenarios/ap/AP-022.yaml` | createBill, approveBill, recordVendorPayment |  |
| `AP-023` | PASS | `scenarios/ap/AP-023.yaml` | createBill, recordVendorPayment |  |
| `BANK-001` | PASS | `scenarios/bank/BANK-001.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `BANK-002` | PASS | `scenarios/bank/BANK-002.yaml` | createBill, approveBill, recordVendorPayment |  |
| `BANK-003` | PASS | `scenarios/bank/BANK-003.yaml` | recordManualJournalEntry |  |
| `BANK-004` | PASS | `scenarios/bank/BANK-004.yaml` | recordManualJournalEntry |  |
| `BANK-005` | PASS | `scenarios/bank/BANK-005.yaml` | recordManualJournalEntry |  |
| `BANK-006` | PASS | `scenarios/bank/BANK-006.yaml` | recordManualJournalEntry |  |
| `BANK-007` | PASS | `scenarios/bank/BANK-007.yaml` | createInvoice, issueInvoice, recordPayment, importStatement, matchBankTransaction |  |
| `BANK-008` | PASS | `scenarios/bank/BANK-008.yaml` | createBill, approveBill, recordVendorPayment, importStatement, matchBankTransaction |  |
| `BANK-009` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists; only match and reconciliation rules. |
| `BANK-010` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists. |
| `BANK-011` | NOT_IMPLEMENTED | — | — | No split of one bank transaction across accounts exists. |
| `BANK-012` | NOT_IMPLEMENTED | — | — | No split of one bank transaction across customers exists. |
| `BANK-013` | PASS | `scenarios/bank/BANK-013.yaml` | importStatement |  |
| `BANK-014` | PASS | `scenarios/bank/BANK-014.yaml` | importStatement |  |
| `BANK-015` | PASS | `scenarios/bank/BANK-015.yaml` | recordManualJournalEntry |  |
| `BANK-016` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists. |
| `BANK-017` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists. |
| `BANK-018` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists. |
| `BANK-019` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists. |
| `BANK-020` | NOT_IMPLEMENTED | — | — | No statement reconciliation operation exists. |
| `BANK-021` | FAIL | `scenarios/bank/BANK-021.yaml` | createInvoice, issueInvoice, recordPayment, importStatement, matchBankTransaction | action 5 bank.match: succeeded, expected refusal amount_mismatch |
| `BANK-022` | PASS | `scenarios/bank/BANK-022.yaml` | createInvoice, issueInvoice, recordPayment, importStatement, matchBankTransaction |  |
| `TAX-001` | PASS | `scenarios/tax/TAX-001.yaml` | createInvoice, issueInvoice |  |
| `TAX-002` | PASS | `scenarios/tax/TAX-002.yaml` | createInvoice, issueInvoice |  |
| `TAX-003` | PASS | `scenarios/tax/TAX-003.yaml` | createInvoice, issueInvoice |  |
| `TAX-004` | PASS | `scenarios/tax/TAX-004.yaml` | createInvoice, issueInvoice |  |
| `TAX-005` | PASS | `scenarios/tax/TAX-005.yaml` | createInvoice, issueInvoice |  |
| `TAX-006` | FAIL | `scenarios/tax/TAX-006.yaml` | createInvoice, issueInvoice, recordCreditMemo | action 3 invoice.credit: missing line: SERVICE_REVENUE Dr 100.00 Cr 0.00 |
| `TAX-007` | FAIL | `scenarios/tax/TAX-007.yaml` | createInvoice, issueInvoice, recordCreditMemo | action 3 invoice.credit: missing line: SERVICE_REVENUE Dr 50.00 Cr 0.00 |
| `TAX-008` | NOT_IMPLEMENTED | — | — | No customer refund operation exists. |
| `TAX-009` | PASS | `scenarios/tax/TAX-009.yaml` | createInvoice, issueInvoice |  |
| `TAX-010` | PASS | `scenarios/tax/TAX-010.yaml` | createInvoice, issueInvoice |  |
| `TAX-011` | PASS | `scenarios/tax/TAX-011.yaml` | createInvoice, issueInvoice |  |
| `TAX-012` | PASS | `scenarios/tax/TAX-012.yaml` | createInvoice, issueInvoice |  |
| `TAX-013` | PASS | `scenarios/tax/TAX-013.yaml` | createInvoice, issueInvoice, createTaxRate |  |
| `TAX-014` | PASS | `scenarios/tax/TAX-014.yaml` | createInvoice, issueInvoice, createTaxRate |  |
| `TAX-015` | PASS | `scenarios/tax/TAX-015.yaml` | createInvoice, issueInvoice, taxLiabilitySummary |  |
| `TAX-016` | PASS | `scenarios/tax/TAX-016.yaml` | createInvoice |  |
| `FX-001` | PASS | `scenarios/fx/FX-001.yaml` | createInvoice, issueInvoice |  |
| `FX-002` | PASS | `scenarios/fx/FX-002.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FX-003` | PASS | `scenarios/fx/FX-003.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FX-004` | PASS | `scenarios/fx/FX-004.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FX-005` | PASS | `scenarios/fx/FX-005.yaml` | createBill, approveBill, recordVendorPayment |  |
| `FX-006` | PASS | `scenarios/fx/FX-006.yaml` | createBill, approveBill, recordVendorPayment |  |
| `FX-007` | PASS | `scenarios/fx/FX-007.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FX-008` | PASS | `scenarios/fx/FX-008.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FX-009` | NOT_IMPLEMENTED | — | — | FX revaluation is report-only; it posts nothing. |
| `FX-010` | NOT_IMPLEMENTED | — | — | FX revaluation is report-only; it posts nothing. |
| `FX-011` | NOT_IMPLEMENTED | — | — | FX revaluation is report-only; it posts nothing. |
| `FX-012` | NOT_IMPLEMENTED | — | — | FX revaluation is report-only; it posts nothing. |
| `FX-013` | PASS | `scenarios/fx/FX-013.yaml` | createInvoice, issueInvoice, recordCreditMemo |  |
| `FX-014` | NOT_IMPLEMENTED | — | — | No customer deposit exists. |
| `FX-015` | PASS | `scenarios/fx/FX-015.yaml` | recordManualJournalEntry |  |
| `FX-016` | PASS | `scenarios/fx/FX-016.yaml` | createInvoice, issueInvoice |  |
| `FX-017` | PASS | `scenarios/fx/FX-017.yaml` | createInvoice, issueInvoice |  |
| `FX-018` | PASS | `scenarios/fx/FX-018.yaml` | createInvoice, issueInvoice, INSERT exchange_rates as owner |  |
| `FX-019` | NOT_IMPLEMENTED | — | — | Reports have no display-currency option. |
| `FX-020` | FAIL | `scenarios/fx/FX-020.yaml` | createInvoice, issueInvoice, recordPayment | action 3 payment.receive: succeeded, expected refusal currency_mismatch |
| `FX-021` | FAIL | `scenarios/fx/FX-021.yaml` | createInvoice, issueInvoice, recordPayment | action 3 payment.receive: succeeded, expected refusal no_rate |
| `INV-001` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-002` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-003` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-004` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-005` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-006` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-007` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-008` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-009` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-010` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-011` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-012` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-013` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-014` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-015` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-016` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-017` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-018` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-019` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-020` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-021` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `INV-022` | NOT_IMPLEMENTED | — | — | The engine has no inventory tables. |
| `ACC-001` | PASS | `scenarios/acc/ACC-001.yaml` | recordAccrual |  |
| `ACC-002` | PASS | `scenarios/acc/ACC-002.yaml` | recordAccrual |  |
| `ACC-003` | NOT_IMPLEMENTED | — | — | recordAccrual posts accrued expenses only; accrued revenue is a documented scope line. |
| `ACC-004` | NOT_IMPLEMENTED | — | — | recordAccrual posts accrued expenses only. |
| `ACC-005` | PASS | `scenarios/acc/ACC-005.yaml` | recordManualJournalEntry, createAmortizationSchedule |  |
| `ACC-006` | PASS | `scenarios/acc/ACC-006.yaml` | recordManualJournalEntry, createAmortizationSchedule, postDueAmortizations |  |
| `ACC-007` | NOT_IMPLEMENTED | `scenarios/acc/ACC-007.yaml` | recordManualJournalEntry, createAmortizationSchedule, postDueAmortizations | postDueAmortizations posts only schedules due by CURRENT_DATE; twelve 2026 recognitions cannot all be posted until 2027. Same clock dependency as ACC-013. |
| `ACC-008` | FAIL | `scenarios/acc/ACC-008.yaml` | recordManualJournalEntry, createAmortizationSchedule, postDueAmortizations | action 3 amortization.post_due: missing line: INSURANCE_EXPENSE Dr 50.00 Cr 0.00 |
| `ACC-009` | NOT_IMPLEMENTED | — | — | No operation changes an amortization schedule after creation. |
| `ACC-010` | PASS | `scenarios/acc/ACC-010.yaml` | recordManualJournalEntry, createAmortizationSchedule, postDueAmortizations, UPDATE journal_entry_lines / journal_entries as app_user |  |
| `ACC-011` | NOT_IMPLEMENTED | — | — | No operation cancels an amortization schedule. |
| `ACC-012` | PASS | `scenarios/acc/ACC-012.yaml` | recordManualJournalEntry, createAmortizationSchedule, postDueAmortizations |  |
| `ACC-013` | NOT_IMPLEMENTED | — | — | postDueAmortizations reads CURRENT_DATE and takes no as-of date, so 'twice for 2026-01-31' cannot be expressed; the second call posts the next month. |
| `ACC-014` | NOT_IMPLEMENTED | — | — | recordAccrual posts the accrual and its reversal in one call; there is no separate reversal run. |
| `DEF-001` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-002` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-003` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-004` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-005` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-006` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-007` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-008` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-009` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `DEF-010` | NOT_IMPLEMENTED | — | — | The engine has no deferred-revenue schedule that posts revenue against a contract; amortization_schedules kind deferred_revenue exists but no contract or cancellation model. |
| `FA-001` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-002` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-003` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-004` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-005` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-006` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-007` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-008` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-009` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-010` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-011` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `FA-012` | NOT_IMPLEMENTED | — | — | The engine has no fixed-asset register. |
| `CLOSE-001` | PASS | `scenarios/close/CLOSE-001.yaml` | recordManualJournalEntry |  |
| `CLOSE-002` | PASS | `scenarios/close/CLOSE-002.yaml` | closePeriod |  |
| `CLOSE-003` | PASS | `scenarios/close/CLOSE-003.yaml` | closePeriod, createInvoice, issueInvoice |  |
| `CLOSE-004` | PASS | `scenarios/close/CLOSE-004.yaml` | closePeriod, recordManualJournalEntry |  |
| `CLOSE-005` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists; a January journal cannot be voided. |
| `CLOSE-006` | PASS | `scenarios/close/CLOSE-006.yaml` | closePeriod, recordManualJournalEntry |  |
| `CLOSE-007` | PASS | `scenarios/close/CLOSE-007.yaml` | closePeriod, reopenPeriod, recordManualJournalEntry |  |
| `CLOSE-008` | NOT_IMPLEMENTED | — | — | The audit row for a reopen is written by the page action, outside the engine boundary the runner calls. |
| `CLOSE-009` | PASS | `scenarios/close/CLOSE-009.yaml` | closePeriod, reopenPeriod, recordManualJournalEntry |  |
| `CLOSE-010` | PASS | `scenarios/close/CLOSE-010.yaml` | createInvoice, issueInvoice, recordManualJournalEntry, yearEndClose |  |
| `CLOSE-011` | PASS | `scenarios/close/CLOSE-011.yaml` | createInvoice, issueInvoice, recordManualJournalEntry, yearEndClose |  |
| `CLOSE-012` | PASS | `scenarios/close/CLOSE-012.yaml` | createInvoice, issueInvoice, recordManualJournalEntry, yearEndClose |  |
| `CLOSE-013` | PASS | `scenarios/close/CLOSE-013.yaml` | closePeriod, createInvoice, issueInvoice |  |
| `CLOSE-014` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists. |
| `CLOSE-015` | PASS | `scenarios/close/CLOSE-015.yaml` | recordManualJournalEntry, closePeriod |  |
| `CLOSE-016` | PASS | `scenarios/close/CLOSE-016.yaml` | closePeriod |  |
| `CLOSE-017` | FAIL | `scenarios/close/CLOSE-017.yaml` | closePeriod | action 1 period.close: succeeded, expected refusal period_out_of_order |
| `CLOSE-018` | FAIL | `scenarios/close/CLOSE-018.yaml` | createInvoice, issueInvoice, yearEndClose | action 3 year.close: succeeded, expected refusal period_open |
| `META-001` | PASS | `scenarios/meta/META-001.yaml` | createInvoice, issueInvoice, recordCreditMemo |  |
| `META-002` | PASS | `scenarios/meta/META-002.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `META-003` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists. |
| `META-004` | PASS | `scenarios/meta/META-004.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `META-005` | PASS | `scenarios/meta/META-005.yaml` | createInvoice, issueInvoice |  |
| `META-006` | PASS | `scenarios/meta/META-006.yaml` | createBill, approveBill, recordVendorPayment |  |
| `META-007` | PASS | `scenarios/meta/META-007.yaml` | createInvoice, issueInvoice, recordLockboxPayment, recordPayment |  |
| `META-008` | PASS | `scenarios/meta/META-008.yaml` | createInvoice, issueInvoice |  |
| `RPT-001` | PASS | `scenarios/rpt/RPT-001.yaml` | trialBalance, trialBalanceTotals |  |
| `RPT-002` | PASS | `scenarios/rpt/RPT-002.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, trialBalance, trialBalanceTotals |  |
| `RPT-003` | PASS | `scenarios/rpt/RPT-003.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, trialBalance, trialBalanceTotals |  |
| `RPT-004` | PASS | `scenarios/rpt/RPT-004.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, balanceSheet, balanceSheetTotals |  |
| `RPT-005` | PASS | `scenarios/rpt/RPT-005.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, profitAndLoss, profitAndLossTotals |  |
| `RPT-006` | PASS | `scenarios/rpt/RPT-006.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, balanceSheet, balanceSheetTotals |  |
| `RPT-007` | PASS | `scenarios/rpt/RPT-007.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, arAging |  |
| `RPT-008` | NOT_IMPLEMENTED | — | — | No AP aging report exists; apDueSoon lists bills by due date without aging buckets. |
| `RPT-009` | PASS | `scenarios/rpt/RPT-009.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, customerBalances |  |
| `RPT-010` | NOT_IMPLEMENTED | — | — | No vendor statement exists. |
| `RPT-011` | PASS | `scenarios/rpt/RPT-011.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, taxLiabilitySummary |  |
| `RPT-012` | NOT_IMPLEMENTED | — | — | INV is not implemented. |
| `RPT-013` | NOT_IMPLEMENTED | — | — | FA is not implemented. |
| `RPT-014` | PASS | `scenarios/rpt/RPT-014.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, balanceSheet, balanceSheetTotals |  |
| `RPT-015` | NOT_IMPLEMENTED | — | — | No cost-centre report exists; journal_entry_lines.department_id is written by nothing. |
| `RPT-016` | NOT_IMPLEMENTED | — | — | No project report over the ledger exists. |
| `RPT-017` | PASS | `scenarios/rpt/RPT-017.yaml` | recordManualJournalEntry, profitAndLoss, profitAndLossTotals |  |
| `RPT-018` | PASS | `scenarios/rpt/RPT-018.yaml` | recordManualJournalEntry, balanceSheet, balanceSheetTotals |  |
| `RPT-019` | PASS | `scenarios/rpt/RPT-019.yaml` | recordManualJournalEntry, trialBalanceComparison |  |
| `RPT-020` | NOT_IMPLEMENTED | — | — | The trial balance has no include-zero-balances option. |
| `RPT-021` | PASS | `scenarios/rpt/RPT-021.yaml` | createInvoice, issueInvoice, balanceSheet, balanceSheetTotals |  |
| `RPT-022` | PASS | `scenarios/rpt/RPT-022.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, ledger, ledgerLines |  |
| `RPT-023` | NOT_IMPLEMENTED | — | — | CSV columns are defined per page action; the engine has no export the runner can call. |
| `RPT-024` | PASS | `scenarios/rpt/RPT-024.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, trialBalance, trialBalanceTotals |  |
| `RPT-025` | PASS | `scenarios/rpt/RPT-025.yaml` | createInvoice, issueInvoice, recordPayment, createBill, approveBill, recordVendorPayment, cashFlowTotals |  |
| `CON-001` | NOT_IMPLEMENTED | — | — | No idempotency key exists. |
| `CON-002` | NOT_IMPLEMENTED | — | — | No idempotency key exists. |
| `CON-003` | NOT_IMPLEMENTED | — | — | No draft journal entry exists; there is no draft for two users to post. |
| `CON-004` | PASS | `scenarios/con/CON-004.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `CON-005` | FAIL | `scenarios/con/CON-005.yaml` | createInvoice, issueInvoice, recordPayment, importStatement, matchBankTransaction | lanes committed: 2, expected 1 (lane 1: committed; lane 2: committed) |
| `CON-006` | PASS | `scenarios/con/CON-006.yaml` | createInvoice, issueInvoice, recordCreditMemo, recordPayment |  |
| `CON-007` | NOT_IMPLEMENTED | — | — | An issued invoice cannot be cancelled; only a draft can be voided, and a draft takes no payment. |
| `CON-008` | FAIL | `scenarios/con/CON-008.yaml` | closePeriod, recordManualJournalEntry | after the lanes: invariant INV-GL-006 fails: [{"entry_number":"JE-2026-0001","period_name":"2026-01","posted_at":"2026-10-02 06:24:03.51903-04","closed_at":"2026-10-02 06:24:03.519022-04"}] |
| `CON-009` | NOT_IMPLEMENTED | — | — | No idempotency key exists. |
| `CON-010` | NOT_IMPLEMENTED | — | — | No idempotency key exists. |
| `CON-011` | PASS | `scenarios/con/CON-011.yaml` | recordManualJournalEntry |  |
| `CON-012` | PASS | `scenarios/con/CON-012.yaml` | recordManualJournalEntry |  |
| `CON-013` | NOT_IMPLEMENTED | — | — | INV is not implemented. |
| `CON-014` | NOT_IMPLEMENTED | — | — | FA is not implemented. |
| `CON-015` | NOT_IMPLEMENTED | — | — | DEF is not implemented. |
| `CON-016` | FAIL | `scenarios/con/CON-016.yaml` | recordManualJournalEntry, createAmortizationSchedule, postDueAmortizations | balance PREPAID_EXPENSES is 1000.00, expected 1100.00 |
| `CON-017` | FAIL | `scenarios/con/CON-017.yaml` | recordManualJournalEntry | lanes committed: 1, expected 2 (lane 1: committed; lane 2: pg:23505) |
| `CON-018` | FAIL | `scenarios/con/CON-018.yaml` | recordManualJournalEntry | lanes committed: 2, expected 20 (lane 1: committed; lane 2: pg:23505; lane 3: pg:23505; lane 4: pg:23505; lane 5: committed; lane 6: pg:23505; lane 7: pg:23505; lane 8: pg:23505; lane 9: pg:23505; lane 10: pg:23505; lane 11: pg:23505; lane 12: pg:23505; lane 13: pg:23505; lane 14: pg:23505; lane 15: pg:23505; lane 16: pg:23505; lane 17: pg:23505; lane 18: pg:23505; lane 19: pg:23505; lane 20: pg:23505) |
| `FAIL-001` | PASS | `scenarios/fail/FAIL-001.yaml` | createInvoice |  |
| `FAIL-002` | PASS | `scenarios/fail/FAIL-002.yaml` | createInvoice |  |
| `FAIL-003` | PASS | `scenarios/fail/FAIL-003.yaml` | createInvoice, issueInvoice |  |
| `FAIL-004` | PASS | `scenarios/fail/FAIL-004.yaml` | createInvoice, issueInvoice |  |
| `FAIL-005` | PASS | `scenarios/fail/FAIL-005.yaml` | createInvoice, issueInvoice |  |
| `FAIL-006` | PASS | `scenarios/fail/FAIL-006.yaml` | createInvoice, issueInvoice |  |
| `FAIL-007` | PASS | `scenarios/fail/FAIL-007.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FAIL-008` | PASS | `scenarios/fail/FAIL-008.yaml` | recordManualJournalEntry |  |
| `FAIL-009` | PASS | `scenarios/fail/FAIL-009.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FAIL-010` | PASS | `scenarios/fail/FAIL-010.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `FAIL-011` | NOT_IMPLEMENTED | — | — | closePeriod writes no audit row; the page action does, outside the engine boundary. |
| `FAIL-012` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists. |
| `AUD-001` | PASS | `scenarios/aud/AUD-001.yaml` | createInvoice, issueInvoice |  |
| `AUD-002` | PASS | `scenarios/aud/AUD-002.yaml` | recordManualJournalEntry |  |
| `AUD-003` | PASS | `scenarios/aud/AUD-003.yaml` | recordManualJournalEntry |  |
| `AUD-004` | PASS | `scenarios/aud/AUD-004.yaml` | createInvoice, issueInvoice |  |
| `AUD-005` | PASS | `scenarios/aud/AUD-005.yaml` | createInvoice, issueInvoice, recordPayment |  |
| `AUD-006` | NOT_IMPLEMENTED | — | — | No reversing-entry operation exists; journal_entries carries no reversal link. |
| `AUD-007` | PASS | `scenarios/aud/AUD-007.yaml` | createInvoice, issueInvoice, recordCreditMemo |  |
| `AUD-008` | PASS | `scenarios/aud/AUD-008.yaml` | createInvoice, issueInvoice, recordLockboxPayment |  |
| `AUD-009` | NOT_IMPLEMENTED | — | — | The audit row for a reopen is written by the page action, outside the engine boundary the runner calls. |
| `AUD-010` | PASS | `scenarios/aud/AUD-010.yaml` | recordManualJournalEntry, UPDATE journal_entry_lines / journal_entries as app_user |  |
| `AUD-011` | PASS | `scenarios/aud/AUD-011.yaml` | createInvoice, issueInvoice, INSERT exchange_rates as owner |  |
| `AUD-012` | PASS | `scenarios/aud/AUD-012.yaml` | createInvoice, issueInvoice, createTaxRate |  |
| `AUD-013` | PASS | `scenarios/aud/AUD-013.yaml` | createInvoice, voidInvoice |  |
| `AUD-014` | PASS | `scenarios/aud/AUD-014.yaml` | createInvoice, issueInvoice, recordPayment, recordCreditMemo, recordWriteOff, SELECT entry_number FROM journal_entries |  |
| `AUD-015` | NOT_IMPLEMENTED | — | — | Audit rows are written by page actions, outside the engine boundary the runner calls. |
| `NUM-001` | PASS | `scenarios/num/NUM-001.yaml` | createInvoice, issueInvoice |  |
| `NUM-002` | PASS | `scenarios/num/NUM-002.yaml` | createInvoice, issueInvoice |  |
| `NUM-003` | NOT_RUN | `scenarios/num/NUM-003.yaml` | createInvoice, issueInvoice | nightly gate (spec section 22.2); run with `pnpm db:acs run --nightly` |
| `NUM-004` | PASS | `scenarios/num/NUM-004.yaml` | createInvoice, issueInvoice, recordLockboxPayment |  |
| `NUM-005` | NOT_RUN | `scenarios/num/NUM-005.yaml` | recordManualJournalEntry | nightly gate (spec section 22.2); run with `pnpm db:acs run --nightly` |
| `NUM-006` | PASS | `scenarios/num/NUM-006.yaml` | createInvoice, issueInvoice |  |
| `NUM-007` | PASS | `scenarios/num/NUM-007.yaml` | createInvoice |  |
| `NUM-008` | PASS | `scenarios/num/NUM-008.yaml` | createInvoice, issueInvoice |  |
| `NUM-009` | NOT_IMPLEMENTED | — | — | A third decimal is refused by FormReader in the page action; the engine casts to numeric(15,2) and would round. |
| `NUM-010` | PASS | `scenarios/num/NUM-010.yaml` | createInvoice, issueInvoice |  |
| `NUM-011` | PASS | `scenarios/num/NUM-011.yaml` | createBill, approveBill |  |
| `NUM-012` | PASS | `scenarios/num/NUM-012.yaml` | createInvoice, issueInvoice |  |
| `NUM-013` | NOT_IMPLEMENTED | — | — | The column-size refusal is answered by the page action's constraint registry, outside the engine boundary. |
| `NUM-014` | PASS | `scenarios/num/NUM-014.yaml` | createInvoice, issueInvoice, SELECT sum(...) FROM journal_entry_lines (type check) |  |
| `DB-001` | PASS | `scenarios/db/DB-001.yaml` | `db/DB-001.sql` as owner |  |
| `DB-002` | PASS | `scenarios/db/DB-002.yaml` | `db/DB-002.sql` as owner |  |
| `DB-003` | PASS | `scenarios/db/DB-003.yaml` | `db/DB-003.sql` as owner |  |
| `DB-004` | FAIL | `scenarios/db/DB-004.yaml` | `db/DB-004.sql` as owner | db/DB-004.sql returned 1 rows, expected 0: [{"problem":"journal_entries.status has no CHECK constraint or enum"}] |
| `DB-005` | PASS | `scenarios/db/DB-005.yaml` | `db/DB-005.sql` as owner |  |
| `DB-006` | FAIL | `scenarios/db/DB-006.yaml` | `db/DB-006.sql` as owner | db/DB-006.sql returned 1 rows, expected 0: [{"problem":"no deferred constraint trigger checks that an entry balances"}] |
| `DB-007` | PASS | `scenarios/db/DB-007.yaml` | `db/DB-007.sql` as owner |  |
| `DB-008` | NOT_IMPLEMENTED | — | — | No idempotency key exists. |
| `DB-009` | PASS | `scenarios/db/DB-009.yaml` | `db/DB-009.sql` as owner |  |
| `DB-010` | PASS | `scenarios/db/DB-010.yaml` | `db/DB-010.sql` as owner |  |
| `DB-011` | PASS | `scenarios/db/DB-011.yaml` | `db/DB-011.sql` as owner |  |
| `DB-012` | PASS | `scenarios/db/DB-012.yaml` | createInvoice, issueInvoice |  |
| `DB-013` | PASS | `scenarios/db/DB-013.yaml` | `db/DB-013.sql` as owner |  |
| `DB-014` | PASS | `scenarios/db/DB-014.yaml` | `db/DB-014.sql` as owner |  |
| `DB-015` | PASS | `scenarios/db/DB-015.yaml` | `db/DB-015.sql` as owner |  |
| `E2E-GLD-001` | PASS | `scenarios/e2e/E2E-GLD-001.yaml` | recordManualJournalEntry, createAmortizationSchedule, createBill, approveBill, recordVendorPayment, createInvoice, issueInvoice, recordPayment, recordCreditMemo, recordAccrual, postDueAmortizations, importStatement, matchBankTransaction, closePeriod |  |
| `MIG-001` | NOT_RUN | `scenarios/mig/MIG-001.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-002` | NOT_RUN | `scenarios/mig/MIG-002.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-003` | NOT_RUN | `scenarios/mig/MIG-003.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-004` | NOT_RUN | `scenarios/mig/MIG-004.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-005` | NOT_RUN | `scenarios/mig/MIG-005.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-006` | NOT_RUN | `scenarios/mig/MIG-006.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-007` | NOT_RUN | `scenarios/mig/MIG-007.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-008` | NOT_RUN | `scenarios/mig/MIG-008.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |
| `MIG-009` | NOT_IMPLEMENTED | `scenarios/mig/MIG-009.yaml` | acs.mjs migrate | INV is not implemented. |
| `MIG-010` | NOT_RUN | `scenarios/mig/MIG-010.yaml` | acs.mjs migrate | run `pnpm db:acs migrate <base-ref>` first |

<!-- audit:end -->

---

## 32. Engine Findings

This section is written by hand after each run. It explains every `FAIL` in section 31: what the specification requires, what the engine does, and which kind of difference it is. A reviewer decides each one: change the engine, or change the specification and the fixture. When a row is resolved, delete it here and rerun section 31.

Kinds: **defect** means the engine produces a wrong accounting result or accepts an invalid one. **policy** means both behaviours are coherent and the specification chose one. **scale** means the result is right and the cost is not.

### 32.1 Failures as of 2026-10-02

| ID | Specification requires | Engine does | Kind |
|---|---|---|---|
| `TAX-006`, `TAX-007` | A credit note reverses the tax in proportion: `Dr SERVICE_REVENUE 100`, `Dr SALES_TAX_PAYABLE 8`. | `recordCreditMemo` debits the whole credit to revenue. The tax liability stays overstated and revenue ends with a debit balance. | defect |
| `GL-007` | A journal on an inactive account is refused. | `recordManualJournalEntry` and `postJournal` never read `is_active`; the entry posts. | defect |
| `AR-004` | Each invoice line credits its own revenue account. | `issueInvoice` credits the whole subtotal to account 4000; `invoice_lines.revenue_account_id` is written and ignored. | defect |
| `AR-030` | A payment dated before its invoice is refused. | `recordPayment` compares no dates; the payment posts. | defect |
| `CLOSE-017` | Periods close in order. | `closePeriod` closes any open period; March closes while February is open. | defect |
| `CLOSE-018` | Year-end close refuses while a period of the year is open. | `yearEndClose` reads no period status; it posts with every period open. | defect |
| `FX-020` | A payment in a currency other than the invoice's is refused. | `recordPayment` carries no payment currency; a EUR invoice paid from the USD bank account posts and books an FX gain. | defect |
| `FX-021` | A settlement with no rate on file is refused. | `settlementFxDelta` falls back to the invoice rate when no rate exists on or before the settlement date, and posts no gain or loss. | defect |
| `BANK-021` | A bank transaction of `50` cannot be matched to a payment of `100`. | `matchBankTransaction` checks currency and direction, never amount; the match succeeds. | defect |
| `CON-005` | Two matches of one transaction at once: one wins. | Both commit. The second match is checked against a status it read before the first committed. | defect |
| `CON-008` | A posting dated in a period never lands after that period closed. | Both the close and the posting commit; the posting's `posted_at` is later than `closed_at`. The period check in `postJournal` is not serialised against `closePeriod`. | defect |
| `CON-016` | Two amortization runs at once post one entry. | Both post; `postDueAmortizations` counts posted periods from a snapshot the other run has not changed. | defect |
| `CON-017`, `CON-018` | Two journals posted at once both commit with distinct numbers. | One commits; the other fails with `pg:23505` on `entry_number`. `nextEntryNumber` scans for the next free number instead of drawing from a sequence, so concurrent posts collide. Of twenty lanes, two commit. | defect |
| `DB-004` | `journal_entries.status` accepts only `draft`, `posted`, `void`, `reversed`. | The column is `varchar(50)` with no CHECK and no enum; `enumerations.json` lists the four values but nothing in the database enforces them. | defect |
| `DB-006` | An unbalanced posted entry cannot be committed. | No deferred constraint trigger exists on `journal_entry_lines`; `postJournal` refuses in TypeScript only. | defect |
| `AP-013` | Sales tax on a purchase is part of the expense (US profile). | `approveBill` debits `1200 Input Tax Recoverable`, a VAT-style design. | policy |
| `ACC-008` | A schedule starting after the 15th recognises half a month first. | `postDueAmortizations` divides evenly whatever the start day. | policy |

### 32.2 Scale

| Scenario | Observation | Cause |
|---|---|---|
| `NUM-003` | 1000 one-cent invoices took 572 seconds. | `gl_daily_balances` is recomputed from every line of the account-day on each insert, so one account-day costs the square of its lines. |
| `NUM-005` | 10000 postings had not finished after 14 minutes. | The same. Both scenarios carry `gate: nightly`. |

### 32.3 Not implemented

Section 3.2 and `capabilities.json` give the reason for every `NOT_IMPLEMENTED` scenario. The largest groups are:

| Missing capability | Scenarios |
|---|---|
| The `INV`, `DEF` and `FA` modules | 44 |
| A reversing-entry operation | `GL-012`, `GL-013`, `AR-026`, `AP-011`, `AP-012`, `CLOSE-005`, `CLOSE-014`, `META-003`, `AUD-006`, `FAIL-012` |
| Unapplied receipts, deposits and prepayments | `AR-010` to `AR-013`, `AR-023`, `AR-024`, `AP-009`, `AP-010`, `AP-015`, `FX-014` |
| Refunds | `AR-018`, `AR-019`, `AP-019`, `TAX-008` |
| Statement reconciliation | `BANK-009`, `BANK-010`, `BANK-016` to `BANK-020` |
| FX revaluation that posts | `FX-009` to `FX-012` |
| An idempotency key | `CON-001`, `CON-002`, `CON-009`, `CON-010`, `DB-008` |

### 32.4 Conventions adopted from the engine

These were differences between the draft specification and the engine where the engine's behaviour is a coherent accounting convention. The specification and the fixtures follow the engine; no finding stands.

- A void is for a draft document only; an issued invoice is reversed with a credit note (`AR-025`, `AR-033`).
- A fully credited invoice has status `credited`, never `paid` (`AR-015`).
- A batch receipt or batch payment posts one control-account line per document (`AR-020`, `AP-005`).
- An accrual posts its reversal in the same call, dated the next period's first day (`ACC-001`, `ACC-002`).
- Realized FX gain and loss share one netted account, 4200 (`FX-*`).
- The trial balance reports gross debit and credit columns per account, not net balances (`RPT-002`, `RPT-003`).
- A posted entry resists `UPDATE` through row-level security: the statement changes no row and raises nothing (`GL-010`, `AUD-010`).
- A tax-exempt customer's taxed line is refused rather than zeroed (`AR-005`).
- Year-end close carries `source_type = 'year_end_close'` (`CLOSE-010`).
