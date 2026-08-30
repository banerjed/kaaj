import { describe, expect, it } from "vitest"
import {
  FUNCTIONAL_ROLES,
  permissionsFor,
  revealOrMask,
  type FunctionalRole,
} from "@kaaj/authz"
import { authorizeSensitiveRead, type Actor } from "../src/security.js"

/**
 * The two suites must not disagree.
 *
 * `apps/web` asserts the DEPLOYED authorization — real `can()`, real actions,
 * real database. This package asserts the SPEC-DERIVED requirement matrix.
 * Both are worth having, and for a while both were green while contradicting
 * each other: this model asserted a payroll admin sees a masked bank number
 * while the application granted a full reveal. Nothing failed, because neither
 * suite could see the other.
 *
 * @kaaj/authz is now the single vocabulary. This file is the join: for every
 * rule both models express, it asserts they give the same answer. A future
 * divergence fails here rather than shipping.
 */

const TENANT = "tenant-a"

/** How a spec-test Actor's role maps onto the product's role model. */
const ROLE_MAP: Record<string, { base: string; functional: FunctionalRole[] }> =
  {
    employee: { base: "employee", functional: [] },
    hr_admin: { base: "employee", functional: ["hr_admin"] },
    payroll_admin: { base: "employee", functional: ["payroll_admin"] },
    finance_admin: { base: "employee", functional: ["finance_admin"] },
    it_admin: { base: "employee", functional: ["it_admin"] },
    marketing_admin: { base: "employee", functional: ["marketing_admin"] },
    project_manager: { base: "employee", functional: ["project_manager"] },
    auditor: { base: "employee", functional: ["auditor"] },
  }

const actor = (role: string, permissions: string[] = []): Actor =>
  ({
    id: "actor-1",
    tenantId: TENANT,
    role,
    permissions,
    mfaSatisfied: true,
  }) as Actor

const bankResource = {
  id: "bank-1",
  tenantId: TENANT,
  ownerEmployeeId: "someone-else",
  fieldName: "account_number",
  sensitivity: "bank" as const,
  value: "12345678909012",
}

describe("the two models agree on who may read a bank number", () => {
  it("payroll_admin sees it masked in both", () => {
    // The divergence that started this. Resolved by splitting pii.read
    // (masked) from pii.reveal (full): payroll_admin verifies an account, it
    // does not read one.
    const theirs = authorizeSensitiveRead(
      actor("payroll_admin", ["sensitive:bank:read"]),
      bankResource,
    )
    const mine = revealOrMask(
      permissionsFor("employee", ["payroll_admin"]),
      bankResource.value,
    )

    expect(theirs.allowed).toBe(true)
    expect(mine.revealed).toBe(false)
    // Same last four, different mask glyph — both refuse the full number,
    // which is the property that matters.
    expect(theirs.responseValue).toContain("9012")
    expect(mine.value).toContain("9012")
    expect(theirs.responseValue).not.toBe(bankResource.value)
    expect(mine.value).not.toBe(bankResource.value)
  })

  it("hr_admin is the one role that reveals", () => {
    // HR corrects a mistyped account at onboarding, so it must see the value.
    expect(permissionsFor("employee", ["hr_admin"]).has("pii.reveal")).toBe(
      true,
    )
    expect(
      revealOrMask(permissionsFor("employee", ["hr_admin"]), bankResource.value)
        .revealed,
    ).toBe(true)
  })

  it("no other functional role reveals", () => {
    for (const role of FUNCTIONAL_ROLES) {
      if (role === "hr_admin") continue
      expect(
        permissionsFor("employee", [role]).has("pii.reveal"),
        `${role} must not reveal a raw identifier`,
      ).toBe(false)
    }
  })

  it("it_admin cannot read one at all, masked or otherwise", () => {
    const p = permissionsFor("employee", ["it_admin"])
    expect(p.has("pii.read")).toBe(false)
    expect(p.has("pii.reveal")).toBe(false)
    expect(revealOrMask(p, bankResource.value).value).toBe("—")
  })
})

describe("cross-tenant reads are refused in both", () => {
  it("refuses regardless of role or permission", () => {
    for (const role of Object.keys(ROLE_MAP)) {
      const decision = authorizeSensitiveRead(
        actor(role, ["sensitive:all:read"]),
        { ...bankResource, tenantId: "tenant-b" },
      )
      expect(decision.allowed, `${role} must not read across tenants`).toBe(
        false,
      )
    }
  })
})

describe("every role this model names exists in the product", () => {
  it("maps to a real base + functional pair", () => {
    // A role asserted here but absent from @kaaj/authz would be a requirement
    // tested against something that cannot be granted — green, and meaningless.
    for (const [name, { functional }] of Object.entries(ROLE_MAP)) {
      for (const f of functional) {
        expect(
          (FUNCTIONAL_ROLES as readonly string[]).includes(f),
          `${name} maps to unknown functional role ${f}`,
        ).toBe(true)
      }
    }
  })

  it.todo(
    "SEC-MFA-001 — high-sensitivity reads require MFA. " +
      "SPECIFIED BUT NOT ENFORCED: hooks.server.ts resolves locals.amr, and " +
      "nothing gates on it. The cases in security-invariants.spec.test.ts pass " +
      "because this model simulates the check the product does not perform. " +
      "Left as a todo so the gap is visible rather than reported as covered.",
  )
})
