import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as exp from "./payroll_export.repo"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}

// US-NYC: overtime after 8h a day or 40h a week, double time after 12h a day,
// workweek from Sunday (the fixture's firm_payroll_policies row).
const AISHA = "11f31511-ad53-59c7-9e90-8ee3b553489b" // US-NYC, monthly
const YUKI = "fa4c9324-158b-55b7-acdd-7fe7917bc7cf" // US-NYC, monthly
const OLIVER = "56bd1329-6740-572f-aa90-c44d1b27bedf" // US-NYC, monthly, stays salaried

const PERIOD = { from: "2026-09-14", to: "2026-09-27", frequency: null }

afterAll(async () => {
  await closeConnections()
})

async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const marker = new Error("__rollback__")
  try {
    return await withTenant(AS_OWNER, async (tx) => {
      throw Object.assign(marker, { result: await fn(tx) })
    })
  } catch (e) {
    if (e === marker) return (e as { result: T }).result
    throw e
  }
}

async function payHourly(tx: Tx, employeeId: string, eligible: boolean) {
  await tx`
    INSERT INTO compensation_base (tenant_id, employee_id, effective_from,
                                   compensation_type, amount, overtime_eligible)
    VALUES (${NORTHWIND}, ${employeeId}, '2026-09-01', 'hourly', '30.00', ${eligible})`
}

async function work(
  tx: Tx,
  employeeId: string,
  days: Record<string, number>,
  status = "approved",
) {
  for (const [date, hours] of Object.entries(days))
    await tx`
      INSERT INTO time_tracking_entries (tenant_id, employee_id, entry_date, hours,
                                         description, status)
      VALUES (${NORTHWIND}, ${employeeId}, ${date}, ${String(hours)}, 'test', ${status})`
}

/**
 * The rule written out plainly, to check the SQL against: per day, double
 * time past 12 and overtime past 8; per Sunday-to-Saturday week, remaining
 * regular hours past 40 are overtime, counting days before the period.
 */
function oracle(days: Record<string, number>, from: string, to: string) {
  const sorted = Object.entries(days).sort(([a], [b]) => a.localeCompare(b))
  const weekOf = (d: string) => {
    const t = new Date(`${d}T00:00:00Z`)
    t.setUTCDate(t.getUTCDate() - t.getUTCDay())
    return t.toISOString().slice(0, 10)
  }
  const cum = new Map<string, number>()
  const out = { regular: 0, overtime: 0, double_time: 0 }
  for (const [d, h] of sorted) {
    const dt = Math.max(h - 12, 0)
    const dailyOt = Math.max(Math.min(h, 12) - 8, 0)
    const reg = h - dt - dailyOt
    const w = weekOf(d)
    const before = cum.get(w) ?? 0
    const after = before + reg
    cum.set(w, after)
    const weeklyOt = Math.max(after - 40, 0) - Math.max(before - 40, 0)
    if (d >= from && d <= to) {
      out.regular += reg - weeklyOt
      out.overtime += dailyOt + weeklyOt
      out.double_time += dt
    }
  }
  return out
}

const byEmployee = (lines: exp.PeriodLine[], id: string) =>
  Object.fromEntries(
    lines.filter((l) => l.employee_id === id).map((l) => [l.source, l.hours]),
  )

