# SOC 2 Test Plan

**Status:** draft — readiness baseline taken 2026-09-27 at `95772d3`
**Created:** 2026-09-27
**Scope:** Everything a SOC 2 Type I and Type II examination of Kaaj will test,
written as the tests a service auditor and a penetration tester would run, with
Kaaj's own controls, evidence and current gaps mapped onto each.

---

## 0. How to read this document

This plan joins the spec-based set in [testplan-index.md](./testplan-index.md).
It does not repeat what those plans already cover; it points at them:

| Already covered in | What this plan adds |
|---|---|
| [testplan-role-security.md](./testplan-role-security.md) | RBAC/ABAC/field-level cases → reused as CC6.1–CC6.3 evidence |
| [testplan-high-risk-invariants.md](./testplan-high-risk-invariants.md) | payroll/accounting invariants → reused as PI1.x evidence |
| [15-row-level-visibility.md](./15-row-level-visibility.md), [16-disclosure-verification.md](./16-disclosure-verification.md) | disclosure design → reused as C1.1 / CC6.1 evidence |
| [13-pii-encryption.md](./13-pii-encryption.md) | envelope encryption → reused as CC6.1 / CC6.7 / C1.2 / P4.3 evidence |

A SOC 2 examination tests **controls** — things the organisation does
repeatedly and can prove it did — not just software behaviour. So every test
below states four things:

- **Criterion** — the AICPA Trust Services Criterion it supports.
- **Control** — what Kaaj does (or must start doing).
- **Test** — how an auditor or tester verifies it: inquiry, observation,
  inspection, reperformance, or a technical attack.
- **Status** — `EXISTS` (implemented, with evidence), `PARTIAL`, or `GAP`,
  from the repo survey of 2026-09-27. A `GAP` is a readiness finding, not a
  failed audit: it is exactly what a readiness assessment is for.

Identifiers are `SOC-<area>-<n>`. The gap register in §9 collects every `GAP`
and `PARTIAL` in priority order.

---

## 1. Engagement framing

### 1.1 Report type and timeline

| Phase | Duration | Output |
|---|---|---|
| Readiness (this plan, §9 remediation) | 2–3 months | gaps closed, policies approved, evidence collection automated |
| **Type I** — design at a point in time | 1 month fieldwork | first report customers can see |
| **Type II** — operating effectiveness | 6-month observation window (3 is the permitted minimum; enterprise buyers expect 6–12), then fieldwork | the report that answers security questionnaires |
| Continuous | every 12 months | Type II renewal, with a bridge letter between periods |

A Type I tests that controls are *designed* correctly; a Type II tests that
they *operated* throughout the window. Every control in this plan therefore
needs evidence that accumulates **over time**, not a screenshot on the day
(see §8.3 on CI log retention, the first place this bites).

### 1.2 Trust Services Categories in scope

| Category | Recommendation | Why |
|---|---|---|
| **Security (CC1–CC9)** | Required | Every SOC 2 includes it |
| **Availability (A1)** | Include | Payroll and invoicing are time-critical for customers |
| **Confidentiality (C1)** | Include | Compensation, ledgers and HR records are the product |
| **Processing Integrity (PI1)** | Include | Kaaj computes pay, tax and ledger postings; a wrong number is the failure customers fear most |
| **Privacy (P1–P8)** | Defer to year 2 | Kaaj is mostly a *processor* for customers' employee data; GDPR/DPDP obligations are tested in §6.6 regardless |

### 1.3 System boundary (DC 200 system description)

The system description (AICPA DC 200) must name every component. From
[24-deployment-and-pooling.md](./24-deployment-and-pooling.md) and the code:

| Component | Role | In boundary? |
|---|---|---|
| SvelteKit app (`apps/web`, adapter-node) | frontend + backend | Yes |
| Render (Virginia) | runs the app container, worker, chat relay | Subservice — **carve-out** |
| Supabase (`us-east-1`) | Postgres, Auth, Storage; one project per premium tenant | Subservice — **carve-out** |
| Cloudflare | DNS, TLS, WAF, DDoS | Subservice — **carve-out** |
| Stripe | subscription billing, invoice payment links | Subservice — **carve-out** |
| Bird | outbound email, SMS | Subservice — **carve-out** |
| GitHub + GitHub Actions | source control, CI | Subservice — **carve-out** |
| `PRIVATE_PII_KEK` storage | key-encryption key, backed up separately from the database | Yes — Kaaj's own control |

**Carve-out** means the auditor does not test the vendor's controls; Kaaj
lists the *complementary subservice organization controls* (CSOCs) it relies on
and proves it monitors the vendor (§7.2).

### 1.4 Complementary user entity controls (CUECs)

Controls Kaaj relies on its **customers** to perform. These go in the report,
and the product should make each one easy:

| CUEC | Supporting product feature |
|---|---|
| Customers provision and de-provision their own users promptly | De-provisioning EXISTS: ending an employee's employment revokes their `tenant_users` membership, audited as `role_revoke` (`employees/[id]/edit`). Provisioning is a **GAP** — no page invites a user |
| Customers assign roles on least privilege, and review them | user groups (`/settings/groups`); per-user role assignment has no page yet |
| Customers enable MFA for their users | **GAP** — MFA is not offered yet (SOC-CC6-12) |
| Customers review the audit log for their tenant | **GAP** — `audit_log` is recorded, but no page shows it to a customer |
| Customers protect exported data once it leaves Kaaj | none — needs a warning at export |
| Customers keep portal contacts current | customer portal admin (verify it exists before relying on it) |

A CUEC the product gives customers no way to perform is not a control the
report can list. The gaps above must be built, or the CUEC dropped, before
the system description is written.

---

## 2. Test methodology

### 2.1 Test types

| Method | Used for | Never sufficient alone |
|---|---|---|
| **Inquiry** | how a control works | always corroborated |
| **Observation** | a control performed live (a deploy, an access review) | point-in-time only |
| **Inspection** | tickets, approvals, configs, logs | must prove completeness of the population |
| **Reperformance** | re-running the control: re-query RLS as a refused actor, re-run `./check` | strongest evidence |
| **Technical testing** | penetration testing and vulnerability scanning (§5) | evidence for CC4.1 and CC7.1 |

### 2.2 Sample sizes (Type II)

Sampling is the auditor's judgement, not a fixed table. The ranges below are
the ones commonly seen in practice (AICPA Audit Sampling Guide, ~90%
confidence), and are what this plan prepares evidence for:

| Control frequency | Population in 6 months | Typical sample |
|---|---|---|
| Annual | 1 | 1 (100%) |
| Quarterly | 2 | 2 |
| Monthly | 6 | 2–3 |
| Weekly | ~26 | 5–10 |
| Daily | ~180 | 20–40 |
| Many times a day (deploys, PRs, access requests) | hundreds | 25–60 |
| **Automated** (a CI gate, an RLS policy) | — | 1 reperformance, **plus** proof the automation itself was under change control all period |

That last row matters for Kaaj: most controls here are automated (`./check`,
RLS, CI). An automated control is tested once, *if* the auditor can rely on the
change-management controls over the code that implements it (CC8.1). If
`main` is unprotected, that reliance fails and every automated control must be
sampled like a manual one. SOC-CC8-01 is therefore the highest-leverage fix in
this plan.

