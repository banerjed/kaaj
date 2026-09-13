# Accounting Test Plan — Reference Taxonomy & Coverage

Implementation-independent hierarchy of what a complete, correct accounting
SaaS must prove about itself (general double-entry bookkeeping mechanics +
SaaS-specific concerns), with every leaf now annotated against Kaaj's actual
schema, code, and tests as of 2026-09-11.

**Status legend**
- **[DONE]** — a real, DB-backed test exercises exactly this behavior (write
  path or a computation with hand-checkable expected values), or the DB
  schema itself enforces it and that enforcement is load-bearing.
- **[PARTIAL]** — some of {code exists, guard exists, test exists} is true
  but not all, or the test covers a narrower case than the bullet describes.
- **[MISSING]** — no code path and no test. Where the survey found the
  underlying *feature* doesn't exist yet, that's noted rather than treated as
  a pure test gap.

Every `[DONE]`/`[PARTIAL]` citation was verified by reading the cited file at
the cited line, not inferred from a description — see the two corrections
called out below the table of contents, which is exactly why that mattered.
A handful of bullets below are additions found during that verification pass
rather than part of the original implementation-independent taxonomy (each
says so where it appears) — the "built before looking at the implementation"
claim applies to the taxonomy's structure and original bullets, not to those
call-outs.

**Two corrections from the first coverage-mapping pass** (previously
`20-accounting-test-coverage-mapping.md`, now folded in here and deleted):
1. **Settlement FX gain/loss (§3.2) is not implemented, not just untested.**
   `recordPayment` reuses the invoice's *original* `exchange_rate` rather than
   a new settlement-date rate, and never writes `payment_allocations.fx_gain_loss`
   (it stays at its schema default of 0). The column and the spec-tests unit
   test (`INV-ACC-004`) exist; the real code path that would populate them
   does not.
2. **A posted journal entry's immutability was unenforced, not unreachable —
   fixed 2026-09-12, no longer a live finding.** At the time of the first
   coverage-mapping pass, the RLS `accounting_update` policy
   (`20260903045821_accounting_row_visibility.sql`) granted UPDATE on
   `journal_entries`/`journal_entry_lines` to anyone `app.writes_accounting()`
   allowed, with no predicate on the entry's `status` — so if a route had
   ever issued that UPDATE, RLS would not have stopped it from touching a
   posted entry. No route did (every write path was read end-to-end), so it
   was unreachable rather than exploited, but nothing stopped a future route
   from reaching it. DELETE was, and remains, genuinely blocked at the grant
   level, checked exhaustively across all 15 accounting tables (`app_user`
   holds no DELETE grant on any of them — `awk -F'\t' '$2=="app_user" &&
   /DELETE/' packages/database/snapshot/06-grants.txt` returns only `jobs`
   and `pii_keys`, neither accounting-related).
   `20260912060000_journal_entry_immutability.sql` closed the UPDATE gap: a
   RESTRICTIVE predicate now requires `status <> 'posted'` on
   `journal_entries`, and on `journal_entry_lines` an `EXISTS` against its
   parent's status (phrased positively, not `NOT EXISTS`, so an invisible
   parent row denies rather than silently permitting — see the migration's
   own comment). `accounting.writes.test.ts` ("a posted journal entry
   resists an UPDATE") asserts both the posted case (RLS returns zero rows,
   not an error) and a positive control (a `status = 'draft'` row — no CHECK
   constraint behind the column, so a test can construct one even though no
   production code currently does — still permits the UPDATE), per L48: a
   guard never observed denying is not evidence, and neither is one never
   observed permitting.

---

## 1. Ledger Foundations (the accounting engine itself)

### 1.1 Double-entry enforcement
- Every journal entry's debits equal credits (sum = 0), at insert time, not just at report time. **[DONE]** (2026-09-12)
  *`postJournal` asserts this against the rows actually written and throws `AccountingRefused("does_not_balance", ...)` if not (`accounting.repo.ts`). Read-side balance is tested in `accounting.test.ts:19` ("every entry balances — debits equal credits") and re-asserted after every write in `receivables.writes.test.ts:89-125,319-340` and `payables.writes.test.ts:92-121,207-227` ("...and leaves the ledger balanced"). Per L48 ("a guard never observed failing is not evidence"), `accounting.writes.test.ts` now feeds `postJournal` a deliberately unbalanced set of lines directly ("refuses an entry whose debits do not equal its credits", 100.00 against 90.00) and watches `does_not_balance` actually fire.*

  ***The enforcement boundary is `postJournal`, not the database.*** *There is no CHECK/trigger on `journal_entry_lines`/`journal_entries` requiring an entry's debits to equal its credits — confirmed empirically, not just inferred: `accounting.writes.test.ts` ("a one-sided posted entry — bypassing postJournal's own balance guard — makes `balances` false") inserts a single-line `status='posted'` entry directly via SQL, and it succeeds. `unbalanced()`/`trialBalanceTotals().balances`/`balanceSheetTotals().balances` all then correctly report the drift on read — but nothing stops a second write path that skips `postJournal` (a future manual-JE import, a data-fix script run by hand) from creating one silently. "Every journal entry's debits equal credits" is true of every entry this application's own code has ever posted, not a database-enforced invariant.*
- A journal entry cannot be posted with zero lines, one line, or all-debit/all-credit lines. **[DONE]** (2026-09-12)
  *`postJournal` now refuses `live.length < 2` (real, non-zero-amount lines) up front with `AccountingRefused("no_lines", ...)`, before any row is inserted — previously it had no such guard and would have inserted a zero-line header that "balances" trivially (0 = 0). Both current callers (`issueInvoice`/`approveBill`) already refuse a zero-line invoice/bill first, so this was unreachable through them, but the guard now lives in `postJournal` itself so a future caller can't skip it. All-debit/all-credit is caught structurally by the existing balance check rather than a separate guard. `accounting.writes.test.ts` ("posting a journal entry directly") tests all four shapes directly: zero lines, one line, two lines that both net to zero after filtering, and two same-side lines — plus a genuinely balanced two-line entry to prove the guard doesn't also reject valid postings.*
- A journal entry cannot mix currencies within itself without an explicit FX line that balances. **[MISSING]**
  *Not applicable to the current design, which isn't the same as passing: `postJournal` takes one `entry.currency` for the whole entry and every line inherits it — there's no per-line currency at all, so the scenario this bullet describes can't be constructed, and nothing tests what would happen if it could.*
- Rounding residue on multi-line entries (e.g., tax splits) is swept to a designated rounding account, never silently dropped. **[MISSING]**
  *No rounding account or residue-sweep exists anywhere in `accounting.repo.ts`/`payables.repo.ts`. The closest related test, `receivables.writes.test.ts:187` ("rounds each part before summing, on a rate where it matters"), verifies that `base_subtotal`/`base_tax`/`base_total` round-then-sum consistently with each other — a different technique (consistent rounding) than a sweep-to-rounding-account, and it doesn't leave a residue to sweep in the first place.*
- Reversing an entry produces an exact mirror (same accounts, same amounts, sign-flipped), not a netted approximation. **[MISSING]**
  *No reversing-entry or credit-note feature exists. `voidInvoice` only permits voiding a **draft** invoice that was never posted (`accounting.repo.ts`); an issued invoice explicitly refuses voiding with the message "reverse it with a credit note, not a void" — and no credit-note code exists to do that reversal.*
