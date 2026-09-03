import { describe, expect, it } from "vitest"
import { safeError } from "./errors"

/**
 * The allowlist, watched refusing the fields that carry rows.
 *
 * Every shape here was taken from a real `PostgresError` measured against this
 * database. The `detail` case is the one that matters and the one the request
 * path CANNOT produce: Postgres withholds it from `app_user`, so only the
 * table owner — `./check`, the migrations, the remote verifier, anything on
 * the service role — ever sees it. That makes this test the only place the
 * rule is observable, which is exactly why it is written down.
 */

/** As postgres.js builds it, for the table OWNER. */
const ownerConstraintViolation = Object.assign(
  new Error(
    'duplicate key value violates unique constraint "firm_departments_tenant_id_department_code_key"',
  ),
  {
    name: "PostgresError",
    severity: "ERROR",
    code: "23505",
    detail:
      "Key (tenant_id, department_code)=(07fb03f8-1521-5ef4-9c2d-25fcfa297ac1, ENG) already exists.",
    schema_name: "public",
    table_name: "firm_departments",
    constraint_name: "firm_departments_tenant_id_department_code_key",
    routine: "_bt_check_unique",
  },
)

describe("safeError", () => {
  it("keeps what diagnoses the failure", () => {
    const out = safeError(ownerConstraintViolation)
    expect(out.name).toBe("PostgresError")
    expect(out.code).toBe("23505")
    expect(out.constraint_name).toBe(
      "firm_departments_tenant_id_department_code_key",
    )
    expect(out.table_name).toBe("firm_departments")
  })

  it("drops `detail`, which is the row", () => {
    const out = safeError(ownerConstraintViolation)
    expect(out.detail).toBeUndefined()
    expect(JSON.stringify(out)).not.toContain("07fb03f8")
    expect(JSON.stringify(out)).not.toContain("already exists")
  })

  it("drops `where`, `query` and bound parameters", () => {
    const out = safeError(
      Object.assign(new Error("boom"), {
        name: "PostgresError",
        where: "PL/pgSQL function app.current_tenant_id() line 3",
        query: "SELECT base_amount FROM employees WHERE id = $1",
        parameters: ["6d466aa9-e51a-5d52-9015-152600855932"],
      }),
    )
    expect(out.where).toBeUndefined()
    expect(out.query).toBeUndefined()
    expect(out.parameters).toBeUndefined()
    expect(out.message).toBe("boom")
  })

  it("survives a throw that is not an Error", () => {
    expect(safeError("just a string").message).toBe("just a string")
    expect(safeError(null).message).toBe("null")
    expect(safeError(undefined).message).toBe("undefined")
    // A thrown object with nothing on it still has to say something, or the
    // log line is an empty husk that reads like a working reporter.
    const bare = safeError({})
    expect(bare.message).toContain("no message")
  })

  it("returns only strings, so a log line cannot carry a nested object", () => {
    const out = safeError(
      Object.assign(new Error("x"), { name: "PostgresError", code: 23505 }),
    )
    // `code` arrived as a number and is dropped rather than coerced: the
    // allowlist decides the FIELD, the type check decides the value.
    expect(out.code).toBeUndefined()
    expect(Object.values(out).every((v) => typeof v === "string")).toBe(true)
  })
})