### 2.3 Information produced by the entity (IPE)

Any report Kaaj hands the auditor — a user list, a deploy list, a query export —
must itself be shown **complete and accurate**: the query text, who ran it,
when, and against which database, captured at the time. A population
extracted by a query that silently filtered rows is a failed test. Every
evidence query in this plan should be committed under
`packages/database/evidence/` and run by a script that records its own
provenance (SOC-CC4-03).

### 2.4 Deviation handling

- One deviation in a small sample usually fails the control for the period.
- A deviation found by Kaaj, documented, and remediated *before* the auditor
  finds it is still a deviation, but reported with management's response.
- Record every deviation in the risk register (SOC-CC3-02) with root cause.

---

## 3. Common Criteria — organisational controls (CC1–CC5)

These are mostly policy and people controls. For a small company the auditor
accepts proportionate versions (a founder acting as the governance body, for
example), provided they are **documented and evidenced**.

### CC1 — Control environment

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC1-01 | CC1.1 integrity and ethics | Code of conduct; acceptable use policy | Inspect policy, version history, signed acknowledgements for a sample of staff and contractors | GAP |
| SOC-CC1-02 | CC1.2 board oversight | Named governance body (board or founders) reviews security quarterly | Inspect meeting minutes for each quarter in the window | GAP |
| SOC-CC1-03 | CC1.3 structure, reporting lines | Org chart; named security owner; RACI for controls | Inspect org chart and a control-owner list covering every control in this plan | GAP |
| SOC-CC1-04 | CC1.4 competence | Background checks (where lawful); role descriptions; annual security training | Sample new hires: check background-check evidence and training completion within 30 days | GAP |
| SOC-CC1-05 | CC1.5 accountability | Disciplinary policy; security responsibilities in contracts | Inspect contracts/offer letters for a sample of staff | GAP |

### CC2 — Communication and information

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC2-01 | CC2.1 quality information | Security-relevant information is produced by systems of record: `audit_log`, `app_error_log`, CI results | Reperform: confirm `audit_log` is append-only (INSERT/SELECT grants only, CLAUDE.md "Tenancy, audit and disclosure") | EXISTS |
| SOC-CC2-02 | CC2.2 internal communication | Policies published internally; changes announced | Inspect policy portal and change notices | GAP |
| SOC-CC2-03 | CC2.3 external communication | Security page, status page, `security.txt`, responsible-disclosure channel, customer notification process | Inspect `/.well-known/security.txt`; submit a test report to the disclosure channel and time the response | GAP |
| SOC-CC2-04 | CC2.3 | Customer-facing system description and CUEC list (§1.4) | Inspect | GAP |

### CC3 — Risk assessment

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC3-01 | CC3.1 objectives | Written security objectives and service commitments (SLA, RPO/RTO, breach-notification window) | Inspect; confirm the commitments in customer contracts match | GAP |
| SOC-CC3-02 | CC3.2 risk identification | Annual risk assessment + risk register; `docs/10-lessons-learned.md` feeds it | Inspect register: each risk has an owner, likelihood/impact, treatment, review date | PARTIAL — the lessons file is an excellent incident/risk record but is not a register |
| SOC-CC3-03 | CC3.3 fraud risk | Fraud risk assessment: payroll (pay changes, bank detail changes), accounting (journal manipulation), insider access | Inspect assessment; confirm the separation-of-duties controls it names exist (payroll `calculated_by` ≠ `approved_by`, bill approval, self-approval refusal on time entries) | PARTIAL — the controls exist in code, the assessment does not |
| SOC-CC3-04 | CC3.4 change impact | New modules, vendors and architecture changes trigger a risk review | Inspect ADRs (`05-architecture-decisions.md`) for risk sections; sample new vendor additions | PARTIAL |

### CC4 — Monitoring activities

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC4-01 | CC4.1 ongoing evaluation | `./check` (26 steps) runs on every push via CI | Reperform `./check --all`; inspect CI history for the whole window: every commit that reached production passed | PARTIAL — see SOC-CC8-01 (no branch protection means a red CI does not block `main`) |
| SOC-CC4-02 | CC4.1 separate evaluation | Annual third-party penetration test (§5) and quarterly internal review of this plan | Inspect pentest report, scope letter, retest letter | GAP |
| SOC-CC4-03 | CC4.1 | IPE: evidence queries are committed and self-documenting (§2.3) | Inspect `packages/database/evidence/` and a run log | GAP |
| SOC-CC4-04 | CC4.2 deficiencies communicated | Findings tracked to closure with owners and due dates | Inspect tracker; sample 5 findings for timely closure | GAP |

### CC5 — Control activities

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC5-01 | CC5.1 control selection | This plan's control list is approved and mapped to risks | Inspect approval | GAP |
| SOC-CC5-02 | CC5.2 technology general controls | Access, change, operations controls in CC6–CC8 | See those sections | — |
| SOC-CC5-03 | CC5.3 policies deployed | Policy set: information security, access control, change management, incident response, BCP/DR, vendor management, data classification and retention, acceptable use, encryption/key management, secure development, vulnerability management, logging and monitoring, privacy | Inspect each: owner, approval, annual review date, staff acknowledgement | GAP — engineering *rules* are exceptionally well written (CLAUDE.md, CODING_GUIDELINES.md) and can be lifted into the secure-development and data-handling policies almost verbatim |

---

## 4. Common Criteria — technical controls (CC6–CC9)

### CC6 — Logical and physical access

#### CC6.1 — Logical access security (tenancy, RLS, encryption)

This is Kaaj's strongest area, and the one a penetration tester will attack
hardest (§5.2).

| ID | Control | Test | Status |
|---|---|---|---|
| SOC-CC6-01 | Every table has RLS enabled and **forced**; tenancy by `tenant_id` | Reperform `verify-rls.sql` (731 isolation checks across 121 tables): phase A fixture exists, B owner sees own, C no cross-tenant leak, D fail-closed on no claim | EXISTS |
| SOC-CC6-02 | Every table is classified row-scoped / per-column / tenant-wide, and each row-scoped claim is verified against `pg_policies` | Reperform `verify-matrix-complete.mjs`; confirm `EXPOSED_PENDING` is empty | EXISTS (0 exposed since `95772d3`) |
| SOC-CC6-03 | The app connects as `app_user` (not owner, no BYPASSRLS); service role quarantined to a committed file list | Query `pg_roles` for `app_user`: `rolbypassrls = false`, `rolsuper = false`; reperform `verify-service-role.mjs` | EXISTS |
| SOC-CC6-04 | Every `SECURITY DEFINER` function sets `search_path` and pins itself to `app.current_tenant_id()` | Inspect `pg_proc WHERE prosecdef`; for each, call with another tenant's id and with a malformed claim; expect no effect | PARTIAL — `app.refresh_time_hours`/`next_time_entry_number`/`can_see_folder` follow the pattern; no automated check enumerates `prosecdef` functions (add one to `verify-invariants.sql`) |
| SOC-CC6-05 | Claim parsing never raises (fail-closed quietly) | Reperform the `claims/fail-closed-quietly` invariant | EXISTS |
| SOC-CC6-06 | PII encrypted in the application with AES-256-GCM, bound to tenant\|table\|column\|row, per-subject keys | Reperform `pii.test.ts`; attempt to move a ciphertext between rows/tenants and confirm decrypt fails | EXISTS |
| SOC-CC6-07 | KEK (`PRIVATE_PII_KEK`) stored outside the database, backed up separately, rotation procedure exists (`rewrapSubject`) | Inspect secret store and backup record; observe a rotation in staging | PARTIAL — mechanism exists; key custody and rotation procedure are not documented as a control |

