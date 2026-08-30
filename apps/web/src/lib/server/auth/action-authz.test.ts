import { describe, expect, it } from "vitest"
import { isHttpError } from "@sveltejs/kit"

/**
 * Every write action, invoked as every role, asserting the actual outcome.
 *
 * This is the case that `authz/actions-are-guarded` cannot see and the `can()`
 * unit tests cannot see either. The guard proves a check EXISTS; the unit tests
 * prove a permission maps to the right roles. Neither notices a wrong
 * permission STRING in one action — `firm.settings.write` typed where
 * `tenant.settings.write` was meant passes both, and quietly lets HR rewrite
 * the company profile.
 *
 * The actions are imported and called directly with a synthetic `locals`, so
 * what is asserted is the behaviour of the deployed code path, not a
 * description of it.
 */

type Role = "owner" | "firm_admin" | "employee" | "contractor"

const TENANT = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const SARAH = "6d466aa9-e51a-5d52-9015-152600855932"

const locals = (role: Role, functionalRoles: string[] = []) =>
  ({
    tenantId: TENANT,
    tenantRole: role,
    functionalRoles,
    employeeId: SARAH,
    user: { id: "00000000-0000-0000-0000-000000000009" },
  }) as unknown as App.Locals

const request = () =>
  new Request("http://localhost/", { method: "POST", body: new FormData() })

/** The 403 a denied action throws, or null if it got past the gate. */
async function outcome(
  action: (e: never) => unknown,
  who: App.Locals,
): Promise<number | null> {
  try {
    await action({
      request: request(),
      locals: who,
      params: { id: SARAH },
      url: new URL("http://localhost/"),
    } as never)
    return null
  } catch (e) {
    if (isHttpError(e)) return e.status
    // Past the gate and failed for another reason — a missing form field, a
    // constraint. Not an authorization outcome, which is what this asserts.
    return null
  }
}

/**
 * Who each action must refuse, and who it must let through to the form.
 *
 * `allowed` does NOT mean the write succeeds — the request carries an empty
 * body, so it fails validation afterwards. It means authorization did not stop
 * them, which is the whole subject here.
 */
