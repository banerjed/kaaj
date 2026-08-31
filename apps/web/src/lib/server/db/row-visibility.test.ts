import { describe, expect, it } from "vitest"
import postgres from "postgres"
import { can, type AuthContext } from "../auth/can"

/**
 * Row-level visibility — docs/15-row-level-visibility.md.
 *
 * These connect as `app_user` directly rather than through `withTenant`,
 * because the point is what the DATABASE returns for a given claim. Going
 * through the application would test the application.
 *
 * **Every case asserts what a role CAN see, not only what it cannot.** A
 * RESTRICTIVE policy that is too tight blanks a page rather than erroring
 * (L21), which is this codebase's default failure mode — so "returns nothing"
 * is never on its own evidence that a policy is right.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"
const PRIYA = "bf17b1af-963b-53ef-9083-21506fb34e9c"
const NADIA = "385f5ae5-e567-5fb6-98f8-b45007099ff8"

const sql = postgres(
  process.env.APP_DATABASE_URL ??
    "postgresql://app_user:app_user@127.0.0.1:54322/postgres",
  { max: 2, types: {}, onnotice: () => {} },
)

type Who = {
  employeeId?: string | null
  role?: string
  functionalRoles?: string[]
  tenantId?: string
}

/** One transaction, claim set the way withTenant sets it. */
async function asRole<T>(
  who: Who,
  fn: (tx: postgres.Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      app_metadata: {
        tenant_id: who.tenantId ?? NORTHWIND,
        employee_id: who.employeeId ?? null,
        role: who.role ?? "employee",
        functional_roles: who.functionalRoles ?? [],
      },
    })}, true)`
    return fn(tx as unknown as postgres.Sql)
  }) as Promise<T>
}

const counts = (who: Who) =>
  asRole(who, async (tx) => {
    const [r] = await tx<{ employees: number; pay: number }[]>`
      SELECT (SELECT count(*)::int FROM employees) AS employees,
             (SELECT count(*)::int FROM compensation_base) AS pay
    `
    return r
  })

describe("the staff directory", () => {
  it("is visible to an employee — colleagues need to find each other", async () => {
    // The directory is not a secret. Sensitive fields on a record are gated by
    // pii.read / pii.reveal, not by hiding the row.
    const c = await counts({ employeeId: MARCUS, role: "employee" })
    expect(c.employees).toBe(12)
  })

  it("is NOT visible to a contractor — they see only themselves", async () => {
    const c = await counts({ employeeId: MARCUS, role: "contractor" })
    expect(c.employees).toBe(1)
  })

  it("shows nothing at all without a claim", async () => {
    // Fails closed. A token minted before the claim existed, or a malformed
    // one, must mean "no rows", never "every row".
    const c = await counts({ employeeId: null, role: "" })
    expect(c.employees).toBe(0)
    expect(c.pay).toBe(0)
  })

  it("treats an unrecognised role as the floor", async () => {
    // Not an escalation, and not a blank page for someone who has a record.
    const c = await counts({ employeeId: MARCUS, role: "superuser" })
    expect(c.employees).toBe(1)
  })
})

describe("pay", () => {
  it("shows an employee their own, and only their own", async () => {
    const c = await counts({ employeeId: MARCUS, role: "employee" })
    expect(c.pay).toBe(2) // Marcus's two effective-dated records
    const rows = await asRole(
      { employeeId: MARCUS, role: "employee" },
      (tx) =>
        tx<
          { employee_id: string }[]
        >`SELECT employee_id FROM compensation_base`,
    )
    expect(rows.every((r) => r.employee_id === MARCUS)).toBe(true)
  })

  it("shows hr_admin and payroll_admin everyone's", async () => {
    for (const role of ["hr_admin", "payroll_admin"]) {
      const c = await counts({
        employeeId: MARCUS,
        role: "employee",
        functionalRoles: [role],
      })
      expect(c.pay, role).toBe(24)
    }
  })

  it("shows it_admin the directory and NOT the pay", async () => {
    // The separation rule, now holding at the row level as well as in can():
    // IT administers systems, not salaries.
    const c = await counts({
      employeeId: MARCUS,
      role: "employee",
      functionalRoles: ["it_admin"],
    })
    expect(c.employees).toBe(12)
    expect(c.pay).toBe(2)
  })

  it("shows owner and firm_admin everyone's", async () => {
    for (const role of ["owner", "firm_admin"]) {
      const c = await counts({ employeeId: MARCUS, role })
      expect(c.pay, role).toBe(24)
    }
  })
})

describe("RLS and can() agree", () => {
  // The divergence problem again — a policy and application code enforcing the
  // same rule. Not merged: asserted to agree, the same answer used for the two
  // test suites.
  const ctx = (role: string, functionalRoles: string[] = []): AuthContext => ({
    tenantId: NORTHWIND,
    userId: "00000000-0000-0000-0000-000000000001",
    employeeId: MARCUS,
    role: role as AuthContext["role"],
    functionalRoles,
  })

  it("gives the same answer on who reads all compensation", async () => {
    const cases: [string, string[]][] = [
      ["employee", []],
      ["employee", ["hr_admin"]],
      ["employee", ["payroll_admin"]],
      ["employee", ["it_admin"]],
      ["employee", ["finance_admin"]],
      ["owner", []],
      ["firm_admin", []],
      ["contractor", []],
    ]
    for (const [role, fns] of cases) {
      const viaPolicy =
        (
          await counts({
            employeeId: MARCUS,
            role,
            functionalRoles: fns,
          })
        ).pay === 24
      const viaCan = can(ctx(role, fns), "compensation.read.all")
      expect(viaPolicy, `${role}+${fns.join("+") || "none"}`).toBe(viaCan)
    }
  })

  it("gives the same answer on who reads every employee", async () => {
    for (const [role, fns] of [
      ["employee", ["hr_admin"]],
      ["employee", ["payroll_admin"]],
      ["owner", []],
      ["firm_admin", []],
    ] as [string, string[]][]) {
      const viaPolicy =
        (
          await counts({
            employeeId: MARCUS,
            role,
            functionalRoles: fns,
          })
        ).employees === 12
      expect(viaPolicy, `${role}+${fns.join("+")}`).toBe(
        can(ctx(role, fns), "employee.read.all"),
      )
    }
  })
})

describe("tenant isolation still holds underneath", () => {
  it("shows nothing for another tenant, whatever the role", async () => {
    // RESTRICTIVE is AND-ed with tenant_isolation, so it can only narrow —
    // but a policy that accidentally widened would show here.
    const c = await counts({
      employeeId: MARCUS,
      role: "owner",
      tenantId: "00000000-0000-0000-0000-0000000000ff",
    })
    expect(c.employees).toBe(0)
    expect(c.pay).toBe(0)
  })
})

// -----------------------------------------------------------------------------
// The rest of Tier 1
// -----------------------------------------------------------------------------

/**
 * What each role should see in each table, as row counts against the fixture.
 *
 * Table-driven because the interesting property is the SHAPE of the matrix —
 * that payroll_admin reads every salary and no review, that it_admin reads
 * neither, that everyone reads their own. Written out per table, those facts
 * scroll past; side by side they are checkable.
 *
 * Every number is what the role CAN see. A RESTRICTIVE policy that is too
 * tight blanks a page rather than erroring (L21), so "0" as a universal
 * expectation would pass while the app was broken.
 */
const TIER1: {
  table: string
  total: number
  /** What MARCUS, a plain employee, sees of his own. */
  own: number
  /** Grants that read the whole table. */
  readsAll: string[]
}[] = [
  {
    table: "compensation_allowances",
    total: 5,
    own: 2,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "compensation_variable",
    total: 5,
    own: 0,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    // Absent from this list until the fixture gained rows: with zero rows the
    // suite had nothing to assert, so a policy that was never exercised looked
    // indistinguishable from one that passed.
    table: "compensation_premiums",
    total: 2,
    own: 0,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "compensation_equity",
    total: 4,
    own: 0,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "employment_terms",
    total: 12,
    own: 1,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "hr_employment_history",
    total: 8,
    own: 2,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "payroll_run_employees",
    total: 13,
    own: 1,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "payroll_employee_deductions",
    total: 8,
    own: 2,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "employee_bank_accounts",
    total: 7,
    own: 1,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "hr_emergency_contacts",
    total: 3,
    own: 1,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  {
    table: "hr_employee_documents",
    total: 2,
    own: 0,
    readsAll: ["hr_admin", "payroll_admin", "auditor"],
  },
  // Performance is a NARROWER grant: payroll has no business in a review.
  { table: "hr_reviews", total: 4, own: 1, readsAll: ["hr_admin", "auditor"] },
  {
    table: "hr_survey_responses",
    total: 3,
    own: 0,
    readsAll: ["hr_admin", "auditor"],
  },
]

const countOf = (who: Who, table: string) =>
  asRole(who, async (tx) => {
    const [r] = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ${tx.unsafe(table)}
    `
    return r.n
  })

