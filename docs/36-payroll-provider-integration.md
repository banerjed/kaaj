# Payroll through a provider — plan

Status: **proposal, not started.** Scope: US first, built so that other
countries are a new adapter, not a new design.

This plan follows the decision already recorded in
[product-specification.md](product-specification.md) ("Required integration
#1"): integrate a payroll provider rather than build a tax engine, because a
tax table we invent puts a correct-looking number on a payslip
([11-module-roadmap.md](11-module-roadmap.md), Phase 6). It uses the rules
that section sets for every integration: per-tenant sealed credentials, one
verified idempotent ingress pattern, and the `--worker` process from ADR-002.

---

## 0. The decision this plan needs first

The request was "ADP under the covers": the customer uses Kaaj, and ADP
computes pay without the customer seeing ADP. **ADP's documented partner
model does not work that way.** In every ADP developer guide we could read
(sources in §11):

- the employer is already an ADP client, with its own RUN Powered by ADP or
  Workforce Now contract;
- it subscribes to the partner's app on ADP Marketplace and consents to
  data access, after which the partner gets credentials for that one client;
- the partner pushes employees and pay inputs, and pulls results;
- the employer's own payroll practitioner reviews, approves and runs payroll
  **in ADP's screens**. No documented API lets a partner create, submit or
  approve a pay run, or set up a new ADP employer.

The developer portal itself did not render for us and most guides date from
2020–2023, so the last point is *undocumented*, not *impossible*. It is the
first question for ADP (§10, Q1). Until it is answered there are two
products, and they are different:

| | **Mode A — ADP connector** | **Mode B — embedded payroll** |
|---|---|---|
| Who has the payroll contract | the customer, with ADP | Kaaj (the platform), with the provider |
| Who approves a run | the customer's practitioner, in ADP | the customer, in Kaaj |
| Does the customer see ADP | yes | no |
| Provider | ADP (RUN, Workforce Now) | Check, Gusto Embedded or Zeal in the US; Deel or Remote for global; ADP only if it offers a white-label arrangement |
| Customer acquisition | only businesses that already pay ADP | any business |
| Kaaj's liability for filings and money movement | none (ADP's contract) | shared with the provider, per its agreement |

**What does not depend on the mode** — most of the build:

- Kaaj is the system of record for people, pay, time, deductions and
  withholding inputs. The provider is the system of record for gross-to-net,
  tax, filing and money movement.
- A provider **port** in Kaaj, with one adapter per provider product. ADP RUN,
  ADP Workforce Now and an embedded provider are three adapters behind one
  interface.
- The infrastructure: the worker, the ingress route, the outbound client,
  sealed credentials, code mappings, result import, and ledger posting.

**Recommendation.** Ask ADP Q1–Q2 before writing adapter code, and build the
mode-independent core (Phases 1–2) in the meantime. If ADP confirms Mode A
only, decide whether "under the covers" or "ADP" matters more: Mode A serves
customers who already run ADP; Mode B needs a different provider for
everyone else. Supporting both is possible because of the port, but it is
two certifications and two support stories.

---

## 1. What exists today

- **Schema** — complete enough to hold results: `payroll_runs` (lifecycle
  `draft → calculated → approved → finalized → paid`, a CHECK that the
  calculator is not the approver), `payroll_run_employees` (one line per
  person: hours, JSONB `earnings`/`taxes`/`deductions` as money strings, YTD
  columns), `payroll_pay_schedules`, `payroll_deduction_definitions`,
  `payroll_employee_deductions`, `payroll_tax_withholding_certificates`
  (W-4), `employee_bank_accounts` (sealed account and routing numbers, split
  deposits), `compensation_*`, `employees.ssn_tax_id_ct`.
- **Code** — `payroll_runs.repo.ts` moves a run through its states and
  audits each move. "Calculate" only re-sums lines; **no code writes
  `payroll_run_employees`**, so every amount comes from the fixture.
- **Not there yet**, all needed here:
  - no webhook or ingress route anywhere;
  - the `jobs` table exists (ADR-002) but nothing reads or writes it, and
    there is no `--worker` process;
  - the one outbound HTTP call (`fx_rates.ts`) has no timeout or retry;
  - nothing posts payroll to the ledger.
- **A pattern to reuse** — Stripe's key is sealed per tenant
  (`payment_gateway_settings.secret_key_ct`, tenant subject) and called
  outside any transaction: read in one transaction, call the provider, write
  the result and the audit entry in a second transaction.

---

## 2. Responsibilities