- A partially-failed multi-line insert (crash mid-transaction) leaves zero rows, never an unbalanced half-entry. **[PARTIAL]**
  *`postJournal` runs entirely inside the caller's transaction, so ordinary Postgres atomicity means a failure mid-insert rolls back everything — this is inherent to the design, not a bespoke guard. No test deliberately induces a mid-transaction failure (e.g., a bad account code on a later line) to confirm zero rows land; the architecture is sound but unexercised.*

### 1.2 Chart of Accounts (COA) integrity
- Every account has exactly one type (asset/liability/equity/revenue/expense) and the type is immutable once transactions exist against it. **[PARTIAL]**
  *`account_type` is `NOT NULL` (schema-enforced single type at creation), but nothing prevents changing it later — no immutability trigger, no test, and no UI/route to change it in the first place (see next bullet's finding), so the risk is currently theoretical.*
- Account codes are unique per tenant/entity; no two accounts share a code. **[PARTIAL]**
  *`CREATE UNIQUE INDEX idx_chart_of_accounts_code ON chart_of_accounts (tenant_id, account_code)` (`20260827000001_initial_schema.sql:4064`) enforces this at the DB level. No app-level test attempts a duplicate insert; per CLAUDE.md's own forms rule, an unhandled unique-violation on this constraint would currently surface as a raw 500 rather than a field error unless `chart_of_accounts` is in the `constraintFailure` registry (not confirmed either way — no chart-of-accounts write path exists to trigger it).*
- A parent account with postings and children both existing doesn't silently double-count in rollups. **[MISSING]**
  *No rollup computation exists anywhere — accounts are read individually via `accountId()` (a code→id lookup only); `parent_account_id` exists on the schema and is FK'd to itself, but nothing aggregates through it.*
- Deleting/deactivating an account with a non-zero balance or historical postings is blocked, not silently allowed. **[MISSING]**
  *No account CRUD or deactivation route/repo function exists at all; `is_active` is a schema column nothing writes to.*
- Reparenting an account in the hierarchy recalculates every ancestor's rollup balance, not just the immediate parent. **[MISSING]**
  *No reparenting feature exists, and per the previous bullet, no rollup exists to recalculate.*
- Normal balance side (debit-normal vs credit-normal) is enforced for display sign, and a contra account displays with the correct sign despite being on the "wrong" side of its type. **[MISSING]**
  *No display/report layer reads `account_type` for sign presentation — there is no financial-statement rendering at all (§5).*
- System/control accounts (AR control, AP control, retained earnings) cannot be posted to directly by a user — only through the subledger process that owns them. **[PARTIAL]**
  *True today, but incidentally: no manual-JE UI exists at all (§1.3), so nothing lets *any* user post directly to *any* account, control or otherwise. This is the absence of a dangerous feature, not a deliberate guard against it — if a manual-JE feature is ever added, this protection has to be built, not assumed to already exist.*

### 1.3 Journal entry correctness
- Manual journal entries require the same balancing/period/permission checks as system-generated ones — no backdoor. **[MISSING]**
  *No manual journal-entry creation path exists — no route, no repo function. The question is moot today and becomes live the moment one is built.*
- A journal entry references a valid, open period; posting to a closed period is blocked. **[DONE]**
  *`postJournal` queries `accounting_periods` and throws `AccountingRefused("period_closed", ...)` when the entry date falls in a non-`open` period (`accounting.repo.ts`). Tested from both subledgers: `receivables.writes.test.ts:262` ("refuses to post revenue into a closed period"), `receivables.writes.test.ts:271` ("refuses a payment dated into a locked period"), `payables.writes.test.ts:175` ("refuses to recognise a liability in a closed period"), and the open-period-with-no-row case is separately tested (`receivables.writes.test.ts:295`, `payables.writes.test.ts:184`, "allows a posting in a month no period row covers").*
- Each line requires a valid account, and (where the COA demands it) a valid cost center / department / project / class dimension. **[PARTIAL]**
  *`account_id` is `NOT NULL` and FK'd to `chart_of_accounts`, so an invalid account is impossible by construction (and `accountId()` throws `no_such_account` for an unknown code, per `accounting.repo.ts:305`). `department_id`/`location_id`/`tracking_categories` columns exist on `journal_entry_lines` but `postJournal` never populates or requires them, and no test exercises a dimension requirement.*
- Attachments/memos survive entry edits and reversals; the audit trail shows who posted, when, and via which source document. **[PARTIAL]**
  *The "who/when/source" half is [DONE]: registered audit events `issue`, `approve`, `recordPayment`, `voidInvoice`, `match` (`audit/register.ts:129-158`) capture the actor on every money-moving action. Attachments/memos on a journal entry itself are not a feature — `journal_entries.description`/`reference` are free text, and there is no reversal to survive in the first place (§1.1).*
- A journal entry created by a subledger transaction (invoice, bill, payment) is traceable back to that source document and vice versa (drill-down both directions). **[DONE]**
  *`postJournal` records `source_type`/`source_id` on the journal entry, and `invoices.journal_entry_id`/`bills.journal_entry_id` link the other way. The JE→source direction is exercised by every writes-test that reads `journal_entry_lines` joined via the `entryNumber` returned from `issueInvoice`/`approveBill` (e.g., `receivables.writes.test.ts:89-125`); the source→JE direction is used operationally by `recomputeInvoiceTotals`/bank-match idempotency checks but isn't asserted by a dedicated test of its own.*
- Editing a posted entry is disallowed; correction requires a reversing entry + a new correct entry. **[PARTIAL]** (the "disallowed" half is now [DONE], 2026-09-12)
  *"Editing is disallowed": see the corrected top-of-document note — `accounting_update` now carries a RESTRICTIVE `status <> 'posted'` predicate on `journal_entries` (and the equivalent, via its parent, on `journal_entry_lines`), migration `20260912060000_journal_entry_immutability.sql`, tested in `accounting.writes.test.ts` ("a posted journal entry resists an UPDATE") both for the denial and, as a positive control, that a non-posted row still permits it. DELETE remains blocked at the grant level, as before. "Correction requires a reversing entry": still **[MISSING]** — no reversing-entry or credit-note feature exists (same gap as §1.1's reversing-entry bullet); immutability alone doesn't give anyone a way to correct a mistake yet, only a way to stop silently overwriting one.*

### 1.4 Period management & close
- A period's state machine (open → soft-close → hard-close/locked) is enforced: no posting to a locked period from ANY path. **[PARTIAL]**
  *The two real write paths (invoice issuance/payment, bill approval/payment) both go through `postJournal`'s period check and are tested (see 1.3). `accounting_periods.status` is a bare `VARCHAR(50)` with no CHECK constraint — the "soft-close" state the bullet describes isn't a distinct, enforced state, just whatever string a row happens to hold; `postJournal` only distinguishes `'open'` from "anything else."*
- Reopening a locked period is either disallowed or requires elevated permission + is itself audited. **[MISSING]**
  *No close or reopen endpoint exists at all — nothing in `apps/web/src/lib/server` or `routes/` writes to `accounting_periods.status`. `packages/database/fixtures/mock-data.sql:873` seeds an `audit_log` row for a `close_period` action as if this happened, but there is no corresponding application code that could have produced it — the fixture asserts a workflow that doesn't exist. `spec-tests`' `INV-ACC-002` ("requires permission, reason, and audit before reopening a closed period") is a hand-built-fixture unit test of the *desired* rule, disconnected from any real code to reopen a period with.*
- Opening balances for period N+1 equal exactly the closing balances of period N, per account, before any period-N+1 activity. **[MISSING]**
  *No period-close process computes or carries forward opening balances — `chart_of_accounts.current_balance`/`current_balance_base` are schema columns nothing in the accounting repos writes to.*
- Year-end close correctly zeroes out revenue/expense accounts into retained earnings/equity. **[MISSING]**
  *No such process exists in code.*
- Fiscal year definitions that don't align to calendar year roll periods correctly. **[MISSING]**
  *`accounting_periods.fiscal_year`/`period_type` exist as schema columns; nothing computes or validates period boundaries against a non-calendar fiscal year.*
- Concurrent close: two periods cannot be "current" at once; a report requested mid-close reads a consistent snapshot. **[MISSING]**
  *Moot without a close process or any report that reads "the current period" (§5).*

### 1.5 Trial balance & balancing invariants
- Trial balance total debits = total credits, always, computed independently from the sum of all posted journal lines. **[DONE]** (2026-09-12)
  *`/accounting/trial-balance` — `acc.trialBalance()` (per-account, grouped) and `acc.trialBalanceTotals()` (a second, independent aggregation over the same `journal_entry_lines`, not a sum of the first report's own rows) both exist and are tested in `accounting.test.ts` ("the trial balance" — "total debits equal total credits, computed independently of the per-account grouping"). Both sum `base_debit_amount`/`base_credit_amount`, not the raw currency-native columns — a raw sum would silently mix USD/EUR/GBP figures from entries posted in different currencies.*
- Trial balance ties to the sum of every subledger's control account. **[PARTIAL]** — the check now exists and is tested; the invariant it checks for is **currently false** in this tenant's data.
  *`acc.controlAccountTieOut()` sums `journal_entry_lines` for AR (`"1100"`) and AP (`"2000"`) and compares each to `sum(invoices.base_amount_due)`/`sum(bills.base_amount_due)` WHERE `journal_entry_id IS NOT NULL`, shown on `/accounting/trial-balance` with a "ties out"/"drift" badge per row. The subledger filter is on `journal_entry_id`, not `status` — an early draft filtered `status NOT IN ('draft', 'void')`, which looked plausible but counts a hand-authored `overdue`/`partial` invoice as posted whether or not it was ever actually run through `issueInvoice`. `journal_entry_id` is the fact of whether a GL entry exists for the row, which is what a tie-out needs.*

  *Building it immediately found something real, exactly as this taxonomy predicted ("it becomes the correctness check that fails loudly"): `accounting.test.ts` ("the AR and AP control accounts do not tie to their subledgers today") asserts the exact current drift — AR off by `-10000.00`, AP off by `-2500.00`. These are two distinct, fully-explained gaps, not one aggregate mystery:*
  - *AR: four of five fixture invoices were hand-authored with a plausible status/`amount_due` and never actually issued (no `journal_entry_id`) — only `INV-2026-001` (paid, `amount_due` 0.00) was. So the AR subledger total is 0.00, and the entire `-10000.00` GL balance is `JE-2026-0004` ("Partial payment allocated across Acme invoices", 2026-02-07): a $10,000 credit-only line with no matching debit and no invoice pointing back to it — an orphaned journal entry.*
  - *AP: the subledger total (`1981.53`) is exactly what `BILL-AWS-2026-01` and `BILL-UX-2026-001`'s two journal-entry pairs net to on their own. The `-2500.00` difference is entirely `JE-2026-0006` ("AWS batch vendor payment", 2026-02-10): a $2,500 debit with no bill's `journal_entry_id` pointing to it.*

  *Both are fixture data-modeling gaps — hand-authored journal entries and invoice/bill rows that were never actually linked to each other — not an application bug. `accounting.writes.test.ts` ("the control-account tie-out reflects a clean write") proves the mechanism itself is sound: a fresh invoice/bill taken through the real write path to fully paid changes the AR/AP difference by exactly zero.*
- A trial balance run for a prior period, after later periods have activity, still reflects only that period's cumulative state. **[DONE]** (2026-09-12)
  *`trialBalance`/`trialBalanceTotals` take an `asOf` date, filtering `journal_entries.entry_date <= asOf` — tested in `accounting.test.ts` ("run as of a prior date reflects only that date's cumulative activity, not later periods'"): as-of the fixture's first posting date includes only that date's three entries, and as-of a date before any posting returns zero, both while still balancing.*
- Suspense/clearing accounts trend toward zero after processing completes. **[MISSING]**
  *No suspense/clearing account concept exists in the chart of accounts constants or schema.*

---

## 2. Core Subledgers

### 2.1 Accounts Receivable (AR)
- Invoice total = sum of line amounts + tax − discounts. **[DONE]** (updated 2026-09-11, was PARTIAL)
  *`recomputeInvoiceTotals` now nets `sum(invoice_lines.discount_amount)` out of `subtotal` before adding tax (`accounting.repo.ts`, in the `line_totals` CTE) — previously it only summed `amount` and ignored discount entirely. `createInvoice()` computes each line's gross `amount` and `discount_amount` from `quantity`/`unit_price`/`discount_percent` in SQL. Tested with a real nonzero discount and exact expected figures in `receivables.writes.test.ts` ("creating an invoice" → "sums line amounts net of each line's discount into the subtotal"): 10 × 100.00 less a 10% discount nets to 900.00, plus a second undiscounted line, subtotal `1100.00`. Existing (discount-free) fixture rows are unaffected since they net against zero. The discount also survives issuance: `INVOICE_SELECT`'s `line_subtotal` (the read-side figure the invoice-list page's "≠ lines" drift badge compares `subtotal` against) was updated to net `discount_amount` the same way, since otherwise every discounted invoice would have tripped a false drift flag; `receivables.writes.test.ts` ("issues clean through a discount — balanced JE, revenue credited net, no false drift flag") creates a 20%-discounted invoice, issues it, and asserts the JE balances, revenue posts at the net `800.00`, and `line_subtotal === subtotal`.*
- Invoice posts a balanced JE (Dr AR, Cr Revenue/Tax Payable) at the moment it's finalized. **[DONE]**
  *`issueInvoice` → `postJournal`, tested with exact expected account codes and amounts: `receivables.writes.test.ts:89` (DR 1100, CR 4000, no tax) and `receivables.writes.test.ts:127` ("splits revenue from tax", CR 2200 tax payable + CR 4000 revenue, exact figures `3214.97`/`36225.00`).*
- Partial payment reduces invoice open balance correctly and invoice status transitions at the right thresholds. **[DONE]**
  *`receivables.writes.test.ts:342` ("reduces what is owed by exactly the amount received"), `:356` ("marks the invoice paid when the last of it is settled"), `:368` ("leaves it partial when something is still outstanding") — including the exact-full-payment boundary.*
- Overpayment either creates a credit balance / customer credit memo or is rejected — never silently discarded. **[DONE]** (rejected half only)
  *`receivables.writes.test.ts:375` ("refuses more than is outstanding") — compared in SQL/NUMERIC per the code's own comment, not JS float. There is no credit-balance/credit-memo alternative to reject *into* — overpayment is refused outright, which satisfies the bullet's "never silently discarded" but not its first alternative.*
- Credit memos and refunds reduce AR and revenue symmetrically to how the original invoice increased them. **[MISSING]**
  *No credit memo / refund feature exists in code.*
- Voiding/cancelling an invoice after payment is blocked, or requires unwinding the payment first. **[DONE]** (blocked)
  *`voidInvoice` refuses anything not a draft (`accounting.repo.ts`), tested in `receivables.writes.test.ts:474` ("refuses to void anything already issued") and `:463` ("voids a draft"). Since payment can only happen on an issued invoice, an invoice with a payment can never reach void — the block is total rather than conditional on payment state, which trivially satisfies the bullet.*
- AR aging report buckets use the correct "as of" date and correctly age partially-paid invoices by their remaining balance. **[DONE]** (added 2026-09-13)
  *`acc.arAging()` at `/accounting/ar-aging` buckets open, non-draft/void invoices into current/1-30/31-60/61-90/90+ by `asOf - due_date`, defaulting a blank `asOf` to the database's own `CURRENT_DATE` — deliberately different from the balance sheet's `asOf`, where blank means no upper bound, since aging needs a real reference date to bucket against. `amount_due` already reflects partial payment (it is `total - amount_paid`, enforced by `ck_invoices_amounts_reconcile`), so a partially-paid invoice ages by its remaining balance for free. Grouped by `(customer_id, currency)` and read from the invoice's own currency — never `base_amount_due` — so a customer billed in two currencies is two rows rather than one silently-summed one, and no cross-customer total is shown (mixing currencies would violate BR-FP-003). Tested in `accounting.test.ts` ("AR aging") by walking the same fixture balances through every bucket as `asOf` moves, with each boundary checked exactly (30/31, 60/61, 90/91 days — break/revert-verified) and the five buckets asserted to sum to the row's total at every date tested — plus the draft-exclusion and own-currency assertions, and finance-only RLS visibility.*
- Per-customer aggregate balance (how much each customer currently owes, for credit-risk review) is available, not just per-invoice figures. **[DONE]** (added 2026-09-13 — this bullet is new, not a status flip from the original v2.1 audit, which covered the underlying gap under US-ACC-019 in `module-accounting.md` rather than as its own line here)
  *`acc.customerBalances()` at `/accounting/customer-balances` groups open invoices by `(customer_id, currency)`, with invoice count, invoiced/paid/due totals, and the customer's `credit_limit`. Takes no `asOf` — a live balance, not a point-in-time report — so it always reads the invoices' current `amount_due`. Tested in `accounting.test.ts` ("customer balances"): `total_due = total_invoiced - total_paid` is asserted against real fixture figures (break/revert-verified), a customer with only a draft invoice is excluded, and finance-only RLS is checked. The page's over-limit flag is a `compareDecimal` comparison rather than a new SQL column — the fixture's uniform `100.00` credit limit on every customer means only the over-limit branch is exercised by real data, which is noted rather than hidden.*
- Write-off of bad debt moves the balance out of AR into an expense/allowance account and is auditable. **[MISSING]**
  *No write-off feature exists.*
- Currency of the invoice, once issued, doesn't change even if the customer's default currency changes later. **[PARTIAL]**
  *No code path changes `invoices.currency` after issuance (there's no invoice-edit feature at all post-issuance beyond payment/void), so this holds by absence of a mutation path rather than by a deliberate immutability guard. Untested directly.*
- Applying a payment to multiple invoices (batch/lockbox-style) allocates the full payment exactly, with no rounding leftover unaccounted for. **[DONE]** (added 2026-09-13)
  *`acc.recordLockboxPayment()` at `/accounting/receive-payment` takes a `totalAmount` and a set of per-invoice allocations, refusing (`allocation_mismatch`) unless they sum to it exactly — checked in SQL/NUMERIC, never by trusting the page's own arithmetic. One journal entry per payment (one Cash debit, one AR credit per invoice), each invoice individually checked for its own overpayment, wrong status, and wrong customer, plus a duplicate-invoice-in-one-batch guard. Tested in `receivables.writes.test.ts` ("receiving a lockbox payment across multiple invoices"): the ledger stays balanced, each invoice's balance drops by exactly its own allocation, one invoice can settle to `paid` while another stays `partial` in the same payment, and every refusal path (overpayment, mismatch, wrong status, wrong customer, duplicate) is exercised with `refusedBecause`. A `form-errors.spec.ts` case covers the mismatch refusal end-to-end.*

### 2.2 Accounts Payable (AP)
- Bill posting, partial payment, credit application, overpayment handling, aging, void rules (mirroring AR). **[DONE]** (posting/payment/overpayment/void, and a forward-looking "due soon" view) **/ [MISSING]** (credit application, a backward-looking AP aging bucket report)
  *`approveBill` posts a balanced JE with one line per expense account, tested with exact figures in `payables.writes.test.ts:92` ("posts a balanced entry, one line per expense account..."). `recordVendorPayment`: `:230` ("reduces what is owed by exactly the amount paid"), `:244`/`:256` (paid/partial transitions), `:263` ("refuses more than is outstanding"), `:278` ("refuses a payment against a draft"). `pay.apDueSoon()` (added 2026-09-13) is a forward-looking view of bills coming due, bucketed by a chosen window — a different, separately-shipped feature from AP aging, which would bucket overdue bills by how late they are (current/30/60/90+, mirroring `acc.arAging()`) and does not exist yet, nor does a credit-memo-from-vendor feature.*
- Three-way match (PO ↔ receipt ↔ invoice) blocks payment when quantities/amounts diverge beyond tolerance. **[MISSING]**
  *No purchase-order feature exists at all, so there is nothing to three-way-match against.*
- Duplicate invoice detection (same vendor + invoice number + amount) flags or blocks a second entry. **[MISSING]**
  *No such check exists in `payables.repo.ts`.*
- Payment run (batch payment) selects only approved, unpaid, non-disputed bills and produces one JE per payment consistently. **[MISSING]**
  *`recordVendorPayment` operates on a single bill; there is no batch/payment-run feature.*
- Early payment discount terms (e.g., 2/10 net 30) calculate correctly and expire at the right date. **[MISSING]**
  *No payment-terms-discount logic exists.*
- 1099/vendor-tax-reporting flags accumulate the right taxable payment total across the year, excluding non-reportable payment types. **[MISSING]**
  *`vendors.is_1099_vendor` exists as a schema column; nothing reads it into any report or filing.*

Additionally, and beyond the original taxonomy — **segregation of duties on bill approval is [DONE] and worth calling out explicitly**: `payables.writes.test.ts:124` ("names the new approver and leaves the old creator alone") and `:293` ("refuses the approver paying their own bill") are real, deliberate SoD tests with no analog in the AR taxonomy bullets above (invoicing has no equivalent "approver" concept).

### 2.3 Cash & Bank
- Every cash account in the COA maps to exactly one bank account record, no orphaned mapping either direction. **[PARTIAL]**
  *`bank_accounts.gl_account_id` FKs to `chart_of_accounts` (schema-enforced one-way), but nothing enforces or tests the reverse (a cash-type COA account without a `bank_accounts` row, or vice versa) — no explicit petty-cash-account concept either.*
- Bank feed / statement import matches transactions to existing JEs by amount + date + reference, unmatched items surfaced, never auto-matched to the wrong entry. **[PARTIAL]**
  *Manual matching (a human picks a candidate) is [DONE] and well tested: `payables.writes.test.ts:364` ("matches a credit to a customer payment"), `:380` ("matches a debit to a vendor payment"), `:401` ("refuses a payment in a different currency"), `:412` ("refuses a credit matched to a vendor payment" — direction mismatch), `:423` ("refuses a payment already claimed by another transaction"), `:463` (candidate picker "offers only same-currency, same-direction, still-unmatched payments"). There is no automatic/algorithmic matching and no live bank-feed import to test — `bank_accounts.feed_provider`/`feed_enabled` are unused schema columns.*
- Reconciliation ties book balance to statement balance; a reconciled transaction cannot be silently edited/deleted without un-reconciling first. **[PARTIAL]**
  *`payables.test.ts:97` ("keeps the bank's balance and the feed's balance as separate facts") and `:177` ("shows every reconciliation state the screen has to render") cover the read side. No test attempts to edit or delete an already-matched transaction and asserts a refusal — the "already claimed" refusal (`:423`) covers double-matching, not post-match mutation.*
- A bank account balance in the GL never diverges from "sum of all posted transactions to that account." **[MISSING]**
  *No test ties `chart_of_accounts.current_balance` for a bank's GL account to the sum of its `journal_entry_lines` — same class of gap as the trial-balance-to-subledger tie-out in §1.5/§6.*
- NSF/bounced payment reverses the original cash receipt and reinstates the AR balance. **[MISSING]**
  *No NSF/bounce/reversal feature exists — consistent with §1.1's "no reversing entry" finding.*
- Multi-currency bank accounts revalue at period-end and post the unrealized FX gain/loss to the right account. **[MISSING]**
  *Same finding as §3.3 — no revaluation code exists.*
- Bank account number never returned in any form. **[DONE]** *(not in the original taxonomy, but real and worth recording)*
  *`payables.test.ts:135` ("never returns an account number in any form") is a direct, deliberate masking test.*

### 2.4 Fixed Assets — **[MISSING]**, entirely
*No table, no code, no test. `rg -il 'fixed.asset|depreciation'` across `apps/web/src` and `packages` finds nothing. Confirmed as explicitly deferred in both `module-accounting.md`'s Future Enhancements and `accounting-gap-analysis.md` Enhancement #19 — a product decision, not a testing oversight.*

### 2.5 Inventory / COGS — **[MISSING]**, entirely
*No table, no code, no test. Same status as Fixed Assets — deferred by product decision (Gap #4 / Phase 2 in the same docs).*

### 2.6 Payroll (if in scope) — **[MISSING]**, GL integration specifically
*Payroll exists as its own module with its own tests, but posting payroll to the accounting ledger is explicitly unbuilt (`module-accounting.md`'s Future Enhancements). `rg -il 'recurring|deferred_revenue|accrual'` under `apps/web/src/lib/server` and `packages` turns up only unrelated HR/compensation modules (`firm_holidays.repo.ts`, `hr_time_off_*`, `compensation_allowances.repo.ts`) — none of it is a payroll→GL bridge.*

---

## 3. Multi-Currency & Multi-Entity

### 3.1 Transaction-level FX
- A foreign-currency transaction records both the original and functional-currency equivalent at the transaction-date rate. **[DONE]**
  *`exchange_rate`/`base_currency`/`base_*` columns are populated at issuance; `receivables.writes.test.ts:156` ("ties the posting to the invoice's base total in a foreign currency") asserts `sum(base_debit_amount)` equals `invoices.base_total` exactly for a real GBP fixture invoice.*
- Rounding on FX conversion follows a documented rule and is applied identically on the debit and credit side. **[DONE]**
  *`receivables.writes.test.ts:187` ("rounds each part before summing, on a rate where it matters") is a deliberately chosen rate/amount (GBP 1.27, `100.01`) that distinguishes round-then-sum from sum-then-round, asserting `127.01 + 127.01 = 254.02` rather than the naive `254.03` — a real, sharp test, not an incidental pass.*

### 3.2 Settlement FX gain/loss — **[MISSING]**
*See the correction at the top of this document. `recordPayment`/`recordVendorPayment` both reuse the invoice's/bill's original `exchange_rate` (`accounting.repo.ts`, confirmed by reading the full function body) rather than looking up a new settlement-date rate, so there is no rate delta to realize a gain or loss from — `payment_allocations.fx_gain_loss` is inserted only implicitly via its schema default of `0` (`accounting.repo.ts` never mentions the column). No test pays a foreign-currency invoice at a different rate than it was booked; every `recordPayment` test in `receivables.writes.test.ts` uses the `PARTIAL` (USD) or `DRAFT` (USD) fixture invoices, never the `GBP` one. `INV-ACC-004`'s `calculateRealizedFxGainLoss` in `packages/spec-tests` tests the correct *formula* as a pure function, but nothing connects it to the real write path.*

### 3.3 Revaluation (period-end) — **[MISSING]**
*No code revalues open foreign-currency AR/AP/bank balances at period-end; no unrealized-gain/loss test exists anywhere.*

### 3.4 Multi-entity / consolidation — **[MISSING]**, entirely
*Kaaj is single-entity-per-tenant today (`accounting-gap-analysis.md` Enhancement #13). No schema, code, or test.*

---

## 4. Tax Handling

- Tax calculated matches the jurisdiction's rate table for the transaction date; rate changes apply prospectively. **[PARTIAL]**
  *Line-level tax math is exercised via fixture data — `payables.test.ts:45` ("has a bill carrying tax, so the tax path is exercised") and `receivables.writes.test.ts:127` (exact split, `3214.97` tax / `36225.00` revenue) — but these check internal consistency (`total = subtotal + tax`) against whatever `tax_amount` the fixture already carries, not that the rate was looked up correctly for the transaction date from a rate table. There is no dedicated accounting `tax_rates` table at all: every accounting tax FK (`invoice_lines.tax_rate_id`, `bill_lines.tax_rate_id`, `chart_of_accounts.tax_rate_id`, `journal_entry_lines.tax_rate_id`) points at `payroll_tax_rates(id)` (`supabase/migrations/20260827000001_initial_schema.sql:4108,4122,4143,4181`) — confirmed by reading the FK constraints directly, not inferred. This is a genuine data-model gap worth fixing before building any tax report on top of it.*
- Tax-exempt customers/products correctly produce zero tax, and an exemption expiring mid-period stops exempting after expiry. **[MISSING]**
  *No exemption/exemption-expiry logic exists.*
- Compound/cascading tax jurisdictions sum correctly and each layer posts to its own liability account. **[MISSING]**
  *Only a single `tax_amount`/`tax_rate_id` per line exists — no multi-jurisdiction stacking.*
- Reverse-charge / self-assessed VAT scenarios post both the payable and receivable side symmetrically. **[MISSING]**
  *No reverse-charge logic exists.*
- Tax on a credit memo/refund reverses exactly the tax originally charged. **[MISSING]**
  *Moot — no credit memo feature (§2.1).*
- A tax liability report ties to the sum of all tax-account postings for the period. **[MISSING]**
  *No tax report exists; `INV-ACC-006`'s `summarizeTaxLines` (output tax − input tax) is a pure-function unit test in `packages/spec-tests` against hand-built fixture objects, not the real ledger.*
- Rounding of tax per line vs. tax on invoice total is applied consistently, and doesn't drift between creation and recalculation. **[PARTIAL]**
  *`recomputeInvoiceTotals` always sums `invoice_lines.tax_amount` (per-line convention) the same way on every call (creation and any later recompute use the identical SQL), so there's no drift *within* the one convention it uses — but nothing tests the per-line-vs-per-invoice distinction itself, because only the per-line convention exists.*

---

## 5. Financial Statement Reports — all five statements **[PARTIAL]**
- Profit & Loss (Income Statement). **[PARTIAL]** (2026-09-12)
  *`/accounting/profit-loss` — `acc.profitAndLoss()` lists revenue/expense accounts with posted activity in a `from`/`to` period (both optional; blank means all-time), and `acc.profitAndLossTotals()` is an independent SQL aggregation, not a JS reduction of the first's rows — summing `debits`/`credits` as strings in JS would be silent concatenation (CLAUDE.md's money rule). Period comparison (US-ACC-041) added 2026-09-12: `acc.profitAndLossComparison()` computes the prior window's boundaries in SQL — `previous_period` is an equal-length window immediately before `from` (Feb 2026's 28 days lands the prior window on Jan 4–31, not a calendar month), `previous_year` shifts both dates back exactly a year — and is scoped to totals (revenue/expenses/net income), not a per-account comparison. `compare` requires both `from` and `to`, refused otherwise; an off-list `compare` value is refused with its own message rather than misattributed to the date fields (`f.choice()` fails the same way `f.date()` does, so a naive single `if (!f.ok)` would blame the wrong one); and `previous_year` is refused for a period a year or longer, since the shifted comparison window would then overlap the current one and double-count the same activity — three e2e cases in `form-errors.spec.ts`, the first in the same shape as the cash-flow inverted-range guard. Tested in `accounting.test.ts` ("the profit and loss statement", 5 cases; "profit and loss period comparison", 3 cases) including RLS as a refused plain employee. What's missing against FR-ACC-007's fuller spec: no COGS subtotal/gross margin (the fixture's chart of accounts has no COGS vs. operating-expense distinction to group by), no per-account period comparison, no comparison on the trial balance or balance sheet (both are cumulative "as of" reports, not periodic — a comparison there means two `asOf` columns, not two windows, and would need its own differently-shaped function), no department/location segmentation (the fixture's `journal_entry_lines` all share one department and one location — nothing to filter yet), no drill-down to transaction detail, no export, and no cash-vs-accrual toggle.*
- Balance Sheet. **[PARTIAL]** (2026-09-12)
  *`/accounting/balance-sheet` — `acc.balanceSheet()` lists real, posted asset/liability/equity accounts as of a date (cumulative, like the trial balance's `asOf`), and `acc.balanceSheetTotals()` is an independent SQL aggregation asserting the accounting identity directly: assets = liabilities + equity + net income. This codebase has no closing-entry process rolling revenue/expense into retained earnings, so `equity` alone understates what a real balance sheet needs — `balanceSheetTotals()` folds the current period's net income back in as `total_equity`/`total_liabilities_and_equity`, shown as its own "Current period earnings (no closing entry has run)" line, which is what actually ties to assets. Verified against the real fixture: assets `59061.53` = liabilities `95981.53` + equity `20000.00` + net income `-56920.00` — the fixture now carries a real opening-balance entry crediting Retained Earnings (see the equity bullet below), so `equity` is a genuine non-zero figure here rather than a term that happened to pass at 0. Tested in `accounting.test.ts` ("the balance sheet", 4 cases) including RLS as a refused plain employee, plus 2 write-path positive controls in `accounting.writes.test.ts` ("the balance sheet's equity term and balance check are real, not vacuous") proving `equity` moves further when a second credit is posted, and that `balances` actually goes `false` for a one-sided posted entry (CLAUDE.md L48/L50). Missing against FR-ACC-007's fuller spec: no comparison periods, no department/location segmentation, no drill-down, no export.*
- Cash Flow Statement. **[PARTIAL]** (2026-09-12)
  *`/accounting/cash-flow` — the indirect method: `acc.cashFlowTotals()` computes net income for the period plus the period's change in every non-cash working-capital account (`acc.cashFlowStatement()` lists those adjustments, signed as their impact ON CASH — a decrease in an asset or an increase in a liability is a source), and asserts `reconciles`: beginning cash + net change = the real Cash-account balance (identified by `chart_of_accounts.is_bank_account`, not a hardcoded account code). This is algebraically forced by the same double-entry identity `balanceSheetTotals` asserts, verified against the real fixture (`68900.00` both ways, unfiltered; `62300.00` → `68900.00` for the Feb-only period). Investing is structurally present but always `0`: this chart of accounts has no fixed-asset or investment account category to draw from — a real, documented schema gap, not an unfinished computation. Financing is no longer always zero: the fixture's opening-balance entry crediting Retained Earnings (see the equity bullet below) is a real financing-side posting, so `financing_cash_flow` is `20000.00` unfiltered and the Financing Activities section renders a real row rather than an always-empty one — this was previously untested by construction, since nothing in the fixture had ever moved that term. Direct-method cash flow (categorizing actual cash transactions) isn't attempted at all, since nothing in this schema tags a `journal_entry_line` with an activity type. Period comparison (US-ACC-041) added 2026-09-13: `acc.cashFlowComparison()` doubles `cashFlowTotals()`'s own begin/end-balance pattern across two windows (four balance points per account instead of two) using the same `compare`/guard vocabulary as the P&L, shared via `$lib/server/accounting/period-compare.ts` rather than copied a third time. Scoped to the operating/financing/net-change subtotals, not the per-account adjustment rows. Tested in `accounting.test.ts` ("the cash flow statement", 4 cases; "cash flow period comparison", 2 cases) including RLS as a refused plain employee, plus a write-path positive control in `accounting.writes.test.ts` proving `reconciles` actually goes `false` for a one-sided posted entry (folded into the same insert that proves `balanceSheetTotals`/`trialBalanceTotals`'s own balance checks aren't vacuous — CLAUDE.md L48/L50).*
- Statement of Changes in Equity. **[PARTIAL]** (2026-09-12)
  *`/accounting/equity` — `acc.equityStatement()` rolls forward every active equity account for a period (beginning balance, its own direct postings, ending balance), and `acc.equityStatementTotals()` shows the period's net income as its own line rather than folding it into any account's `direct_changes` — this codebase has no closing-entry process, so net income never actually reaches an equity account. `ending_equity_including_current_earnings` matches `balanceSheetTotals().total_equity` for the same `to` date exactly, proven directly in a test rather than left as an unverified claim. Unlike every other report in this module, active equity accounts are listed even at zero rather than hidden when untouched — the equity section is a small, fixed set of lines (capital, retained earnings), not a large chart, proven with a real period query (`to: "2025-12-31"`) that predates any posting and still returns the row at all zeros. The fixture was originally silent here — Retained Earnings had never been posted to — so it now carries a real opening-balance entry (`JE-2026-0000`, 2026-01-01: Debit Cash `20000.00` / Credit Retained Earnings `20000.00`, modeling FY2025 earnings carried into the new year) rather than leaving the report permanently over a zero subject (CLAUDE.md L50/L51). Unfiltered: `beginning_equity` `0`, `direct_changes` `20000.00`, `ending_equity` `20000.00`, `ending_equity_including_current_earnings` `-36920.00` (matching `balanceSheetTotals().total_equity` exactly). A write-path positive control in `accounting.writes.test.ts` additionally posts a second, incremental credit and — using `from` set to that posting's own date to isolate it from the fixture's opening balance — proves `beginning_balance`/`direct_changes`/`ending_balance` all move by exactly that increment, and (queried the following day) that the posting correctly shifts from `direct_changes` into `beginning_balance` on the far side of its own date — `equityStatement` and `equityStatementTotals` each run their own copy of the FILTER (L82), so each needed its own proof. Period comparison (US-ACC-041) added 2026-09-13: `acc.equityComparison()` compares the period's own activity — `direct_changes` and `net_income` — not the cumulative `ending_equity` balances either window ends on, which would mostly reflect elapsed time rather than a change in the rate of equity activity. Uses the same shared `compare` vocabulary and guards as the P&L and cash flow. Tested in `accounting.test.ts` ("the statement of changes in equity", 3 cases; "equity statement period comparison", 2 cases) including RLS as a refused plain employee. Missing against FR-ACC-007's fuller spec: no department/location segmentation, no drill-down, no export.*

---

## 6. Reconciliation & Cross-Checks

- GL control account balance = subledger total, for every subledger. **[PARTIAL]** (2026-09-12) — see §1.5's identical finding
  *`acc.controlAccountTieOut()` now performs exactly this check for AR and AP, tested and shown on `/accounting/trial-balance`. It found the two control accounts do NOT currently tie to their subledgers — a real, pre-existing fixture data gap (most invoices/bills were never actually posted via `issueInvoice`/`approveBill`), not a bug in the check or in `createInvoice`/`createBill`'s write paths, which a separate test proves add zero net drift. See §1.5 for the exact figures.*
- Bank reconciliation ties book balance to statement balance with itemized reconciling items that clear in a subsequent period. **[PARTIAL]**
  *The "already claimed" refusal (`payables.writes.test.ts:423`) gives idempotency-flavored coverage for matching, but there's no full reconciliation report (itemized outstanding checks / deposits in transit) and no test of an item clearing in a later statement period.*
- Intercompany reconciliation run independently of the consolidation elimination logic. **[MISSING]**
  *Moot — no multi-entity feature (§3.4).*
- A "trial balance drift" job comparing computed vs. stored balances runs and reports zero drift. **[PARTIAL]** (2026-09-12)
  *A trial balance now exists (§1.5) and `chart_of_accounts.current_balance` is still an unused cached column nothing writes to — so there is nothing to compare the computed figure AGAINST, which is what this bullet actually asks for (computed vs. STORED). What exists instead is the control-account tie-out (computed vs. computed, from two different tables), a related but distinct check. No scheduled job of any kind exists in this codebase for anything accounting-related.*

---

## 7. Audit Trail, Controls & Segregation of Duties

- Every posted transaction records who created it, who approved it, and when — immutably. **[DONE]**
  *`audit/register.ts:129-158` registers `issue`, `recordPayment` (×2 routes), `voidInvoice`, `approve`, `match` for the accounting routes, each capturing the actor. "Immutably" for the audit log itself: `audit.test.ts:134` ("refuses an UPDATE from the application role") and `:140` ("refuses a DELETE too").*
- Editing a transaction after posting is either disallowed or creates a new versioned/reversing record. **[MISSING]**
  *See the top-of-document correction — this is currently neither disallowed by RLS nor implemented as a versioned/reversing record.*
- A user cannot approve their own transaction where segregation-of-duties rules require a different approver. **[DONE]**
  *`payables.writes.test.ts:293` ("refuses the approver paying their own bill") is a direct, real test of this exact rule on the AP path. There is no equivalent concept on the AR path (invoicing has no "approver"), so this coverage is AP-only.*
- Deleting a transaction is disallowed post-posting; hard deletes of financial records don't exist in the product surface. **[DONE]**
  *Confirmed at the grant level, not just by absence of a delete button: `app_user` holds `INSERT,SELECT,UPDATE` (no `DELETE`) on every accounting table, per `packages/database/snapshot/06-grants.txt` — checked directly for `invoices`, `bills`, `payments`, `journal_entries`, `chart_of_accounts`, `accounting_periods`.*
- The audit log itself cannot be edited or deleted by any application-level actor, including admins. **[DONE]**
  *Same citations as the first bullet in this section (`audit.test.ts:134,140`) — these tests run as the application role generally, not scoped to a specific admin identity, so "including admins" is covered by the fact that `app_user` (which every admin request runs as) has no UPDATE/DELETE grant on `audit_log` at all.*
- A permission change (e.g., granting someone AP-approval rights) is itself logged with who granted it and when. **[MISSING]**
  *Confirmed by direct search: no role/permission-grant action exists anywhere in `audit/register.ts`, and this isn't accounting-specific — no such audit entry exists for *any* module's role grants in this codebase today.*
- Locked-period enforcement is tested from every entry point that can write a JE. **[PARTIAL]**
  *Tested from both current entry points (invoice/bill issuance and payment — see §1.3). There is only one enforcement mechanism (`postJournal`'s check) and only two real callers, so "every entry point" is currently a small, fully-covered set — but that coverage will silently stop being complete the moment a third posting path (e.g., a manual JE) is added, since the bullet's real intent is about defense-in-depth across paths, not about today's count.*

---

## 8. Numeric Precision & Rounding

- Money never round-trips through a binary floating-point type anywhere in the pipeline. **[DONE]**
  *`accounting.test.ts:36` ("returns amounts as strings"), `payables.writes.test.ts:349` ("keeps money as strings throughout"), `receivables.writes.test.ts:448` (same) — and overpayment/room checks are explicitly done "in SQL/NUMERIC, not JS float" per the code's own comments (`accounting.repo.ts` `recordPayment`), which the tests exercise indirectly via the overpayment-refusal tests.*
- Every arithmetic operation happens in a fixed-point/decimal representation, with intermediate rounding consistent regardless of code path. **[DONE]**
  *`receivables.writes.test.ts:187`'s round-then-sum test (§3.1) is exactly this, and it was deliberately built with a rate/amount combination chosen to distinguish rounding from truncation.*
- Percentage-based calculations apply to the correct base and don't compound rounding across multiple applications. **[PARTIAL]**
  *Only the FX-rate percentage case is tested (above); tax-rate percentage math is exercised only incidentally via fixture consistency checks (§4), not with a hand-computed expected value chosen to expose a rounding-compounding bug.*
- A currency with zero decimal places (JPY) and one with three (BHD/KWD) are both handled correctly. **[MISSING]**
  *No test uses a non-2-decimal currency anywhere in the accounting fixtures or tests — `grep -c JPY` in the accounting test files returns nothing.*
- Very large amounts (near the storage type's ceiling) don't silently truncate or overflow. **[MISSING]**
  *`NUMERIC(15,2)` gives a real ceiling (~10^13), but no test approaches it.*

---

## 9. Data Integrity & Referential Consistency

- Every JE line references an account in the same tenant/entity as the entry. **[DONE]**
  *`journal_entry_lines.account_id` is `NOT NULL` and FK'd to `chart_of_accounts(id)`; combined with RLS tenant isolation on both tables (§10), a cross-tenant account reference is prevented at the DB level. Not separately tested as its own scenario, but structurally enforced by two independent mechanisms (FK + RLS).*
- Deleting a customer/vendor/product with historical transaction references is blocked, or references are preserved. **[PARTIAL]**
  *No DELETE grant exists on `customers`/`vendors` for `app_user` (§7), so the deletion this bullet worries about is already impossible via the application — but that's a blanket "nothing can delete anything" guarantee, not a deliberate "preserve historical references" design, and it's untested as such.*
- Every monetary column enforces a fixed scale at the database level. **[DONE]**
  *Confirmed directly: every accounting money column is `DECIMAL(15,2)` (or `DECIMAL(12,6)` for `exchange_rate`, `DECIMAL(5,2)` for `discount_percent`) — checked in the `chart_of_accounts`, `journal_entries`, `journal_entry_lines` table definitions. Postgres enforces the scale on every write regardless of application code.*
- Referential integrity holds under concurrent writes. **[MISSING]**
  *No deliberate concurrency-race test exists anywhere in the accounting suite (or found elsewhere in the codebase for this module).*

---

## 10. Access Control & Multi-Tenancy (SaaS-specific)

- Every read and write path enforces tenant isolation, tested as the refused actor. **[DONE]**
  *`row-visibility.test.ts:189` ("tenant isolation still holds underneath") covers this generally; accounting-specifically, the whole `describe("accounting is visible to the finance function, and to nobody else", ...)` block (`row-visibility.test.ts:473-538`) parametrizes over all 15 accounting tables and tests, per table: `finance_admin` sees rows and there ARE rows (`:476`), a plain employee sees none (`:484`), a powerful role from another function (`hr_admin`/`it_admin`/`payroll_admin`) sees none (`:489`), and an owner sees rows (`:497`) — 15 tables × 4 assertions.*
- Role-based restrictions are enforced server-side, not just hidden in the UI. **[DONE]**
  *`row-visibility.test.ts:502` ("an auditor reads accounting but cannot write it") directly attempts a real `UPDATE invoices` as an auditor and asserts zero rows affected (RESTRICTIVE policies filter rather than raise); `:516` ("a plain employee cannot insert a bank account") asserts a real INSERT is rejected with a row-level-security error.*
- A report or export aggregating across "all accessible data" still respects row-level restrictions on sensitive subsets. **[MISSING]**
  *Moot — no export/report feature exists to test (§10's "financial-report export permission tests" is explicitly listed as REMAINING in `testplan-role-security.md`'s own accounting section, for exactly this reason).*
- API/integration tokens carry the same tenant and role restrictions as an interactive session. **[MISSING]**
  *No integration-token concept for accounting exists to test.*
- Exporting data never leaks fields the exporting user isn't permitted to view on-screen. **[MISSING]**
  *Moot — no export feature exists.*

Also directly tested and worth recording even though not a named bullet above: `row-visibility.test.ts:527` ("a malformed claim reads no accounting, rather than raising") — sets `request.jwt.claims` to `'not-json'` and asserts zero rows rather than a 500, matching this codebase's own `app.*` fail-closed convention (L62).

---

## 11. Recurring Transactions, Accruals & Deferrals — **[MISSING]**, entirely
No recurring invoice/bill template, no accrual-reversal logic, and no
deferred-revenue/prepaid-expense amortization exists anywhere in code.
Confirmed by direct search (`rg -il 'recurring|deferred_revenue|accrual'`
under `apps/web/src/lib/server` and `packages`) — every hit is an unrelated
HR/compensation module (time-off policies, holiday accrual balances,
compensation allowances), none of it accounting. This is a genuine
specification gap in `module-accounting.md` itself, not merely an
implementation gap: recurring invoices are Enhancement #7 in
`accounting-gap-analysis.md`, but accrual/deferral aren't mentioned as a gap
in either document, meaning nobody has flagged this as missing before now.

---

## 12. Workflow, Approval & Document Controls

- An approval workflow with multiple thresholds routes correctly at each boundary. **[PARTIAL]**
  *Bill approval has exactly one threshold-free rule tested: approver ≠ creator (`payables.writes.test.ts:293`, §7). There is no amount-based or multi-level routing at all — "at each boundary" doesn't apply because there's only one gate, not several.*
- A rejected transaction returns to a clearly-marked draft/rejected state, not silently posted. **[PARTIAL]**
  *`payables.writes.test.ts:141` ("refuses a bill that is not a draft") and `:148` ("refuses a bill with no lines") confirm the write is refused rather than silently succeeding — but there's no distinct "rejected" state in the bill status enum (only `draft`/approved-equivalent/paid states), so there's no draft→rejected transition to test in the first place.*
- Attachments required by policy above a threshold are enforced as required. **[MISSING]**
  *No attachment-requirement-by-threshold logic exists.*

---

## 13. Period-End / Year-End Close Procedures

- A close checklist's steps can each be verified complete/incomplete, and the period can't lock while one is outstanding. **[MISSING]**
  *No close checklist or close workflow exists at all (§1.4).*
- Comparative financials for a closed prior year remain byte-identical after any later-year activity. **[PARTIAL]**
  *The underlying "no new postings into a closed period" half is [DONE] (§1.3/§1.4's `period_closed` tests) — an already-closed period's *existing* entries can't be added to. But per the top-of-document correction, those existing entries CAN be edited via a direct UPDATE (RLS permits it), so "byte-identical" isn't actually guaranteed — and there's no comparative-financials report to observe drift in anyway (§5).*
- A restatement of a prior closed period is only possible through an explicit, audited reopen-and-relock process. **[MISSING]**
  *No reopen process exists (§1.4).*

---

## 14. Budgeting & Forecasting (if in scope) — **[MISSING]**, entirely
No GL-account-level budget table, comparison report, or variance test exists.
The `budget` field on `projects`/`tasks` is a project-management concept —
confirmed by checking its usage is scoped to those tables, unrelated to the
chart of accounts — and does not roll up through the COA.

---

## 15. Import, Export & Integration Correctness — **[MISSING]**, entirely
No bulk-import path for opening balances or historical transactions, no
export-then-reimport round-trip test, and no payment-gateway integration on
the AR side — confirmed directly: `grep -rln "csv\|CSV\|pdf\|PDF"` under
`apps/web/src/routes/(app)/accounting/` returns nothing. Stripe exists only
under `(admin)/account/billing` for Kaaj's own SaaS subscription billing,
unrelated to customer invoicing.

---

## 16. Regulatory & Compliance Specifics — **[MISSING]**, entirely
No statutory tax report (sales tax summary, VAT return, 1099 filing) exists.
Financial-record retention relies only on the generic `audit_log`
append-only guarantee (§7) — there is no accounting-specific retention
policy or test, and no jurisdiction-specific statutory COA handling (moot
anyway without multi-entity support, §3.4).

---

## 17. Non-Functional (SaaS-specific)

- Performance at realistic multi-year transaction volume. **[MISSING]**
  *All accounting tests run against the small seed fixture; no volume/performance test exists.*
- Backup/restore reconciles to the same trial balance as the source. **[MISSING]**
  *Moot — no trial balance exists to reconcile to (§1.5).*
- Concurrency: two simultaneous postings don't produce a lost update, verified by a deliberate race. **[MISSING]**
  *No concurrency-race test exists (same finding as §9's last bullet).*
- Idempotency: retrying a failed API write after a timeout doesn't double-post. **[PARTIAL]**
  *The closest existing analog is the bank-transaction "already-claimed" refusal (`payables.writes.test.ts:423`) — real idempotency-flavored coverage for matching, but nothing tests a retried `issueInvoice`/`recordPayment`/`approveBill` call specifically for double-posting after a simulated timeout.*

---

## Where this leaves the highest-leverage next steps

Ranked by smallest gap between *what the codebase's own docs already say
should exist* and *reality* — i.e., closing an acknowledged hole rather than
building a new module:

1. **Financial statement reports (§5)** — `module-accounting.md` FR-ACC-007 is
   base spec, not roadmap, and is 0% built.
2. **The two corrections at the top of this document** — settlement FX
   gain/loss is dead code with a live column and a disconnected unit test
   (§3.2), and posted journal entries have no immutability guard at all
   (§1.3/§7) despite RLS otherwise being carefully built for this module.
   Both are real, exploitable-today gaps, not just missing tests.
3. **GL control-account-to-subledger tie-out (§1.5, §6)** — the cheapest
   high-value reconciliation check to add, since the control-account codes
   (`"1100"`, `"2000"`) already exist as constants.
4. **The "feed it something wrong and watch it fail" gap on `postJournal`
   (§1.1)** — the balance guard and the zero-line guard have never been
   observed actually rejecting anything, per this codebase's own L48 rule.
5. **AP aging report (§2.2)** — AR's now exists (§2.1, added 2026-09-13); AP's
   is the remaining commonly-expected report missing from its subledger.
6. **Tax rates as their own accounting concept (§4)** — the `payroll_tax_rates`
   FK is a modeling inconsistency worth fixing before building any tax report
   on top of it.

Fixed assets, inventory, multi-entity consolidation, budgeting, and recurring
transactions/accruals are larger, genuinely unbuilt modules rather than test
gaps in existing code — those are product decisions (see
`accounting-gap-analysis.md`) more than testing ones.
