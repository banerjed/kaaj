import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as runs from "./payroll_runs.repo"
import { RunRefused } from "./payroll_runs.repo"

/**
 * The pay run LIFECYCLE, against the real database.
 *
 * This is the module where correctness is not negotiable, so the tests are
 * about the two things that can go wrong without an error:
 *
 * 1. **The header drifting from the lines.** `employee_count` and the four
 *    totals are denormalised; the lines are what people are actually paid. A
 *    header that disagrees is what a finance lead reads and reports.
 * 2. **A transition that should have been refused.** Three CHECK constraints
 *    back these writes, but none of them gives DIRECTION — the database is
 *    equally happy with finalized → draft — and separation of duties only
 *    fires when both `calculated_by` and `approved_by` are set.
 *
 * Every case rolls back, so the fixture is unchanged afterwards.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}

/** Rachel — the fixture's calculator. */
const RACHEL = "a87e0200-0849-53b6-a491-e882feace3f5"
/** Sarah — the fixture's approver. */
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

/** PR-2026-01-US, finalized, 7 lines. */
const US_RUN = "953095ac-deb3-54dc-baf2-09a7e3829e82"
/** PR-2026-01-IN, approved, 2 lines. */
const IN_RUN = "cf6699a0-43f1-5002-b44f-64f4b8ff7e43"

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
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

/**
 * Assert not merely that a write was refused, but WHY.
 *
 * `rejects.toThrow(RunRefused)` passes on any refusal at all, including one
 * raised two lines earlier by the setup — which is exactly what happened while
 * these were being written: a transition bug made `markCalculated` throw, and
 * three separation-of-duties tests went green without ever reaching `approve`.
 */
async function refusedBecause(
  fn: () => Promise<unknown>,
  reason: RunRefused["reason"],
): Promise<void> {
  try {
    await fn()
  } catch (e) {
    expect(e).toBeInstanceOf(RunRefused)
    expect((e as RunRefused).reason).toBe(reason)
    return
  }
  throw new Error(`expected a refusal (${reason}) and the write succeeded`)
}

/** A period no fixture run covers, so the number cannot collide. */
const NEW_RUN = {
  pay_period_start: "2026-07-01",
  pay_period_end: "2026-07-31",
  pay_date: "2026-08-03",
  country: "US",
  currency: "USD",
  run_type: "regular",
  pay_schedule_id: null,
}

/**
 * A draft run with real lines, borrowed from an existing run inside the
 * rollback. Nothing in the product can create a line yet — computing one needs
 * tax tables this database does not have — so the lines have to come from
 * somewhere real rather than be invented here.
 */
async function draftWithLines(tx: Tx): Promise<string> {
  const created = await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
  await tx`
    UPDATE payroll_run_employees
       SET payroll_run_id = ${created.id}::uuid
     WHERE payroll_run_id = ${US_RUN}::uuid
  `
  // The donor run now claims seven people it has no lines for — which is the
  // very inconsistency these tests assert the absence of, manufactured by the
  // setup rather than by the code under test. Left uncorrected it made
  // `inconsistentRuns` report the DONOR and the test read as a failure of the
  // write. Setup that breaks an invariant has to repair it, or the assertion
  // is measuring the wrong thing.
  await runs.refreshRunTotals(tx, US_RUN)
  return created.id
}

