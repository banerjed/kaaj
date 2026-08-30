# Role-Based Access Control

**Status:** steps 0-3 implemented and enforced. RLS visibility predicates
(step 5) and the subject-access export (step 6) are still ahead
**Created:** 2026-08-30

This is the authorization model for Kaaj: who may see which rows, who may take
which actions, which layer enforces each, and how a violation is caught before
it ships.

It supersedes [`architecture-technical.md`](./architecture-technical.md)
§ Roles and Permissions, which describes a `roles` table, a
`role_permissions` join and a `user_effective_permissions` view. **None of those
exist in the built schema** — the same class of stale prose as ADR-003's tenant
claim ([L1](./10-lessons-learned.md)). That section should be read as intent,
not as description.

---

## Where we are today

Measured against the running system, not assumed:

| | State |
|---|---|
| Tenant isolation | **Enforced.** RLS, `FORCE`d on all 100 tables, 587 checks in `./check` |
| Role claim | **Correct but decorative.** `custom_access_token_hook` reads `tenant_users.role` and stamps `app_metadata.role`; `hooks.server.ts` resolves it into `locals.tenantRole` |
| Role enforcement | **Application layer done.** `can()` / `requireCan()` in `$lib/server/auth/`, with the base + functional bundles |
| Write paths gated by role | **23 of 23**, enforced by `authz/actions-are-guarded` in `./check` |
| Row visibility by role | **Not yet.** RLS still filters by tenant only — step 5 |

**The consequence, stated plainly: any authenticated member of a tenant can
change anyone's pay.** `addRaise` authorizes on "has a tenant". So can
`employees/[id]/edit`, `settings/company`, and every settings action. The only
authorization the product performs beyond tenancy is two hand-written refusals
in `time_off.decide` — `not_pending` and `self_approval` — which exist because
the schema could not express them, not because a role model asked for them.

This is acceptable for a design-partner beta with people you know. It is not
acceptable before **Phase 6, payroll**, which is the phase that turns "can edit
a number" into "can pay themselves".

### One property to design around

`jwt_expiry = 3600`. The role claim is stamped at token issue, so **revoking
someone's role takes up to an hour to take effect.** Any check that must be
immediate — offboarding, suspected compromise — has to read `tenant_users`
rather than the claim. That is a deliberate trade: reading the claim costs
nothing, reading the table costs a query per request.

---

## The model

### Five vocabularies, none of which agreed

Found while answering "what roles are granted today". The repository carried
five different role lists:

| Source | Values | Status |
|---|---|---|
| `tenant_users.role` — the live data | `owner, hr_admin, manager, member` | 5 rows, plain `text`, no constraint |
| `enumerations.json` `system.userRole` | `super_admin, firm_admin, hr_admin, finance_admin, payroll_admin, manager, employee, contractor, read_only` | declared, **never made a Postgres type, zero consumers** |
| The first draft of this document | `owner, hr_admin, manager, member` | written without checking the enum file — [L1](./10-lessons-learned.md)'s failure mode, one day after it was cited |
| `employee_group_roles.role_name` | `project_member, payroll_approver` | 2 fixture rows |
| `employee_group_members.role` | `owner, admin, moderator, member` | a **different axis** — position within a group, not access. No consumer treats it as a permission |

Only `hr_admin` and `manager` appeared in more than one. `owner`/`firm_admin`
and `member`/`employee` were the same idea spelled twice. This section is the
reconciliation.

### A base role, plus functional roles

**The mistake to avoid is one role per department.** Department is org
structure — `employees.department_code`, already hierarchical. A role is a
permission bundle. Someone in Finance may be a read-only auditor; the office
manager in G&A is routinely the HR admin *and* the IT admin. Weld the two
together and every reorganisation becomes a permissions migration.

In a small firm people wear several hats, so:

**One base role**, which sets the floor:

| Base role | Who |
|---|---|
| `owner` | Holds billing and can transfer ownership. Usually one or two people |
| `firm_admin` | Everything except billing and ownership |
| `employee` | Everyone on payroll. Sees themselves and the directory |
| `contractor` | Engaged, not employed. Narrower than `employee` — no directory, no colleague profiles |