| Data | Owner | Direction |
|---|---|---|
| Employee identity, job, location, employment dates | Kaaj | → provider |
| Compensation (salary, hourly rate, allowances) | Kaaj | → provider |
| Hours (time tracking, attendance), one-time payments | Kaaj | → provider, per pay period |
| Deductions and garnishments | Kaaj | → provider |
| W-4 and state withholding | Kaaj (employee self-service) | → provider |
| Direct deposit accounts | Kaaj (sealed) | → provider |
| Pay schedule and pay calendar | provider (Mode A) or Kaaj (Mode B) | mirrored both ways |
| Gross-to-net, employee and employer taxes | provider | → Kaaj, as results |
| Filing, deposits, W-2 | provider | → Kaaj (documents, where the API offers them) |
| Ledger journal for a run | Kaaj, from imported results | internal |

**Changes made directly in ADP (Mode A).** Mode A customers can edit data in
ADP. The adapter reads change notifications and reports differences: it does
**not** overwrite Kaaj silently, because Kaaj's audit trail must record who
changed a salary. A difference is a task for HR, shown on a reconciliation
page.

---

## 3. Architecture

### 3.1 The port

`packages/payroll-provider` — plain TypeScript, no Svelte, per the
framework-agnostic rule. Sketch:

```ts
export interface PayrollProvider {
  readonly id: ProviderId                  // "adp-run" | "adp-wfn" | "fake" | ...
  capabilities(country: CountryCode): Capabilities   // what this adapter can do there

  // connection
  connect(input: ConnectInput): Promise<Connection>  // consent / credential exchange
  health(conn: Connection): Promise<HealthReport>

  // outbound sync — idempotent by Kaaj's own key
  upsertWorker(conn: Connection, w: WorkerRecord): Promise<ExternalRef>
  terminateWorker(conn: Connection, ref: ExternalRef, on: IsoDate): Promise<void>
  setWithholding(conn: Connection, ref: ExternalRef, w: Withholding): Promise<void>
  setDeposit(conn: Connection, ref: ExternalRef, d: DepositSplit[]): Promise<void>
  submitPayInputs(conn: Connection, period: PayPeriod, rows: PayInputRow[]): Promise<SubmissionRef>

  // run control — Mode B only; Mode A adapters report "unsupported"
  previewRun?(conn: Connection, period: PayPeriod): Promise<RunPreview>
  approveRun?(conn: Connection, run: ExternalRef): Promise<void>

  // inbound
  listRuns(conn: Connection, since: IsoDate): Promise<ExternalRun[]>
  fetchRunResults(conn: Connection, run: ExternalRef): Promise<RunResult>
  verifyNotification(headers: Headers, body: string): Notification | null
}
```

Rules for every type in the port:

- **Money is a decimal string**, as everywhere in Kaaj. An adapter parses a
  provider's JSON **without** `JSON.parse` turning amounts into float64
  (a lossless parser, or a reviver over the raw text). This applies to
  inbound data as much as to forms.
- **Every outbound call carries Kaaj's idempotency key** (the job id), so a
  retried job never creates a second worker or a second batch.
- `capabilities()` is how other countries arrive: the run page and the sync
  ask the adapter what it supports for `run.country` instead of branching on
  provider names.

### 3.2 Flow

```
Kaaj write (hire, pay change, W-4, deposit, hours)
  └─ same transaction: audit entry + jobs row (job_type 'payroll_sync')
        └─ worker: claim (FOR UPDATE SKIP LOCKED) → adapter call → record ExternalRef
              └─ failure: retry with backoff; 429 → honour rate limit; final failure → task for HR

Pay period close
  └─ job 'payroll_inputs': gather hours + one-time pay → submitPayInputs

Provider finishes a run (ADP: practitioner approves in ADP)
  └─ notification (webhook → ingress route, or 5-minute poll by the worker)
        └─ job 'payroll_import': fetchRunResults → payroll_runs + payroll_run_employees
              └─ same transaction: ledger journal + audit entry
```

### 3.3 Run lifecycle

| Kaaj state | Mode A (ADP) | Mode B (embedded) |
|---|---|---|
| `draft` | created when Kaaj sends the period's inputs | created by the user |
| `calculated` | set by import, from ADP's results | set by `previewRun` |
| `approved` | set by import; `approved_by` is **not** a Kaaj user — the run records the external approver's name and the provider as the actor | Kaaj user, through the existing approve action; the calculator-is-not-approver CHECK applies unchanged |
| `finalized`/`paid` | from the provider's status | from the provider's status |

INV-PAY-001 (a run does not change after approval) holds in both modes:
after import, lines are written once. A correction in the provider arrives as
a new run (an off-cycle or adjustment run), never as an edit. Mode A needs a
schema change, because `approved_by` is a Kaaj user id today: add
`approved_externally_by text` and `approval_source`, with a CHECK that exactly
one of the two is set.

