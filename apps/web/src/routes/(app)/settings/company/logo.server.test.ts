import { afterAll, afterEach, describe, expect, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { closeConnections } from "$lib/server/db/client"
import { withTenant } from "$lib/server/db/tenant"
import { getCurrent } from "$lib/server/platform-tenancy/tenants.repo"
import { actions } from "./+page.server"

/**
 * Real sign-in, real HTTP calls to the local storage-api container — not a
 * stub. `locals.supabase` in production is an anon-key client carrying the
 * signed-in user's own session (hooks.server.ts), and Storage RLS is what
 * actually enforces tenant isolation here (the new migration's policies),
 * so a test against a fake client would prove nothing about the real path
 * (CLAUDE.md: "a guard never observed failing is not evidence").
 *
 * Storage writes are NOT covered by `inRollback`'s Postgres transaction —
 * storage-api holds its own connection — so every test that uploads cleans
 * up for real afterward, the same discipline `fx_rates.test.ts` uses for
 * its own non-transactional service-role writes.
 */

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"
const ANON_KEY =
  process.env.PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
const SERVICE_ROLE_KEY =
  process.env.PRIVATE_SUPABASE_SERVICE_ROLE ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
// A syntactically valid tenant id that isn't Northwind's — the fixture seeds
// only one tenant, but the policy compares the JWT's own tenant_id claim
// against the path's folder segment, which needs no real row on the other
// side to exercise (matching the false-tenant probe verify-rls.sql itself
// injects for the same reason, rather than provisioning a second full tenant).
const OTHER_TENANT = "00000000-0000-0000-0000-000000000099"

const serviceRole = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function signIn(email: string, password = "devpassword") {
  const client = createClient(SUPABASE_URL, ANON_KEY)
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

// A plain `SupabaseClient` type here fights the generic default `createClient`
// resolves to depending on call-site inference; the whole object is already
// funneled through `as unknown as App.Locals` below, so nothing is lost by
// accepting the client loosely here instead of fighting that mismatch.
function locals(tenantId: string, supabase: unknown) {
  return {
    tenantId,
    tenantRole: "owner",
    functionalRoles: [] as string[],
    employeeId: null,
    customerContactId: null,
    customerId: null,
    user: { id: "00000000-0000-0000-0000-000000000000" },
    supabase,
  } as unknown as App.Locals
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function pngFile(totalBytes = 16): File {
  // Real PNG magic bytes, then filler — the action checks the signature,
  // not just the declared type, so a fixture with arbitrary content would
  // never pass upload.
  const buf = new Uint8Array(totalBytes).fill(1)
  buf.set(PNG_SIGNATURE)
  return new File([buf], "logo.png", { type: "image/png" })
}

async function cleanupLogo(tenantId: string) {
  await serviceRole.storage.from("tenant-logos").remove([`${tenantId}/logo`])
  await withTenant(
    { tenantId, role: "owner", functionalRoles: [], employeeId: null },
    (tx) => tx`UPDATE tenants SET logo_storage_key = NULL`,
  )
}

afterAll(async () => {
  await closeConnections()
})

describe("uploadLogo/removeLogo validation (no network reached on refusal)", () => {
  const THROWS = {
    storage: {
      from() {
        throw new Error("must not reach storage on a refused upload")
      },
    },
  } as unknown as ReturnType<typeof createClient>

  it("refuses when no file is chosen", async () => {
    const formData = new FormData()
    const result = (await actions.uploadLogo({
      request: { formData: async () => formData } as never,
      locals: locals(NORTHWIND, THROWS),
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["logo"])
  })

  it("refuses a non-image file type", async () => {
    const formData = new FormData()
    formData.set(
      "logo",
      new File(["not an image"], "logo.txt", { type: "text/plain" }),
    )
    const result = (await actions.uploadLogo({
      request: { formData: async () => formData } as never,
      locals: locals(NORTHWIND, THROWS),
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["logo"])
  })

  it("refuses a file over the size limit", async () => {
    const formData = new FormData()
    formData.set("logo", pngFile(2 * 1024 * 1024 + 1))
    const result = (await actions.uploadLogo({
      request: { formData: async () => formData } as never,
      locals: locals(NORTHWIND, THROWS),
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["logo"])
  })

  it("refuses a file whose bytes don't match its declared MIME type", async () => {
    // The declared type alone is what the size/type checks above see —
    // this is the one case only the magic-byte check can catch, and the
    // one a real attacker would actually send.
    const formData = new FormData()
    formData.set(
      "logo",
      new File(["not really a png"], "logo.png", { type: "image/png" }),
    )
    const result = (await actions.uploadLogo({
      request: { formData: async () => formData } as never,
      locals: locals(NORTHWIND, THROWS),
    } as never)) as { status: number; data: { errorFields: string[] } }
    expect(result.status).toBe(400)
    expect(result.data.errorFields).toEqual(["logo"])
  })
})

describe("uploadLogo/removeLogo against the real local Storage service", () => {
  afterEach(async () => {
    await cleanupLogo(NORTHWIND)
  })

  it("uploads a logo, sets logo_storage_key, and it can be read back", async () => {
    const supabase = await signIn("sarah.johnson@northwind.example")
    const formData = new FormData()
    formData.set("logo", pngFile())

    const result = (await actions.uploadLogo({
      request: { formData: async () => formData } as never,
      locals: locals(NORTHWIND, supabase),
    } as never)) as { logoUpdated: true; company: { logo_storage_key: string } }

    expect(result.logoUpdated).toBe(true)
    expect(result.company.logo_storage_key).toBe(`${NORTHWIND}/logo`)

    const stored = await withTenant(
      {
        tenantId: NORTHWIND,
        role: "owner",
        functionalRoles: [],
        employeeId: null,
      },
      (tx) => getCurrent(tx),
    )
    expect(stored?.logo_storage_key).toBe(`${NORTHWIND}/logo`)

    const { data, error } = await supabase.storage
      .from("tenant-logos")
      .download(`${NORTHWIND}/logo`)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
  })

  it("re-uploading overwrites the same key rather than leaving a second file", async () => {
    const supabase = await signIn("sarah.johnson@northwind.example")

    const first = new FormData()
    first.set("logo", pngFile(8))
    await actions.uploadLogo({
      request: { formData: async () => first } as never,
      locals: locals(NORTHWIND, supabase),
    } as never)

    const second = new FormData()
    second.set("logo", pngFile(32))
    await actions.uploadLogo({
      request: { formData: async () => second } as never,
      locals: locals(NORTHWIND, supabase),
    } as never)

    const { data: list } = await supabase.storage
      .from("tenant-logos")
      .list(NORTHWIND)
    expect(list?.map((f) => f.name)).toEqual(["logo"])

    const { data } = await supabase.storage
      .from("tenant-logos")
      .download(`${NORTHWIND}/logo`)
    expect(await data?.arrayBuffer()).toHaveProperty("byteLength", 32)
  })

  it("a tenant cannot write into another tenant's logo folder — Storage RLS, not just app logic", async () => {
    const supabase = await signIn("sarah.johnson@northwind.example")
    const { error } = await supabase.storage
      .from("tenant-logos")
      .upload(`${OTHER_TENANT}/logo`, new Uint8Array([1, 2, 3]), {
        contentType: "image/png",
      })
    expect(error).not.toBeNull()
  })

  it("a tenant cannot read another tenant's logo, even if one exists", async () => {
    // Seeded via the service role, which bypasses RLS — the negative case
    // needs a real object to exist, or "not found" would be true regardless
    // of the policy under test.
    await serviceRole.storage
      .from("tenant-logos")
      .upload(`${OTHER_TENANT}/logo`, new Uint8Array([9, 9, 9]), {
        contentType: "image/png",
        upsert: true,
      })
    try {
      const supabase = await signIn("sarah.johnson@northwind.example")
      const { data, error } = await supabase.storage
        .from("tenant-logos")
        .download(`${OTHER_TENANT}/logo`)
      expect(data).toBeNull()
      expect(error).not.toBeNull()
    } finally {
      await serviceRole.storage
        .from("tenant-logos")
        .remove([`${OTHER_TENANT}/logo`])
    }
  })

  it("removeLogo deletes the object and clears logo_storage_key", async () => {
    const supabase = await signIn("sarah.johnson@northwind.example")
    const formData = new FormData()
    formData.set("logo", pngFile())
    await actions.uploadLogo({
      request: { formData: async () => formData } as never,
      locals: locals(NORTHWIND, supabase),
    } as never)

    const result = (await actions.removeLogo({
      locals: locals(NORTHWIND, supabase),
    } as never)) as { logoRemoved: true; company: { logo_storage_key: null } }
    expect(result.logoRemoved).toBe(true)
    expect(result.company.logo_storage_key).toBeNull()

    const { error } = await supabase.storage
      .from("tenant-logos")
      .download(`${NORTHWIND}/logo`)
    expect(error).not.toBeNull()
  })
})
