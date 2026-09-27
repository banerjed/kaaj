import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "$lib/server/db/client"
import { actions } from "./+page.server"

/**
 * The import page's actions against the real database — only the paths that
 * write nothing (preview, and every refusal before the write). The write
 * itself is covered in `statement-import.writes.test.ts`, where it can roll
 * back; an action commits, and imported rows would leak into the fixture
 * every other suite counts.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const USD_ACCOUNT = "d189279d-45d2-5e98-85bf-e03f3dbe04e3"

const locals = (functionalRoles: string[]) =>
  ({
    tenantId: NORTHWIND,
    tenantRole: "employee",
    functionalRoles,
    employeeId: "6d466aa9-e51a-5d52-9015-152600855932",
    user: { id: "00000000-0000-0000-0000-000000000009" },
  }) as unknown as App.Locals

const CSV =
  "Date,Description,Amount,Balance\n2026-01-02,Client payment,2500.00,3500.00\n2026-01-03,Coffee,-4.50,3495.50\n"

function request(
  action: string,
  fields: Record<string, string>,
  file: string | null = CSV,
) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  if (file !== null)
    fd.append("file", new File([file], "statement.csv", { type: "text/csv" }))
  return new Request(`http://localhost/accounting/banking/import?/${action}`, {
    method: "POST",
    body: fd,
  })
}

type Anything = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const call = async (
  action: "preview" | "import",
  fields: Record<string, string>,
  file?: string | null,
  roles = ["finance_admin"],
) =>
  (await actions[action]({
    request: request(action, fields, file),
    locals: locals(roles),
  } as never)) as Anything

afterAll(async () => {
  await closeConnections()
})

describe("preview", () => {
  it("reads the file and reports what an import would do, writing nothing", async () => {
    const r = await call("preview", { account: USD_ACCOUNT })
    expect(r.preview).toMatchObject({
      format: "csv",
      transactionCount: 2,
      newCount: 2,
      duplicateCount: 0,
      balanceCheck: "passed",
      needsConfirmation: true,
      problems: [],
    })
    expect(r.preview.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it("marks the file field when no file is chosen", async () => {
    const r = await call("preview", { account: USD_ACCOUNT }, null)
    expect(r.status).toBe(400)
    expect(r.data.errorFields).toContain("file")
  })

  it("refuses a spreadsheet by its content, whatever it is called", async () => {
    const r = await call(
      "preview",
      { account: USD_ACCOUNT },
      "PK\u0003\u0004 not really a csv",
    )
    expect(r.status).toBe(400)
    expect(r.data.message).toMatch(/spreadsheet/)
  })

  it("is refused to a plain employee — the action checks, not just the page", async () => {
    await expect(
      call("preview", { account: USD_ACCOUNT }, CSV, []),
    ).rejects.toMatchObject({ status: 403 })
  })
})

describe("import refuses before writing", () => {
  it("without a preview", async () => {
    const r = await call("import", { account: USD_ACCOUNT })
    expect(r.status).toBe(400)
    expect(r.data.message).toMatch(/Preview the file/)
  })

  it("when the file changed since the preview", async () => {
    const { preview } = await call("preview", { account: USD_ACCOUNT })
    const r = await call(
      "import",
      { account: USD_ACCOUNT, token: preview.token, confirmed: "on" },
      CSV + "2026-01-04,Extra,-1.00,3494.50\n",
    )
    expect(r.status).toBe(400)
    expect(r.data.message).toMatch(/changed since the preview/)
  })

  it("until a person confirms which way money moves", async () => {
    const { preview } = await call("preview", { account: USD_ACCOUNT })
    const r = await call("import", {
      account: USD_ACCOUNT,
      token: preview.token,
    })
    expect(r.status).toBe(400)
    expect(r.data.errorFields).toEqual(["confirmed"])
  })
})
