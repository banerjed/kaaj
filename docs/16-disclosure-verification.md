# Disclosure Verification: proving who can see what

**Status:** 📋 **specification — not implemented.** Written for offline review
and to survive a context reset.
**Created:** 2026-09-01

Two real disclosures reached `main` in this codebase, days apart, and neither
was found by a test:

- **L47** — every employee could read every colleague's salary from
  `/employees`. `compensation_base` carries a row policy and enforced it
  correctly; the query then read `COALESCE(cp.amount, e.base_amount)`, and
  `employees.base_amount` is an unprotected cache of the same figure. The
  policy hid the row and the query substituted the copy.
- **L55** — every employee could read every pay change in the firm from
  `audit_log`. The trail had tenant isolation and no row policy, which was
  tolerable until pay changes were audited into it.

Both were *correct-looking numbers in the right-looking columns*. 426 tests,
587 isolation checks, 133 invariants and 80 row-visibility tests could not see
either, for principled reasons set out in L48.

This document specifies the work that would make that class of failure
mechanically hard, **and states precisely what it still would not catch.** The
second half matters as much as the first: a check believed to be exhaustive and
is not is worse than no check, because it manufactures confidence.

---

## What already exists

| Component | Layer | Cases | Proves |
|---|---|---|---|
| `packages/database/tests/verify-rls.sql` | database | 587 | tenant A cannot read tenant B |
| `db/row-visibility.test.ts` | database | 80 | the row policies filter, per table per claim |
| `security/disclosure.test.ts` | database | 62 | each declared field is held by its declared mechanism |
| `auth/action-authz.test.ts` | **API — writes** | 109 | actions actually refuse the roles they must |
| `security/matrix.ts` | register | 6 tables | which values are sensitive, and what holds each |
| `scripts/verify-*.mjs` | build | 6 guards | code patterns that reintroduce a known bug |

**The gap is the API read layer.** Nothing asks whether a `load` can assemble a
response containing something the database would have refused. That is exactly
what L47 did.

`action-authz.test.ts` already contains three quarters of the machinery: it
imports real route modules, builds a synthetic `locals` per role, invokes the
deployed code path, and reads the outcome through `isHttpError`. It should be
extended rather than duplicated.

---

## The criterion

> For every read path, and every actor, no value may appear in the response
> that the disclosure matrix says that actor may not see.

Two properties follow, and both must be asserted:

1. **Reachability** — who may open the route at all (403 vs 200).
2. **Content** — what comes back. L47 returned **200 with the right people and
   the wrong data**, so a status-code assertion cannot see it. This is the half
   that matters.

---

## Work item 1 — extend the disclosure matrix

**Do this first. Everything downstream inherits its blind spots.**

`apps/web/src/lib/server/security/matrix.ts` covers 6 tables: `employees` and
the five `compensation_*`. The schema has 103. A value living only in an
unclassified table is never "forbidden", so no downstream check will flag it.

### Algorithm

```
for each base table T in the schema:
    if T holds data ABOUT A PERSON:
        if the whole row is scoped by a row policy:
            add T to PROTECTED_TABLES with { defense: "rls", audience, why }
        else:                                   # a broadly-visible row
            for each column C in T:
                classify C: rls | encrypted | projection | open
    else:                                       # firm business data
        classify T against a FUNCTIONAL-ROLE audience, not a
        relationship-to-subject one — this is a second axis and needs
        its own audience vocabulary (see "Open question" below)
```

### Priority order

Tables holding data about a person, most sensitive first:

1. `employee_bank_accounts`, `hr_emergency_contacts` — already policy-scoped,
   need classifying
2. `payroll_run_employees`, `payroll_employee_deductions`,
   `payroll_india_salary_structure`, `payroll_tax_withholding_certificates`
3. `hr_reviews`, `hr_feedback`, `hr_survey_responses`, `employment_terms`,
   `hr_employment_history`
4. `employee_certifications`, `employee_assets`, `employee_training_records`
5. `audit_log` — classified by the entry's *contents*, which is a special case:
   a pay-change entry is as sensitive as the pay it records

### Acceptance

`scripts/verify-matrix-complete.mjs` already fails on an unclassified column
within covered tables. Widen `COVERED_TABLES` in step with the register, so the
guard's scope grows as classification does.

### Open question for review

Firm business data (invoices, ledger, bank accounts) has a different audience
axis: a functional role, not a relationship to a subject. `accounting.read`
already gates those routes. **Decide whether that is enough, or whether a
second matrix is warranted.** Recommendation: a second matrix, because "which
role" and "which relationship" cannot share an `Audience` type without one of
them becoming meaningless.

---

## Work item 2 — the taint check over read paths

### Inputs

- **Route inventory** — by directory scan, so it is exhaustive by construction:
  - every `+page.server.ts` exporting `load` under `src/routes/(app)`
  - every `+server.ts` exporting `GET`
  - **plus every `actions` export** — actions return data too, and today some
    return whole rows: `{ company: tenant }`, `{ locations: rows }`,
    `{ saved: true, company: saved }`
- **Actor archetypes** — the 11 in `disclosure.test.ts`, which must include the
  roles that are powerful *elsewhere*: `finance_admin`, `it_admin`,
  `legal_admin`, `project_manager`. Those are the limits nobody tests.