describe("payroll export: hours for a period", () => {
  const AISHA_DAYS = {
    "2026-09-13": 10, // Sunday before the period: counts toward that week
    "2026-09-14": 13, // double time and daily overtime
    "2026-09-15": 8,
    "2026-09-16": 8,
    "2026-09-17": 8,
    "2026-09-18": 8, // crosses 40 regular hours in the week
    "2026-09-21": 9,
    "2026-09-22": 9,
    "2026-09-23": 9,
    "2026-09-24": 9,
    "2026-09-25": 9,
    "2026-09-27": 7, // a new week, inside the period
    "2026-09-28": 12, // after the period: not exported
  }

  it("classifies regular, overtime and double time as the policy says", async () => {
    const lines = await inRollback(async (tx) => {
      await payHourly(tx, AISHA, true)
      await work(tx, AISHA, AISHA_DAYS)
      return exp.periodLines(tx, "adp_run", PERIOD)
    })
    const want = oracle(AISHA_DAYS, PERIOD.from, PERIOD.to)
    expect(want).toEqual({ regular: 79, overtime: 17, double_time: 1 })
    expect(byEmployee(lines, AISHA)).toEqual({
      regular: "79.00",
      overtime: "17.00",
      double_time: "1.00",
    })
  })

  it("leaves every hour regular for an employee who is not overtime-eligible", async () => {
    const lines = await inRollback(async (tx) => {
      await payHourly(tx, YUKI, false)
      await work(tx, YUKI, { "2026-09-14": 13, "2026-09-15": 30 })
      return exp.periodLines(tx, "adp_run", PERIOD)
    })
    expect(byEmployee(lines, YUKI)).toEqual({ regular: "43.00" })
  })

  it("exports no worked hours for a salaried employee, and no unapproved hours", async () => {
    const { lines, notes } = await inRollback(async (tx) => {
      await work(tx, OLIVER, { "2026-09-14": 8 })
      await payHourly(tx, YUKI, true)
      await work(tx, YUKI, { "2026-09-16": 6 }, "submitted")
      return {
        lines: await exp.periodLines(tx, "adp_run", PERIOD),
        notes: await exp.periodNotes(tx, PERIOD),
      }
    })
    expect(byEmployee(lines, OLIVER)).toEqual({})
    expect(byEmployee(lines, YUKI)).toEqual({})
    expect(notes.unapproved_entries).toBe(1)
  })

  it("prorates time off by the weekdays that fall in the period, and says so", async () => {
    const { lines, notes } = await inRollback(async (tx) => {
      // Friday to Tuesday: three weekdays, one of them in the period.
      await tx`
        INSERT INTO hr_time_off_requests (tenant_id, employee_id, policy_code, start_date,
                                          end_date, total_hours, status, submitted_at)
        VALUES (${NORTHWIND}, ${OLIVER}, 'US-PTO', '2026-09-25', '2026-09-29', '24',
                'approved', now())`
      return {
        lines: await exp.periodLines(tx, "adp_run", PERIOD),
        notes: await exp.periodNotes(tx, PERIOD),
      }
    })
    expect(byEmployee(lines, OLIVER)).toEqual({ "time_off:US-PTO": "8.00" })
    expect(notes.prorated).toContainEqual({
      employee: "Oliver Grant",
      policy_code: "US-PTO",
      start_date: "2026-09-25",
      end_date: "2026-09-29",
    })
  })

  it("keeps the hourly days of a pay record that ends inside the period", async () => {
    const lines = await inRollback(async (tx) => {
      // Hourly until the 20th; the salaried row from the fixture is in effect after.
      await tx`
        INSERT INTO compensation_base (tenant_id, employee_id, effective_from, effective_to,
                                       compensation_type, amount, overtime_eligible)
        VALUES (${NORTHWIND}, ${AISHA}, '2026-09-01', '2026-09-20', 'hourly', '30.00', false)`
      await work(tx, AISHA, { "2026-09-15": 8, "2026-09-22": 8 })
      return exp.periodLines(tx, "adp_run", PERIOD)
    })
    expect(byEmployee(lines, AISHA)).toEqual({ regular: "8.00" })
  })

  it("refuses approved time that no pay record covers, rather than leave it out", async () => {
    const { lines, notes } = await inRollback(async (tx) => {
      await tx`UPDATE compensation_base SET effective_from = '2027-01-01'
                WHERE employee_id = ${OLIVER}`
      await work(tx, OLIVER, { "2026-09-14": 8 })
      return {
        lines: await exp.periodLines(tx, "adp_run", PERIOD),
        notes: await exp.periodNotes(tx, PERIOD),
      }
    })
    expect(notes.no_pay_record).toEqual([
      { employee_id: OLIVER, name: "Oliver Grant" },
    ])
    expect(exp.refuses(exp.problems("adp_run", lines, notes))).toBe(true)
  })

  it("refuses overtime-eligible hours that no overtime rule can classify", async () => {
    const { lines, notes } = await inRollback(async (tx) => {
      await tx`UPDATE firm_payroll_policies SET is_active = false`
      await payHourly(tx, AISHA, true)
      await work(tx, AISHA, { "2026-09-14": 13 })
      return {
        lines: await exp.periodLines(tx, "adp_run", PERIOD),
        notes: await exp.periodNotes(tx, PERIOD),
      }
    })
    // Every hour regular: exactly the under-payment the refusal prevents.
    expect(byEmployee(lines, AISHA)).toEqual({ regular: "13.00" })
    expect(exp.problems("adp_run", lines, notes).no_overtime_rule).toEqual([
      { employee_id: AISHA, name: "Aisha Okafor" },
    ])
  })

  it("exports the fixture's own hourly employee from committed rows, with nothing inserted", async () => {
    // Aisha is hourly in the fixture, with four approved January entries
    // (7.5 + 8 + 6.5 + 4): under the daily 8 and the weekly 40, so every hour
    // is regular. This is the one case that reaches the worked-hours path
    // on the data every other suite also runs against (L50).
    const lines = await inRollback((tx) =>
      exp.periodLines(tx, "adp_run", {
        from: "2026-01-05",
        to: "2026-01-18",
        frequency: null,
      }),
    )
    expect(byEmployee(lines, AISHA)).toEqual({ regular: "26.00" })
    // The salaried colleagues with approved January entries contribute no
    // worked hours; their approved leave still exports, as it should.
    expect(
      lines.filter(
        (l) => l.employee_id !== AISHA && !l.source.startsWith("time_off"),
      ),
    ).toEqual([])
  })

  it("filters by pay frequency", async () => {
    const lines = await inRollback(async (tx) => {
      await payHourly(tx, AISHA, true)
      await work(tx, AISHA, { "2026-09-14": 8 })
      return exp.periodLines(tx, "adp_run", { ...PERIOD, frequency: "weekly" })
    })
    expect(byEmployee(lines, AISHA)).toEqual({})
  })
})

