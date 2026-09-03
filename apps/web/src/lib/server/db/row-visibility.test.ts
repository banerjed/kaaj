import { describe, expect, it } from "vitest"
import postgres from "postgres"
import { can, type AuthContext } from "../auth/can"

/**
 * Row-level visibility — docs/15-row-level-visibility.md. Connects as
 * `app_user` directly (not through `withTenant`), since the point is what the
 * DATABASE returns. Every case asserts what a role CAN see too — a too-tight
 * RESTRICTIVE policy blanks a page rather than erroring (L21).
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
    const c = await counts({ employeeId: MARCUS, role: "employee" })
    expect(c.employees).toBe(12)
  })

  it("is NOT visible to a contractor — they see only themselves", async () => {
    const c = await counts({ employeeId: MARCUS, role: "contractor" })
    expect(c.employees).toBe(1)
  })

  it("shows nothing at all without a claim", async () => {
    // Fails closed — a malformed claim means "no rows", never "every row".
    const c = await counts({ employeeId: null, role: "" })
    expect(c.employees).toBe(0)
    expect(c.pay).toBe(0)
  })

  it("treats an unrecognised role as the floor", async () => {
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
  // Policy and application code enforcing the same rule — not merged, asserted to agree.
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
 * Table-driven so the shape of the matrix is checkable side by side, and every
 * number is what a role CAN see — "0" everywhere would pass a broken app (L21).
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
    // Not in TIER1: a note has an author AND a recipient, not just an owner.
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
    // PRIYA wrote FB-004 anonymously — the one place its author is legitimately known.
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
    const n = await countOf(
      { employeeId: SARAH, role: "employee" },
      "hr_reviews",
    )
    expect(n).toBe(3) // the three she writes; she has no review of her own
  })
})

/**
 * Accounting — the firm's money, not the tenant's noticeboard. These tables
 * once carried only `tenant_isolation`; the application already refused
 * non-finance roles, but RLS didn't, so one missed guard disclosed everything.
 */
const ACCOUNTING = [
  "invoices",
  "bank_accounts",
  "payments",
  "journal_entries",
  "vendors",
  "expenses",
] as const

describe("accounting is visible to the finance function, and to nobody else", () => {
  // Fixture rows must exist, or these assertions pass vacuously over NULL (L50).
  for (const table of ACCOUNTING) {
    it(`${table}: finance_admin sees rows, and there ARE rows`, async () => {
      const n = await countOf(
        { role: "employee", functionalRoles: ["finance_admin"] },
        table,
      )
      expect(n).toBeGreaterThan(0)
    })

    it(`${table}: a plain employee sees none`, async () => {
      const n = await countOf({ role: "employee" }, table)
      expect(n).toBe(0)
    })

    it(`${table}: a powerful role from ANOTHER function sees none`, async () => {
      for (const fr of ["hr_admin", "it_admin", "payroll_admin"]) {
        expect(
          await countOf({ role: "employee", functionalRoles: [fr] }, table),
        ).toBe(0)
      }
    })

    it(`${table}: an owner sees rows`, async () => {
      expect(await countOf({ role: "owner" }, table)).toBeGreaterThan(0)
    })
  }

  it("an auditor reads accounting but cannot write it", async () => {
    const auditor = { role: "employee", functionalRoles: ["auditor"] }
    expect(await countOf(auditor, "invoices")).toBeGreaterThan(0)

    // RESTRICTIVE on UPDATE filters rows rather than raising — the refusal is a zero-row result.
    const updated = await asRole(auditor, async (tx) => {
      const rows = await tx<{ id: string }[]>`
        UPDATE invoices SET notes = 'probe' RETURNING id
      `
      return rows.length
    })
    expect(updated).toBe(0)
  })

  it("a plain employee cannot insert a bank account", async () => {
    await expect(
      asRole(
        { role: "employee" },
        (tx) =>
          tx`INSERT INTO bank_accounts (tenant_id, account_name)
           VALUES (${NORTHWIND}, 'probe')`,
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it("a malformed claim reads no accounting, rather than raising", async () => {
    const n = await sql.begin(async (tx) => {
      await tx`SET LOCAL ROLE app_user`
      await tx`SELECT set_config('request.jwt.claims', 'not-json', true)`
      const [r] = await tx<{ n: number }[]>`
        SELECT count(*)::int AS n FROM invoices
      `
      return r.n
    })
    expect(n).toBe(0)
  })
})