**Zero or more functional roles** on top:

| Functional role | Grants | Usually sits in |
|---|---|---|
| `hr_admin` | employee records, HR modules, PII, erasure requests | HR / People |
| `payroll_admin` | run payroll, payslips, tax filings. Reads compensation, **cannot change it** | Finance or HR |
| `finance_admin` | invoices, bills, ledger, banking, expenses, chart of accounts | Finance / Accounts |
| `sales_admin` | CRM, clients, proposals, pipeline | Sales |
| `marketing_admin` | campaigns, marketing hub, analytics | Marketing |
| `it_admin` | assets, user groups, integrations, ticketing configuration. **No employee PII** | IT |
| `legal_admin` | documents, contracts, change requests, compliance and audit read | Legal / Compliance |
| `project_manager` | projects, tasks, and timesheet approval for their own projects | any |
| `auditor` | read-only across the tenant. No writes, ever | external, or Finance/Legal |

`manager` is **not granted**. Someone manages the people whose
`employees.manager_id` chain reaches them; `wouldReportToSelf` already walks it.
A `manager` value on a person with no reports would grant nothing, which is why
it is derived rather than assigned.

`super_admin` is **deliberately absent.** Kaaj staff are not a tenant role, and
putting them in the same list invites a tenant granting it.

### Two separation-of-duties rules

These are the reason the catalogue is not decorative. Both are enforced by
`CHECK` constraints on `tenant_users`, so the combination is unreachable rather
than merely discouraged.

**They do not bind the `owner`, and no constraint could.** The owner holds every
permission, including both halves of the payroll rule — and grants and removes
roles, so any rule they hit they can remove first. That is a property of being
the account owner, not a gap to close. The compensating controls are the audit
trail (`created_by`/`updated_by`, `pii_erasures`) and keeping Owner to people
already trusted with the company bank account. `firm_admin` is the most powerful
role that *is* bound: it cannot grant itself `tenant.members.manage`.

**1. Whoever sets pay must not approve the run that pays it.** `payroll_admin`
gets `compensation.read.all` and `payroll.approve` but **never**
`compensation.write`. `hr_admin` is the reverse. Holding both is refused at
grant time, not at use time — the same shape as "never your own approval",
generalised. This is what `payroll_approver` in the fixture is reaching for.

**2. `it_admin` never reaches employee PII.** IT needs assets, groups,
integrations and ticket configuration. It does not need tax identifiers, and
"admin" reading as "all" is how that mapping is usually got wrong. Checkable
directly against the `pii.read` permission.

### Suggested by department, never derived from it

The intuitive part, without welding access to the org chart. When someone is
added to a department, the onboarding flow **suggests** a functional role and
the administrator confirms or overrides it:

| Department | Suggested |
|---|---|
| HR / People Ops | `hr_admin` |
| Finance / Accounts | `finance_admin` |
| Payroll | `payroll_admin` |
| Legal / Compliance | `legal_admin` |
| IT | `it_admin` |
| Marketing | `marketing_admin` |
| Sales | `sales_admin` |
| Engineering / Delivery / Consulting | `project_manager` for a lead, otherwise none |
| Executive / G&A | `firm_admin` |
| anything else | none — `employee` is the floor |

A suggestion, never a derivation. Moving departments does not change what
someone can do until an administrator says so.

### Roles are data, and must never become a Postgres enum

Roles are Tier 1 customization ([06-customization-model.md](./06-customization-model.md)):
a customer will eventually want "Office Manager". `ALTER TYPE` has no
`DROP VALUE`, so promoting these would make a customer's typo permanent.

They live in `enumerations.json` as `system.baseRole` and
`system.functionalRole` — the shipped **defaults** — and move to a reference
table when customers can edit them. `./check` enforces this: `base_role`,
`functional_role` and the superseded `user_role` are on the
`_must_not_be_enum` list, and creating any of them as a type fails
`enum/classification`. Proved by creating one and watching it fail.

### Migrating the five live rows

`tenant_users.role` holds one value today; it needs a second column for the
functional set:

| Today | Becomes |
|---|---|
| `owner` (Sarah Johnson, ENG) | base `owner` |
| `hr_admin` (Rachel Adeyemi, G&A) | base `employee` + functional `hr_admin` |
| `manager` (Aisha Okafor, CONSULT) | base `employee` — manager is derived from her reports |
| `member` ×2 (Marcus Chen, Tom Whitfield) | base `employee` |

`member` → `employee` and a `functional_roles TEXT[]` column are one migration.
It is step 0 of the sequence below.

### Permissions

Permissions are `resource.verb` strings, not booleans on a role, so a role is a
*bundle* and a new role does not mean a new column:

```
employee.read.self      employee.read.reports    employee.read.all
employee.write          employee.create          employee.archive
compensation.read.self  compensation.read.reports compensation.read.all
compensation.write      payroll.approve
timeoff.request         timeoff.approve          timeoff.read.all
attendance.read.self    attendance.read.reports  attendance.read.all
firm.settings.read      firm.settings.write
pii.read                pii.erase
tenant.settings.write   tenant.members.manage
```

---

## Two layers, and which owns what

The decision that stops future modules guessing:

| Layer | Answers | Mechanism | Failure mode |
|---|---|---|---|
| **RLS** | *Do these rows exist for me at all?* | policy predicate, `FORCE`d | `42501` / zero rows — unbypassable, survives a module that forgets |
| **Application** | *May I do this to this row?* | `can()` in the action | `fail(403, …)` — a message the user can act on |

**RLS owns visibility.** A `member` querying `employees` sees their own row.
A `manager` sees their reporting chain. `hr_admin` and `owner` see the tenant.
This is the backstop: a page that forgets to filter still cannot leak, which is
the property application checks cannot offer — and the layer that failed twice
in one day this session was application code in files patched rather than
rewritten.

**The application owns actions.** "Approve this request, but not your own."
"Change pay, but only if hr_admin." These are awkward or impossible as SQL
predicates, and a raw `42501` is a useless error for a form.

Neither substitutes for the other, for the same reason the four `./check`
database steps do not substitute for each other.

---

## The matrix

Columns are the **base** role plus the **functional** role that grants the row.
`self` = the row is the acting employee's. `reports` = the acting employee is up
the `manager_id` chain.

| Action | employee | contractor | +manager (derived) | +hr_admin | +payroll_admin | +finance_admin | +it_admin | +legal_admin | +auditor | firm_admin | owner |
|---|---|---|---|---|---|---|---|---|---|---|---|
| See own profile, pay, time off, attendance | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| See the staff directory | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| See a colleague's pay | ❌ | ❌ | reports | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| See a colleague's tax ID / bank details | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | **❌** | ❌ | ❌ | ✅ | ✅ |
| Create / edit an employee record | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Edit own profile, emergency contacts | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Change pay** (`addRaise`) | ❌ | ❌ | ❌ | ✅ | **❌** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Approve a payroll run** | ❌ | ❌ | ❌ | **❌** | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Approve time off | ❌ | ❌ | reports | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Approve a timesheet | ❌ | ❌ | reports | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Firm settings — locations, departments, job titles, holidays, benefits, payroll policies, pay schedules | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Invoices, bills, ledger, banking, expenses | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| CRM, clients, proposals | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Assets, user groups, integrations, ticket config | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Documents, contracts, change requests | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Read anything, write nothing | — | — | — | — | — | — | — | — | ✅ | — | — |
| Company profile, locales, currencies | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage members and role grants | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Erase a data subject (GDPR Art. 17) | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Billing, ownership transfer | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

The four **bold** cells are the separation-of-duties rules, and they are the
reason this table is worth having. `hr_admin` sets pay and cannot approve the
run; `payroll_admin` approves the run and cannot set pay; `it_admin` administers
the systems and cannot read a tax identifier.

**Never your own approval** is absolute and applies to every column including
`owner`. It is not a grantable permission — it is the rule standing between a
manager and unlimited self-granted holiday, and it is the one authorization
check the product already performs.

`auditor` is read-only *everywhere* and writes *nowhere*: holding it alongside a
writing role is refused at grant time, or it is not an audit.