describe("Tier 1: every role sees what it should", () => {
  for (const spec of TIER1) {
    describe(spec.table, () => {
      it("shows an owner everything", async () => {
        expect(
          await countOf({ employeeId: MARCUS, role: "owner" }, spec.table),
        ).toBe(spec.total)
      })

      it("shows a plain employee only their own", async () => {
        expect(
          await countOf({ employeeId: MARCUS, role: "employee" }, spec.table),
        ).toBe(spec.own)
      })

      it("shows it_admin only their own — IT administers systems, not people", async () => {
        // The separation rule, in the database rather than only in can().
        expect(
          await countOf(
            {
              employeeId: MARCUS,
              role: "employee",
              functionalRoles: ["it_admin"],
            },
            spec.table,
          ),
        ).toBe(spec.own)
      })

      it("shows nothing without a claim", async () => {
        expect(await countOf({ employeeId: null, role: "" }, spec.table)).toBe(
          0,
        )
      })

      it(`grants the whole table to exactly ${spec.readsAll.join(", ")}`, async () => {
        // Both directions: the named grants see all of it, and every other
        // functional role sees only their own. A policy that granted too widely
        // would pass a "denies a stranger" test and fail this one.
        for (const role of spec.readsAll) {
          expect(
            await countOf(
              { employeeId: MARCUS, role: "employee", functionalRoles: [role] },
              spec.table,
            ),
            `${role} should read all of ${spec.table}`,
          ).toBe(spec.total)
        }
        const others = [
          "finance_admin",
          "sales_admin",
          "marketing_admin",
          "it_admin",
          "legal_admin",
          "project_manager",
        ].filter((r) => !spec.readsAll.includes(r))
        for (const role of others) {
          expect(
            await countOf(
              { employeeId: MARCUS, role: "employee", functionalRoles: [role] },
              spec.table,
            ),
            `${role} should NOT read all of ${spec.table}`,
          ).toBe(spec.own)
        }
      })
    })
  }
})

