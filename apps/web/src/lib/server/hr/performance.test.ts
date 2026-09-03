import { describe, expect, it } from "vitest"
import { withTenant } from "../db/tenant"
import * as reviews from "./hr_reviews.repo"
import * as goals from "./hr_goals.repo"
import * as feedback from "./hr_feedback.repo"

/**
 * Performance reviews, against the real database. Read-only.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
/** Tested as an owner so RLS doesn't narrow what the test sees (see db/row-visibility.test.ts). */
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [],
  employeeId: null,
}
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932" // reviewer on three
const PRIYA = "bf17b1af-963b-53ef-9083-21506fb34e9c" // REV-E003, status draft
const MARCUS = "db1f1f2b-b140-5948-a34e-1c998ed98757" // REV-E002, acknowledged
const NADIA = "385f5ae5-e567-5fb6-98f8-b45007099ff8" // no review at all

const reader = (employeeId: string | null, readsAll = false) => ({
  employeeId,
  readsAll,
})

describe("a manager's assessment is hidden from its subject until submitted", () => {
  it("withholds the draft from the person being reviewed", async () => {
    const [review] = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(PRIYA), { employeeId: PRIYA }),
    )
    expect(review.status).toBe("draft")
    expect(review.manager_assessment).toBeNull()
    expect(review.manager_assessment_withheld).toBe(true)
    expect(review.self_assessment).not.toBeNull()
  })

  it("shows the same draft to the reviewer who is writing it", async () => {
    const [review] = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(SARAH), { employeeId: PRIYA }),
    )
    expect(review.status).toBe("draft")
    expect(review.manager_assessment).not.toBeNull()
    expect(review.manager_assessment_withheld).toBe(false)
  })

  it("shows it to HR, who runs the cycle", async () => {
    const [review] = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(NADIA, true), { employeeId: PRIYA }),
    )
    expect(review.manager_assessment).not.toBeNull()
  })

  it("releases it to the subject once submitted", async () => {
    const [review] = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(MARCUS), { employeeId: MARCUS }),
    )
    expect(review.status).toBe("acknowledged")
    expect(review.manager_assessment).not.toBeNull()
    expect(review.manager_assessment_withheld).toBe(false)
  })

  it("redacts on the single-row path too, not only the list", async () => {
    const redacted = await withTenant(AS_OWNER, async (tx) => {
      const [row] = await reviews.visibleTo(tx, reader(SARAH), {
        employeeId: PRIYA,
      })
      return reviews.byId(tx, reader(PRIYA), row.id)
    })
    expect(redacted?.manager_assessment).toBeNull()
    expect(redacted?.manager_assessment_withheld).toBe(true)
  })
})

describe("who sees which reviews at all", () => {
  it("shows a peer nothing", async () => {
    // Also asserted independently by SEC-EMP-026 in the spec suite.
    const rows = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(MARCUS), { employeeId: PRIYA }),
    )
    expect(rows).toEqual([])
  })

  it("shows a reviewer the reviews they are writing", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(SARAH)),
    )
    expect(rows.length).toBeGreaterThan(1)
    for (const r of rows) {
      expect(r.reviewer_id === SARAH || r.employee_id === SARAH).toBe(true)
    }
  })

  it("shows someone with no review and no grant nothing at all", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(NADIA)),
    )
    expect(rows).toEqual([])
  })

  it("does not raise for a reader who is not an employee", async () => {
    // null must not become ''::uuid (L37).
    const rows = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(null)),
    )
    expect(rows).toEqual([])
  })

  it("gives HR every review in the cycle", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      reviews.visibleTo(tx, reader(NADIA, true)),
    )
    expect(rows).toHaveLength(4)
  })
})

describe("the cycle", () => {
  it("has deadlines in order, as dates rather than text", async () => {
    const [cycle] = await withTenant(AS_OWNER, (tx) => reviews.cycles(tx))
    expect(cycle.start_date).toBe("2026-05-31")
    expect(cycle.self_assessment_due).toBe("2026-06-15")
    expect(cycle.manager_assessment_due).toBe("2026-06-25")
    expect(cycle.cycle_close_date).toBe("2026-07-10")
    const ordered = [
      cycle.start_date,
      cycle.self_assessment_due,
      cycle.manager_assessment_due,
      cycle.cycle_close_date,
    ].filter((d): d is string => d !== null)
    expect([...ordered].sort()).toEqual(ordered)
  })

  it("counts progress in SQL, so the total does not depend on the reader", async () => {
    const progress = await withTenant(AS_OWNER, (tx) =>
      reviews.cycleProgress(tx, "2026-H1"),
    )
    expect(progress.reduce((n, p) => n + p.n, 0)).toBe(4)
    expect(progress.map((p) => p.status).sort()).toEqual([
      "acknowledged",
      "draft",
      "submitted",
    ])
  })
})