- **A register** of per-route expectations: sample params, query-string
  variants, and expected reachability per actor.

### Algorithm

```
FORBIDDEN(actor):
    # Driven by the MATRIX, not by diffing RLS. Diffing makes the database the
    # oracle, and a value with no protected home is then never forbidden —
    # which is exactly the state audit_log was in.
    values = {}
    for each field F in matrix where audience(F) excludes actor:
        read F's values from the database AS A PRIVILEGED ACTOR
        values += those values, tagged with F
    return values

for each route R, for each actor A, for each variant V:
    outcome = invoke R as A with V          # real module, synthetic locals
    assert reachability(R, A) == (outcome is not 403)
    if outcome is data:
        for each (value, field) in FORBIDDEN(A):
            assert value does not appear in outcome
```

### Comparison rule

Compare **per field**, not by raw string containment. `JSON.stringify(x).includes("100.00")`
matches an unrelated invoice line; tuning that down creates false negatives
instead. Walk the response, and for each leaf compare against the forbidden set
for the field it came from.

Fixture values for sensitive fields should be **distinctive by construction**
so a collision is impossible rather than unlikely.

### Exhaustiveness

A route absent from the register fails the run — the same "decide, do not
default" shape as `verify-audit-coverage.mjs` and the disclosure matrix.
Replace `action-authz.test.ts`'s hardcoded `expect(named + timeOff).toBe(25)`
with the directory scan; the hand-maintained `const timeOff = 1` fudge beside
it is exactly the drift a scan removes.

### Scale

30 loads × 11 actors ≈ 330 invocations, plus actions and variants. Expect
30–90 seconds. **Measure before deciding** whether it joins `./check` or runs
as `./check --security` in CI and before deploys.

---

## Work item 3 — route variants

Loads read `url.searchParams`, and a filter can widen visibility: `/employees`
honours `?inactive=1`. Testing with an empty query string leaves that path
unexercised.

Declare per route, in the register, the variants that change what is returned —
at minimum every filter the load reads. The set is unbounded in principle;
declaring the ones the code actually branches on is the achievable version, and
a load reading a parameter absent from its variants should fail the run.

---

## Work item 4 — scenario coverage in the fixture

`scripts/verify-fixture-coverage.mjs` enforces that no column of a
personal-data table is empty. It does **not** enforce that the *situations*
exist. No scenario means no value, which means no leak, which means a green
test — L50 one level up.

Add a committed list of required scenarios, each with the query that proves it:

- a terminated employee (`employment_status = 'terminated'`)
- a tenant member with no employee record (an external accountant)
- an employee with no compensation record
- a second employee in the same department (so an average of two reveals one)
- an archived row in every table carrying `archived_at`

---

## Work item 5 — what stays discipline, and must be written down

These are **not** mechanisable by this approach. They belong in CLAUDE.md's
checklist as questions asked during review, because no harness will ask them.

**Inference and aggregation.** A response need not contain a value to reveal
it. "Average salary in your department" with two people in the department, plus
your own salary, gives the other exactly. A count — "3 colleagues earn above
£100k" — narrows. A directory *sorted* by salary leaks the ordering with no
figure shown. String comparison cannot see any of it.
→ **Rule: any feature that aggregates, counts, ranks or sorts by a restricted
value needs review as a disclosure, not as a feature.**

**Existence oracles.** `404` versus `403` tells an attacker whether a row
exists. "No such employee" and "you may not see this employee" are different
disclosures.
→ **Rule: a refused read returns the same status and message whether or not the
row exists.** Worth auditing the current 404/403 split as its own task.

**Timing and error text.** A query slower when a row exists; a constraint
violation echoing a value.

**The archetype sample.** 11 actors against 4 base roles × 2⁹ functional
combinations × relationship-to-subject. A leak requiring `it_admin` *and* being
someone's manager is not covered. Mitigation: assert that the permission model
makes no distinctions the archetype list does not cover.

---

## What this would and would not have caught

| | Caught? | Why |
|---|---|---|
| L47 — salary via `COALESCE` | ✅ | a forbidden value appeared in a load's response |
| L55 — pay via `audit_log` | ✅ | same, provided `FORBIDDEN` is matrix-driven rather than RLS-diffed |
| A future `COALESCE` onto a new cache | ✅ | value-based, not pattern-based |
| An unclassified table leaking | ❌ | not in the matrix, so not forbidden — hence work item 1 first |
| "Average salary in your team" | ❌ | inference; no value appears |
| 404 vs 403 revealing existence | ❌ | not in the response body |
| A leak only for an archived employee | ❌ | unless the scenario is in the fixture |

---

## Order, and why

1. **Extend the matrix** — everything downstream inherits its coverage
2. **Taint check** over loads, actions and `+server.ts`, matrix-driven
3. **Route variants** in the register
4. **Scenario coverage** in the fixture guard
5. **Write the discipline rules** into CLAUDE.md

Items 2–4 are perhaps a day together. Item 1 is the larger and less glamorous
piece, and skipping it would produce a harness that runs 330 checks and proves
less than it appears to.

## What this is not

It is an exhaustive check over **one channel** (response bodies), against **one
definition of sensitive** (the register), with **one fixture's data**. It makes
a large class of disclosure mechanically hard to reintroduce. It is not a proof
that no information leaks, and it should never be described as one.
