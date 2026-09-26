import { afterAll, describe, expect, it } from "vitest"
import { closeConnections } from "../db/client"
import { withTenant, type Tx } from "../db/tenant"
import * as documents from "./documents.repo"

/**
 * `defaultFolderForEntity`/`folderForEntity`/`forEntities`
 * (docs/25-project-management-phase2.md's task files) against the real
 * database. Every case rolls back. Storage itself is exercised by
 * `upload.ts`, not here — this is the DB side only.
 */

const NORTHWIND = "07fb03f8-1521-5ef4-9c2d-25fcfa297ac1"
const AS_OWNER = {
  tenantId: NORTHWIND,
  role: "owner",
  functionalRoles: [] as string[],
  employeeId: null,
}
/** Aisha Okafor — a real employees.id in the fixture (document_folders.owner_employee_id is a real FK, unlike tasks.created_by). */
const ACTOR = "11f31511-ad53-59c7-9e90-8ee3b553489b"
/** T-001 'Discovery workshops' — a task id with no files yet in the fixture. */
const T1 = "48961ce2-d17a-5ebe-81db-f608b4b6b125"

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

describe("entity-rooted folders (task files)", () => {
  afterAll(async () => {
    await closeConnections()
  })

  it("folderForEntity is null before any file has been attached", async () => {
    const found = await inRollback((tx) =>
      documents.folderForEntity(tx, "task", T1),
    )
    expect(found).toBeNull()
  })

  it("defaultFolderForEntity creates a company-visibility folder, and returns the SAME one on a second call", async () => {
    const { first, second, folder } = await inRollback(async (tx) => {
      const first = await documents.defaultFolderForEntity(tx, {
        tenantId: NORTHWIND,
        entityType: "task",
        entityId: T1,
        name: "Discovery workshops",
        ownerEmployeeId: ACTOR,
      })
      const second = await documents.defaultFolderForEntity(tx, {
        tenantId: NORTHWIND,
        entityType: "task",
        entityId: T1,
        name: "Discovery workshops",
        ownerEmployeeId: ACTOR,
      })
      const folder = await documents.folder(tx, first)
      return { first, second, folder }
    })
    expect(second).toBe(first)
    expect(folder!.visibility).toBe("company")
    expect(folder!.entity_type).toBe("task")
    expect(folder!.entity_id).toBe(T1)
  })

  it("forEntities groups documents by entity id, scoped to the entity type given", async () => {
    const { forTask, forWrongType } = await inRollback(async (tx) => {
      const folderId = await documents.defaultFolderForEntity(tx, {
        tenantId: NORTHWIND,
        entityType: "task",
        entityId: T1,
        name: "Discovery workshops",
        ownerEmployeeId: ACTOR,
      })
      await documents.uploadDocument(tx, {
        id: crypto.randomUUID(),
        tenantId: NORTHWIND,
        folderId,
        fileName: "kickoff-notes.pdf",
        storageKey: `${NORTHWIND}/task/${T1}/test-kickoff-notes.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
        visibility: "internal",
        uploadedByEmployeeId: ACTOR,
        entityType: "task",
        entityId: T1,
      })
      const forTask = await documents.forEntities(tx, "task", [T1])
      // Same id, wrong entity_type — must not match a "project" query.
      const forWrongType = await documents.forEntities(tx, "project", [T1])
      return { forTask, forWrongType }
    })
    expect(forTask[T1]).toHaveLength(1)
    expect(forTask[T1][0].file_name).toBe("kickoff-notes.pdf")
    expect(forWrongType[T1]).toBeUndefined()
  })

  it("forEntities returns nothing for an empty id list, without querying", async () => {
    const result = await inRollback((tx) =>
      documents.forEntities(tx, "task", []),
    )
    expect(result).toEqual({})
  })
})