#### CC6.2 / CC6.3 — Provisioning, roles, reviews

| ID | Control | Test | Status |
|---|---|---|---|
| SOC-CC6-08 | Role bundles in `@kaaj/authz` mirrored by SQL helpers; a conformance test keeps them in agreement | Reperform `row-visibility.test.ts` "RLS and can() agree" and `authz-conformance.spec.test.ts` | EXISTS |
| SOC-CC6-09 | Every page `load()` checks its own read permission (L79); every form action authorizes | Reperform `verify-authz.mjs`; manual spot-check 10 routes with a refused actor | EXISTS |
| SOC-CC6-10 | **Internal** access to production (Supabase dashboard, Render, Cloudflare, GitHub, Stripe) granted by ticket with approval | Sample every access grant in the window: request, approver, date | GAP |
| SOC-CC6-11 | Quarterly access review of every production system; leavers removed within 24 h | Inspect review sign-offs each quarter; compare HR leaver dates to account removal timestamps | GAP |

#### CC6.5 / CC6.6 — Credentials and authentication

| ID | Control | Test | Status |
|---|---|---|---|
| SOC-CC6-12 | **End-user MFA** available, and enforced for privileged roles (owner, firm_admin, hr_admin, payroll_admin, finance_admin) | Attempt to reach payroll/pay pages with a password-only session; expect step-up to AAL2 | **GAP** — `[auth.mfa.totp] enroll_enabled = false`; no `aal2` check anywhere in `apps/web/src` |
| SOC-CC6-13 | Password policy per NIST SP 800-63B-4: ≥ 15 characters if password-only (≥ 8 when MFA is enforced), accept 64+, allow paste, no composition rules, breached-password screening | Reperform against **production** auth settings via the Supabase Management API | **GAP** locally (`minimum_password_length = 6`, `password_requirements = ""`); verify production |
| SOC-CC6-14 | Operator MFA on Supabase org (enforced), GitHub org, Render, Cloudflare, Stripe, Bird, domain registrar; at least two org owners on each | Inspect each org's MFA-enforcement setting and owner list | GAP — not evidenced |
| SOC-CC6-15 | Sessions: short-lived JWT (900 s), refresh-token rotation with reuse detection, logout revokes refresh token | Capture a refresh token, log out, replay it; expect 401. Replay a rotated token after the 10 s reuse interval; expect family revocation | PARTIAL — configured (`jwt_expiry = 900`, rotation on); replay tests not written |
| SOC-CC6-16 | Re-authentication for sensitive changes (password, email, bank details) | Change password with a 2-day-old session; expect re-auth | GAP locally (`secure_password_change = false`) |
| SOC-CC6-17 | Email confirmation required for sign-up | Sign up with an unowned address; expect no session until confirmed | GAP locally (`enable_confirmations = false`); verify production |
| SOC-CC6-18 | Secrets never in the repo; `.env*` gitignored; secret scanning on push | Run `gitleaks detect` over full history; enable GitHub secret scanning + push protection | PARTIAL — gitignore correct; no scanning |
| SOC-CC6-19 | Machine credentials least-privileged: `app_user` has no DELETE anywhere; service role only in 7 files | Reperform grant snapshot `06-grants.txt` review | EXISTS |

#### CC6.4 — Physical access

| ID | Control | Test | Status |
|---|---|---|---|
| SOC-CC6-20 | No Kaaj-operated data centre; physical security inherited from Supabase/AWS, Render, Cloudflare | Obtain each vendor's current SOC 2 Type II; confirm CC6.4 has no exceptions; record as CSOC | GAP — reports not yet collected |
| SOC-CC6-21 | Endpoint security for staff laptops: disk encryption, screen lock, OS updates, EDR/MDM | Inspect MDM compliance export for every device with production access | GAP |

#### CC6.7 — Transmission and removal of data

| ID | Control | Test | Status |
|---|---|---|---|
| SOC-CC6-22 | TLS 1.2+ everywhere; HSTS with `includeSubDomains`; Cloudflare "Full (strict)" to origin | `testssl.sh` / SSL Labs against apex and a tenant subdomain: grade A, no TLS 1.0/1.1, no weak ciphers | GAP — verify at launch; no HSTS header is set by the app (SOC-WEB-01) |
| SOC-CC6-23 | Database connections require SSL (Supabase "SSL Enforcement") and network restrictions allow only Render egress | Attempt a non-SSL connection and a connection from an unlisted IP; both refused | GAP — verify in production |
| SOC-CC6-24 | Exports (payroll files, PDFs, reports) are authorized, audited and logged | Sample exports: each has an audit entry naming actor and scope | PARTIAL — invoice PDF gated; export audit coverage not verified end to end |
| SOC-CC6-25 | Storage buckets private; objects scoped by tenant path (`storage.foldername`) | Request another tenant's object path with a valid session; expect 403. List a bucket anonymously; expect denial | EXISTS for documents/logo policies; add as automated test |

#### CC6.8 — Malicious software