describe("opening a run", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("starts as a draft with every total at zero", async () => {
    const run = await inRollback(async (tx) => {
      const { id } = await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
      return (await runs.byId(tx, id))!
    })
    expect(run.run_status).toBe("draft")
    expect(run.employee_count).toBe(0)
    expect(run.total_gross_pay).toBe("0.00")
    expect(run.line_count).toBe(0)
  })

  it("numbers the run by period and country", async () => {
    const run = await inRollback(async (tx) => {
      const { id } = await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
      return (await runs.byId(tx, id))!
    })
    expect(run.run_id).toBe("PR-2026-07-US")
  })

  it("refuses a second run for the same period and country", async () => {
    // Two runs for one period is how somebody gets paid twice.
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
          await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
        }),
      "number_taken",
    )
  })

  it("keeps money as a string in the run's own currency", async () => {
    const run = await inRollback(async (tx) => {
      const { id } = await runs.createRun(
        tx,
        NORTHWIND,
        { ...NEW_RUN, country: "GB", currency: "GBP" },
        RACHEL,
      )
      return (await runs.byId(tx, id))!
    })
    expect(run.currency).toBe("GBP")
    expect(typeof run.total_gross_pay).toBe("string")
  })
})

describe("calculating a run", () => {
  it("refuses a run with no lines", async () => {
    // A run calculated over nothing reports zero gross and looks exactly like
    // a finished period in which nobody was paid.
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const { id } = await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
          return runs.markCalculated(tx, id, RACHEL)
        }),
      "no_lines",
    )
  })

  it("makes the header describe the lines beneath it", async () => {
    const { run, lineTotal } = await inRollback(async (tx) => {
      const id = await draftWithLines(tx)
      await runs.markCalculated(tx, id, RACHEL)
      const [sum] = await tx<{ gross: string; n: number }[]>`
        SELECT coalesce(sum(gross_pay), 0)::text AS gross, count(*)::int AS n
          FROM payroll_run_employees WHERE payroll_run_id = ${id}::uuid
      `
      return { run: (await runs.byId(tx, id))!, lineTotal: sum }
    })
    expect(run.run_status).toBe("calculated")
    expect(run.calculated_at).not.toBeNull()
    expect(run.employee_count).toBe(lineTotal.n)
    expect(run.total_gross_pay).toBe(lineTotal.gross)
  })

  it("leaves no run whose header disagrees with its lines", async () => {
    // The maintainer's query, run AFTER a write rather than before one.
    const bad = await inRollback(async (tx) => {
      const id = await draftWithLines(tx)
      await runs.markCalculated(tx, id, RACHEL)
      return runs.inconsistentRuns(tx)
    })
    expect(bad).toEqual([])
  })

  it("REPAIRS a header that had already drifted", async () => {
    // The reason the totals are recomputed rather than adjusted: a header that
    // is already wrong is corrected by the next write instead of carried
    // forward. The fixture shipped exactly this kind of drift once.
    const { drifted, repaired } = await inRollback(async (tx) => {
      const id = await draftWithLines(tx)
      await tx`
        UPDATE payroll_runs
           SET employee_count = 99, total_gross_pay = 1
         WHERE id = ${id}::uuid
      `
      const drifted = await runs.inconsistentRuns(tx)
      await runs.markCalculated(tx, id, RACHEL)
      return { drifted, repaired: await runs.inconsistentRuns(tx) }
    })
    expect(drifted.length).toBe(1)
    expect(repaired).toEqual([])
  })

  it("does not touch whether the LINES themselves add up", async () => {
    // net = gross - taxes - deductions is a property of the calculation, which
    // this lifecycle deliberately does not do. Asserting it is unchanged keeps
    // the two concerns separate rather than pretending one fixed the other.
    const { before, after } = await inRollback(async (tx) => {
      const before = await runs.inconsistentLines(tx)
      const id = await draftWithLines(tx)
      await runs.markCalculated(tx, id, RACHEL)
      return { before, after: await runs.inconsistentLines(tx) }
    })
    expect(after).toEqual(before)
  })
})