---

## 4. Data model

Each new table needs, in the same change: `tenant_isolation` plus a decision
on a visibility policy, a class in `matrix.ts`, a scale class in
`verify-query-scale.mjs`, audit-register entries for every action that
writes it, fixture rows with no empty column, and a line in
`docs/22-test-inventory.md` for its tests.

| Table | Purpose | Visibility | Scale |
|---|---|---|---|
| `payroll_provider_connections` | one per tenant and provider: provider id, product, external organization id, `credentials_ct` (sealed, tenant subject, like Stripe), consent state, last health check | owner and payroll admin | bounded |
| `payroll_external_refs` | Kaaj id ↔ provider id, for employees, runs and submissions (`entity_type`, `entity_id`, `external_id`, `UNIQUE (tenant_id, provider, entity_type, entity_id)`) | payroll readers | grows with employees and runs: SCALE_SENSITIVE |
| `payroll_code_mappings` | Kaaj earning and deduction codes ↔ the client's ADP codes (ADP rejects inputs with codes the client has not set up) | tenant-wide, write by payroll admin | bounded |
| `payroll_provider_events` | inbound notifications: dedupe key (`UNIQUE`), verified flag, received time, **minimal** payload | payroll admin only | SCALE_SENSITIVE |
| `jobs` | the existing table, used for the first time | — | already classified |

**No raw provider payloads.** A pay-run response holds salaries, tax ids
and bank details. The import writes the parsed fields into the existing
protected columns and keeps no raw copy. If one is needed for debugging, it
is sealed and expires after 30 days.

**Partner-level secrets are not tenant data.** ADP's partner client
credentials and the mutual-TLS certificate and key belong to Kaaj, not to a
tenant. They live in the server's secret store, never in a `PUBLIC_`
variable, and the code that reads them joins the service-role quarantine
list. The certificate expires two years after issue: the
`check-error-rates.mjs`-style cron alerts 30 days before.

---

## 5. Infrastructure to build first

These are general and outlive this integration; product-specification.md
already asks for each.

1. **The worker** — a second entry point to the same build, `node build
   --worker`, that claims `jobs` rows with `FOR UPDATE SKIP LOCKED`, runs
   them as the tenant's actor, records `attempts` and `last_error`, and
   backs off. Deployment: a second process on the same host (docs/12).
2. **The ingress route** — one verified, idempotent pattern for every
   inbound notification: signature check (ADP: `adpx-messageauthentication`),
   replay window, dedupe key into `payroll_provider_events`, tenant resolved
   from the connection (never from the body), audited, and only then a job.
   Polling (ADP: every 5 minutes at most) feeds the same path.
3. **An outbound HTTP client** in `$lib/server/http`: timeouts, retry on
   429/5xx with backoff, mutual TLS, and errors through `safeError` with
   request bodies never logged.
4. **The token cache** — ADP tokens last 60 minutes and must be reused. A
   module-level cache in a Node process that serves every tenant is the
   shape of a cross-tenant disclosure (CLAUDE.md, Svelte, module scope).
   Key the cache by connection id and keep it inside the worker; never share
   one token between tenants.

---

## 6. Security and PII

- **What leaves Kaaj.** Mode A sends SSN, date of birth, address, W-4 data
  and bank account and routing numbers to ADP. Each value is opened with
  `openField` in the worker, sent, and never logged. The disclosure matrix
  gains a "sent to provider" note on each of these columns.
- **Who can trigger it.** Only actions that already require
  `payroll.run`/`compensation.write`/`pii.reveal` enqueue sync jobs. The
  worker re-checks that the connection is active and consented.
- **Erasure.** Kaaj's erasure destroys the employee's key. The copy in ADP
  is outside that. Erasure must (a) send a terminate to the provider, (b)
  record that statutory payroll records stay with the provider for their
  legal retention period, and (c) say so in docs/13. Legal review needed.
- **Audit.** Every sync records an audit entry with the job id and the
  fields sent (names only, never values), in the transaction that enqueues
  it. Every import records one with the run totals as strings.
- **Errors.** Provider error bodies can echo the payload. They go through
  `safeError` and are truncated before `last_error` or `app_error_log`.

---

## 7. Accounting

ADP exposes no general-ledger API that we found. Kaaj posts the journal
itself from the imported results, through the existing journal path, so the
`gl_daily_balances` triggers and the `ledger/daily-balances-agree`
invariant apply without new work:

- gross pay → payroll expense, by department (cost centre accounts exist);
- employee taxes and deductions → liability accounts per jurisdiction;
- employer taxes → expense and liability;
- net pay → cash clearing.

Account mapping is a settings page (`payroll_gl_mappings`, bounded). This
also satisfies INV-PAY-002 (run lines reconcile to totals and to the
ledger).

