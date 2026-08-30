# Role-Based Access Control

**Status:** specification. Nothing in this document is enforced yet — see
[Where we are today](#where-we-are-today)
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
| Role enforcement | **None.** `locals.tenantRole` is read in exactly one place — `(app)/+layout.server.ts`, to render "Owner" under the user's name in the sidebar |
| Write paths gated by role | **0 of 19** |

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

### Roles

Four tenant-wide roles, the values `tenant_users.role` already carries:

| Role | Who | Intent |
|---|---|---|
| `owner` | founder, admin | everything, including billing and tenant settings |
| `hr_admin` | HR / people ops | all employee data, compensation, payroll setup |
| `manager` | anyone with reports | their reporting chain, approvals for it |
| `member` | everyone | themselves, and public directory information |

`manager` is **not** a granted role in practice — it is a shape. Someone is a
manager of the people whose `employees.manager_id` chain reaches them, and
`wouldReportToSelf` in `employees.repo.ts` already walks that chain. A `manager`
role value without reports grants nothing extra.

### Scope, designed in and not yet used

`employee_group_roles` already carries `role_name` with optional
`department_code`, `location_code` and `expires_at` — scoped, time-bounded
grants — and the fixture holds `payroll_approver` scoped to `US-NYC`.

**Flat roles ship first.** But `can()` takes an optional scope from the outset:

```ts
can(ctx, "compensation.write")                       // tenant-wide
can(ctx, "payroll.approve", { location: "US-NYC" })  // later, no call-site change
```

so adopting scoped grants is additive rather than a rewrite of every check. A
firm operating in three countries will need "HR admin for the India entity
only"; it does not need it before payroll exists.

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

`self` = the row belongs to the acting employee. `reports` = the acting
employee is somewhere up the `manager_id` chain.

| Action | member | manager | hr_admin | owner |
|---|---|---|---|---|
| **See** own profile, pay, time off, attendance | ✅ | ✅ | ✅ | ✅ |
| See a colleague's directory entry (name, title, dept, office) | ✅ | ✅ | ✅ | ✅ |
| See a colleague's pay | ❌ | reports | ✅ | ✅ |
| See a colleague's tax ID / bank details | ❌ | ❌ | ✅ | ✅ |
| **Create / edit** an employee record | ❌ | ❌ | ✅ | ✅ |
| Edit own profile (address, phone, emergency contacts) | ✅ | ✅ | ✅ | ✅ |
| Archive an employee | ❌ | ❌ | ✅ | ✅ |
| **Change pay** (`addRaise`) | ❌ | ❌ | ✅ | ✅ |
| Approve time off | ❌ | reports, **never own** | ✅, **never own** | ✅, **never own** |
| Approve a timesheet | ❌ | reports | ✅ | ✅ |
| **Firm settings** (locations, departments, job titles, holidays, benefits, payroll policies, pay schedules) | ❌ | ❌ | ✅ | ✅ |
| Company profile, locales, currencies | ❌ | ❌ | ❌ | ✅ |
| Manage members and roles | ❌ | ❌ | ❌ | ✅ |
| Erase a data subject (GDPR Art. 17) | ❌ | ❌ | ❌ | ✅ |

**Never own** is absolute and applies to every role including `owner`. It is not
a permission that can be granted — it is the rule that stands between a manager
and unlimited self-granted holiday, and it is the one authorization check the
product already performs.

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

1. `can.ts`, the `AuthContext`, and the permission vocabulary — no behaviour change
2. Gate all 19 actions; each denial gets a test asserting `403`
3. The `authz/actions-are-guarded` guard, proved to fail on an unguarded action
4. `employee_id` into the token claim, with its verification
5. RLS visibility predicates on person-scoped tables
6. Subject-access export (GDPR Art. 15)
7. Scoped grants via `employee_group_roles`, when payroll needs them

Steps 1–3 close the pay-editing hole and are the ones that must land before
Phase 6.

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