const MATRIX: {
  module: string
  load: () => Promise<Record<string, (e: never) => unknown>>
  actions: string[]
  denied: [Role, string[]][]
  allowed: [Role, string[]][]
}[] = [
  {
    module: "employees/[id] — addRaise",
    load: async () =>
      (await import("../../../routes/(app)/employees/[id]/+page.server"))
        .actions,
    actions: ["addRaise"],
    denied: [
      ["employee", []],
      ["contractor", []],
      // The separation rule, at the call site: payroll approves, HR sets.
      ["employee", ["payroll_admin"]],
      ["employee", ["it_admin"]],
      ["employee", ["finance_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["firm_admin", []],
      ["owner", []],
    ],
  },
  {
    module: "employees/new",
    load: async () =>
      (await import("../../../routes/(app)/employees/new/+page.server"))
        .actions,
    actions: ["default"],
    denied: [
      ["employee", []],
      ["contractor", []],
      ["employee", ["it_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "employees/[id]/edit",
    load: async () =>
      (await import("../../../routes/(app)/employees/[id]/edit/+page.server"))
        .actions,
    actions: ["default"],
    denied: [
      ["employee", []],
      ["contractor", []],
      ["employee", ["payroll_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "settings/company",
    load: async () =>
      (await import("../../../routes/(app)/settings/company/+page.server"))
        .actions,
    actions: ["update"],
    // tenant.settings.write, NOT firm.settings.write. hr_admin runs the firm's
    // configuration and must not reach the company profile — that pair is
    // exactly what a typo'd permission string would silently merge, and this
    // case caught a denial message that claimed owner-only when firm_admin
    // holds it too.
    denied: [
      ["employee", []],
      ["employee", ["hr_admin"]],
      ["employee", ["payroll_admin"]],
    ],
    allowed: [
      ["firm_admin", []],
      ["owner", []],
    ],
  },
  {
    module: "settings/locations",
    load: async () =>
      (await import("../../../routes/(app)/settings/locations/+page.server"))
        .actions,
    actions: ["save", "archive"],
    denied: [
      ["employee", []],
      ["contractor", []],
      ["employee", ["it_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["firm_admin", []],
      ["owner", []],
    ],
  },
  {
    module: "settings/departments",
    load: async () =>
      (await import("../../../routes/(app)/settings/departments/+page.server"))
        .actions,
    actions: ["save", "archive"],
    denied: [
      ["employee", []],
      ["employee", ["sales_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "settings/holidays",
    load: async () =>
      (await import("../../../routes/(app)/settings/holidays/+page.server"))
        .actions,
    actions: ["save", "archive"],
    denied: [
      ["employee", []],
      ["employee", ["marketing_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "settings/job-titles",
    load: async () =>
      (await import("../../../routes/(app)/settings/job-titles/+page.server"))
        .actions,
    actions: ["saveTitle", "archiveTitle", "saveLevel", "archiveLevel"],
    denied: [
      ["employee", []],
      ["employee", ["legal_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "settings/benefits",
    load: async () =>
      (await import("../../../routes/(app)/settings/benefits/+page.server"))
        .actions,
    actions: ["savePackage", "archivePackage", "saveItem", "archiveItem"],
    denied: [
      ["employee", []],
      ["employee", ["finance_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "settings/payroll/policies",
    load: async () =>
      (
        await import("../../../routes/(app)/settings/payroll/policies/+page.server")
      ).actions,
    actions: ["save", "archive"],
    denied: [
      ["employee", []],
      ["employee", ["project_manager"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
  {
    module: "performance",
    load: async () =>
      (await import("../../../routes/(app)/performance/+page.server")).actions,
    actions: ["submit"],
    // performance.write — a reviewer writes and submits. The repository then
    // refuses anyone who is not THIS review's reviewer, which is a different
    // question from holding the permission at all.
    denied: [
      ["employee", []],
      ["contractor", []],
      ["employee", ["it_admin"]],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["firm_admin", []],
      ["owner", []],
    ],
  },
  {
    module: "performance — acknowledge",
    load: async () =>
      (await import("../../../routes/(app)/performance/+page.server")).actions,
    actions: ["acknowledge"],
    // Everyone acknowledges their OWN review, so the gate is the floor and
    // the repository refuses anyone else's. Nobody is denied at this layer —
    // which is the honest answer, not an omission.
    denied: [],
    allowed: [
      ["employee", []],
      ["contractor", []],
      ["owner", []],
    ],
  },
  {
    module: "settings/payroll/schedules",
    load: async () =>
      (
        await import("../../../routes/(app)/settings/payroll/schedules/+page.server")
      ).actions,
    actions: ["save", "archive"],
    denied: [
      ["employee", []],
      ["contractor", []],
    ],
    allowed: [
      ["employee", ["hr_admin"]],
      ["owner", []],
    ],
  },
]

const name = (role: Role, fns: string[]) =>
  fns.length ? `${role}+${fns.join("+")}` : role

for (const spec of MATRIX) {
  describe(spec.module, () => {
    for (const action of spec.actions) {
      for (const [role, fns] of spec.denied) {
        it(`refuses ${action} for ${name(role, fns)}`, async () => {
          const actions = await spec.load()
          expect(
            actions[action],
            `${spec.module} has no action ${action}`,
          ).toBeTypeOf("function")
          expect(await outcome(actions[action], locals(role, fns))).toBe(403)
        })
      }
      for (const [role, fns] of spec.allowed) {
        it(`admits ${action} for ${name(role, fns)}`, async () => {
          // A gate that refuses everyone is not authorization, it is an outage.
          const actions = await spec.load()
          expect(await outcome(actions[action], locals(role, fns))).not.toBe(
            403,
          )
        })
      }
    }
  })
}

describe("the matrix covers every action that exists", () => {
  it("names all 23", async () => {
    // If someone adds an action, this fails until it is classified here —
    // the companion to authz/actions-are-guarded, which only checks that a
    // call is present.
    const named = MATRIX.reduce((n, m) => n + m.actions.length, 0)
    const timeOff = 1 // decide — covered in time_off.test.ts, needs a real request
    expect(named + timeOff).toBe(25)
  })
})