describe("goals", () => {
  it("stored progress agrees with the numbers it summarises", async () => {
    const bad = await withTenant(AS_OWNER, (tx) => goals.inconsistent(tx))
    expect(bad).toEqual([])
  })

  it("keeps every NUMERIC as a string", async () => {
    const [goal] = await withTenant(AS_OWNER, (tx) =>
      goals.forEmployee(tx, MARCUS),
    )
    for (const field of [
      "target_value",
      "current_value",
      "weight",
      "progress_percentage",
    ] as const) {
      expect(typeof goal[field], field).toBe("string")
    }
  })

  it("does not treat weight as a share of 100", async () => {
    const rows = await withTenant(
      NORTHWIND,
      (tx) => tx<{ total: string }[]>`
      SELECT sum(weight)::text AS total FROM hr_goals GROUP BY employee_id
    `,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => Number(r.total) === 100)).toBe(false)
  })

  it("returns nothing rather than raising for an empty id list", async () => {
    const rows = await withTenant(AS_OWNER, (tx) => goals.forEmployees(tx, []))
    expect(rows).toEqual([])
  })
})

describe("the page's own load, not just the repository", () => {
  // Calls the real load() with a synthetic locals — checks the page actually
  // uses the repository's redacting path, not just that the path exists.
  const localsFor = (employeeId: string, functionalRoles: string[] = []) =>
    ({
      tenantId: NORTHWIND,
      tenantRole: "employee",
      functionalRoles,
      employeeId,
      user: { id: "00000000-0000-0000-0000-000000000009" },
    }) as unknown as App.Locals

  const runLoad = async (locals: App.Locals) => {
    const { load } =
      await import("../../../routes/(app)/performance/+page.server")
    return (await load({ locals } as never)) as {
      reviews: reviews.Review[]
      readsAll: boolean
      progress: { status: string; n: number }[]
    }
  }

  it("hands the subject a withheld draft, not the manager's words", async () => {
    const data = await runLoad(localsFor(PRIYA))
    const own = data.reviews.find((r) => r.employee_id === PRIYA)!
    expect(own.status).toBe("draft")
    expect(own.manager_assessment).toBeNull()
    expect(own.manager_assessment_withheld).toBe(true)
    expect(data.reviews).toHaveLength(1)
    expect(data.readsAll).toBe(false)
    expect(data.progress).toEqual([])
  })

  it("hands HR every review, drafts included", async () => {
    const data = await runLoad(localsFor(NADIA, ["hr_admin"]))
    expect(data.readsAll).toBe(true)
    expect(data.reviews).toHaveLength(4)
    expect(data.reviews.every((r) => !r.manager_assessment_withheld)).toBe(true)
    expect(data.progress.reduce((n, p) => n + p.n, 0)).toBe(4)
  })

  it("hands a reviewer their own drafts unredacted", async () => {
    const data = await runLoad(localsFor(SARAH))
    expect(data.readsAll).toBe(false)
    const priyas = data.reviews.find((r) => r.employee_id === PRIYA)!
    expect(priyas.manager_assessment).not.toBeNull()
  })
})

describe("feedback anonymity", () => {
  const fbReader = (
    employeeId: string | null,
    readsAll = false,
    manages: string[] = [],
  ) => ({ employeeId, readsAll, manages })

  it("never returns the author of an anonymous note — not even to HR", async () => {
    const all = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(NADIA, true)),
    )
    const anon = all.find((f) => f.feedback_id === "FB-004")!
    expect(anon.is_anonymous).toBe(true)
    expect(anon.from_name).toBeNull()
    expect(Object.keys(anon)).not.toContain("from_employee_id")
  })

  it("still names the author of a signed note", async () => {
    const all = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(NADIA, true)),
    )
    expect(all.find((f) => f.feedback_id === "FB-002")!.from_name).toBe(
      "Aisha Okafor",
    )
  })

  it("keeps the author's id out of the query result entirely", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(NADIA, true)),
    )
    const serialised = JSON.stringify(rows)
    expect(serialised).not.toContain(PRIYA) // the anonymous author
  })
})

describe("who may read which feedback", () => {
  const TOM = "b9b84064-a67a-5048-8282-8fc048b4dbfb"

  const fbReader = (
    employeeId: string | null,
    readsAll = false,
    manages: string[] = [],
  ) => ({ employeeId, readsAll, manages })

  it("shows a recipient their own private note", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(TOM)),
    )
    expect(rows.map((f) => f.feedback_id)).toContain("FB-003")
  })

  it("withholds a manager_only note from its own subject", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(MARCUS)),
    )
    expect(rows.map((f) => f.feedback_id)).not.toContain("FB-001")
    expect(
      await withTenant(AS_OWNER, (tx) => feedback.receivedBy(tx, MARCUS)),
    ).toEqual([])
  })

  it("shows that same note to the manager it was written for", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(SARAH, false, [MARCUS])),
    )
    expect(rows.map((f) => f.feedback_id)).toContain("FB-001")
  })

  it("shows a public note to anyone", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(NADIA)),
    )
    expect(rows.map((f) => f.feedback_id)).toEqual(["FB-002"])
  })

  it("shows a peer nothing private", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(MARCUS)),
    )
    expect(rows.map((f) => f.feedback_id)).not.toContain("FB-003")
  })

  it("does not raise for a reader who is not an employee", async () => {
    const rows = await withTenant(AS_OWNER, (tx) =>
      feedback.visibleTo(tx, fbReader(null)),
    )
    expect(rows.map((f) => f.feedback_id)).toEqual(["FB-002"])
  })
})