### Self-access to sensitive fields

An employee sees their own compensation, time off and attendance. They do **not**
see their own tax identifier or full bank number:

| Field | Own record | `hr_admin` / `owner` |
|---|---|---|
| Compensation, payslips | full | full |
| Bank account | `•••• 4417` (`account_number_last4`) | full, on explicit reveal |
| Tax identifier | masked, never rendered | full, on explicit reveal |

**Write-once, then a change request.** An employee supplies their own bank
details and tax identifier; changing them afterwards goes through
[`module-change-requests.md`](./module-change-requests.md), because a silent
bank-detail change is how payroll fraud works.

GDPR Article 15 is a right of *access*, and it is satisfied by a subject-access
export — a deliberate, audited action — not by rendering the raw value on a page
anyone standing behind the person can read. That export does not exist yet and
is listed below.

---

## Enforcement points

### Application

One helper, in `$lib/server/auth/can.ts`, taking the same shape everywhere:

```ts
export type AuthContext = {
  tenantId: string
  userId: string
  employeeId: string | null
  role: TenantRole
}

export function can(
  ctx: AuthContext,
  permission: Permission,
  scope?: { employeeId?: string; department?: string; location?: string },
): boolean
```

Every action begins with it, and a denial is a `403`, never a silent no-op:

```ts
if (!can(ctx, "compensation.write")) {
  return fail(403, { message: "Only HR can record a pay change." })
}
```

`reports` resolution is a recursive walk of `manager_id`, the same one
`wouldReportToSelf` already performs.

### RLS

Row visibility moves from `tenant_id = app.current_tenant_id()` to that **and** a
visibility predicate, via a new `app.current_employee_id()` alongside the
existing `app.current_tenant_id()`. Only tables holding person-scoped data
change; firm configuration stays tenant-wide.

The claim must therefore carry `employee_id` as well as `tenant_id` and `role` —
a change to `custom_access_token_hook`, and the one piece of this that touches
login. It fails the way L5/L21 describe if registration is forgotten, so it
belongs in the same migration as its verification.

---

## Where authorization is asserted

Two suites, deliberately, answering different questions:

| | Asserts | Runs |
|---|---|---|
| `apps/web/src/lib/server/auth/can.test.ts` | role → permission | 24 cases |
| `apps/web/src/lib/server/auth/action-authz.test.ts` | every action × every role, by invoking the action | 100 cases |
| `apps/web/src/lib/server/pii/pii.test.ts` | encryption, erasure, rotation | 31 cases |
| `apps/web/src/lib/server/db/tenant.test.ts` | tenant isolation | 6 cases |
| `packages/spec-tests/tests/security-*.spec.test.ts` | the spec-derived requirement matrix, with traceability IDs | 179 cases |

### They stay independent, on purpose

The two suites are **separate implementations and remain so.** `spec-tests`
decides through its own `authorizeSensitiveRead` and its own role vocabulary;
`apps/web` decides through `permissionsFor()`. Neither imports the other's
logic. That is the point: two implementations catch each other's errors, which
one cannot.

But independence only pays off **if something compares them.** They were fully
independent and they *did* disagree — this model asserted a payroll admin sees
a masked bank number while the application granted a full reveal — and both
stayed green for as long as both existed. The disagreement was found by reading
both by hand. Nothing in CI would ever have surfaced it.

So the fix was a comparison, not a merge:

1. **`authz-conformance.spec.test.ts`** asserts the two models give the same
   answer on every rule both express. It compares **outcomes**, never internals:
   it does not care how either side decides, only that a payroll admin ends up
   with a masked number in both. A failure means *"these disagree, decide which
   is right"* — a product decision, not something to auto-fix in either
   direction.
2. **`pii.read` and `pii.reveal` became separate permissions**, which is how the
   bank divergence was resolved — toward the narrower rule, deliberately, rather
   than toward whichever side was easier to edit.
3. **`@kaaj/authz`** holds the product's vocabulary and bundles so `apps/web`
   and the bridge can share a dictionary. **`spec-tests`' engine does not import
   it**; the bridge maps between the two vocabularies in `ROLE_MAP`.