---

## 8. Other countries

- ADP is a different system, and a different integration, per region:
  Workforce Now covers the US and Canada; Europe runs on separate endpoints
  with EU data residency; GlobalView's partner APIs are read-only; pay input
  APIs exist for specific products (UK iHCM, Brazil, Payroll@ADP). Each is a
  new adapter and a new ADP certification.
- The port and `capabilities(country)` keep the rest of Kaaj unchanged. The
  schema already carries `country` on runs, lines, offices and bank
  accounts, and India-specific columns exist.
- For Mode B outside the US, Deel and Remote offer embedded global payroll
  APIs; they would be adapters too.
- `packages/validation` already validates the identifiers each country
  needs (SSN, PAN, IFSC, IBAN, SIN, NI number), so outbound records can be
  checked before they leave.

---

## 9. Phases

Each phase ends with `./check --all` green and a working, reviewable slice.

| Phase | Delivers | Exit criteria |
|---|---|---|
| **0. Decide** | ADP answers to §10, the mode decision, ADP partner application and sandbox (or an embedded provider's sandbox) | Mode chosen in writing; sandbox credentials in hand |
| **1. Infrastructure** | worker, ingress route, HTTP client, `payroll_provider_connections`, sealed credentials, the port package and a **fake adapter** | a job round-trips through the worker in tests; a forged notification is refused; the fake adapter passes the port's contract tests |
| **2. Connect** | settings page to connect a provider (ADP: subscription event, consent, credential exchange), health check, code mappings | a sandbox client connects, and disconnects cleanly |
| **3. People out** | worker sync: hire, change, terminate, W-4, direct deposit; `payroll_external_refs`; reconciliation page for differences made in ADP | every fixture employee exists in the sandbox; re-running the sync changes nothing |
| **4. Inputs out** | pay inputs from time tracking, attendance and one-time pay, per period, batched (ADP: 100 rows), with the "504 but saved" read-back | a period's hours appear in the sandbox for the practitioner to approve |
| **5. Results in** | import into `payroll_runs`/`payroll_run_employees`, lifecycle mapping, payslips show real amounts | an approved sandbox run appears in Kaaj with amounts equal to ADP's, to the cent, as strings |
| **6. Ledger** | journal per run, account mapping page | the journal balances; the invariant holds; INV-PAY-002 test passes |
| **7. Second product, then countries** | Workforce Now (if Phase 3–6 used RUN), then the first non-US region | per adapter, the same exit criteria |

**Tests.** No network call runs in `./check`. The fake adapter covers the
application; contract tests replay recorded sandbox responses against each
real adapter, and a separate, manual job runs them against the live
sandbox. Each security rule above is tested as the refused actor, and each
guard is watched failing once.

---

## 10. Questions for ADP

1. Is there a partner API to create, submit or approve a pay run, or a
   white-label arrangement in which the employer never uses ADP's screens?
2. Can a partner sign up a business that is not yet an ADP client (for
   example, provision a RUN company), or must every customer already be one?
3. Revenue share and other terms of the Developer's Participation
   Agreement; usual duration of the security review.
4. US APIs for pay statement PDFs, W-2s and general-ledger output on RUN
   and Workforce Now?
5. A rate tier above 300 calls a minute per client; and is RUN's
   12-second limit on pay input (a 504 above about 100 employees, with the
   data saved) fixed?
6. Can one integration serve RUN and Workforce Now, or are two listings and
   two certifications needed?
7. The international route: which products accept pay input by API, and is
   there one partner agreement or one per region?
8. US data residency, retention and subprocessor terms for client data a
   partner holds.

---

## 11. Sources

ADP's partner and API guides, published at
`marketplace-cdn.adp.com/dev-portal/pdf/…` (developers.adp.com did not
render; most guides are dated 2020–2023, the webhooks guide October 2025):
Marketplace Partner Development Learning Guide; RUN Powered by ADP API
Catalog; Payroll Data Input API guides for RUN and for Workforce Now;
Payroll Output API guides for RUN and for mid-sized to enterprise (Turbo);
Introduction to Credentials; Marketplace Integration Standards; Webhooks;
Web API Gateway Rate Limit Policy; Worker Management, Termination, Rehire
and U.S. Federal Tax Withholding guides; ESI Marketplace API Catalog for
GlobalView. API Central pricing from apps.adp.com listing 410612.
Embedded alternatives: docs.gusto.com/embedded-payroll, docs.checkhq.com,
docs.zeal.com, developer.deel.com, embedded.remote.com.

Re-verify every endpoint and limit against ADP's current documentation in
Phase 0; this plan quotes them only to size the work.