describe("writing a review", () => {
  const inRollback = async <T>(
    fn: (tx: Parameters<typeof reviews.submit>[0]) => Promise<T>,
  ): Promise<T> => {
    const marker = new Error("__rollback__")
    try {
      return await withTenant(AS_OWNER, async (tx) => {
        const result = await fn(tx)
        throw Object.assign(marker, { result })
      })
    } catch (e) {
      if (e === marker) return (e as { result: T }).result
      throw e
    }
  }

  /** REV-E003: Priya's, drafted by Sarah. */
  const draftId = async (tx: Parameters<typeof reviews.submit>[0]) => {
    const [r] = await reviews.visibleTo(tx, reader(SARAH), {
      employeeId: PRIYA,
    })
    return r.id
  }

  it("lets each author write their own half, and only theirs", async () => {
    await inRollback(async (tx) => {
      const id = await draftId(tx)
      await reviews.saveAssessment(tx, id, { employeeId: SARAH }, "manager", {
        strengths: "Rewritten",
      })
      const after = await reviews.byId(tx, reader(SARAH), id)
      expect(after?.manager_assessment).toEqual({ strengths: "Rewritten" })
    })
  })

  it("refuses a reviewer editing someone's self-assessment", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await reviews.saveAssessment(tx, id, { employeeId: SARAH }, "self", {
          strengths: "Not mine to write",
        })
      }),
    ).rejects.toThrow(/not_yours/)
  })

  it("refuses a subject editing the manager's half", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await reviews.saveAssessment(tx, id, { employeeId: PRIYA }, "manager", {
          strengths: "Flattering",
        })
      }),
    ).rejects.toThrow(/not_yours/)
  })

  it("refuses any edit once submitted — it is the record by then", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await reviews.submit(tx, id, { employeeId: SARAH })
        await reviews.saveAssessment(tx, id, { employeeId: SARAH }, "manager", {
          strengths: "Second thoughts",
        })
      }),
    ).rejects.toThrow(/wrong_status/)
  })

  it("releases the manager's half to its subject on submit", async () => {
    const [before, after] = await inRollback(async (tx) => {
      const id = await draftId(tx)
      const b = await reviews.byId(tx, reader(PRIYA), id)
      await reviews.submit(tx, id, { employeeId: SARAH })
      const a = await reviews.byId(tx, reader(PRIYA), id)
      return [b, a]
    })
    expect(before?.manager_assessment_withheld).toBe(true)
    expect(after?.manager_assessment_withheld).toBe(false)
    expect(after?.manager_assessment).not.toBeNull()
  })

  it("refuses to submit a review with nothing in it", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await tx`UPDATE hr_reviews SET manager_assessment = NULL WHERE id = ${id}`
        await reviews.submit(tx, id, { employeeId: SARAH })
      }),
    ).rejects.toThrow(/nothing_to_submit/)
  })

  it("refuses a submit by anyone but the reviewer", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await reviews.submit(tx, id, { employeeId: PRIYA })
      }),
    ).rejects.toThrow(/not_yours/)
  })

  it("lets only the subject acknowledge, and only once", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await reviews.submit(tx, id, { employeeId: SARAH })
        await reviews.acknowledge(tx, id, { employeeId: SARAH })
      }),
    ).rejects.toThrow(/not_yours/)

    await inRollback(async (tx) => {
      const id = await draftId(tx)
      await reviews.submit(tx, id, { employeeId: SARAH })
      await reviews.acknowledge(tx, id, { employeeId: PRIYA })
      const after = await reviews.byId(tx, reader(PRIYA), id)
      expect(after?.status).toBe("acknowledged")
    })
  })

  it("refuses acknowledging a draft — there is nothing released to read", async () => {
    await expect(
      inRollback(async (tx) => {
        const id = await draftId(tx)
        await reviews.acknowledge(tx, id, { employeeId: PRIYA })
      }),
    ).rejects.toThrow(/backwards|wrong_status/)
  })

  it("refuses moving backwards from acknowledged", async () => {
    await expect(
      inRollback(async (tx) => {
        const [ack] = await reviews.visibleTo(tx, reader(MARCUS), {
          employeeId: MARCUS,
        })
        expect(ack.status).toBe("acknowledged")
        await reviews.submit(tx, ack.id, { employeeId: SARAH })
      }),
    ).rejects.toThrow(/backwards/)
  })
})