| ID | Control | Test | Status |
|---|---|---|---|
| SOC-CC6-26 | Uploaded files: size cap (25 MB), content-type validation, never served with executable types, no inline HTML/SVG rendering | Upload `.html`, `.svg` with script, polyglot PDF, zip bomb, EICAR test file; confirm stored as attachment with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` | PARTIAL — size cap exists (`upload.ts`); MIME taken from the browser (`file.type`), not sniffed; no malware scan |
| SOC-CC6-27 | Dependencies pinned (`--frozen-lockfile`), scanned daily, updated on a schedule | Inspect Dependabot/Renovate PR history and `pnpm audit` in CI | **GAP** — no `.github/dependabot.yml`, no audit step |

### CC7 — System operations

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC7-01 | CC7.1 | Weekly authenticated DAST (OWASP ZAP baseline in CI + full scan weekly) against staging | Inspect scan history for every week in the window; confirm findings ticketed | GAP |
| SOC-CC7-02 | CC7.1 | SAST on every PR (CodeQL or Semgrep with `p/owasp-top-ten` + custom rules for `tx.unsafe`) | Inspect PR checks | GAP |
| SOC-CC7-03 | CC7.1 | Schema drift detection: structure snapshot; `verify-remote.sh` read-only verification after each production migration | Reperform `verify-remote.sh` against production (read-only) | EXISTS (snapshot); PARTIAL (production run not evidenced) |
| SOC-CC7-04 | CC7.1 | Vulnerability remediation SLAs, risk-based (exposure × known exploitation × impact, the model of CISA BOD 26-04): KEV-listed on an internet-facing asset ≤ 3 days; critical ≤ 7 days; high ≤ 30 days; medium ≤ 90 days | Sample findings; compute time-to-fix against SLA | GAP |
| SOC-CC7-05 | CC7.2 | Centralised logs: app stdout (JSON with request id + actor), `app_error_log`, Supabase Postgres/Auth logs, Render, Cloudflare WAF — retained ≥ 12 months (the audit window plus margin) | Inspect retention settings on each source; retrieve a 9-month-old log line | GAP — Supabase log retention on Pro is short; export needed |
| SOC-CC7-06 | CC7.2 | Alerting on error-rate breaches (`check-error-rates.mjs` on a cron), auth anomalies (failed-login spikes), RLS denials, service-role use | Trigger each alert in staging; confirm a page reaches on-call | **GAP** — `notifyOncall` is not wired (CLAUDE.md, "production-only tools") |
| SOC-CC7-07 | CC7.2 | Database audit logging: connection logging on; `pgaudit` for DDL and role changes | Inspect Supabase settings; run `ALTER ROLE` in staging and find it in logs | GAP |
| SOC-CC7-08 | CC7.3 | Incident triage: severity matrix, on-call rota, runbook | Inspect; sample incident tickets | GAP |
| SOC-CC7-09 | CC7.4 | Incident response plan aligned to NIST SP 800-61r3 (CSF 2.0 Govern/Identify/Protect/Detect/Respond/Recover); annual tabletop | Inspect plan and tabletop report (scenario suggestion: cross-tenant leak via a mis-scoped policy — the L47/L55/L63 shape) | GAP |
| SOC-CC7-10 | CC7.5 | Breach notification: to customers (as processor) within the DPA window, supporting their GDPR Art. 33 (72 h) and India DPDP Rule 7 (72 h detailed report) obligations | Inspect templates and DPA; tabletop measures time-to-notify | GAP |
| SOC-CC7-11 | CC7.4 | Every unexpected error gets an id shown to the user and logged with the actor (`handleError`) | Reperform: force a 500; find the id in logs; confirm no PII in the logged object (`safeError` allowlist) | EXISTS |

### CC8 — Change management

The criterion: changes are authorized, designed, tested, approved and
implemented. Auditors sample deploys and trace each to a reviewed, tested,
approved change.

| ID | Control | Test | Status |
|---|---|---|---|
| **SOC-CC8-01** | **`main` is protected**: PR required, ≥ 1 approving review from someone other than the author, required status checks (all CI workflows), no force-push, no deletion, admins included | `gh api repos/banerjed/kaaj/branches/main/protection` returns a rule set with those properties; sample 25–40 production deploys and trace each to an approved PR | **GAP — highest priority.** `main` is not protected (HTTP 404 "Branch not protected", 2026-09-27). Commits currently go straight to `main` with no reviewer. A single-developer team can satisfy review with a second human reviewer, or with documented compensating detective controls (post-merge review within 24 h, signed off) — but this must be decided and written down before the observation window opens |
| SOC-CC8-02 | Every change passes `./check` before deploy (CLAUDE.md "Required before pushing") | CI history for every deployed commit is green | PARTIAL — enforced by convention, not by the branch rule |
| SOC-CC8-03 | Migrations are forward-only, applied via `supabase db push` by an authorized deployer, verified with `verify-remote.sh` | Sample migrations: each has a PR, a green CI, a deploy record, a post-deploy verification | PARTIAL — process documented; deploy records not captured |
| SOC-CC8-04 | Separation of environments: `vite dev` refuses non-local Supabase; production values in `.env.prod`, not auto-loaded | Reperform: point dev at a remote URL; expect refusal (L75) | EXISTS |
| SOC-CC8-05 | CODEOWNERS for security-critical paths (`supabase/migrations/`, `packages/authz/`, `apps/web/src/lib/server/security/`, `scripts/verify-*`, `.github/workflows/`) | Inspect CODEOWNERS; sample PRs touching them have an owner's approval | GAP — no CODEOWNERS |
| SOC-CC8-06 | CI hardening: workflows declare least-privilege `permissions:`; third-party actions pinned by SHA; no `pull_request_target` with untrusted checkout | Inspect every workflow | **GAP** — no `permissions:` block in any of the 6 workflows |
| SOC-CC8-07 | Emergency change procedure: allowed, but reviewed retrospectively within 1 business day | Inspect procedure and sample | GAP |
| SOC-CC8-08 | Supply-chain integrity: lockfile committed and frozen; SBOM (CycloneDX) per release; build provenance (SLSA Build L2 via GitHub artifact attestations) | Inspect release artifacts | PARTIAL — frozen lockfile only |

### CC9 — Risk mitigation

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-CC9-01 | CC9.1 | Business continuity plan: loss of Supabase region, Render, Cloudflare, key staff | Inspect BCP; confirm it was exercised (A1.3) | GAP |
| SOC-CC9-02 | CC9.1 | Cyber insurance appropriate to data held | Inspect policy | GAP |
| SOC-CC9-03 | CC9.2 | Vendor inventory with risk tiering; annual review of each critical vendor's SOC 2 report, bridge letter and CSOC mapping (§7.2); DPAs signed | Inspect inventory and review records | GAP |
| SOC-CC9-04 | CC9.2 | Sub-processor list published for customers; change notice period | Inspect public list | GAP |

---

## 5. Technical security testing programme

This is the part an auditor does not run but expects to see: evidence for
CC4.1 (separate evaluations) and CC7.1 (vulnerability identification). Plan it
as one annual third-party penetration test plus continuous automated testing,
following NIST SP 800-115's phases (planning → discovery → attack → reporting)
and OWASP's WSTG v4.2 test identifiers. The verification target is
**OWASP ASVS 5.0 Level 2** across the app, and **Level 3** for payroll, bank
details, PII reveal and authentication.

### 5.1 Scope and rules of engagement

- Targets: apex + a tenant subdomain on staging (production-identical config),
  a dedicated-tier tenant database, the customer portal, all form actions and
  `+server.ts` endpoints, Storage, the chat relay.
- Accounts: at least two tenants, each with owner, firm_admin, hr_admin,
  payroll_admin, finance_admin, project_manager, auditor, employee,
  contractor and portal-contact users. The fixture's second tenant
  (`tenant-b-isolation-probe`) is the model.
- Out of scope: vendor infrastructure (Supabase, Render, Cloudflare) beyond
  Kaaj's own configuration of it — covered by their reports.
- Deliverables: findings with CVSS v4.0 score, reproduction steps, evidence,
  and a **retest letter** after fixes (auditors ask for both).

### 5.2 Multi-tenant isolation (highest risk)

Every disclosure in `docs/10-lessons-learned.md` was a correct-looking value in
the wrong place, with no error. The tester's brief is to find the next one.

| ID | Attack | Expected result | Existing automated coverage |
|---|---|---|---|
| SOC-MT-01 | For every route/action taking an id (`params.id`, hidden `id` fields, `?project_id=`), substitute an id from tenant B (API1:2023 BOLA / WSTG-ATHZ-04 IDOR) | 404 or refusal, never B's data | Partial: RLS makes most impossible; `assertCustomerExists`-style checks for FK writes (L103) |
| SOC-MT-02 | Write a row in tenant A referencing tenant B's id through every foreign key a form sets (customer, project, objective, employee, account) | Refused with a field error | `projects.writes.test.ts` "refuses a customer this tenant cannot see"; extend to every FK a form sets |
| SOC-MT-03 | Tamper with JWT claims: change `tenant_id`, `role`, `functional_roles`, `employee_id` in an unsigned or re-signed token | Signature failure; malformed claim fails closed | `claims/fail-closed-quietly` |
| SOC-MT-04 | Host-header / subdomain confusion: session from `a.<domain>` used on `b.<domain>` | Tenant from the session, never from the Host header; refusal | Not covered — add an e2e case |
| SOC-MT-05 | Race: two tenants creating records simultaneously; numbering (`nextNumber`, `next_time_entry_number`) never crosses tenants | Numbers tenant-scoped | Partial |
| SOC-MT-06 | Dedicated-tier routing: a shared-tier session reaching a dedicated database, and vice versa | Refused (ADR-009) | `dedicated targets` step — currently **vacuous locally** (no dedicated-tier row in the fixture) |
| SOC-MT-07 | Search/filter/sort parameters that change the query shape (`ORDER BY`, full-text search) leaking counts or existence across tenants | No cross-tenant signal | Not covered |
| SOC-MT-08 | Aggregates across a restricted table computed under the wrong actor (L106) | Correct totals, no leak | `time_tracking_entries.writes.test.ts` plain-employee cases |
| SOC-MT-09 | Realtime / chat relay subscribing to another tenant's channel | Refused | `team_chat` visibility tests; add relay-level test |
| SOC-MT-10 | Storage: another tenant's object path, signed-URL reuse after revocation | Refused | Add automated test (SOC-CC6-25) |

### 5.3 Authentication (WSTG-ATHN, ASVS V6/V7, NIST SP 800-63B-4)

| ID | Test | Expected |
|---|---|---|
| SOC-AUTH-01 | Credential stuffing / brute force on `/login` and `/portal/login` | Rate-limited per IP and per account; generic error; CAPTCHA after threshold |
| SOC-AUTH-02 | Account enumeration via login, reset, sign-up responses and timing | Identical responses and timing |
| SOC-AUTH-03 | Password reset: token single-use, expires ≤ 1 h, bound to the account, invalidates sessions | As stated |
| SOC-AUTH-04 | Password policy (SOC-CC6-13) and breached-password rejection | Rejects `password1234567` and a known-breached password |
| SOC-AUTH-05 | MFA bypass: skip the second step, replay a TOTP, downgrade AAL2→AAL1 on sensitive routes | Refused (once SOC-CC6-12 exists) |
| SOC-AUTH-06 | Session fixation, cookie flags (`HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`), logout everywhere | As stated |
| SOC-AUTH-07 | Refresh-token reuse detection (SOC-CC6-15) | Whole token family revoked |
| SOC-AUTH-08 | Portal contact attempting staff routes, and staff attempting portal routes | Refused both ways |
| SOC-AUTH-09 | OAuth/SSO (when added): state/nonce, redirect-URI exact match, IdP-initiated login refused | As stated |

### 5.4 Authorization (WSTG-ATHZ, API5:2023)

| ID | Test | Expected | Coverage |
|---|---|---|---|
| SOC-AZ-01 | Every form action invoked by every role (function-level authorization) | Only permitted roles succeed | `verify-authz.mjs` + role-security plan |
| SOC-AZ-02 | Every page `load()` requested by every role (L79) | Read permission checked in `load()` | e2e `rbac-boundaries.spec.ts` |
| SOC-AZ-03 | Mass assignment: extra fields in form POSTs (`tenant_id`, `employee_id`, `approved_by`, `status`) | Ignored — `FormReader` reads named fields only | Add a crafted-POST case per module |
| SOC-AZ-04 | Separation of duties: self-approval of time entries, pay changes, bills, payroll runs (`calculated_by` ≠ `approved_by`) | Refused | Covered for time entries and payroll; confirm bills |
| SOC-AZ-05 | Field-level disclosure: `_pvt` columns never in a response to a refused actor, including JSON in page data (`__data.json`) | Absent | `disclosure.test.ts`; add a `__data.json` crawl per role |
| SOC-AZ-06 | Auditor role writes anything | Refused (DB enforces the auditor/writer split) | Covered |

### 5.5 Input handling and injection (WSTG-INPV, A05:2025)

| ID | Test | Expected | Note |
|---|---|---|---|
| SOC-INJ-01 | SQL injection through every parameter | No injection: postgres.js tagged templates parameterize | Audit every `tx.unsafe(` call (currently used only with values from fixed internal maps — keep a lint rule that fails on any other use) |
| SOC-INJ-02 | Stored XSS through rich text (tickets, comments, news, chat) | Sanitized by `sanitize-html` allowlist; CSP as defence in depth | Test payload list: `<img onerror>`, `<svg onload>`, `javascript:` hrefs, CSS `expression()`, mutation-XSS vectors |
| SOC-INJ-03 | XSS through PDF generation (invoice, payslip) and CSV export (formula injection `=HYPERLINK(...)`) | Escaped; CSV cells starting `= + - @` prefixed | CSV injection not currently tested |
| SOC-INJ-04 | SSRF: any server-side fetch with user-influenced URLs (logo URLs, webhook targets, link previews) | Allowlist; block private ranges and cloud metadata `169.254.169.254` | Rolled into A01:2025 |
| SOC-INJ-05 | Path traversal in Storage keys and document names | Keys generated server-side | Test `../` and encoded variants |
| SOC-INJ-06 | Oversized / malformed inputs: 10 MB text fields, deeply nested JSON, invalid UTF-8, `2026-02-31` dates, `1e309` numbers | Field errors, never 500 (L34, L66, L67) | `forms.test.ts`, `form-errors.spec.ts` |
| SOC-INJ-07 | Exceptional conditions (A10:2025): DB timeouts, pool exhaustion, Stripe/Bird outage mid-transaction | Fails closed; no partial writes; no stack traces or `detail` leaked | `safeError` covers leakage; add fault-injection tests |

### 5.6 Web and transport hardening (A02:2025, ASVS V3)

| ID | Test | Expected | Status |
|---|---|---|---|
| SOC-WEB-01 | Response headers on every page: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `frame-ancestors 'none'` | Present | **GAP** — `hooks.server.ts` sets only `server-timing` and `x-request-id`; `svelte.config.js` has no `kit.csp` |
| SOC-WEB-02 | CSRF: SvelteKit `csrf.checkOrigin` on (default) and not weakened with a broad `trustedOrigins` | Cross-origin form POST refused | EXISTS (default) — add an e2e case so a config change cannot silently remove it |
| SOC-WEB-03 | Clickjacking | `frame-ancestors 'none'` | GAP (with SOC-WEB-01) |
| SOC-WEB-04 | Error pages leak no stack traces, SQL or `detail` | Generic message + error id | EXISTS (`handleError`) |
| SOC-WEB-05 | Directory listing, source maps, `.env`, `.git` reachable in production | 404 | Verify at launch |
| SOC-WEB-06 | Rate limiting of expensive endpoints (PDF, exports, search) — API4:2023 | 429 past threshold | GAP — no app-level rate limiting |

### 5.7 Cryptography (A04:2025, ASVS V11)

| ID | Test | Expected | Status |
|---|---|---|---|
| SOC-CRY-01 | Envelope: AES-256-GCM, 96-bit random IV per seal, AAD binding tenant\|table\|column\|row | Tampered AAD or IV fails | EXISTS (`envelope.ts`, `pii.test.ts`) |
| SOC-CRY-02 | IV uniqueness under load (seal the same value 10⁶ times) | No repeat | Add test |
| SOC-CRY-03 | Erasure is crypto-shredding: destroying the subject key makes every ciphertext unreadable, backups included | `openField` returns `{erased: true}` | EXISTS (`eraseSubject`) |
| SOC-CRY-04 | KEK rotation re-wraps every DEK without data loss (`rewrapSubject`) | All fields still open | Exercise in staging annually |
| SOC-CRY-05 | Dev KEK refused outside dev (`keys.ts` guard) | Refusal | EXISTS |

### 5.8 Business-logic abuse (API6:2023)

| ID | Test | Expected |
|---|---|---|
| SOC-BL-01 | Approve a payroll run twice, or move `finalized → draft` | Refused (repository direction checks + CHECK constraints) |
| SOC-BL-02 | Change a bank account and run payroll in the same hour as the same user | Flagged or requires second approver (fraud risk, SOC-CC3-03) |
| SOC-BL-03 | Invoice payment link reuse after payment; double payment | Idempotent |
| SOC-BL-04 | Negative quantities, zero-rate lines, currency mismatch on invoices | Refused or explicit |
| SOC-BL-05 | Time-entry self-approval via a second account in a group the user controls | Refused |

### 5.9 AI assistant (if `module-ai-assistant.md` ships inside the window)

Test against the OWASP Top 10 for LLM Applications: prompt injection through
stored content (a ticket body instructing the assistant to reveal pay), data
leakage across tenants and across roles (the assistant must run as the user,
under the same RLS), and excessive agency (no writes without confirmation).

### 5.10 Continuous testing cadence

| Activity | Tool | Frequency | Evidence |
|---|---|---|---|
| Unit, RLS, invariants, e2e | `./check --all` | every push | CI run, archived (§8.3) |
| Dependency vulnerabilities | Dependabot + `pnpm audit --audit-level=high` | daily | alerts, PRs |
| SAST | CodeQL or Semgrep | every PR | PR checks |
| Secret scanning | GitHub push protection + `gitleaks` | every push | alerts |
| DAST | OWASP ZAP baseline (CI) / full (weekly, staging) | weekly | reports |
| External attack surface | port scan + TLS scan of all hosts | monthly | reports |
| Supply-chain posture | OpenSSF Scorecard | monthly | score history |
| Penetration test | third party | annual + after major change | report + retest letter |

---

## 6. Additional Trust Services Categories

### 6.1 Availability (A1)

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-A1-01 | A1.1 capacity | Monitor Supabase CPU/memory/connections, Supavisor pool saturation, Render instance metrics; alert at 70% | Inspect dashboards and alert history | GAP |
| SOC-A1-02 | A1.1 | Load test before each major release (the front-page load gate is a floor, not a load test) | Inspect k6/Artillery results at 3× expected peak | PARTIAL (`scripts/loadtest.mjs` exists) |
| SOC-A1-03 | A1.2 backups | Supabase PITR enabled on the shared project and every dedicated project; retention ≥ 7 days | Inspect settings per project | GAP — verify in production |
| SOC-A1-04 | A1.2 | Encrypted, off-platform logical backup (weekly `pg_dump`, encrypted, different provider/region), so one vendor account compromise cannot destroy all copies | Inspect backup job log and bucket | GAP |
| SOC-A1-05 | A1.2 | The KEK backup is stored separately from database backups (a restored database is useless without it — and a KEK stored with the backup defeats encryption) | Inspect | GAP (documented intent in CLAUDE.md; custody not evidenced) |
| SOC-A1-06 | A1.3 recovery testing | Quarterly restore drill: restore PITR to a new project, run `verify-remote.sh` and `pii.test`-style decrypt checks against it, measure RTO/RPO against commitments | Inspect drill reports for each quarter | GAP |
| SOC-A1-07 | A1.2 | Uptime monitoring from outside (every 1 min), public status page | Inspect monitor history and incident posts | GAP |

### 6.2 Confidentiality (C1)

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-C1-01 | C1.1 identification | Data classification: the disclosure matrix (`security/matrix.ts`) + table classification (`verify-matrix-complete.mjs`) | Reperform both; confirm a written classification policy references them | PARTIAL — technical classification is complete; policy missing |
| SOC-C1-02 | C1.1 protection | Restricted values protected by row policy, encryption or projection, and `./check` fails on an unclassified one | Reperform | EXISTS |
| SOC-C1-03 | C1.2 disposal | Tenant offboarding: on contract end, export for the customer, then delete or crypto-shred every row and object in the tenant (and drop a dedicated project), within the contractual window | Execute on a test tenant; verify zero rows remain in every table, zero Storage objects, keys destroyed | **GAP** — no tenant-deletion procedure exists |
| SOC-C1-04 | C1.2 | Backups age out on schedule so deleted data does not persist indefinitely | Inspect retention | GAP |

### 6.3 Processing integrity (PI1)

Kaaj's invariants are already strong here; the SOC 2 work is mostly evidence.

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-PI-01 | PI1.1 specifications | Module specs + data definitions (`docs/module-*.md`, schema snapshot) | Inspect | EXISTS |
| SOC-PI-02 | PI1.2 inputs | `FormReader` validates every field against its column (length, uuid, enum, date round-trip, decimal scale); three-outcome optional fields (L33) | Reperform `forms.test.ts`; crafted POSTs per form | EXISTS |
| SOC-PI-03 | PI1.2 | Database refusals answer with a message (`constraintFailure` registry) | Reperform `verify-constraint-registry.mjs` | EXISTS |
| SOC-PI-04 | PI1.3 processing | Money is `NUMERIC` end to end and a string in TypeScript; arithmetic in SQL; JSONB money as strings | Reperform `money/*` invariants | EXISTS |
| SOC-PI-05 | PI1.3 | Denormalised counters recomputed, never incremented, with drift readers (`staleCounters`, `staleHours`, `inconsistentRuns`) run as a privileged actor (L58, L106) | Scheduled drift report in production, reviewed weekly | PARTIAL — readers exist; not scheduled |
| SOC-PI-06 | PI1.3 | Ledger integrity: journal entries balance; posted entries immutable (UPDATE and DELETE refused) | Reperform accounting invariants and the immutability tests | EXISTS |
| SOC-PI-07 | PI1.4 outputs | Payslips, invoices and reports reconcile to their source rows; PDFs refuse truncation (`DOCUMENT_CHILD_CAP`) | Reperform `invoiceForPdf` tests; reconcile a sample payroll run | EXISTS |
| SOC-PI-08 | PI1.5 stored data | Writes audited in the same transaction (L40); audit register complete | Reperform `verify-audit-coverage.mjs` | EXISTS |
| SOC-PI-09 | PI1.3 | Payroll calculation — **not yet implemented** (CLAUDE.md): until it is, payroll figures are fixture data and must be excluded from the PI1 system description or clearly caveated | Inspect system description | Note |

### 6.4 Privacy (P1–P8) — if brought into scope

| ID | Criterion | Control | Test | Status |
|---|---|---|---|---|
| SOC-P-01 | P1.1 notice | Privacy notice for Kaaj's own data subjects (customer admins, portal contacts, marketing leads) | Inspect | GAP |
| SOC-P-02 | P2.1 consent | Marketing consent recorded with source and timestamp; revocation honoured | Test opt-in/opt-out end to end | Per role-security "Marketing And Consent Security" |
| SOC-P-03 | P4.2 retention | Retention schedule per data category; automated purge | Inspect schedule and purge logs | GAP |
| SOC-P-04 | P4.3 disposal | Erasure via `eraseSubject` (crypto-shredding), audited in `pii_erasures` | Reperform on a test subject | EXISTS |
| SOC-P-05 | P5.1 access/correction | Data-subject export and correction, routed via the controller (the customer) | Execute a DSR on a test subject within 30 days | PARTIAL |
| SOC-P-06 | P6.1 disclosure | Sub-processor list and DPAs (SOC-CC9-03/04) | Inspect | GAP |
| SOC-P-07 | P6.2 breach notification | SOC-CC7-10 | — | GAP |
| SOC-P-08 | P8.1 monitoring | Annual privacy review; complaint handling | Inspect | GAP |

### 6.5 Regulatory overlays that shape the tests

| Regulation | Obligation tested | Where |
|---|---|---|
| GDPR Art. 28 (Kaaj as processor) | DPA; processor → controller breach notice "without undue delay" (commit to ≤ 24–48 h so customers meet their 72 h) | SOC-CC7-10, SOC-CC9-03 |
| GDPR Art. 32 | encryption, confidentiality, resilience, regular testing | CC6, A1, §5 |
| GDPR Art. 17 / DPDP §12(3) | erasure — per-employee keys, crypto-shredding | SOC-CRY-03, SOC-P-04 |
| India DPDP Rules 2025 (notified 2025-11-13, enforceable ~May 2027) | Rule 6 security safeguards; Rule 7 breach notice to the Board and each data principal, detailed report within 72 h | SOC-CC7-10 |
| US state breach laws | notification timelines vary by state | incident plan appendix |

---

## 7. Vendor (subservice) controls

### 7.1 Supabase — customer-side responsibilities to test

Supabase's shared-responsibility model assigns access management, RLS, key
handling and many settings to the customer. Each item on its production
checklist becomes a control Kaaj must evidence **in production**:

| ID | Setting | Test |
|---|---|---|
| SOC-SB-01 | RLS on every table | covered by SOC-CC6-01 |
| SOC-SB-02 | SSL enforcement on | Management API / dashboard export |
| SOC-SB-03 | Network restrictions (Render egress IPs only) | attempt from another IP |
| SOC-SB-04 | Org MFA enforced; ≥ 2 owners | org settings export |
| SOC-SB-05 | PITR enabled (shared + every dedicated project) | settings export |
| SOC-SB-06 | Custom SMTP (Bird) with link tracking **off** (tracking rewrites confirmation links) | settings; send a reset email and inspect the link |
| SOC-SB-07 | Email confirmations on; OTP expiry ≤ 3600 s | settings |
| SOC-SB-08 | Auth rate limits and CAPTCHA on sign-up, sign-in, reset | settings; brute-force test (SOC-AUTH-01) |
| SOC-SB-09 | Connection logging enabled, logs exported and retained (Supabase's SOC 2 page names this explicitly) | settings; retrieve an old log |
| SOC-SB-10 | Data API exposure: `app` schema and business tables not reachable through PostgREST for `anon`/`authenticated` | `curl` the REST endpoint with the anon key for every table; expect no rows or 401 |
| SOC-SB-11 | Service-role key rotated on staff departure and annually | rotation record |
| SOC-SB-12 | Security Advisor has no unresolved warnings | advisor export |
| SOC-SB-13 | Project region matches contractual residency | project metadata |

### 7.2 Vendor review procedure (annual, per critical vendor)

For Supabase, Render, Cloudflare, Stripe, Bird and GitHub:

1. Obtain the current SOC 2 Type II report (and bridge letter if the period
   ended more than 3 months ago).
2. Read the auditor's opinion (qualified?) and the exceptions in section 4.
3. Map the vendor's **CUECs** to Kaaj controls — each one is a Kaaj control
   that must exist (e.g. Supabase's "customer manages database access").
4. Record the review with date, reviewer and follow-ups.

---

## 8. Evidence management

### 8.1 Evidence standards

- System-generated where possible; screenshots must show URL, date and time.
- Each item names the control ID from this plan.
- Populations come from committed queries (§2.3).
- Retained for the observation window plus 12 months.

### 8.2 Automated controls and their evidence

| Automated control | Evidence an auditor can reperform |
|---|---|
| RLS + tenant isolation | `verify-rls.sql` run log |
| Table/column classification | `verify-matrix-complete.mjs` output |
| Authorization of every action | `verify-authz.mjs` |
| Audit coverage | `verify-audit-coverage.mjs` |
| PII encryption and binding | `pii.test.ts` |
| Schema drift | structure snapshot diff |
| Service-role quarantine | `verify-service-role.mjs` |

### 8.3 CI log retention — the trap to fix first

GitHub Actions keeps workflow logs and artifacts for **90 days by default**. A
6- or 12-month Type II window will reach back past that, and "CI ran `./check`
on every deploy" becomes unprovable for the earliest months. Archive every CI
run's summary (commit SHA, workflow, result, timestamp) to durable storage, or
raise the retention period, **before** the window opens (SOC-EV-01, gap
register).

---

## 9. Readiness gap register (from the 2026-09-27 survey)

Ordered by audit impact. "Verify in production" means the local setting is a
developer default and the production value is what the auditor will test.

| # | ID | Gap | Why it matters | Fix |
|---|---|---|---|---|
| 1 | SOC-CC8-01 | `main` unprotected; commits go straight to `main` without review | Without it the auditor cannot rely on any automated control, and must sample them all as manual controls | Branch protection + required reviews + required checks; or a documented compensating review control |
| 2 | SOC-CC6-12 | No end-user MFA; no AAL2 step-up for privileged roles | Payroll, bank details and compensation behind a single factor | Enable TOTP/WebAuthn in Supabase Auth; enforce AAL2 in `hooks.server.ts` for privileged roles |
| 3 | SOC-WEB-01 | No security headers or CSP | A02:2025; turns any XSS into full compromise | `kit.csp` in `svelte.config.js` + headers in `hooks.server.ts` + e2e assertion |
| 4 | SOC-CC7-06 | Error-rate alerting not wired (`notifyOncall`) | CC7.2 needs detection that reaches a human | Wire to a paging channel; test monthly |
| 5 | SOC-CC6-27 / CC7-02 | No dependency, SAST or secret scanning in CI | CC7.1 vulnerability identification | Dependabot, CodeQL/Semgrep, secret-scanning push protection |
| 6 | SOC-CC8-06 | Workflows lack `permissions:`; actions unpinned | Supply-chain compromise through CI | Least-privilege `permissions:`, pin actions by SHA |
| 7 | SOC-EV-01 | CI logs expire after 90 days | Type II evidence disappears mid-window | Archive CI results |
| 8 | SOC-CC6-13/16/17 | Weak auth defaults locally (6-char passwords, no email confirmation, no re-auth on password change) | Must be verified correct in production | Set production auth per NIST SP 800-63B-4 |
| 9 | SOC-C1-03 | No tenant offboarding/deletion procedure | C1.2 and contractual deletion commitments | Write and test the procedure |
| 10 | SOC-A1-03..06 | PITR, off-platform backups, KEK custody, restore drills not evidenced | A1.2/A1.3 | Enable, document, drill quarterly |
| 11 | SOC-CC7-05/07 | Log retention and DB audit logging not configured | CC7.2 | Export logs; enable pgaudit/connection logs |
| 12 | SOC-CC6-26 | Upload MIME from the browser, no malware scan | CC6.8 | Server-side sniffing; scan; `nosniff` |
| 13 | SOC-WEB-06 | No app-level rate limiting on expensive endpoints | API4:2023 availability | Per-tenant and per-IP limits |
| 14 | SOC-CC6-04 | `SECURITY DEFINER` functions not enumerated by a check | A future definer function without tenant pinning would bypass RLS silently | Add an invariant listing them with reasons (committed-literal style) |
| 15 | SOC-MT-06 | Dedicated-target check vacuous locally | A test that passes on no rows (L50) | Add a dedicated-tier fixture row |
| 16 | Policy set | CC1–CC5, CC9 policies, training, risk register, vendor reviews | Organisational criteria | Policy pack + a GRC tool, or a lightweight repo-based register |
| 17 | Payroll run totals | An employee can read the totals of runs they were paid in; on a 2-person run that reveals a colleague's pay | Residual disclosure noted in `20260927100000` | Serve a payslip's pay date without exposing the run row, or restrict run totals to payroll readers |

---

## 10. Annual control calendar

| Frequency | Controls |
|---|---|
| Every change | PR review, `./check`, CI, SAST, secret scan (CC8, CC7.1) |
| Daily | dependency alerts triaged; alerts reviewed (CC7.1, CC7.2) |
| Weekly | DAST; drift report (`staleCounters`/`staleHours`/`inconsistentRuns`) reviewed (CC7.1, PI1.3) |
| Monthly | external attack-surface and TLS scans; vulnerability SLA report (CC7.1) |
| Quarterly | access reviews of every production system; restore drill; governance review (CC6.3, A1.3, CC1.2) |
| Annually | penetration test + retest; risk assessment; policy review; security training; tabletop; vendor SOC 2 reviews; KEK rotation exercise; BCP test (CC4.1, CC3.2, CC5.3, CC1.4, CC7.4, CC9.2, A1.3) |

---

## 11. Sources

**AICPA and SOC 2 practice**
- [AICPA — 2017 Trust Services Criteria (With Revised Points of Focus – 2022)](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria-with-revised-points-of-focus-2022)
- [Barr Advisory — What's new in the revised points of focus](https://www.barradvisory.com/resource/whats-new-with-soc-2/)
- [Ledger Audits — DC Section 200 description criteria](https://www.ledgeraudits.com/blog/dc-200-guidelines)
- [Linford & Co — Carve-out vs inclusive subservice audits](https://linfordco.com/blog/subservice-carve-out-inclusive-audits/)
- [soc2auditors.org — Complementary user entity controls](https://soc2auditors.org/insights/complementary-user-entity-controls/)
- [Linford & Co — Audit sampling for SOC audits](https://linfordco.com/blog/audit-sampling/)
- [Linford & Co — Audit procedures and tests of controls](https://linfordco.com/blog/audit-procedures-testing/)
- [soc2auditors.org — CC6 and CC7 security controls and evidence](https://soc2auditors.org/insights/soc-2-security-controls/)
- [AuditPath — SOC 2 privacy criteria P1–P8](https://www.auditpath.io/blog/soc2-privacy-criteria)
- [Linford & Co — Processing integrity](https://linfordco.com/blog/processing-integrity/)
- [Drata — SOC 2 Type 1 vs Type 2 timelines](https://drata.com/learn/soc-2/type-1-vs-type-2)
- [Bright Defense — SOC 2 penetration testing requirements](https://www.brightdefense.com/resources/soc-2-penetration-testing/)
- [NIST — AICPA Trust Services Criteria crosswalk](https://www.nist.gov/itl/applied-cybersecurity/privacy-engineering/american-institute-certified-public-accountants-aicpa)
- [Secure Controls Framework — TSC mappings](https://securecontrolsframework.com/grc-fundamentals/common-cybersecurity-frameworks/trust-services-criteria-soc-2-compliance-guidance)

**Technical testing standards**
- [NIST SP 800-115 — Technical Guide to Information Security Testing and Assessment](https://nvlpubs.nist.gov/NISTpubs/Legacy/SP/NISTspecialpublication800-115.pdf)
- [OWASP ASVS (5.0, May 2025)](https://github.com/OWASP/ASVS)
- [OWASP Web Security Testing Guide](https://owasp.org/projects/web-security-testing-guide) and its [checklist](https://github.com/OWASP/wstg/blob/master/checklists/checklist.md)
- [OWASP Top 10:2025](https://top10.owasp.org/2025/0x00_2025-Introduction/)
- [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/)
- [NIST SP 800-63B-4 — Digital Identity Guidelines: Authentication](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63B-4.pdf)
- [NIST SP 800-61r3 — Incident Response (CSF 2.0 profile)](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-61r3.pdf)
- [NIST SP 800-218 — Secure Software Development Framework](https://nvlpubs.nist.gov/nistpubs/specialpublications/nist.sp.800-218.pdf)
- [CISA BOD 26-04 — Prioritizing security updates based on risk](https://www.cisa.gov/news-events/directives/bod-26-04-prioritizing-security-updates-based-risk) (supersedes BOD 22-01 and 19-02)
- [CIS PostgreSQL Benchmarks](https://www.cisecurity.org/benchmark/postgresql)

**Platform and regulatory**
- [Supabase — SOC 2 compliance](https://supabase.com/docs/guides/security/soc-2-compliance)
- [Supabase — Shared responsibility model](https://supabase.com/docs/guides/deployment/shared-responsibility-model)
- [Supabase — Production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [GDPR Art. 33](https://gdpr-info.eu/art-33-gdpr/) and [Art. 28](https://gdpr-text.com/read/article-28/)
- [India DPDP Rules 2025 — breach notification overview](https://ksandk.com/data-protection-and-data-privacy/dpdp-data-breach-notification-timeline/)