describe("payroll export: what refuses the file", () => {
  const NO_NOTES = { no_pay_record: [] }
  const line = (over: Partial<exp.PeriodLine>): exp.PeriodLine => ({
    employee_id: AISHA,
    first_name: "Aisha",
    last_name: "Okafor",
    employee_code: "E001",
    external_id: "000101",
    source: "regular",
    hours: "8.00",
    source_total: "8.00",
    mapped: true,
    code: "REG",
    policy_missing: false,
    ...over,
  })

  it("an employee with hours and no id refuses the file", () => {
    const p = exp.problems("adp_run", [line({ external_id: null })], NO_NOTES)
    expect(p.missing_ids).toEqual([
      { employee_id: AISHA, name: "Aisha Okafor" },
    ])
    expect(exp.refuses(p)).toBe(true)
  })

  it("Gusto matches by name, so needs no id, but two people with one name refuse it", () => {
    const p = exp.problems(
      "gusto",
      [
        line({ external_id: null }),
        line({ employee_id: YUKI, external_id: null }),
      ],
      NO_NOTES,
    )
    expect(p.missing_ids).toEqual([])
    expect(p.duplicate_names).toEqual(["aisha okafor"])
    expect(exp.refuses(p)).toBe(true)
  })

  it("hours with no code mapping refuse the file; a mapping to 'not exported' does not", () => {
    expect(
      exp.problems(
        "adp_run",
        [line({ source: "overtime", mapped: false, code: null })],
        NO_NOTES,
      ).unmapped_sources,
    ).toEqual(["overtime"])
    const p = exp.problems(
      "adp_run",
      [line({ source: "time_off:UNPAID", code: null, external_id: null })],
      NO_NOTES,
    )
    expect(exp.refuses(p)).toBe(false)
  })
})
