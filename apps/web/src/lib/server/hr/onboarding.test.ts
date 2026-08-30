import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import * as onboarding from "./hr_onboarding.repo"

/**
 * Onboarding, against the real database. Read-only.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/**
 * Repositories are tested as an actor who reads everything, so a row-visibility
 * policy does not silently narrow what a repository test sees. Visibility has
 * its own tests in db/row-visibility.test.ts.
 */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [],
  employeeId: null,
}
const OLIVER = "56bd1329-6740-572f-aa90-c44d1b27bedf" // the fixture's new hire
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

describe("choosing a template", () => {
  it("gives an engineer the engineering template, not the default", async () => {
    // Both match: STANDARD is the default and matches everyone, ENGINEERING
    // names the department. Without a defined rule the winner would be
    // whichever row was read first — so a hire's plan would depend on physical
    // row order and change silently after a VACUUM.
    const t = await withTenant(AS_OWNER, (tx) =>
      onboarding.templateFor(tx, {
        departmentCode: "ENG",
        locationCode: "US-NYC",
        employmentType: "full_time",
      }),
    )
    expect(t?.template_code).toBe("ENGINEERING")
  })

  it("falls back to the default for a department with no template", async () => {
    const t = await withTenant(AS_OWNER, (tx) =>
      onboarding.templateFor(tx, {
        departmentCode: "SALES",
        locationCode: "UK-LON",
        employmentType: "full_time",
      }),
    )
    expect(t?.template_code).toBe("STANDARD")
    expect(t?.is_default).toBe(true)
  })

  it("gives the same answer every time, whatever the row order", async () => {
    // The property the specificity rule exists for. Ten reads, one answer.
    const answers = await withTenant(AS_OWNER, async (tx) => {
      const out: (string | undefined)[] = []
      for (let i = 0; i < 10; i++) {
        const t = await onboarding.templateFor(tx, {
          departmentCode: "ENG",
          locationCode: "IN-BLR",
          employmentType: "full_time",
        })
        out.push(t?.template_code)
      }
      return out
    })
    expect(new Set(answers).size).toBe(1)
  })

  it("respects employment type as a filter", async () => {
    const t = await withTenant(AS_OWNER, (tx) =>
      onboarding.templateFor(tx, {
        departmentCode: "ENG",
        locationCode: null,
        employmentType: "contractor",
      }),
    )
    // Neither template lists contractor, so nothing applies — a configuration
    // gap, and better shown than papered over with an empty plan.
    expect(t).toBeNull()
  })

  it("reports nothing ambiguous today", async () => {
    // templateFor always answers, because a hire needs a plan. This says
    // whether the answer was a coin toss.
    const tied = await withTenant(AS_OWNER, (tx) =>
      onboarding.ambiguousFor(tx, {
        departmentCode: "ENG",
        locationCode: "US-NYC",
        employmentType: "full_time",
      }),
    )
    expect(tied).toEqual([])
  })

  it("ranks specificity: department beats default", async () => {
    const all = await withTenant(AS_OWNER, (tx) => onboarding.templates(tx))
    const eng = all.find((t) => t.template_code === "ENGINEERING")!
    const std = all.find((t) => t.template_code === "STANDARD")!
    expect(eng.specificity).toBeGreaterThan(std.specificity)
    expect(std.specificity).toBe(0)
  })
})

describe("the plan a template produces", () => {
  it("dates every task from the start date, including the ones before it", async () => {
    // Offsets run from -7 (pre-boarding: kit ordered before the person
    // exists in the building) to +90.
    const plan = await withTenant(AS_OWNER, async (tx) => {
      const t = await onboarding.templateFor(tx, {
        departmentCode: "SALES",
        locationCode: null,
        employmentType: "full_time",
      })
      return onboarding.planFor(tx, t!.id, "2026-09-01")
    })

    expect(plan.length).toBe(11)
    // -7 from 1 September is 25 August, which is calendar arithmetic rather
    // than 86,400-second arithmetic — the difference shows up across a
    // daylight-saving boundary.
    expect(plan[0].due_offset_days).toBe(-7)
    expect(plan[0].due_date).toBe("2026-08-25")
    const last = plan[plan.length - 1]
    expect(last.due_offset_days).toBe(90)
    expect(last.due_date).toBe("2026-11-30")
  })

  it("orders by when a task is due, not by how it was entered", async () => {
    const plan = await withTenant(AS_OWNER, async (tx) => {
      const t = await onboarding.templateFor(tx, {
        departmentCode: "SALES",
        locationCode: null,
        employmentType: "full_time",
      })
      return onboarding.planFor(tx, t!.id, "2026-09-01")
    })
    const dates = plan.map((p) => p.due_date!)
    expect([...dates].sort()).toEqual(dates)
  })
})

describe("a hire's actual tasks", () => {
  it("status and completion date agree on every row", async () => {
    // "completed" with no date leaves nothing to answer "when?" — the question
    // an auditor asks about a signed contract or a security training.
    const bad = await withTenant(AS_OWNER, (tx) => onboarding.inconsistent(tx))
    expect(bad).toEqual([])
  })

  it("lists what one person still owes", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      onboarding.tasks(tx, { employeeId: OLIVER }),
    )
    expect(rows).toHaveLength(3)
    expect(rows.filter((t) => t.status === "completed")).toHaveLength(2)
  })

  it("lists what is assigned to someone else about that person", async () => {
    // The 90-day conversation is Oliver's task in the sense that it is about
    // him, and Sarah's in the sense that she has to do it.
    const rows = await withTenant(AS_OWNER, (tx) =>
      onboarding.tasks(tx, { assignedTo: SARAH }),
    )
    expect(rows.map((t) => t.task_id)).toEqual(["OB-E011-003"])
    expect(rows[0].employee_name).toContain("Oliver")
  })

  it("does not raise on empty filters", async () => {
    // '' is not a uuid and SQL does not short-circuit (L37).
    const rows = await withTenant(AS_OWNER, (tx) =>
      onboarding.tasks(tx, { employeeId: "", assignedTo: "" }),
    )
    expect(rows).toHaveLength(3)
  })
})