**Do not "simplify" this by making one suite call the other's authorizer.** That
would leave one implementation wearing two hats, and delete the independent
verification the bridge exists to exploit.

*(An earlier commit message for 6a8d14a said "both suites now evaluate against
@kaaj/authz". That was wrong — only `apps/web` and the bridge do.)*

### One control that is specified and NOT enforced

`security-invariants.spec.test.ts` asserts MFA is required for high-sensitivity
reads. `hooks.server.ts` resolves `locals.amr`, and **nothing gates on it** — so
those cases pass against a simulation of a check the product does not perform.
That is recorded as an explicit `it.todo` (`SEC-MFA-001`) rather than left
looking covered, because a green test claiming a control you do not have is
worse than a visible gap.

## The drift guard

A matrix nobody can enforce is decoration. The analogue of the `pii/*` rules:

**`authz/actions-are-guarded`** — every `export const actions` entry in
`routes/(app)/**` must call `can()` before its first write, or appear in a
committed exemption list with a reason. This is a lint rule rather than a SQL
invariant because the subject is TypeScript, and it belongs in `./check`'s
application half.

Without it, this document describes the codebase for exactly as long as it takes
someone to add the twentieth action.

---

## What is wrong today

Nineteen write actions, none gated. In severity order:

| Action | Current | Should be |
|---|---|---|
| `employees/[id]` → `addRaise` | any member | `compensation.write` — hr_admin, owner |
| `employees/[id]/edit`, `employees/new` | any member | `employee.write` / `employee.create` |
| `settings/company` → `update` | any member | `tenant.settings.write` — owner |
| `settings/*` (14 actions across locations, departments, job-titles, holidays, benefits, payroll policies, pay schedules) | any member | `firm.settings.write` — hr_admin, owner |
| `time-off` → `decide` | any member, refuses own | `timeoff.approve` + reports, refuses own |

`time-off.decide` is the only one that is partly right, and its `self_approval`
refusal is the model the rest should follow: an explicit, named refusal that
surfaces as a field error.

---

## Sequence

0. Migrate `tenant_users`: `member` → `employee`, and add `functional_roles TEXT[]`.
   Five rows ([Migrating the five live rows](#migrating-the-five-live-rows))
1. `can.ts`, the `AuthContext`, and the permission vocabulary — no behaviour change
2. Gate all 19 actions; each denial gets a test asserting `403`
3. The `authz/actions-are-guarded` guard, proved to fail on an unguarded action
4. `employee_id` into the token claim, with its verification
5. RLS visibility predicates on person-scoped tables
6. Subject-access export (GDPR Art. 15)
7. Scoped grants via `employee_group_roles`, when payroll needs them

Steps 0–3 close the pay-editing hole and are the ones that must land before
Phase 6. Step 2 includes the two separation-of-duties refusals at grant time —
`hr_admin` + `payroll_admin` on one person, and `auditor` alongside anything
that writes.

---

## Deliberately not in scope

- **Field-level permissions beyond the sensitive set above.** A per-field ACL is
  a configuration surface customers will ask for; it is not needed to close the
  hole this document is about.
- **Delegation and approval chains.** `employee_group_roles.expires_at` supports
  "cover for me while I am on leave"; the workflow does not exist.
- **Audit of reads.** Who *viewed* a tax identifier is a real requirement for
  the sensitive set and needs its own table. Writes are already covered by
  `created_by`/`updated_by` and `pii_erasures`.
- **Customer-defined roles.** Customization is data, not code
  ([06-customization-model.md](./06-customization-model.md)), so this is
  eventually rows in a `roles` table — the design
  `architecture-technical.md` describes. Not before the four fixed roles work.

---

## Related

- [05-architecture-decisions.md](./05-architecture-decisions.md) — ADR-003, tenancy by RLS
- [13-pii-encryption.md](./13-pii-encryption.md) — the sensitive set, and erasure
- [12-beta-deployment.md](./12-beta-deployment.md) — this is the second gap listed there
- [module-change-requests.md](./module-change-requests.md) — the self-service edit path
