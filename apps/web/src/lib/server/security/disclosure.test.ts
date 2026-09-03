import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import {
  PROTECTED_TABLES,
  SENSITIVE_FIELDS,
  type Audience,
  type SensitiveField,
} from "./matrix"

/**
 * The disclosure matrix, executed — every field x every actor archetype,
 * generated rather than written out, so each is checked the SAME WAY.
 * Connects as `app_user` directly, like row-visibility.test.ts: the question
 * is what the DATABASE hands a claim. Projection defense is asserted
 * separately, in employees.test.ts.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"

/** The subject of every case: managed by Aisha, unrelated to Marcus. */
const JAMES = "c095eafa-952e-5047-961a-82ce7b45cbf1"
const AISHA = "11f31511-ad53-59c7-9e90-8ee3b553489b"
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757"
const RACHEL = "a87e0200-0849-53b6-a491-e882feace3f5"

const sql = postgres(
  process.env.APP_DATABASE_URL ??
    "postgresql://app_user:app_user@127.0.0.1:54322/postgres",
  { max: 2, types: {}, onnotice: () => {} },
)

type Actor = {
  name: string
  employeeId: string | null
  role: string
  functionalRoles: string[]
  /** Relationship to JAMES, which is what the audience rules are written against. */
  relation:
    | "self"
    | "manager"
    | "colleague"
    | "hr"
    | "payroll"
    | "auditor"
    | "admin"
    /** Privileged in their OWN domain, ordinary here — e.g. IT, finance, legal. */
    | "other_admin"
}

const ACTORS: Actor[] = [
  {
    name: "the person themselves",
    employeeId: JAMES,
    role: "employee",
    functionalRoles: [],
    relation: "self",
  },
  {
    name: "their manager",
    employeeId: AISHA,
    role: "employee",
    functionalRoles: [],
    relation: "manager",
  },
  {
    name: "an unrelated colleague",
    employeeId: MARCUS,
    role: "employee",
    functionalRoles: [],
    relation: "colleague",
  },
  {
    name: "a contractor",
    employeeId: MARCUS,
    role: "contractor",
    functionalRoles: [],
    relation: "colleague",
  },
  {
    name: "HR",
    employeeId: RACHEL,
    role: "employee",
    functionalRoles: ["hr_admin"],
    relation: "hr",
  },
  {
    name: "payroll",
    employeeId: RACHEL,
    role: "employee",
    functionalRoles: ["payroll_admin"],
    relation: "payroll",
  },
  {
    name: "an auditor",
    employeeId: RACHEL,
    role: "employee",
    functionalRoles: ["auditor"],
    relation: "auditor",
  },

  // Each of these four administers a real part of the firm, but not salary.
  {
    name: "IT",
    employeeId: MARCUS,
    role: "employee",
    functionalRoles: ["it_admin"],
    relation: "other_admin",
  },
  {
    name: "finance",
    employeeId: MARCUS,
    role: "employee",
    functionalRoles: ["finance_admin"],
    relation: "other_admin",
  },
  {
    name: "legal",
    employeeId: MARCUS,
    role: "employee",
    functionalRoles: ["legal_admin"],
    relation: "other_admin",
  },
  {
    name: "a project manager",
    employeeId: AISHA,
    role: "employee",
    functionalRoles: ["project_manager"],
    relation: "other_admin",
  },
]

/** The audience rules, in one place, applied uniformly. */
function mayRead(audience: Audience, relation: Actor["relation"]): boolean {
  // `other_admin` is deliberately NOT privileged; `auditor` is (the row
  // policies grant it — an audit function must be able to see pay).
  const privileged =
    relation === "hr" ||
    relation === "payroll" ||
    relation === "auditor" ||
    relation === "admin"
  switch (audience) {
    case "colleagues":
      return true
    case "self+manager+hr":
      return privileged || relation === "self" || relation === "manager"
    case "self+hr":
      return privileged || relation === "self"
    case "hr+payroll":
      return privileged
  }
}