describe("feedback visibility is its own shape", () => {
  it("shows a public note to everyone, and private ones only to the two people", async () => {
    // Not in the table above because `own` is not the right idea here: a note
    // has an author AND a recipient, and public ones belong to the firm.
    const asStranger = await countOf(
      { employeeId: NADIA, role: "employee" },
      "hr_feedback",
    )
    const asRecipient = await countOf(
      { employeeId: MARCUS, role: "employee" },
      "hr_feedback",
    )
    expect(asStranger).toBe(1) // the public one only
    expect(asRecipient).toBeGreaterThan(asStranger)
  })

  it("lets an author see their own anonymous note", async () => {
    // The one place the author of an anonymous note is legitimately known,
    // because it is them. PRIYA wrote FB-004 anonymously.
    const rows = await asRole(
      { employeeId: PRIYA, role: "employee" },
      (tx) =>
        tx<{ feedback_id: string }[]>`SELECT feedback_id FROM hr_feedback`,
    )
    expect(rows.map((r) => r.feedback_id)).toContain("FB-004")
  })

  it("does not show that note to its recipient's colleagues", async () => {
    const rows = await asRole(
      { employeeId: NADIA, role: "employee" },
      (tx) =>
        tx<{ feedback_id: string }[]>`SELECT feedback_id FROM hr_feedback`,
    )
    expect(rows.map((r) => r.feedback_id)).not.toContain("FB-004")
  })
})

describe("a reviewer reads the reviews they are writing", () => {
  it("without holding a performance grant", async () => {
    // Sarah reviews three people and holds no functional role beyond owner in
    // the fixture; as a plain employee she must still reach her own drafts.
    const n = await countOf(
      { employeeId: SARAH, role: "employee" },
      "hr_reviews",
    )
    expect(n).toBe(3) // the three she writes; she has no review of her own
  })
})