describe("separation of duties", () => {
  it("refuses the calculator approving their own run", async () => {
    // The database refuses this too, but as a 500 with a constraint name in
    // it. Refused here so the page can say why.
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const id = await draftWithLines(tx)
          await runs.markCalculated(tx, id, RACHEL)
          return runs.approve(tx, id, RACHEL)
        }),
      "self_approval",
    )
  })

  it("refuses approving a run nothing calculated", async () => {
    // The CHECK only fires when BOTH columns are set, so an approval with a
    // NULL calculated_by slips past it — one person doing the whole thing.
    await refusedBecause(
      () =>
        inRollback(async (tx) => {
          const id = await draftWithLines(tx)
          // Straight to the status the transition allows, without a calculator.
          await tx`
            UPDATE payroll_runs
               SET run_status = 'calculated', status = 'calculated',
                   calculated_at = now(), calculated_by = NULL
             WHERE id = ${id}::uuid
          `
          return runs.approve(tx, id, SARAH)
        }),
      "never_calculated",
    )
  })

  it("lets a DIFFERENT person approve, and records who", async () => {
    // Both halves. A rule that refuses everyone reads as a broken page, not as
    // a control.
    const run = await inRollback(async (tx) => {
      const id = await draftWithLines(tx)
      await runs.markCalculated(tx, id, RACHEL)
      await runs.approve(tx, id, SARAH)
      return (await runs.byId(tx, id))!
    })
    expect(run.run_status).toBe("approved")
    expect(run.approved_at).not.toBeNull()
    expect(run.approved_by_name).toBe("Sarah Johnson")
    expect(run.calculated_by_name).toBe("Rachel Adeyemi")
  })
})

describe("the transitions are one way", () => {
  it("refuses finalized going back to approved", async () => {
    // payroll_runs_status_is_known permits it; nothing in the database gives
    // DIRECTION. A run that can be un-approved after someone has been paid
    // leaves the trail describing a state the money does not agree with.
    await refusedBecause(
      () => inRollback((tx) => runs.approve(tx, US_RUN, RACHEL)),
      "wrong_status",
    )
  })

  it("refuses cancelling a finalized run", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) => runs.cancel(tx, US_RUN, SARAH, "changed our mind")),
      "wrong_status",
    )
  })

  it("refuses calculating a run that is already approved", async () => {
    await refusedBecause(
      () => inRollback((tx) => runs.markCalculated(tx, IN_RUN, RACHEL)),
      "wrong_status",
    )
  })

  it("allows a draft to be cancelled, and stops there", async () => {
    const { cancelled } = await inRollback(async (tx) => {
      const { id } = await runs.createRun(tx, NORTHWIND, NEW_RUN, RACHEL)
      await runs.cancel(tx, id, RACHEL, "opened for the wrong country")
      return { cancelled: (await runs.byId(tx, id))! }
    })
    expect(cancelled.run_status).toBe("cancelled")
  })

  it("refuses a run that does not exist", async () => {
    await refusedBecause(
      () =>
        inRollback((tx) =>
          runs.approve(tx, "00000000-0000-0000-0000-000000000000", SARAH),
        ),
      "no_such_run",
    )
  })
})

describe("the two status columns cannot diverge", () => {
  it("moves run_status and status together through every transition", async () => {
    // payroll_runs carries a duplicate `status` column that nothing reads and
    // no CHECK constrained until 20260902040128. A lifecycle write that moved
    // one without the other would leave an index on (tenant_id, status)
    // pointing at a value nothing else believes — silently.
    const seen = await inRollback(async (tx) => {
      const id = await draftWithLines(tx)
      const snap = async () => {
        const [r] = await tx<{ a: string; b: string }[]>`
          SELECT run_status AS a, status AS b
            FROM payroll_runs WHERE id = ${id}::uuid
        `
        return r
      }
      const out = [await snap()]
      await runs.markCalculated(tx, id, RACHEL)
      out.push(await snap())
      await runs.approve(tx, id, SARAH)
      out.push(await snap())
      await runs.finalize(tx, id, SARAH)
      out.push(await snap())
      return out
    })
    expect(seen.map((s) => s.a)).toEqual([
      "draft",
      "calculated",
      "approved",
      "finalized",
    ])
    for (const s of seen) expect(s.b).toBe(s.a)
  })
})