async function asActor<T>(
  a: Actor,
  fn: (tx: postgres.Sql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SET LOCAL ROLE app_user`
    await tx`SELECT set_config('request.jwt.claims', ${JSON.stringify({
      app_metadata: {
        tenant_id: NORTHWIND,
        employee_id: a.employeeId,
        role: a.role,
        functional_roles: a.functionalRoles,
      },
    })}, true)`
    return fn(tx as unknown as postgres.Sql)
  }) as Promise<T>
}

/** Does this actor get a row carrying the field, for the subject? */
async function readsColumn(a: Actor, f: SensitiveField): Promise<boolean> {
  const keyed = f.table === "employees" ? "id" : "employee_id"
  const rows = await asActor(a, (tx) =>
    tx.unsafe(`SELECT ${f.column} AS v FROM ${f.table} WHERE ${keyed} = $1`, [
      JAMES,
    ]),
  )
  return rows.length > 0
}

describe("the disclosure matrix", () => {
  afterAll(async () => {
    await sql.end()
  })

  it("covers every field with a declared reason", () => {
    for (const f of SENSITIVE_FIELDS) {
      expect(f.why.length, `${f.id} has no reason`).toBeGreaterThan(30)
    }
  })

  // -- defense: rls --------------------------------------------------------
  // Per TABLE, not per column: the row policy scopes the whole row. Asserts
  // BOTH directions — a too-tight policy blanks a page rather than erroring
  // (L21), so "denied" is only meaningful alongside "the subject sees it".
  for (const [table, rule] of Object.entries(PROTECTED_TABLES)) {
    for (const a of ACTORS) {
      const allowed = mayRead(rule.audience, a.relation)
      it(`${table}: the subject's row ${allowed ? "reaches" : "is hidden from"} ${a.name}`, async () => {
        const rows = await asActor(a, (tx) =>
          tx.unsafe(`SELECT 1 FROM ${table} WHERE employee_id = $1`, [JAMES]),
        )
        expect(rows.length > 0).toBe(allowed)
      })
    }
  }

  it("every policy-scoped table has a fixture row for the subject", async () => {
    // Without this the negative cases above are vacuous (an empty table
    // passes "cannot see it" for the wrong reason).
    for (const table of Object.keys(PROTECTED_TABLES)) {
      const rows = await asActor(
        ACTORS.find((a) => a.relation === "hr")!,
        (tx) =>
          tx.unsafe(`SELECT 1 FROM ${table} WHERE employee_id = $1`, [JAMES]),
      )
      expect(
        rows.length,
        `${table} has no fixture row for the test subject, so every "is hidden from" case against it proves nothing`,
      ).toBeGreaterThan(0)
    }
  })

  // -- defense: projection -------------------------------------------------
  // Row is visible (employees is a directory), so RLS can't help; the guard
  // in verify-no-unprotected-fallback.mjs must cover every such field.
  const projected = SENSITIVE_FIELDS.filter((x) => x.defense === "projection")
  it("every projection-defended field is named in the build guard", async () => {
    const { readFileSync } = await import("node:fs")
    const guard = readFileSync(
      new URL(
        "../../../../../../scripts/verify-no-unprotected-fallback.mjs",
        import.meta.url,
      ),
      "utf8",
    )
    for (const f of projected) {
      expect(
        guard.includes(`"${f.column}"`),
        `${f.id} declares defense "projection" but the guard does not forbid reading ${f.column}. ` +
          `Nothing is holding it.`,
      ).toBe(true)
    }
  })

  it("a projection-defended row IS still readable — the defense is not RLS", async () => {
    const colleague = ACTORS.find((a) => a.relation === "colleague")!
    const rows = await asActor(
      colleague,
      (tx) => tx`SELECT id FROM employees WHERE id = ${JAMES}`,
    )
    expect(rows.length).toBe(1)
  })

  // -- defense: encrypted --------------------------------------------------
  for (const f of SENSITIVE_FIELDS.filter((x) => x.defense === "encrypted")) {
    it(`${f.id}: is ciphertext at rest, not plaintext`, async () => {
      const rows = await asActor(
        ACTORS.find((a) => a.relation === "hr")!,
        (tx) =>
          tx.unsafe(
            `SELECT ${f.column} AS v FROM ${f.table} WHERE ${f.table === "employees" ? "id" : "employee_id"} = $1`,
            [JAMES],
          ),
      )
      const v = (rows[0] as unknown as { v: string | null } | undefined)?.v
      if (v === null || v === undefined) return // nothing stored for this person
      expect(v).not.toMatch(/^\d{3}-?\d{2}-?\d{4}$/)
      expect(v.length).toBeGreaterThan(20)
    })
  }

  // -- defense: open -------------------------------------------------------
  for (const f of SENSITIVE_FIELDS.filter((x) => x.defense === "open")) {
    it(`${f.id}: is deliberately readable by a colleague`, async () => {
      const colleague = ACTORS.find((a) => a.relation === "colleague")!
      expect(await readsColumn(colleague, f)).toBe(true)
    })
  }
})
